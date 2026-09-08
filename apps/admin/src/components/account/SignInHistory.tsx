'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { signOut } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { API_ROUTES } from '@ezihubb/constants';
import { api } from '../../lib/api-client';
import { useDialog } from '../../contexts/DialogContext';

interface SessionEntry {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  location: string | null;
  isCurrent: boolean;
  status: 'ACTIVE' | 'SIGNED_OUT' | 'EXPIRED';
}

interface SessionHistory {
  data: SessionEntry[];
  totalPages: number;
  legacySession: boolean;
}

function describeDevice(ua: string | null): string {
  if (!ua) return 'Unavailable';
  const browser = [
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ] as const;
  const match = browser.map(([name, pattern]) => ({ name, version: ua.match(pattern)?.[1]?.split('.')[0] }))
    .find((entry) => entry.version);
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux' : null;
  return [match ? `${match.name} ${match.version}` : 'Unknown browser', os].filter(Boolean).join(' on ');
}

export function SignInHistory() {
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const history = useQuery<SessionHistory>({
    queryKey: ['sign-in-history', page],
    queryFn: () => api.get(API_ROUTES.AUTH.SESSIONS, { params: { page } }),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const revoke = useMutation({
    mutationFn: (entry: SessionEntry) => api.delete(API_ROUTES.AUTH.SESSION(entry.id)),
    onSuccess: async (_result, entry) => {
      if (entry.isCurrent) await signOut({ callbackUrl: '/login' });
      else await queryClient.invalidateQueries({ queryKey: ['sign-in-history'] });
    },
  });
  const revokeAll = useMutation({
    mutationFn: () => api.post(API_ROUTES.AUTH.LOGOUT_ALL),
    onSuccess: async () => { await signOut({ callbackUrl: '/login' }); },
  });
  const busy = revoke.isPending || revokeAll.isPending;

  return (
    <section aria-labelledby="sign-in-history-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:gap-8">
        <div>
          <h2 id="sign-in-history-heading" className="text-xl font-semibold text-secondary">Review your sign-in history</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-secondary">
            Make sure you recognize all recent sign-in activity for your account. You can sign out anywhere you’re still signed in.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (await dialog.confirm('Every session on this account will be signed out, including this one.', {
              title: 'Sign out everywhere', destructive: true,
            })) revokeAll.mutate();
          }}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-secondary px-5 py-3 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/5 disabled:opacity-50"
        >
          {revokeAll.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Sign out everywhere
        </button>
      </div>

      {history.data?.legacySession && (
        <p className="mt-4 text-sm text-muted">This sign-in predates session history. Sign in again to record this device. Sign out everywhere also closes older sessions.</p>
      )}
      <div className="mt-5 overflow-x-auto" aria-busy={history.isFetching}>
        <table className="w-full min-w-[850px] text-left text-sm">
          <caption className="sr-only">Recent sign-ins for your account</caption>
          <thead>
            <tr>
              {['Time', 'Browser/Device', 'IP Address', 'Location', 'Status'].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-4 font-semibold text-secondary first:pl-0 last:text-right last:pr-0">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-b border-border">
            {history.isPending ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted"><span role="status">Loading sign-in history…</span></td></tr>
            ) : history.isError ? (
              <tr><td colSpan={5} className="py-8 text-center">
                <p role="alert" className="text-error">Could not load your sign-in history.</p>
                <button type="button" onClick={() => history.refetch()} className="mt-2 font-semibold underline">Try again</button>
              </td></tr>
            ) : !history.data?.data.length ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted">No recorded sign-ins yet. New sign-ins will appear here.</td></tr>
            ) : history.data.data.map((entry) => {
              const date = new Date(entry.createdAt);
              return (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap py-6 pr-3 text-secondary">
                    <time dateTime={entry.createdAt} title={format(date, 'PPpp')}>
                      {Date.now() - date.getTime() < 86400000 ? formatDistanceToNowStrict(date, { addSuffix: true }) : format(date, 'MMM d, yyyy')}
                    </time>
                  </td>
                  <td className="px-3 py-6 text-secondary" title={entry.userAgent ?? undefined}>{describeDevice(entry.userAgent)}</td>
                  <td className="whitespace-nowrap px-3 py-6 tabular-nums text-secondary">{entry.ipAddress?.replace(/^::ffff:/, '') ?? 'Unavailable'}</td>
                  <td className="px-3 py-6 text-secondary">{entry.location ?? 'Unavailable'}</td>
                  <td className="whitespace-nowrap py-6 pl-3 text-right">
                    {entry.status !== 'ACTIVE' ? (
                      <span className="text-muted">{entry.status === 'EXPIRED' ? 'Expired' : 'Signed out'}</span>
                    ) : entry.isCurrent ? (
                      <span className="font-medium text-secondary">This session</span>
                    ) : (
                      <button
                        type="button" disabled={busy}
                        aria-label={`Sign out ${describeDevice(entry.userAgent)} signed in ${format(date, 'PP')}`}
                        onClick={async () => {
                          if (await dialog.confirm(`Sign out ${describeDevice(entry.userAgent)}? This device will need to sign in again.`, { title: 'Sign out device', destructive: true })) revoke.mutate(entry);
                        }}
                        className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-semibold text-secondary hover:bg-secondary/5 disabled:opacity-50"
                      >
                        {revoke.isPending && revoke.variables.id === entry.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        Sign out
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(history.data?.totalPages ?? 0) > 1 && (
        <nav aria-label="Sign-in history pages" className="mt-5 flex items-center justify-end gap-4 text-sm">
          <button type="button" disabled={page === 1 || history.isFetching} onClick={() => setPage(page - 1)} className="rounded-full border border-border px-4 py-2 disabled:opacity-40">Previous</button>
          <span>Page {page} of {history.data?.totalPages}</span>
          <button type="button" disabled={page >= (history.data?.totalPages ?? 1) || history.isFetching} onClick={() => setPage(page + 1)} className="rounded-full border border-border px-4 py-2 disabled:opacity-40">Next</button>
        </nav>
      )}
    </section>
  );
}
