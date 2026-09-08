'use client';

import { Fragment, useState, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@ezihubb/api-client';
import { API_ROUTES, newClientMessageId } from '@ezihubb/constants';
import { useAuthStore } from '../../lib/store/auth.store';
import { TypingIndicator } from '@ezihubb/ui';
import { useConversationStream, usePresence, presenceLabel, useTyping } from '../../lib/realtime';
import type { ConversationWithMessagesDto, MessagePageDto } from '@ezihubb/types';
import { ShopAvatar } from './ShopAvatar';
import { MessageAttachments } from './MessageAttachments';
import { LinkPreviewCard, useLinkPreview } from './LinkPreviewCard';
import { firstLinkIn, isOnlyLink } from '@ezihubb/utils';
import { ThreadMenu } from './ThreadMenu';

/**
 * One conversation: header, messages, composer.
 *
 * Lifted out of the messages page so the floating chat dock can render the
 * same thread instead of a second implementation of it. Everything that only
 * concerns the conversation list stayed behind on the page.
 *
 * Returns a fragment, not a sized box — the caller decides the frame. Both
 * callers give it a flex column with a bounded height, which is what the
 * min-h-0 on the message pane needs to scroll rather than push the page.
 */
/** Mirrors MESSAGE_ATTACHMENT_MIMETYPES and MAX_MESSAGE_ATTACHMENTS on the
 *  API. Duplicated rather than shared because the server is the authority and
 *  this copy exists only to fail fast in the browser. */
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf';
const MAX_ATTACHMENTS = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatTime(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * How close to the bottom still counts as "at the bottom".
 *
 * Used to decide whether the typing bubble may pull the pane down. One
 * bubble tall plus a little, so a reader who has scrolled up even slightly
 * on purpose is left where they are.
 */
const NEAR_BOTTOM_PX = 120;

/** Longer than this between two messages and the thread gets a marker. */
const SEPARATOR_GAP_MS = 60 * 60 * 1000;

/**
 * A centred date, the way every messaging app paces a long thread.
 *
 * Grouping alone removes the repetition but leaves no sense of when any of
 * it happened — a screen of replies could be from this morning or from
 * March. Drawn on the first message, on a change of day, and after an hour
 * of silence, so the marks land where the conversation actually paused.
 *
 * Formatted through Intl with the active locale, so it needs no translation
 * strings of its own and reads correctly in all three.
 */
function needsDateMark(prev: ThreadMessage | undefined, msg: ThreadMessage): boolean {
  if (!prev) return true;
  const a = new Date(prev.createdAt);
  const b = new Date(msg.createdAt);
  if (a.toDateString() !== b.toDateString()) return true;
  return b.getTime() - a.getTime() >= SEPARATOR_GAP_MS;
}

function formatDateMark(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) + ' · ' + time;
}

function MessageSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`flex gap-2 ${i % 2 === 0 ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className="w-7 h-7 rounded-full bg-border/30 flex-shrink-0" />
          <div className={`h-10 rounded-2xl bg-border/30 ${i % 2 === 0 ? 'w-48' : 'w-36'}`} />
        </div>
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function ConversationStatusBadge({ status }: { status?: string }) {
  const t = useTranslations('account.messages.status');
  if (!status || status === 'OPEN') return null;
  const map: Record<string, { label: string; cls: string }> = {
    PENDING:  { label: t('pending'),  cls: 'bg-yellow-100 text-yellow-700' },
    RESOLVED: { label: t('resolved'), cls: 'bg-green-100 text-green-700'   },
    SPAM:     { label: t('spam'),     cls: 'bg-gray-100 text-gray-500'      },
  };
  const cfg = map[status];
  if (!cfg) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

/**
 * Whether two adjacent messages belong to the same run.
 *
 * Same sender, and close enough in time that presenting them as one
 * utterance is honest. Without the time rule, three replies at 14:14, 14:19
 * and 14:20 would collapse into one group showing only the last clock, and
 * the five-minute pause between the first two would vanish from the record.
 *
 * SYSTEM notices never join a run — they are about the conversation rather
 * than part of it.
 */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function sameGroup(a?: ThreadMessage, b?: ThreadMessage): boolean {
  if (!a || !b) return false;
  if (a.senderType === 'SYSTEM' || b.senderType === 'SYSTEM') return false;
  if (a.senderType !== b.senderType) return false;
  const gap = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  return Number.isFinite(gap) && gap >= 0 && gap < GROUP_WINDOW_MS;
}

function MessageBubble({
  message: msg, conversationId, isOwn, shopName, shopLogoUrl,
  isFirstOfGroup, isLastOfGroup,
}: {
  message: ThreadMessage;
  conversationId: string;
  isOwn:   boolean;
  shopName:    string;
  shopLogoUrl: string | null;
  /** First of a run from the same sender — carries the gap above it. */
  isFirstOfGroup: boolean;
  /** Last of that run — carries the avatar, the clock and the tail. */
  isLastOfGroup:  boolean;
}) {
  const t = useTranslations('account.messages');
  const locale = useLocale();
  // Only the first link gets a card. Five links in one message would otherwise
  // be five outbound fetches and a wall of cards taller than the thread.
  const link = msg.deletedAt ? null : firstLinkIn(msg.body);
  // A run reads as one utterance, so the messages inside it sit almost
  // touching and the air goes between runs instead. space-y-4 on the list
  // spent the same 16px everywhere, which is what made a thread of
  // one-word replies look like a list of unrelated notices.
  const groupGap = isFirstOfGroup ? 'mt-4 first:mt-0' : 'mt-0.5';
  /**
   * A message that is nothing but a link becomes the card alone.
   *
   * The address and the card said the same thing twice, and the address was
   * the half that broke the layout: a hundred unbroken characters is what a
   * product URL looks like. Held until the preview actually arrives, so a
   * link that turns out to have no card still shows the link.
   */
  const { data: preview } = useLinkPreview(conversationId, link);
  // Attachments live inside the bubble, so dropping it would take them with
  // it — a message can be a bare link AND carry a file.
  const cardReplacesBody =
    !!preview && isOnlyLink(msg.body, link) && !msg.attachmentUrls?.length;

  /**
   * An unsent message keeps its place, without its text.
   *
   * The buyer may already have read it, so removing the bubble entirely would
   * quietly rewrite a conversation they were part of — and leave them
   * wondering whether they had imagined it. Saying so is the honest version.
   */
  if (msg.deletedAt) {
    return (
      <div className={`flex gap-2 ${groupGap} ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* The real picture, and only on the message that closes the run —
            with a blank of the same width holding the others in line. Drawn
            on every message it repeated the same face seven times down a
            phone screen and ate the width the bubbles needed. */}
        {!isOwn && (isLastOfGroup
          ? <div className="mt-1"><ShopAvatar name={shopName} src={shopLogoUrl} size={28} /></div>
          : <div className="w-7 shrink-0" aria-hidden="true" />
        )}
        {/* Outline, not a filled bubble. An unsent message is a note about
            the conversation rather than part of it, and giving it the same
            solid shape as real messages makes an absence look like content. */}
        <span className="max-w-[80%] rounded-full border border-border px-4 py-2 text-sm italic text-muted">
          {t('messageUnsent')}
        </span>
      </div>
    );
  }

  const isSystem = msg.senderType === 'SYSTEM';
  if (isSystem) {
    return (
      <div className="text-center">
        <span className="text-xs text-muted italic bg-[#FAFAF8] px-3 py-1 rounded-full">
          {msg.body}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${groupGap} ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isOwn && (isLastOfGroup
        ? <div className="mt-1"><ShopAvatar name={shopName} src={shopLogoUrl} size={28} /></div>
        : <div className="w-7 shrink-0" aria-hidden="true" />
      )}
      {/* A column, so the preview card can sit under the bubble rather than
          beside it, and both stay on the sender's side of the thread.

          The width cap lives HERE and not on the bubble. On the bubble it was
          80% of this wrapper — and this wrapper sizes itself from its content,
          which is the bubble. A circular constraint, which the browser settles
          by shrinking to the narrowest thing that fits: "heyy" became three
          lines with the clock wrapped under it. Capping the wrapper against
          the row, which has a real width, leaves the bubble free to be as
          wide as its text. */}
      <div className={`flex min-w-0 max-w-[80%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* The bubble goes away entirely when the card has replaced its text.
            Keeping it would leave a coloured shape holding nothing but a
            clock, floating above the card it was meant to introduce. */}
        {!cardReplacesBody && (
          <div className={[
            // w-fit so a short message is a short bubble rather than a column
            // stretched to the cap above.
            'w-fit rounded-2xl px-3.5 py-2 text-sm',
            isOwn ? 'bg-primary text-white' : 'bg-[#F3F4F6] text-secondary',
            // The flattened corner is the tail. Only the message that ends
            // the run gets one; giving every bubble a tail is what stops a
            // run from reading as a run.
            isLastOfGroup ? (isOwn ? 'rounded-br-sm' : 'rounded-bl-sm') : '',
          ].join(' ')}>
            {/* [overflow-wrap:anywhere], not break-words. They look alike and
                differ in the one way that matters here: break-word leaves the
                element's min-content width at the full length of the longest
                unbreakable run, so a bare URL still forced this flex item wide
                enough to push the whole thread sideways. anywhere lets the
                break count toward min-content, which is what stops it. */}
            <p className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{msg.body}</p>
            <MessageAttachments urls={msg.attachmentUrls} isOwn={isOwn} />
            {/* Once per run, on the message that ends it. On every bubble it
                turned a one-character reply into a two-line block, because
                the clock is six characters on a line of its own — which is
                exactly what a column of tiny square bubbles was.

                nowrap stays: those six characters must never decide how wide
                a bubble is, nor break in half across two lines. */}
            {isLastOfGroup && (
              <p className={`mt-0.5 whitespace-nowrap text-right text-[10px] ${isOwn ? 'text-white/70' : 'text-muted'}`}>
                {formatTime(msg.createdAt, locale)}
                {isOwn && msg.isRead && <span className="ml-1">✓✓</span>}
              </p>
            )}
          </div>
        )}

        {/* Outside the bubble: the card is about the link rather than part of
            what was typed, and inside the buyer's own bubble it would inherit
            a primary-coloured background it was never designed against. */}
        {link && <LinkPreviewCard conversationId={conversationId} url={link} />}

        {/* The clock lives on the card once the bubble is gone, so a
            link-only message still says when it was sent. */}
        {cardReplacesBody && (
          <p className="mt-0.5 whitespace-nowrap px-1 text-[10px] text-muted">
            {formatTime(msg.createdAt, locale)}
            {isOwn && msg.isRead && <span className="ml-1">✓✓</span>}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Paging backwards through a thread ────────────────────────────────────────

type ThreadMessage = ConversationWithMessagesDto['messages'][number];

/** A message on screen that the server has not confirmed yet. */
interface PendingMessage {
  clientMessageId: string;
  body:            string;
  attachmentUrls:  string[];
  createdAt:       string;
}

const byOldest = (a: ThreadMessage, b: ThreadMessage) =>
  a.createdAt === b.createdAt
    ? a.id.localeCompare(b.id)
    : a.createdAt.localeCompare(b.createdAt);

/**
 * Everything the reader has seen, merged with the live newest window.
 *
 * Accumulating rather than concatenating two lists is what makes a sliding
 * window safe. The API returns the newest hundred, so on a thread of a hundred
 * and one, a single new message pushes the oldest one OUT of the window. If
 * the render were `olderPagesFetched + window`, that message would belong to
 * neither and vanish from the middle of a conversation the reader was in.
 * Keyed by id and merged, it stays: the window only ever overwrites a message
 * with a fresher copy of itself.
 *
 * The store is a ref, not state, so a refetch that changes nothing does not
 * re-render the whole thread; `tick` is what says the ref moved.
 */
function useThreadMessages(conversationId: string, newest: ThreadMessage[] | undefined) {
  const seen = useRef(new Map<string, ThreadMessage>());
  const [tick, setTick] = useState(0);

  // A different thread is a different history. Cleared synchronously during
  // render rather than in an effect, so the previous buyer's messages are
  // never painted under the new one's name for a frame.
  const currentId = useRef(conversationId);
  if (currentId.current !== conversationId) {
    currentId.current = conversationId;
    seen.current = new Map();
  }

  /**
   * Merged during render, NOT in an effect — and this is a bug fix, not a
   * style choice.
   *
   * It used to be a useEffect keyed on `newest`. Effects run in declaration
   * order, so on the render where a thread first arrived carrying an unsent
   * message, this one filled the map and the reset below it emptied the map
   * again a moment later. Nothing refilled it: React Query hands back the SAME
   * array reference while the data is unchanged, so the effect's dependency
   * never moved again and the thread stayed blank until someone wrote in it.
   * Merging here cannot lose that race, because the render that follows a
   * reset performs the merge itself.
   *
   * Writing to the ref during render is safe here specifically because the
   * write is idempotent: the same `newest` merged twice leaves the same map.
   */
  if (newest) for (const m of newest) seen.current.set(m.id, m);

  /**
   * Adds messages by id; the sort below puts them where they belong.
   *
   * Used both for a page of older messages and for one that has just arrived
   * over the socket — the map does not care which, and the second case is why
   * a new message no longer costs a fetch to display something the push had
   * already delivered in full.
   */
  const merge = (incoming: ThreadMessage[]) => {
    for (const m of incoming) seen.current.set(m.id, m);
    setTick((n) => n + 1);
  };

  /** Drops everything outside the live window. Used when a message is unsent:
   *  a copy held here predates that and would go on showing text the shop has
   *  taken back. The next render restores the window from `newest`. */
  const reset = () => {
    seen.current = new Map();
    setTick((n) => n + 1);
  };

  const messages = useMemo(
    () => [...seen.current.values()].sort(byOldest),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [newest, tick, conversationId],
  );

  return { messages, prepend: merge, merge, reset };
}

// ── MessageThread ─────────────────────────────────────────────────────────────

export function MessageThread({
  conversationId,
  onBack,
  showMenu = true,
  headerActions,
}: {
  conversationId: string;
  onBack:         () => void;
  /**
   * The report/delete kebab. On by default; the floating dock turns it off,
   * because clearing a conversation away for good is not a thing to offer in
   * a 400px box floating over a shopping page — it belongs on the inbox, where
   * the buyer can see the whole list they are editing.
   */
  showMenu?: boolean;
  /**
   * Rendered at the end of the header. The dock puts its minimise and close
   * controls here rather than in a bar of its own, so an embedded thread has
   * ONE header instead of the dock's stacked on top of this one — which put
   * the shop's avatar on screen twice, a few pixels apart.
   */
  headerActions?: ReactNode;
}) {
  const t = useTranslations('account.messages');
  const locale = useLocale();
  const token = useAuthStore((s) => s.accessToken);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  /**
   * Messages drawn before the server has confirmed them.
   *
   * Sending used to cost two round trips before anything appeared: the POST,
   * and then a refetch of the whole thread to read back what had just been
   * sent. The sender was waiting on a server to be told what they had typed.
   *
   * Matched to the real row by clientMessageId — the id cannot do it, because
   * there is no id until the server answers, which is the entire wait being
   * removed here.
   */
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const { someoneTyping } = useTyping(conversationId, newMessage, isSending);
  const [attachments, setAttachments] = useState<{ name: string; url: string }[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const paneRef   = useRef<HTMLDivElement>(null);
  /** Pane height captured just before a page of older messages is prepended. */
  const pendingScroll = useRef<number | null>(null);
  /** Armed by sendMessage, consumed by the layout effect below. A flag rather
   *  than a scroll call, because the send resolves a render before the
   *  refetch that actually puts the message in the list. */
  const stickToBottom = useRef(false);
  const queryClient = useQueryClient();

  const { data: conv, isLoading } = useQuery<ConversationWithMessagesDto>({
    queryKey: ['conversation', conversationId],
    queryFn: () =>
      apiClient.get<ConversationWithMessagesDto>(API_ROUTES.MESSAGES.CONVERSATION(conversationId), {
        token: token ?? undefined,
      }),
    // Was 15s. The socket now delivers within a second, so this is a safety
    // net for the case where the socket never connected — a corporate proxy
    // that blocks the upgrade, say — not the primary path. Left in rather than
    // removed: silently falling back to a dead thread is the worse failure.
    refetchInterval: 60_000,
    enabled: !!conversationId,
  });

  const { messages, prepend, merge, reset } = useThreadMessages(conversationId, conv?.messages);

  /**
   * Where the next page back starts.
   *
   * Seeded from the thread's own response and then owned here, because the
   * response's cursor is the oldest message in the WINDOW — it walks forwards
   * as the thread grows, while this has to keep walking backwards.
   */
  const [cursor, setCursor]   = useState<{ before: string | null; hasMore: boolean } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    setCursor(null);
    setLoadingOlder(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conv || cursor) return;
    setCursor({ before: conv.oldestMessageId ?? null, hasMore: conv.hasMoreMessages ?? false });
  }, [conv, cursor]);

  const loadOlder = async () => {
    if (!cursor?.before || loadingOlder) return;
    setLoadingOlder(true);
    // Measured before the fetch resolves, so the layout effect below has the
    // height the pane had while the reader was looking at it.
    pendingScroll.current = paneRef.current?.scrollHeight ?? null;
    try {
      const page = await apiClient.get<MessagePageDto>(
        `${API_ROUTES.MESSAGES.CONVERSATION_MESSAGES(conversationId)}?before=${encodeURIComponent(cursor.before)}`,
        { token: token ?? undefined },
      );
      prepend(page.messages);
      setCursor({ before: page.oldestMessageId, hasMore: page.hasMoreMessages });
    } catch {
      // Leave the cursor where it was so the button stays and can be retried.
      pendingScroll.current = null;
    } finally {
      setLoadingOlder(false);
    }
  };

  // Same invalidate-don't-splice reasoning as the seller inbox: the pushed row
  // is the raw record, this query returns it shaped for the page.
  useConversationStream(conversationId, (incoming) => {
    // The push carries the whole row. Merging it is what makes an arriving
    // message appear at once instead of after a fetch for something already
    // in hand. The invalidate below still runs as the safety net for a read
    // receipt, an unsend, or a socket that never connected.
    if (incoming) merge([incoming as ThreadMessage]);

    queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  });

  /**
   * An unsend invalidates history this component is holding.
   *
   * Pages already loaded were fetched before the shop took the message back,
   * so they still carry its text. Dropping them sends the thread back to the
   * live window, which does not.
   */
  const lastDeleted = useRef<string | null>(null);
  useEffect(() => {
    const unsent = conv?.messages?.filter((m) => m.deletedAt).map((m) => m.id).join(',') ?? '';
    if (lastDeleted.current !== null && lastDeleted.current !== unsent) {
      reset();
      setCursor({ before: conv?.oldestMessageId ?? null, hasMore: conv?.hasMoreMessages ?? false });
    }
    lastDeleted.current = unsent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.messages]);

  // There is no /shops index route. Conversations that predate the store link
  // fall back to search so Next.js prefetch does not emit a background 404.
  const shopHref = conv?.store?.slug ? `/${locale}/shops/${conv.store.slug}` : `/${locale}/search`;
  const shopName = conv?.store?.name ?? 'Shop';

  // Presence is per user, and a shop is online when its owner is. The server
  // only answers for people the buyer already shares a conversation with,
  // which this is.
  const ownerId = conv?.store?.ownerId ?? null;
  const presence = usePresence(ownerId ? [ownerId] : []);
  const shopPresence      = ownerId ? presence.get(ownerId) : undefined;
  const shopPresenceLabel = presenceLabel(shopPresence);
  const shopOnline        = shopPresence?.online ?? false;

  /**
   * Scrolls the message pane, not the page.
   *
   * scrollIntoView walks up to whichever ancestor can scroll, and while the
   * thread had no bounded height that was the window — opening a conversation
   * threw the whole page down past the footer. Setting scrollTop on the pane
   * itself cannot escape it, whatever the surrounding layout does.
   *
   * Keyed on the WINDOW's length, not the rendered one. Loading older messages
   * grows the rendered list too, and sharing a trigger would answer "show me
   * what came before" by throwing the reader back to the bottom.
   *
   * pending.length is in there because it is the whole point: a sent message
   * is on screen as an optimistic bubble immediately, but conv.messages only
   * grows once the server answers. Keyed on the confirmed list alone, the
   * thread sat still for a round trip while the reply the reader had just
   * written waited below the fold — which is what made sending feel slow.
   *
   * useLayoutEffect, not useEffect: this runs before the browser paints, so
   * the new message is never shown at the old scroll position first.
   *
   * Instant for your own message, animated for one that arrives. Smoothly
   * animating to a message you just sent yourself is time spent watching the
   * thread travel; a message from the shop reads better if the movement
   * shows where it came from. The first paint is instant either way.
   */
  const firstScroll  = useRef(true);
  const lastPending  = useRef(0);
  const lastCount    = useRef(0);
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    const count = conv?.messages?.length ?? 0;
    const own   = pending.length > lastPending.current;
    const grew  = own || count > lastCount.current;
    lastPending.current = pending.length;
    lastCount.current   = count;

    // The typing bubble appearing is not a reason to drag someone away from
    // what they are reading. A real message still always wins — that is the
    // thing they are waiting for — but the placeholder only pulls the pane
    // down for a reader already at the bottom, where it just appeared.
    if (!grew && !firstScroll.current) {
      const gap = pane.scrollHeight - pane.scrollTop - pane.clientHeight;
      if (gap > NEAR_BOTTOM_PX) return;
    }

    pane.scrollTo({
      top: pane.scrollHeight,
      behavior: firstScroll.current || own ? 'auto' : 'smooth',
    });
    firstScroll.current = false;
  }, [conv?.messages?.length, pending.length, someoneTyping]);

  /**
   * Keeps the reader where they were when a page is prepended.
   *
   * Content added ABOVE the viewport moves everything below it down by exactly
   * the height added, and the browser leaves scrollTop alone — so the message
   * being read jumps off screen. Adding the same delta back puts it under the
   * same pixel it was under before.
   *
   * useLayoutEffect, not useEffect: after paint is one frame too late and the
   * jump is visible.
   */
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    // Checked first: the two are mutually exclusive, and a reply sent while an
    // older page happened to be loading must still land at the bottom.
    if (stickToBottom.current) {
      stickToBottom.current = false;
      pendingScroll.current = null;
      pane.scrollTop = pane.scrollHeight;
      return;
    }

    const before = pendingScroll.current;
    if (before === null) return;
    pendingScroll.current = null;
    pane.scrollTop += pane.scrollHeight - before;
  }, [messages]);

  /**
   * Opening a thread reads it.
   *
   * Nothing called this before, so unreadByCustomer never returned to zero:
   * the sidebar kept a badge for messages the buyer was looking at, and the
   * shop's own double tick never appeared because the messages were never
   * marked read either.
   */
  useEffect(() => {
    if (!conversationId || !token) return;
    // Gated on there being something unread, not on the message count: the
    // count also moves when the buyer sends, which would post a mark-read on
    // every keystroke-ending Enter for messages that were already read.
    //
    // It is also what makes this self-terminating. Marking read sets the
    // count to zero, the refetch below carries that back, and the effect stops
    // — where a length-based dependency would keep firing on its own refetch.
    if (!conv?.unreadByCustomer) return;

    apiClient
      .post(API_ROUTES.MESSAGES.CONVERSATION_READ(conversationId), {}, { token })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      })
      // Silent: failing to clear a badge is not worth an error over a thread
      // the buyer is reading, and the next arriving message tries again.
      .catch(() => undefined);
  }, [conversationId, token, conv?.unreadByCustomer, queryClient]);

  /**
   * Checked in the browser before anything is uploaded, so the buyer is told
   * why a file was refused rather than waiting for a request that cannot
   * succeed. The server enforces all of it again — this copy is courtesy.
   */
  const pickFiles = async (picked: FileList | null) => {
    if (!picked?.length) return;
    // A second pick while the first is still uploading would compute its
    // room allowance from a stale `attachments`, and both batches would
    // append. The attach button is disabled while uploading; a paste is
    // not, so the guard belongs here rather than on the button.
    if (uploading) return;
    const files = Array.from(picked);
    if (fileInput.current) fileInput.current.value = '';

    const room = MAX_ATTACHMENTS - attachments.length;
    if (files.length > room) {
      return setAttachError(t('tooManyAttachments', { count: MAX_ATTACHMENTS }));
    }
    // Checked before any upload starts, so a bad second file does not leave
    // the first already uploaded and half the pick applied.
    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) return setAttachError(t('attachmentTooLarge', { name: tooBig.name }));
    const wrongType = files.find((f) => !ALLOWED_TYPES.has(f.type));
    if (wrongType) return setAttachError(t('attachmentWrongType', { name: wrongType.name }));

    setAttachError(null);
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of files) form.append('files', file);
      const uploaded = await apiClient.post<{ name: string; url: string }[]>(
        API_ROUTES.MESSAGES.CONVERSATION_ATTACHMENTS(conversationId),
        form,
        { token: token ?? undefined },
      );
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setAttachError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  /**
   * Drop optimistic bubbles once the real row is on screen.
   *
   * Returning the previous array unchanged when there is nothing to drop is
   * what keeps this from looping: it runs on every change to `messages`, and
   * a fresh array would be a new render and another run.
   */
  const confirmedKeys = useMemo(
    () => new Set(messages.map((m) => m.clientMessageId).filter(Boolean) as string[]),
    [messages],
  );
  useEffect(() => {
    setPending((prev) => {
      const next = prev.filter((p) => !confirmedKeys.has(p.clientMessageId));
      return next.length === prev.length ? prev : next;
    });
  }, [confirmedKeys]);

  const sendMessage = async () => {
    const body = newMessage.trim();
    // Attachments alone are a message — a photo of a problem does not need a
    // covering note.
    if ((!body && attachments.length === 0) || isSending) return;
    setIsSending(true);
    // Minted here, before the request goes out, so a retry of THIS message
    // carries the same key and the server recognises it instead of writing a
    // second copy. Generating it inside the request would defeat the point.
    const clientMessageId = newClientMessageId();
    const urls  = attachments.map((a) => a.url);
    // Kept for the failure path, which puts the composer back as it was.
    const sentAttachments = attachments;

    // Drawn before the request, not after it. Everything below this line is
    // bookkeeping the sender no longer waits to watch.
    setPending((prev) => [...prev, { clientMessageId, body, attachmentUrls: urls, createdAt: new Date().toISOString() }]);
    setNewMessage('');
    setAttachments([]);
    // Clearing the value does not fire onChange, so the box would keep the
    // height it grew to and sit three lines tall over an empty placeholder.
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      await apiClient.post(
        API_ROUTES.MESSAGES.CONVERSATION_MESSAGES(conversationId),
        { body, clientMessageId, attachmentUrls: urls },
        { token: token ?? undefined },
      );
      // Land on what was just sent. The length-keyed effect above cannot be
      // relied on for this: once a thread fills the window its length stops
      // changing, and sending would leave the reader wherever they were.
      stickToBottom.current = true;
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e) {
      // The bubble goes and the text comes back. Drawing it early must not
      // turn a failed send into a message the sender believes they sent, and
      // the composer holding it is how they retry — which is what the box did
      // before any of this drew anything.
      setPending((prev) => prev.filter((x) => x.clientMessageId !== clientMessageId));
      setNewMessage(body);
      setAttachments(sentAttachments);
      setAttachError((e as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b flex-shrink-0">
        <button
          onClick={onBack}
          className="md:hidden w-8 h-8 flex items-center justify-center text-muted hover:text-secondary"
          aria-label={t('backToConversations')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {/* The avatar and name link to the shop.
            A buyer looking at a conversation with a shop reasonably expects
            the shop's own picture to take them there; it was inert markup.
            One anchor around both, so the whole block is the target rather
            than a 32px circle. */}
        <Link
          href={shopHref}
          className="flex items-center gap-2 flex-1 min-w-0 rounded-lg -m-1 p-1 hover:bg-background transition-colors"
        >
          <ShopAvatar name={shopName} src={conv?.store?.logoUrl} size={32} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-secondary truncate">{shopName}</p>
            {/* Presence under the name, the way every messaging tool puts it.
                Rendered only when there is something true to say — a shop with
                no account behind it has no presence, and "Offline" would be a
                claim rather than a fact. */}
            {shopPresenceLabel && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${shopOnline ? 'bg-success' : 'bg-border'}`}
                  aria-hidden="true"
                />
                {shopPresenceLabel}
              </p>
            )}
          </div>
        </Link>
        {/* The order number used to sit here. It named ONE order on a thread
            that now spans every order this buyer has with the shop, so it was
            answering a question nobody asked — while the two things a person
            actually wants from a thread, reporting it and clearing it away,
            had nowhere to live. */}
        {showMenu && (
          <ThreadMenu
            conversationId={conversationId}
            onHidden={() => {
              // Closing the thread is not enough: the row stays in the list
              // beside a toast saying it was removed, which reads as the delete
              // having failed. The list is a separate query and has to be told.
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
              onBack();
            }}
          />
        )}

        <ConversationStatusBadge status={conv?.status} />

        {headerActions}
      </div>

      {/* Messages.
          min-h-0 is what makes overflow-y-auto work at all: a flex child's
          default min-height is its content, so without it this pane refuses to
          shrink, grows past the frame, and the page scrolls instead of the
          thread — which is what pushed the composer down below the footer. */}
      {/* A column with mt-auto on the message stack, so a short thread sits on
          the composer instead of floating in the middle of an empty pane —
          which is what every messaging app does and what the eye expects.
          `justify-end` would do it too, but it breaks scrolling once the
          thread is taller than the pane; mt-auto stops applying on its own the
          moment the content fills the space. */}
      <div ref={paneRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
        {/* Explicit, not infinite scroll on reaching the top. Reaching the top
            is also what happens when someone flicks the pane hard, and paging
            on that turns an overshoot into a fetch nobody asked for. A button
            is one deliberate tap and cannot fire by accident. */}
        {cursor?.hasMore && !isLoading && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="rounded-full border border-border px-4 py-1.5 text-xs text-muted hover:bg-background disabled:opacity-50"
            >
              {loadingOlder ? t('loadingOlder') : t('loadOlder')}
            </button>
          </div>
        )}

        {/* mt-auto lives here rather than on the pane: it pushes this stack to
            the bottom while the "load earlier" button above stays put at the
            top, which is the arrangement a reader expects. */}
        {/* No space-y here any more: a uniform gap cannot tell a run of
            replies from two separate ones, so each row now carries its own
            margin and decides which of the two it is. */}
        <div className="mt-auto min-w-0">
          {isLoading ? (
            <MessageSkeleton count={3} />
          ) : (
            messages.map((msg, i) => (
              <Fragment key={msg.id}>
                {needsDateMark(messages[i - 1], msg) && (
                  <p className="py-3 text-center text-[11px] font-medium text-muted">
                    {formatDateMark(msg.createdAt, locale)}
                  </p>
                )}
                <MessageBubble
                  message={msg}
                  conversationId={conversationId}
                  isOwn={msg.senderType === 'CUSTOMER'}
                  shopName={shopName}
                  shopLogoUrl={conv?.store?.logoUrl ?? null}
                  isFirstOfGroup={!sameGroup(messages[i - 1], msg)}
                  isLastOfGroup={!sameGroup(msg, messages[i + 1])}
                />
              </Fragment>
            ))
          )}

          {/* Sent, not yet confirmed. Rendered after the real messages because
              it is always the newest thing in the thread, and dimmed so the
              difference between "on your screen" and "delivered" stays
              visible — an optimistic bubble that looked identical would be a
              claim the client cannot make yet. */}
          {pending.map((p) => (
            <div key={p.clientMessageId} className="flex justify-end">
              <div className="max-w-[80%] min-w-0 opacity-60">
                {p.body && (
                  <div className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-white break-words [overflow-wrap:anywhere]">
                    {p.body}
                  </div>
                )}
                {p.attachmentUrls.length > 0 && (
                  <MessageAttachments urls={p.attachmentUrls} isOwn />
                )}
                <p className="mt-1 text-right text-xs text-muted">{t('messageSending')}</p>
              </div>
            </div>
          ))}

          {/* In the thread, not a strip above the composer.
              Outside the pane it sat over the newest message's clock and read
              as an overlay; the point of a placeholder is to occupy the spot
              the message will land in, so the thread does not jump when it
              arrives. Same row shape as an incoming message, avatar and all.

              It can now be scrolled past, which is why the scroll effect
              watches someoneTyping — but only pulls the pane down for a
              reader who was already at the bottom. */}
          {someoneTyping && (
            <div className="mt-4 flex gap-2">
              <div className="mt-1">
                <ShopAvatar name={shopName} src={conv?.store?.logoUrl ?? null} size={28} />
              </div>
              <TypingIndicator label={shopName} />
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      {conv?.status !== 'RESOLVED' ? (
        <div className="p-4 border-t flex-shrink-0">
          {/* Uploaded before the message is sent, so the buyer sees each file
              land and a failed send does not take the upload with it. */}
          {attachments.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <li key={a.url} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-secondary">
                  <span className="max-w-[10rem] truncate">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                    aria-label={t('removeAttachment')}
                    className="text-muted hover:text-error"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* One bar, not three controls in a row.
              The attach button, the box and Send used to be separate boxed
              elements with their own borders, which read as a toolbar rather
              than a place to type. Here the border belongs to the bar and the
              buttons sit inside it, so the whole thing is one target and the
              focus ring lands on the bar. */}
          <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-surface px-2 py-1.5 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15">
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => void pickFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
              aria-label={t('attachFile')}
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-secondary disabled:opacity-40"
            >
              {uploading ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </button>

            {/* rows={1} plus the height reset in onChange: the box starts one
                line tall and grows with what is typed, up to a cap, instead of
                reserving two lines for a message that is usually one. The
                reset to 'auto' first is what lets it shrink again on delete —
                scrollHeight never goes down on its own. */}
            <textarea
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              // Paste an image straight into the box. A screenshot from the OS
              // clipboard arrives here as a File and goes through exactly the
              // same size and type checks the attach button uses.
              onPaste={(e) => {
                if (e.clipboardData.files.length === 0) return;
                // Rich text often travels with a picture of itself (Word, Excel, a
                // copied web selection). That paste is meant to type the text, so
                // anything carrying real text is left to the browser.
                if (e.clipboardData.getData('text/plain')) return;
                // No preventDefault: a textarea has nothing to insert for a file,
                // so the default is already a no-op and suppressing it would only
                // risk swallowing text arriving in the same event.
                void pickFiles(e.clipboardData.files);
              }}
              ref={inputRef}
              placeholder={t('typePlaceholder')}
              rows={1}
              className="min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm leading-relaxed text-secondary placeholder:text-muted focus:outline-none focus:ring-0"
            />

            <button
              onClick={sendMessage}
              disabled={(!newMessage.trim() && attachments.length === 0) || isSending || uploading}
              aria-label={t('sendMessage')}
              // Grey until there is something to send, rather than a washed-out
              // primary: a faded brand colour reads as "broken", not "not yet".
              className={[
                'mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                (!newMessage.trim() && attachments.length === 0) || isSending || uploading
                  ? 'bg-border/60 text-muted'
                  : 'bg-primary text-white hover:bg-primary/90',
              ].join(' ')}
            >
              {isSending ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          {/* Under the bar, and only what is true right now: the upload error
              when there is one, otherwise the Enter hint — and that only once
              the person has started typing. A permanent line of instructions
              under an empty composer is furniture. */}
          {attachError ? (
            <p className="mt-1.5 px-2 text-[11px] text-error">{attachError}</p>
          ) : newMessage.length > 0 ? (
            <p className="mt-1.5 px-2 text-[11px] text-muted">{t('shiftEnterHint')}</p>
          ) : null}
        </div>
      ) : (
        <div className="p-4 border-t text-center">
          <p className="text-xs text-muted">
            {t('resolvedNotice')}{' '}
            <button
              onClick={() =>
                apiClient
                  .post(API_ROUTES.MESSAGES.CONVERSATION_MESSAGES(conversationId), { body: '(Reopening conversation)' }, { token: token ?? undefined })
                  .then(() => queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] }))
              }
              className="text-primary hover:underline"
            >
              {t('reopen')}
            </button>
          </p>
        </div>
      )}
    </>
  );
}
