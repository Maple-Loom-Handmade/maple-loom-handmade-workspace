'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera, Pencil, Plus, X, Check, ExternalLink, Trash2, ArrowUp, ArrowDown,
  Video, ImagePlus, Star, MessageSquareHeart, User, LayoutGrid, Lock, Search, MessageSquare,
} from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, Select } from '@ezihubb/ui';
import { useAdminMode } from '../../../../lib/store-context';
import { api, adminApi, ApiError } from '../../../../lib/api-client';
import { API_ROUTES, SHOP_COLOR_THEMES } from '@ezihubb/constants';
import { fmtNum, fmtDate } from '../../../../lib/fmt';
import { useDialog } from '../../../../contexts/DialogContext';
import { ListingPicker, type PickedProduct } from '../../../../components/marketing/ListingPicker';
import { ReloadButton } from '../../../../components/ui/ReloadButton';
import {
  ManageSectionsModal, EditSectionModal, useShopSections,
} from '../../../../components/shop-home/ManageSectionsModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopFaq { id: string; question: string; answer: string; sortOrder: number }
interface SocialLink { platform: string; url: string }

interface ShopHomeStore {
  id:                 string;
  name:               string;
  slug:               string;
  logoUrl:            string | null;
  bannerUrl:          string | null;
  description:        string | null;
  tagline:            string | null;
  location:           string | null;
  colorTheme:         string | null;
  announcement:       string | null;
  announcementUpdatedAt: string | null;
  aboutHeadline:      string | null;
  aboutVideoUrl:       string | null;
  aboutPhotoUrls:     string[];
  ownerBio:           string | null;
  featuredProductIds: string[];
  featuredLayout:     string | null;
  socialLinks:        SocialLink[] | null;
  followerCount:      number;
  totalOrders:        number;
  createdAt:          string;
  faqs:               ShopFaq[];
  owner:              { firstName: string | null; lastName: string | null; avatarUrl?: string | null };
}

type ItemsSort = 'recent' | 'name';

interface ShopProductRow {
  id: string; name: string; slug: string; status: string; basePrice: number;
  /** Present in the adminGetStoreProducts payload; the interface simply
   *  omitted it. Declaring it here is a type fix, not an API change. */
  createdAt: string;
  images: { url: string }[];
}

interface TaxInfoLite { sellerType: 'INDIVIDUAL' | 'BUSINESS' }

// Mirrors SellerSubscriptionView from
// apps/api/src/modules/subscriptions/subscription-status.util.ts — only the
// field this page needs (hasPlus) is used, kept minimal on purpose.
interface SellerSubscriptionLite { hasPlus: boolean }

interface StoreImageUploadResponse {
  bannerUrl?: string;
  logoUrl?: string;
}

const STORE_BANNER_MAX_BYTES = 10 * 1024 * 1024;
const STORE_BANNER_ACCEPT = 'image/jpeg,image/png,image/webp';
const STORE_BANNER_TYPES = new Set(STORE_BANNER_ACCEPT.split(','));

const SOCIAL_PLATFORMS = [
  { value: 'facebook',  label: 'Facebook'  },
  { value: 'instagram', label: 'Instagram' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'twitter',   label: 'Twitter/X' },
  { value: 'youtube',   label: 'YouTube'   },
  { value: 'tiktok',    label: 'TikTok'    },
  { value: 'website',   label: 'Website'   },
] as const;

// Single source of truth is now @ezihubb/constants's SHOP_COLOR_THEMES —
// also consumed by the public storefront render. Do not redefine this list
// here again.

// Plain `.length`/`.slice()` count/cut UTF-16 code units, not user-perceived
// characters — for text containing surrogate-pair emoji, ZWJ sequences
// (e.g. 👨‍👩‍👧‍👦), or combining marks, that can split a single visible
// character in half, producing a stray unpaired surrogate or an orphaned
// combining mark. Segmenting by grapheme cluster counts/cuts what a user
// actually sees as "one character," matching the visible 55-char limit.
const graphemeSegments = (s: string): string[] =>
  Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (seg) => seg.segment);

const truncateGraphemes = (s: string, max: number): string =>
  graphemeSegments(s).slice(0, max).join('');

/** Full-width section: heading above content. Used by the top of the page
 *  (Colour theme, Banner, identity, Items) — matching the reference, where
 *  only the lower sections use a label column. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-6 border-b border-border last:border-0">
      <h2 className="text-base font-bold text-secondary mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** Label-left section: ~200px label column, content to its right. In the
 *  reference this applies ONLY to the six lower sections (Announcement,
 *  About, Shop members, Shop policies, FAQ, Seller details) — measured from
 *  the screenshot, where those labels sit at the same baseline as their
 *  content while the sections above keep their heading on top. `meta` is the
 *  small print under the label (e.g. "Optional", "Last updated on …").
 *  Collapses to one column below lg so the label doesn't squeeze content. */
function LabelledSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3 lg:gap-8 py-8 border-b border-border last:border-0">
      <div>
        <h2 className="text-sm font-semibold text-secondary">{title}</h2>
        {meta}
      </div>
      <div>{children}</div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ShopHomeEditorPage() {
  const { ownStoreId, isPlatformContext, isReady } = useAdminMode();
  const qc = useQueryClient();
  const { alert, confirm } = useDialog();

  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerUploadProgress, setBannerUploadProgress] = useState<number | null>(null);
  const [uploadingLogo,   setUploadingLogo]   = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [taglineModalOpen,  setTaglineModalOpen]  = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [photoModalOpen,    setPhotoModalOpen]    = useState(false);
  const [logoModalOpen,     setLogoModalOpen]     = useState(false);
  const [layoutModalOpen,   setLayoutModalOpen]   = useState(false);
  // 'standard' maps to the stored 'grid'; 'none' clears featuredProductIds
  // rather than being a stored layout of its own.
  const [featuredLayout,    setFeaturedLayout]    = useState<'standard' | 'mixed' | 'none'>('standard');
  const [taglineDraft,    setTaglineDraft]    = useState('');
  const [locationDraft,   setLocationDraft]   = useState('');
  const [itemsSearch,     setItemsSearch]     = useState('');
  const [itemsSort,       setItemsSort]       = useState<ItemsSort>('recent');
  /** 'add' opens the single-section form directly; 'manage' opens the list. */
  const [sectionsModal,   setSectionsModal]   = useState<'add' | 'manage' | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [showFeaturedPicker, setShowFeaturedPicker] = useState(false);
  const [aboutDraft, setAboutDraft] = useState<{ headline?: string } | null>(null);
  const [editingStory, setEditingStory] = useState(false);
  const [storyDraft, setStoryDraft] = useState('');
  const [newFaq, setNewFaq] = useState<{ question: string; answer: string } | null>(null);
  const [savingFaq, setSavingFaq] = useState(false);
  const [addingSocialLink, setAddingSocialLink] = useState<{ platform: string; url: string } | null>(null);
  // Same read-then-write race as `photosBusy` above: add/remove both derive
  // the next array from the current `store.socialLinks` closure, so firing a
  // second one before the first's refetch lands can silently drop one of the
  // two intended changes (whichever PATCH response arrives last wins).
  const [socialLinksBusy, setSocialLinksBusy] = useState(false);
  const [themeExpanded, setThemeExpanded] = useState(false);
  // Shared "in flight" guard for the plain text-field Save buttons (Tagline,
  // Location, Announcement, Story, About headline) — a user can only be
  // editing one of these at a time in practice, so one flag is enough to
  // stop a fast double-click from firing the same PATCH twice.
  const [saving, setSaving] = useState(false);
  // Add/remove both read-then-write `store.aboutPhotoUrls` from the current
  // render's closure — firing a second one before the first's refetch lands
  // would silently resurrect a just-removed photo (or drop a just-added one).
  // Serializing them via this flag closes that window without a full
  // optimistic-update rewrite.
  const [photosBusy, setPhotosBusy] = useState(false);
  // The banner is a two-step "select then confirm" edit, matching Etsy's own
  // flow: picking a file shows a local object-URL preview + a bottom
  // Cancel/Save bar, and only Save actually uploads.
  const [bannerPreview, setBannerPreview] = useState<{ file: File; url: string } | null>(null);

  // Revoke the object URL if the user navigates away (or the file gets
  // replaced) while a banner preview is still pending, without going
  // through Save/Cancel — those already revoke it themselves, but neither
  // runs on unmount.
  useEffect(() => {
    if (!bannerPreview) return;
    const { url } = bannerPreview;
    return () => URL.revokeObjectURL(url);
  }, [bannerPreview]);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef   = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef  = useRef<HTMLInputElement>(null);
  const videoInputRef  = useRef<HTMLInputElement>(null);

  const storeQuery = useQuery<ShopHomeStore>({
    queryKey: ['shop-home', ownStoreId],
    queryFn:  () => api.get<ShopHomeStore>(API_ROUTES.ADMIN.STORE(ownStoreId)),
    enabled:  isReady && !isPlatformContext && !!ownStoreId,
  });
  const store = storeQuery.data;

  const subscriptionQuery = useQuery<SellerSubscriptionLite>({
    queryKey: ['shop-home-subscription', ownStoreId],
    queryFn:  () => api.get<SellerSubscriptionLite>(API_ROUTES.SELLER.SUBSCRIPTION),
    enabled:  isReady && !isPlatformContext && !!ownStoreId,
  });
  // Default to `true` (not locked) while the subscription query is still
  // loading — defaulting to `false` would flash a locked/upsell state at a
  // paying seller for a split second on every page load, which is worse than
  // the alternative: a non-Plus seller briefly sees unlocked swatches, but
  // clicking during that window still hits the server-enforced 403 (handled
  // below in patchStore) — access is never actually granted client-side.
  const hasPlusColorTheme = subscriptionQuery.data?.hasPlus ?? true;

  const productsQuery = useQuery<{ data: ShopProductRow[] }>({
    queryKey: ['shop-home-products', ownStoreId],
    queryFn:  () => api.get(`${API_ROUTES.ADMIN.STORE_PRODUCTS(ownStoreId)}?limit=50`),
    enabled:  isReady && !isPlatformContext && !!ownStoreId,
  });

  const taxInfoQuery = useQuery<TaxInfoLite | null>({
    queryKey: ['shop-home-tax-info'],
    queryFn:  () => api.get<TaxInfoLite | null>(API_ROUTES.ADMIN.FINANCES_TAX_INFO),
    enabled:  isReady && !isPlatformContext,
  });

  const featuredQuery = useQuery<PickedProduct[]>({
    queryKey: ['shop-home-featured', store?.featuredProductIds],
    queryFn:  async () => {
      const ids = store?.featuredProductIds ?? [];
      const results = await Promise.all(ids.map((id) => api.get<PickedProduct>(API_ROUTES.ADMIN.PRODUCT(id)).catch(() => null)));
      return results.filter((p): p is PickedProduct => !!p);
    },
    enabled: !!store,
  });

  const invalidateStore = () => qc.invalidateQueries({ queryKey: ['shop-home', ownStoreId] });

  // Returns whether the save actually succeeded — callers that close a modal
  // or clear a draft on completion must check this first, or a failed save
  // (error already shown via the alert below) would still discard the user's
  // edit as if it had gone through.
  const patchStore = async (payload: Record<string, unknown>): Promise<boolean> => {
    try {
      await api.patch(API_ROUTES.ADMIN.STORE(ownStoreId), payload);
      invalidateStore();
      return true;
    } catch (err) {
      // Covers the race where entitlement lapses between page load and
      // click (subscriptionQuery still says hasPlus, server disagrees) —
      // same upsell copy as the locked-swatch state below, not a raw
      // "Could not save" dead end.
      if (err instanceof ApiError && err.code === 'ERR_PLUS_REQUIRED') {
        await alert('This feature requires Ezihubb Plus. Visit Settings → Ezihubb Plus to learn more.', { variant: 'error' });
        return false;
      }
      await alert((err as Error).message || 'Could not save. Please try again.', { variant: 'error' });
      return false;
    }
  };

  const handleUpload = async (
    file: File,
    endpoint: string,
    setLoading: (v: boolean) => void,
    onProgress?: (progress: number) => void,
  ): Promise<StoreImageUploadResponse | null> => {
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.post<StoreImageUploadResponse>(endpoint, form, {
        onUploadProgress: (event) => {
          if (!event.total || !onProgress) return;
          onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        },
      });

      // Apply the canonical URL from the successful POST immediately. The old
      // flow discarded it and depended on a second GET, so a slow refetch made
      // the saved image appear only after a manual page reload.
      qc.setQueryData<ShopHomeStore>(['shop-home', ownStoreId], (current) => {
        if (!current) return current;
        return {
          ...current,
          ...(result.bannerUrl ? { bannerUrl: result.bannerUrl } : {}),
          ...(result.logoUrl ? { logoUrl: result.logoUrl } : {}),
        };
      });
      void invalidateStore();
      return result;
    } catch (err) {
      await alert((err as Error).message || 'Upload failed. Please try again.', { variant: 'error' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      await adminApi.post(API_ROUTES.USERS.AVATAR, form);
      invalidateStore();
      setPhotoModalOpen(false);
    } catch {
      await alert('Upload failed. Please try again.', { variant: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveBannerPreview = async () => {
    if (!bannerPreview) return;
    setBannerUploadProgress(0);
    const result = await handleUpload(
      bannerPreview.file,
      API_ROUTES.ADMIN.STORE_BANNER(ownStoreId),
      setUploadingBanner,
      setBannerUploadProgress,
    );
    // Only discard the local preview once the upload actually succeeded — on
    // failure (already surfaced via the alert in handleUpload) keep it, so
    // the user doesn't lose their selected file and can just retry Save.
    if (result?.bannerUrl) {
      URL.revokeObjectURL(bannerPreview.url);
      setBannerPreview(null);
    }
    setBannerUploadProgress(null);
  };

  const selectBannerFile = (file: File) => {
    if (!STORE_BANNER_TYPES.has(file.type)) {
      void alert('Banner must be a JPEG, PNG or WebP image.', { variant: 'error' });
      return;
    }
    if (file.size > STORE_BANNER_MAX_BYTES) {
      void alert('Banner must be smaller than 10 MB.', { variant: 'error' });
      return;
    }
    setBannerPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return { file, url: URL.createObjectURL(file) };
    });
  };

  const cancelBannerPreview = () => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview.url);
    setBannerPreview(null);
  };

  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data]);

  // Separate from the products query on purpose: this endpoint already counts
  // the listings in each section, so the rail can show them without widening
  // what adminGetStoreProducts selects.
  const { data: shopSections = [] } = useShopSections();
  // Search + sort are done client-side on the already-fetched page of
  // products — no extra request, and no API change (the payload already
  // carries createdAt; only the TS interface was missing it).
  const filteredProducts = useMemo(
    () => {
      const q = itemsSearch.trim().toLowerCase();
      const list = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : [...products];
      return list.sort((a, b) => itemsSort === 'name'
        ? a.name.localeCompare(b.name)
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [products, itemsSearch, itemsSort],
  );

  const sinceYear = store ? new Date(store.createdAt).getFullYear() : null;
  const ownerName = store ? [store.owner.firstName, store.owner.lastName].filter(Boolean).join(' ') || 'Shop owner' : '';

  // ── FAQ handlers ─────────────────────────────────────────────────────────────

  const saveFaq = async () => {
    if (!newFaq?.question.trim() || !newFaq?.answer.trim() || savingFaq) return;
    setSavingFaq(true);
    try {
      await api.post(API_ROUTES.ADMIN.STORE_FAQS(ownStoreId), newFaq);
      setNewFaq(null);
      invalidateStore();
    } catch (err) {
      await alert((err as Error).message || 'Could not add this FAQ.', { variant: 'error' });
    } finally {
      setSavingFaq(false);
    }
  };

  const deleteFaq = async (faqId: string) => {
    if (!await confirm('Delete this FAQ?', { confirmLabel: 'Delete', destructive: true })) return;
    try {
      await api.delete(API_ROUTES.ADMIN.STORE_FAQ(ownStoreId, faqId));
      invalidateStore();
    } catch (err) {
      await alert((err as Error).message || 'Could not delete this FAQ.', { variant: 'error' });
    }
  };

  const moveFaq = async (faqs: ShopFaq[], index: number, dir: -1 | 1) => {
    const next = [...faqs];
    const swapWith = index + dir;
    if (swapWith < 0 || swapWith >= next.length) return;
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    try {
      await api.patch(API_ROUTES.ADMIN.STORE_FAQS_REORDER(ownStoreId), { orderedIds: next.map((f) => f.id) });
      invalidateStore();
    } catch (err) {
      await alert((err as Error).message || 'Could not reorder FAQs.', { variant: 'error' });
    }
  };

  // ── Social links handlers ─────────────────────────────────────────────────────
  // `store.socialLinks` is a Json column with no DB-level shape guarantee —
  // the only write path (this DTO) always sends a real array, but a stray
  // manual DB edit could leave something else there. Guard with
  // Array.isArray rather than trusting the TS type, since `?? []` only
  // catches null/undefined, not "some other JSON value."
  const safeSocialLinks = Array.isArray(store?.socialLinks) ? store.socialLinks : [];

  const saveSocialLink = async () => {
    if (!addingSocialLink?.url.trim() || socialLinksBusy) return;
    setSocialLinksBusy(true);
    try {
      const ok = await patchStore({ socialLinks: [...safeSocialLinks, addingSocialLink] });
      if (ok) setAddingSocialLink(null);
    } finally {
      setSocialLinksBusy(false);
    }
  };

  const removeSocialLink = async (index: number) => {
    if (socialLinksBusy) return;
    setSocialLinksBusy(true);
    try {
      await patchStore({ socialLinks: safeSocialLinks.filter((_, i) => i !== index) });
    } finally {
      setSocialLinksBusy(false);
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────────

  if (isPlatformContext) {
    return (
      <div className="text-center py-16 border border-dashed border-border rounded-card">
        <p className="text-sm font-semibold text-secondary mb-1">Shop Home is managed per store</p>
        <p className="text-sm text-muted">Switch into a store to edit its storefront.</p>
      </div>
    );
  }

  if (!store) {
    return <div className="h-96 bg-muted/5 rounded-xl animate-pulse" />;
  }

  return (
    <div className={`max-w-[1200px] ${bannerPreview ? 'pb-20' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-secondary">Shop Home editor</h1>
        <div className="flex items-center gap-2">
          <a
            href={`${process.env.NEXT_PUBLIC_CLIENT_URL ?? 'http://localhost:3000'}/shops/${store.slug}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 border border-border text-secondary text-sm font-semibold rounded-pill hover:border-primary/40 transition-colors"
          >
            View on Ezihubb.com <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <ReloadButton queryKey={['shop-home', ownStoreId]} />
        </div>
      </div>
      <p className="text-sm text-muted mb-6">Customise how your shop appears to buyers.</p>

      {/* ── Colour theme (Ezihubb Plus) ──────────────────────────────────── */}
      <Section title="Colour theme">
        {/* Locked state. The reference screenshot shows an ungated shop, so it
            has NO locked variant — this shape is our own design: the same
            collapsed pill as the unlocked branch (so the section doesn't
            change size or position when Plus is granted), greyed and inert,
            with a dimmed 6-swatch teaser so the seller can see what they're
            missing. Nothing here is clickable except the link to the plan
            page — a pill that looks pressable and then errors would be a
            trap. */}
        {!hasPlusColorTheme ? (
          <div>
            <span
              title="Requires Ezihubb Plus"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-muted/10 text-muted border border-border text-sm font-semibold rounded-pill cursor-not-allowed select-none"
            >
              <Lock className="w-4 h-4" /> Add a colour theme
            </span>
            <div className="flex flex-wrap gap-3 mt-3 opacity-40 pointer-events-none" aria-hidden="true">
              {SHOP_COLOR_THEMES.slice(0, 6).map((t) => (
                <div key={t.value} className="w-9 h-9 rounded-full shrink-0" style={{ backgroundColor: t.hex }} />
              ))}
            </div>
            <p className="text-xs text-muted mt-3">
              Colour themes are an Ezihubb Plus feature.{' '}
              <Link href="/settings/plus" className="text-primary font-semibold hover:underline">
                See Ezihubb Plus
              </Link>
            </p>
          </div>
        ) : themeExpanded || store.colorTheme ? (
          <>
            <div className="flex flex-wrap gap-3">
              {SHOP_COLOR_THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => patchStore({ colorTheme: t.value })}
                  className={`w-9 h-9 rounded-full shrink-0 transition-all ${store.colorTheme === t.value ? 'ring-2 ring-offset-2 ring-secondary' : 'hover:scale-105'}`}
                  style={{ backgroundColor: t.hex }}
                />
              ))}
            </div>
            <p className="text-xs text-muted mt-3">Choose from hues inspired by your banner and shop icon to add a splash of colour to your Shop Home on Ezihubb.com</p>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setThemeExpanded(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold rounded-pill transition-colors"
          >
            <Plus className="w-4 h-4" /> Add a colour theme
          </button>
        )}
      </Section>

      {/* ── Banner + logo + name ─────────────────────────────────────────── */}
      <div className="py-6 border-b border-border">
        <div
          className={`relative w-full aspect-[4/1] rounded-xl overflow-hidden bg-muted/10 border cursor-pointer group ${bannerPreview ? 'border-2 border-dashed border-primary' : 'border-border'}`}
          onClick={() => !bannerPreview && bannerInputRef.current?.click()}
        >
          {bannerPreview ? (
            <Image src={bannerPreview.url} alt="" fill className="object-cover" unoptimized />
          ) : store.bannerUrl ? (
            <Image src={store.bannerUrl} alt="" fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">No banner set</div>
          )}
          {!bannerPreview && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity w-9 h-9 rounded-full bg-white/90 flex items-center justify-center">
                <Camera className="w-4 h-4 text-secondary" />
              </span>
            </div>
          )}
          <input ref={bannerInputRef} type="file" accept={STORE_BANNER_ACCEPT} className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) selectBannerFile(f);
            }} />
        </div>

        {bannerPreview && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border px-6 py-3 flex items-center justify-between shadow-2xl">
            <p className="text-sm font-medium text-secondary">You are editing your banner</p>
            <div className="flex gap-2">
              <button type="button" onClick={cancelBannerPreview} disabled={uploadingBanner} className="px-4 py-2 border border-border text-secondary text-sm font-semibold rounded-pill disabled:opacity-50">Cancel</button>
              <button type="button" onClick={saveBannerPreview} disabled={uploadingBanner} className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold rounded-pill disabled:opacity-50">
                {uploadingBanner
                  ? bannerUploadProgress === 100
                    ? 'Finishing...'
                    : `Uploading ${bannerUploadProgress ?? 0}%`
                  : 'Save'}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-start gap-4 mt-4">
          <div
            className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted/10 border border-border shrink-0 cursor-pointer group"
            onClick={() => setLogoModalOpen(true)}
          >
            {store.logoUrl ? (
              <Image src={store.logoUrl} alt="" fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-primary font-bold text-lg">{store.name[0]?.toUpperCase()}</div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <Camera className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-display text-xl font-bold text-secondary">{store.name}</p>

            <p className="text-sm text-muted mt-0.5 flex items-center gap-1.5">
              {store.tagline || <span className="italic">No tagline set</span>}
              <button type="button" onClick={() => { setTaglineDraft(store.tagline ?? ''); setTaglineModalOpen(true); }} className="text-muted hover:text-primary text-xs font-semibold underline">Edit</button>
            </p>

            <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
              {store.location || 'No location set'}
              <button type="button" onClick={() => { setLocationDraft(store.location ?? ''); setLocationModalOpen(true); }} className="text-muted hover:text-primary text-xs font-semibold underline">Edit</button>
            </p>
          </div>

          <div className="text-right shrink-0">
            <button type="button" onClick={() => setPhotoModalOpen(true)} className="relative w-10 h-10 rounded-full ml-auto block group">
              {store.owner.avatarUrl ? (
                <Image src={store.owner.avatarUrl} alt="" width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted/10 flex items-center justify-center text-muted text-sm font-semibold">{ownerName[0]?.toUpperCase()}</div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white border border-border flex items-center justify-center shadow-sm group-hover:bg-primary/10">
                <Camera className="w-2.5 h-2.5 text-secondary" />
              </span>
            </button>
            <p className="text-xs text-muted mt-1">{ownerName}</p>
            {/* Buyer-facing control, shown here because this editor previews
                the public shop page. Inert until its behaviour is decided —
                see docs backlog. */}
            <button
              type="button"
              disabled
              title="Coming soon"
              className="mt-1 ml-auto flex items-center gap-1 text-xs text-muted cursor-not-allowed"
            >
              <MessageSquare className="w-3 h-3" /> Contact
            </button>
          </div>
        </div>
      </div>

      {/* ── Items ────────────────────────────────────────────────────────── */}
      <section className="py-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-secondary">Items</h2>
          <div className="flex items-center gap-1.5 text-sm text-secondary">
            <span className="text-muted">Sort:</span>
            <Select
              value={itemsSort}
              onChange={(e) => setItemsSort(e.target.value as ItemsSort)}
              className="w-40"
              size="sm"
              options={[
                { value: 'recent', label: 'Most Recent' },
                { value: 'name', label: 'Name (A–Z)' },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          {/* ── Left rail: search, counts, shop stats ─────────────────────── */}
          <div>
            <div className="relative">
              <input
                value={itemsSearch}
                onChange={(e) => setItemsSearch(e.target.value)}
                placeholder="Search items"
                className="w-full pl-3.5 pr-9 py-2 border border-border rounded-pill text-sm text-secondary placeholder:text-muted bg-surface outline-none focus:border-secondary/40"
              />
              <Search className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* "On sale" still needs compareAtPrice from adminGetStoreProducts,
                which it does not select — see docs/etsy-ui-audit.md. Section
                counts do NOT need it: GET /admin/shop-sections already returns
                _count.products per section, so the rail can list them without
                touching the products query at all. */}
            <div className="mt-4">
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-secondary font-medium">All</span>
                <span className="text-muted">{products.length}</span>
              </div>

              {shopSections.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate text-secondary">{s.name}</span>
                  <span className="shrink-0 text-muted">{s._count.products}</span>
                </div>
              ))}

              {/* Both entry points sit with the sections themselves: a seller
                  looking at the rail and wondering how to change it should not
                  have to go looking for the control elsewhere. */}
              <div className="mt-2 flex items-center gap-3 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setSectionsModal('add')}
                  className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add section
                </button>
                {shopSections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSectionsModal('manage')}
                    className="text-sm text-muted hover:text-secondary hover:underline"
                  >
                    Manage
                  </button>
                )}
              </div>
            </div>

            {/* Static preview of what a buyer sees — this editor mirrors the
                public shop page, so the control belongs here even though a
                seller would never message themselves. No behaviour decided
                yet; see docs backlog. */}
            <button
              type="button"
              disabled
              title="Coming soon"
              className="mt-4 w-full flex items-center justify-center gap-1.5 px-3.5 py-2 border border-border rounded-pill text-sm text-muted bg-surface cursor-not-allowed"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Contact shop owner
            </button>

            <div className="mt-4 space-y-0.5">
              <p className="text-xs text-muted">{fmtNum(store.totalOrders)} Sales</p>
              <p className="text-xs text-muted">{fmtNum(store.followerCount)} Admirers</p>
            </div>
          </div>

          {/* ── Right: featured strip, then All Items ─────────────────────── */}
          <div className="min-w-0">
            {/* Seed the radio from what's actually stored, so reopening the
                modal doesn't silently show 'standard' for a store already on
                the mixed layout (and then save that back on Done). */}
            <button type="button" onClick={() => {
              setFeaturedLayout(store.featuredLayout === 'mixed' ? 'mixed' : store.featuredLayout === 'none' ? 'none' : 'standard');
              setLayoutModalOpen(true);
            }}
              className="w-full flex items-center justify-center gap-1.5 py-3 border border-border rounded-lg text-sm font-medium text-secondary hover:border-secondary/40 transition-colors">
              {store.featuredProductIds.length > 0
                ? <><LayoutGrid className="w-4 h-4" /> Change layout</>
                : <><Plus className="w-4 h-4" /> Featured area to highlight listings</>}
            </button>

            {(featuredQuery.data?.length ?? 0) > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
                {(featuredQuery.data ?? []).map((p) => (
                  <div key={p.id} className="relative rounded-lg overflow-hidden border-2 border-primary/40 aspect-square bg-muted/10">
                    {p.images?.[0]?.url && <Image src={p.images[0].url} alt={p.name} fill className="object-cover" />}
                    <span className="absolute top-1.5 left-1.5 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Featured</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-6 mb-4">
              <h3 className="text-base font-semibold text-secondary">All Items</h3>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="flex items-center gap-1.5 text-sm font-semibold text-muted cursor-not-allowed"
              >
                <Plus className="w-4 h-4" /> Rearrange items
              </button>
            </div>

            {filteredProducts.length === 0 ? (
              <p className="text-sm text-muted text-center py-10 border border-dashed border-border rounded-card">No items to show.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {filteredProducts.slice(0, 8).map((p) => (
                  <Link key={p.id} href={`/products/${p.id}/edit`} className="rounded-lg overflow-hidden border border-border bg-muted/5 aspect-square relative group">
                    {p.images?.[0]?.url && <Image src={p.images[0].url} alt={p.name} fill className="object-cover" />}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Announcement ─────────────────────────────────────────────────── */}
      <LabelledSection
        title="Announcement"
        meta={
          <>
            <p className="text-xs text-muted mt-1">Optional</p>
            {store.announcementUpdatedAt && (
              <p className="text-xs text-muted mt-1">
                Last updated on {fmtDate(store.announcementUpdatedAt)}
              </p>
            )}
          </>
        }
      >
        <p className="text-xs text-muted mb-2">
          {store.announcementUpdatedAt
            ? `Last updated on ${new Date(store.announcementUpdatedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}`
            : 'Optional'}
        </p>
        {editingAnnouncement ? (
          <>
            <textarea
              value={announcementDraft}
              onChange={(e) => setAnnouncementDraft(e.target.value)}
              autoFocus
              rows={4}
              placeholder="Welcome to your shop! Share news, seasonal updates, or a friendly hello."
              className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  const ok = await patchStore({ announcement: announcementDraft });
                  setSaving(false);
                  if (ok) setEditingAnnouncement(false);
                }}
                className="px-3.5 py-1.5 bg-primary text-white text-sm font-semibold rounded-pill disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" disabled={saving} onClick={() => setEditingAnnouncement(false)} className="px-3.5 py-1.5 border border-border text-secondary text-sm font-medium rounded-pill disabled:opacity-50">Cancel</button>
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-secondary whitespace-pre-line">
              {store.announcement || <span className="text-muted italic">Welcome to your shop! Share news, seasonal updates, or a friendly hello.</span>}
            </p>
            <button type="button" onClick={() => { setAnnouncementDraft(store.announcement ?? ''); setEditingAnnouncement(true); }} className="shrink-0 flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        )}
      </LabelledSection>

      {/* ── About ────────────────────────────────────────────────────────── */}
      <LabelledSection title={`About ${store.name}`}>
        {/* Stat pair: small muted label above a large value, as in the
            reference. "On Ezihubb since" — our own brand, not the
            marketplace the screenshot came from. */}
        <div className="flex gap-12 mb-6">
          <div>
            <p className="text-xs text-muted">Sales</p>
            <p className="text-xl font-bold text-secondary mt-0.5">{fmtNum(store.totalOrders)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">On Ezihubb since</p>
            <p className="text-xl font-bold text-secondary mt-0.5">{sinceYear}</p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm font-semibold text-secondary">Add a video and up to 5 photos</p>
          <p className="text-xs text-muted mt-0.5 mb-3">
            Share photos of your process, workspace or anything that can inspire your buyers.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted text-[10px] gap-1 hover:border-primary/40 hover:text-primary transition-colors"
            >
              <Video className="w-4 h-4" />
              {store.aboutVideoUrl ? 'Video set' : 'Add Video'}
            </button>
            <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const presigned = await api.post<{ presignedUrl: string; publicUrl: string }[]>(
                    API_ROUTES.ADMIN.ASSETS_PRESIGN,
                    { files: [{ name: f.name, mimeType: f.type }] },
                  );
                  await fetch(presigned[0].presignedUrl, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f });
                  await patchStore({ aboutVideoUrl: presigned[0].publicUrl });
                } catch { await alert('Upload failed. Please try again.', { variant: 'error' }); }
              }} />
            {store.aboutPhotoUrls.map((url) => (
              <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                <Image src={url} alt="" fill className="object-cover" />
                <button type="button"
                  disabled={photosBusy}
                  onClick={async () => {
                    setPhotosBusy(true);
                    try { await patchStore({ aboutPhotoUrls: store.aboutPhotoUrls.filter((u) => u !== url) }); }
                    finally { setPhotosBusy(false); }
                  }}
                  className="absolute top-1 right-1 p-0.5 bg-black/60 rounded text-white disabled:opacity-50"><X className="w-3 h-3" /></button>
              </div>
            ))}
            {store.aboutPhotoUrls.length < 5 && (
              <button type="button" disabled={photosBusy} onClick={() => photoInputRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted hover:border-primary/40 hover:text-primary transition-colors gap-1 disabled:opacity-50">
                <ImagePlus className="w-4 h-4" />
                <span className="text-[10px] leading-tight text-center">Add photos</span>
              </button>
            )}
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setPhotosBusy(true);
                try {
                  const presigned = await api.post<{ presignedUrl: string; publicUrl: string }[]>(
                    API_ROUTES.ADMIN.ASSETS_PRESIGN,
                    { files: [{ name: f.name, mimeType: f.type }] },
                  );
                  await fetch(presigned[0].presignedUrl, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f });
                  await patchStore({ aboutPhotoUrls: [...store.aboutPhotoUrls, presigned[0].publicUrl] });
                } catch { await alert('Upload failed. Please try again.', { variant: 'error' }); }
                finally { setPhotosBusy(false); }
              }} />
          </div>
        </div>

        {aboutDraft !== null ? (
          <div className="flex items-center gap-2 mb-3">
            <input value={aboutDraft.headline ?? ''} onChange={(e) => setAboutDraft({ headline: e.target.value })} autoFocus maxLength={150}
              placeholder="Add a headline"
              className="flex-1 h-9 px-3 text-sm border border-border rounded-input focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const ok = await patchStore({ aboutHeadline: aboutDraft.headline });
                setSaving(false);
                if (ok) setAboutDraft(null);
              }}
              className="p-1.5 rounded hover:bg-primary/10 text-primary disabled:opacity-50"
            ><Check className="w-4 h-4" /></button>
            <button type="button" disabled={saving} onClick={() => setAboutDraft(null)} className="p-1.5 rounded hover:bg-muted/10 text-muted disabled:opacity-50"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => setAboutDraft({ headline: store.aboutHeadline ?? '' })}
            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline mb-3">
            <Plus className="w-4 h-4" /> {store.aboutHeadline || 'Add a headline'}
          </button>
        )}

        {editingStory ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={storyDraft}
              onChange={(e) => setStoryDraft(e.target.value)}
              autoFocus
              rows={4}
              placeholder="How did you get started? What inspires you? We know each seller's story is unique – tell yours here."
              className="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  const ok = await patchStore({ description: storyDraft });
                  setSaving(false);
                  if (ok) setEditingStory(false);
                }}
                className="px-3.5 py-1.5 bg-primary text-white text-sm font-semibold rounded-pill disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" disabled={saving} onClick={() => setEditingStory(false)} className="px-3.5 py-1.5 border border-border text-secondary text-sm font-medium rounded-pill disabled:opacity-50">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-secondary whitespace-pre-line mb-3">
              {store.description || <span className="text-muted italic">Add your story. Tell shoppers a little about your business.</span>}
            </p>
            <button
              type="button"
              onClick={() => { setStoryDraft(store.description ?? ''); setEditingStory(true); }}
              className="text-sm font-semibold text-primary hover:underline"
            >
              {store.description ? 'Edit your story' : 'Add your story'} →
            </button>
          </>
        )}

        {safeSocialLinks.length > 0 && (
          <div className="space-y-1.5 mt-3">
            {safeSocialLinks.map((link, i) => (
              <div key={`${link.platform}-${i}`} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-secondary w-20 shrink-0">
                  {SOCIAL_PLATFORMS.find((p) => p.value === link.platform)?.label ?? link.platform}
                </span>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">{link.url}</a>
                <button type="button" disabled={socialLinksBusy} onClick={() => removeSocialLink(i)} className="ml-auto p-1 rounded hover:bg-red-50 text-muted hover:text-red-500 shrink-0 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {addingSocialLink ? (
          <div className="flex items-center gap-2 mt-3">
            <Select
              value={addingSocialLink.platform}
              onChange={(e) => setAddingSocialLink({ ...addingSocialLink, platform: e.target.value })}
              className="w-36 shrink-0"
              size="sm"
              options={SOCIAL_PLATFORMS}
            />
            <input
              value={addingSocialLink.url}
              onChange={(e) => setAddingSocialLink({ ...addingSocialLink, url: e.target.value })}
              autoFocus
              placeholder="https://…"
              className="flex-1 h-9 px-3 text-sm border border-border rounded-input focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button type="button" disabled={socialLinksBusy} onClick={() => setAddingSocialLink(null)} className="text-sm font-semibold text-secondary hover:underline disabled:opacity-50">Cancel</button>
            <button type="button" disabled={socialLinksBusy} onClick={saveSocialLink} className="text-sm font-semibold text-primary hover:underline disabled:opacity-50">{socialLinksBusy ? 'Saving…' : 'Save'}</button>
          </div>
        ) : safeSocialLinks.length < 5 && (
          <button
            type="button"
            onClick={() => setAddingSocialLink({ platform: SOCIAL_PLATFORMS[0].value, url: '' })}
            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline mt-3"
          >
            <Plus className="w-4 h-4" /> Add links to your website and social media
          </button>
        )}
      </LabelledSection>

      {/* ── Shop members ─────────────────────────────────────────────────── */}
      <LabelledSection title="Shop members">
        <div className="flex items-start gap-3">
          {store.owner.avatarUrl ? (
            <Image src={store.owner.avatarUrl} alt="" width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted/10 flex items-center justify-center text-muted text-sm font-semibold shrink-0">{ownerName[0]?.toUpperCase()}</div>
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold text-secondary">{ownerName}</p>
            <textarea
              defaultValue={store.ownerBio ?? ''}
              onBlur={(e) => { if (e.target.value !== (store.ownerBio ?? '')) patchStore({ ownerBio: e.target.value }); }}
              rows={2}
              placeholder="Add a personal bio with some fun facts about yourself"
              className="w-full mt-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
        </div>
      </LabelledSection>

      {/* ── Shop policies ────────────────────────────────────────────────── */}
      <LabelledSection title="Shop policies">
        <div className="bg-hero-periwinkle rounded-card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-secondary">Set up simple shop policies</p>
            <p className="text-xs text-secondary/70 mt-0.5">We&apos;ll give you a quick template to create your shop policies in seconds.</p>
          </div>
          <Link href="/products" className="shrink-0 px-4 py-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-bold rounded-pill transition-colors">
            Try it now
          </Link>
        </div>
      </LabelledSection>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <LabelledSection title="Frequently asked questions">
        <p className="text-xs text-muted mb-3">Information in your FAQs may not contradict Ezihubb&apos;s policies or your own shop policies.</p>
        {store.faqs.length > 0 && (
          <div className="space-y-2 mb-3">
            {store.faqs.map((f, i) => (
              <div key={f.id} className="border border-border rounded-lg p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-secondary">{f.question}</p>
                    <p className="text-xs text-muted mt-0.5">{f.answer}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" onClick={() => moveFaq(store.faqs, i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-muted/10 text-muted disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => moveFaq(store.faqs, i, 1)} disabled={i === store.faqs.length - 1} className="p-1 rounded hover:bg-muted/10 text-muted disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => deleteFaq(f.id)} className="p-1 rounded hover:bg-red-50 text-muted hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {newFaq ? (
          <div className="border border-border rounded-lg p-3.5 space-y-2">
            <input value={newFaq.question} onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })} placeholder="Question" autoFocus
              className="w-full h-9 px-3 text-sm border border-border rounded-input focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <textarea value={newFaq.answer} onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })} placeholder="Answer" rows={2}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
            <div className="flex gap-2">
              <button type="button" disabled={savingFaq} onClick={saveFaq} className="px-3.5 py-1.5 bg-primary text-white text-sm font-semibold rounded-pill disabled:opacity-50">{savingFaq ? 'Saving…' : 'Save'}</button>
              <button type="button" disabled={savingFaq} onClick={() => setNewFaq(null)} className="px-3.5 py-1.5 border border-border text-secondary text-sm font-medium rounded-pill disabled:opacity-50">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setNewFaq({ question: '', answer: '' })} className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <Plus className="w-4 h-4" /> Add an FAQ
          </button>
        )}
      </LabelledSection>

      {/* ── Seller details ───────────────────────────────────────────────── */}
      <LabelledSection title="Seller details">
        <p className="text-sm font-semibold text-secondary mb-1">Your seller status in the EU</p>
        <p className="text-xs text-muted mb-2 max-w-xl">
          If you&apos;re an incorporated business on Ezihubb, you&apos;re likely considered a professional seller in the EU (known as a trader).
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-secondary">
            Status: <span className="font-semibold">{taxInfoQuery.data?.sellerType === 'BUSINESS' ? 'Incorporated business' : 'Private individual'}</span>
          </span>
          <Link href="/finances/tax-information" className="text-sm font-semibold text-primary hover:underline">Edit</Link>
        </div>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-muted cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Add more details for buyers
        </button>
      </LabelledSection>

      {/* ── Shop location modal ──────────────────────────────────────────── */}
      <Modal isOpen={locationModalOpen} onClose={() => setLocationModalOpen(false)} size="sm">
        <ModalHeader onClose={() => setLocationModalOpen(false)}>Shop location</ModalHeader>
        <ModalBody>
          <p className="text-sm text-secondary mb-3">Start typing and choose from a suggested city to help others find you.</p>
          <input
            value={locationDraft}
            onChange={(e) => setLocationDraft(e.target.value)}
            autoFocus
            maxLength={150}
            placeholder="e.g. Hai Phong, Vietnam"
            className="w-full h-10 px-3 text-sm border border-border rounded-input focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setLocationModalOpen(false)} disabled={saving} className="px-4 py-2 border border-border text-secondary text-sm font-semibold rounded-pill disabled:opacity-50">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await patchStore({ location: locationDraft });
              setSaving(false);
              if (ok) setLocationModalOpen(false);
            }}
            className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold rounded-pill disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </ModalFooter>
      </Modal>

      {/* ── Tagline modal ────────────────────────────────────────────────── */}
      <Modal isOpen={taglineModalOpen} onClose={() => setTaglineModalOpen(false)} size="sm">
        <ModalHeader onClose={() => setTaglineModalOpen(false)}>Tagline</ModalHeader>
        <ModalBody>
          <div className="relative">
            <textarea
              value={taglineDraft}
              onChange={(e) => setTaglineDraft(truncateGraphemes(e.target.value, 55))}
              autoFocus
              rows={2}
              className="w-full px-3 py-2.5 pb-5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
            <span className="absolute bottom-1.5 right-2.5 text-xs text-muted">{graphemeSegments(taglineDraft).length}/55</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-secondary mb-2">Google search results preview</p>
            <div className="border border-border rounded-lg p-3">
              <p className="text-[#1a0dab] text-sm truncate">{(taglineDraft || store.tagline) ? `${taglineDraft || store.tagline} by ${store.name}` : store.name}</p>
              <p className="text-[#006621] text-xs mt-0.5">https://www.ezihubb.com/shops/{store.slug}</p>
            </div>
            <p className="text-xs text-muted mt-2">Have questions? <span className="underline">Learn more about how your shop appears on Google.</span></p>
          </div>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setTaglineModalOpen(false)} disabled={saving} className="px-4 py-2 border border-border text-secondary text-sm font-semibold rounded-pill disabled:opacity-50">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await patchStore({ tagline: taglineDraft });
              setSaving(false);
              if (ok) setTaglineModalOpen(false);
            }}
            className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold rounded-pill disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </ModalFooter>
      </Modal>

      {/* ── Add a profile photo modal ────────────────────────────────────── */}
      <Modal isOpen={photoModalOpen} onClose={() => setPhotoModalOpen(false)} size="sm">
        <ModalHeader onClose={() => setPhotoModalOpen(false)}>Add a profile photo</ModalHeader>
        <ModalBody>
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-28 h-28 rounded-full bg-muted/10 flex items-center justify-center mb-4 overflow-hidden">
              {store.owner.avatarUrl ? (
                <Image src={store.owner.avatarUrl} alt="" width={112} height={112} className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-muted" />
              )}
            </div>
            <p className="text-sm font-semibold text-secondary mb-1">Now update your owner photo</p>
            <p className="text-xs text-muted mb-1">This should clearly show your smiling face. (See examples)</p>
            <p className="text-xs text-muted mb-4">Must be a .jpg, .gif or .png file smaller than 10 MB and at least 400px by 400px.</p>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold rounded-pill disabled:opacity-50"
            >
              {uploadingAvatar ? 'Uploading…' : 'Choose a file'}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleAvatarUpload(f); }} />
          </div>
        </ModalBody>
      </Modal>

      {/* ── Logo modal ───────────────────────────────────────────────────── */}
      <Modal isOpen={logoModalOpen} onClose={() => setLogoModalOpen(false)} size="sm">
        <ModalHeader onClose={() => setLogoModalOpen(false)}>Logo</ModalHeader>
        <ModalBody>
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-32 h-32 rounded-lg overflow-hidden border border-border bg-muted/10 mb-4">
              {store.logoUrl ? (
                <Image src={store.logoUrl} alt="" width={128} height={128} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-primary font-bold text-2xl">{store.name[0]?.toUpperCase()}</div>
              )}
            </div>
            <div className="flex items-center gap-2.5 mb-4 px-3 py-2 border border-border rounded-lg w-full max-w-[220px] text-left">
              <div className="w-9 h-9 rounded overflow-hidden bg-muted/10 shrink-0">
                {store.logoUrl ? (
                  <Image src={store.logoUrl} alt="" width={36} height={36} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-primary font-bold text-xs">{store.name[0]?.toUpperCase()}</div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-secondary truncate">{store.name}</p>
                <p className="text-[10px] text-amber-500">★★★★★</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-secondary mb-1">Upload your logo</p>
            <p className="text-xs text-muted mb-1 max-w-[260px]">Make this a photo or logo that represents your business. (See examples)</p>
            <p className="text-xs text-muted mb-4">Must be a .jpg, .gif or .png file smaller than 10 MB and at least 500px by 500px.</p>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold rounded-pill disabled:opacity-50"
            >
              {uploadingLogo ? 'Uploading…' : 'Choose a file'}
            </button>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, API_ROUTES.ADMIN.STORE_LOGO(ownStoreId), setUploadingLogo); e.target.value = ''; }} />
          </div>
        </ModalBody>
      </Modal>

      {/* ── Choose featured layout modal ─────────────────────────────────── */}
      <Modal isOpen={layoutModalOpen} onClose={() => setLayoutModalOpen(false)} size="lg">
        <ModalHeader onClose={() => setLayoutModalOpen(false)}>Choose featured layout</ModalHeader>
        <ModalBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-border cursor-pointer hover:border-secondary/40">
                <input type="radio" name="featured-layout" checked={featuredLayout === 'standard'} onChange={() => setFeaturedLayout('standard')} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-secondary">Standard grid</span>
                  <span className="block text-xs text-muted mt-0.5">Feature up to four listings or sections with equally sized photos</span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-border cursor-pointer hover:border-secondary/40">
                <input type="radio" name="featured-layout" checked={featuredLayout === 'none'} onChange={() => setFeaturedLayout('none')} className="mt-0.5" />
                <span className="block text-sm font-semibold text-secondary">None</span>
              </label>

              {/* Mixed grid — Ezihubb Plus. Shown to everyone (it is the
                  upsell), selectable only with an active subscription; the
                  server enforces the same rule in adminUpdateStore. */}
              {!hasPlusColorTheme && (
                <div className="flex items-center gap-2 pt-2 text-xs text-muted">
                  <span>Available with upgrade</span>
                  <Link href="/settings/plus" className="text-primary font-semibold hover:underline">Learn more</Link>
                </div>
              )}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-lg border border-border ${
                  hasPlusColorTheme ? 'cursor-pointer hover:border-secondary/40' : 'opacity-55 cursor-not-allowed'
                }`}
              >
                <input
                  type="radio"
                  name="featured-layout"
                  disabled={!hasPlusColorTheme}
                  checked={featuredLayout === 'mixed'}
                  onChange={() => setFeaturedLayout('mixed')}
                  className="mt-0.5"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-secondary">
                    Mixed grid
                    {!hasPlusColorTheme && <Lock className="w-3 h-3 text-muted" />}
                  </span>
                  <span className="block text-xs text-muted mt-0.5">Feature one large photo alongside four smaller ones</span>
                </span>
              </label>
            </div>
            <div className="rounded-lg bg-muted/5 border border-border flex items-center justify-center p-4">
              {featuredLayout === 'mixed' ? (
                /* No dedicated mixed-grid preview asset exists yet, and an
                   <Image src> pointing at a missing file renders as a broken
                   image (see middleware.ts — that is exactly how the standard
                   preview broke in production). A CSS mock of the real
                   layout — one large tile + four small — is accurate and has
                   nothing to 404. Replace with a designed asset when one exists. */
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 grid-rows-2 gap-1.5" aria-label="Mixed grid preview">
                  <div className="col-span-1 row-span-2 rounded bg-muted/25" />
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded bg-muted/20 aspect-[4/3]" />
                  ))}
                </div>
              ) : (
                <Image src="/images/featured-layout-standard-grid.png" alt="Standard grid preview" width={450} height={85} className="w-full h-auto" />
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setLayoutModalOpen(false)} className="px-4 py-2 border border-border text-secondary text-sm font-semibold rounded-pill">Cancel</button>
          <button
            type="button"
            onClick={async () => {
              setLayoutModalOpen(false);
              if (featuredLayout === 'none') {
                await patchStore({ featuredProductIds: [], featuredLayout: 'none' });
                return;
              }
              // Persist the layout itself before opening the picker. 'mixed'
              // is rejected server-side without Plus (ERR_PLUS_REQUIRED,
              // surfaced by patchStore) — the disabled radio is only the
              // first line of defence, not the enforcement.
              const saved = await patchStore({ featuredLayout: featuredLayout === 'mixed' ? 'mixed' : 'grid' });
              if (saved) setShowFeaturedPicker(true);
            }}
            className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white text-sm font-semibold rounded-pill"
          >
            Done
          </button>
        </ModalFooter>
      </Modal>

      {/* ── Featured picker ──────────────────────────────────────────────── */}
      {/* 'add' skips straight to the form — the rail's Add button should not
          make the seller walk through the list first. Both paths close to the
          same place. */}
      {sectionsModal === 'manage' && (
        <ManageSectionsModal onClose={() => setSectionsModal(null)} />
      )}
      {sectionsModal === 'add' && (
        <EditSectionModal section={null} onClose={() => setSectionsModal(null)} />
      )}
      {showFeaturedPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowFeaturedPicker(false)}>
          <div className="bg-surface rounded-card border border-border shadow-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-secondary flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> Featured area</h4>
              <button type="button" onClick={() => setShowFeaturedPicker(false)} className="p-1.5 rounded hover:bg-muted/10 text-muted"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted mb-3">Pin up to 4 listings to highlight at the top of your shop.</p>
            <ListingPicker
              selected={featuredQuery.data ?? []}
              max={4}
              onChange={(picked) => patchStore({ featuredProductIds: picked.map((p) => p.id) })}
            />
            <div className="flex justify-end mt-4">
              <button type="button" onClick={() => setShowFeaturedPicker(false)} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-pill">Done</button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted flex items-center gap-1.5 py-4">
        <MessageSquareHeart className="w-3.5 h-3.5" /> {fmtNum(store.followerCount)} admirer{store.followerCount !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
