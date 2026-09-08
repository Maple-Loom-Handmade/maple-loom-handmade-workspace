'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { signOut } from 'next-auth/react';
import { Loader2, KeyRound } from 'lucide-react';
import { API_ROUTES } from '@ezihubb/constants';
import { api } from '../../../lib/api-client';
import { toast } from '../../../lib/store/toast.store';
import { SignInHistory } from '../../../components/account/SignInHistory';
import { AdminPageHeader } from '../../../components/layout/AdminPageHeader';

/** Matches the API's own rule, so the form fails before the request does. */
const MIN_PASSWORD = 8;

/**
 * The signed-in person's own account, as opposed to the shop's or the
 * platform's.
 *
 * At /account rather than under /settings on purpose: everything in Store
 * Settings is scoped to a shop and hidden from a platform-context
 * SUPER_ADMIN, while these two actions belong to whoever is logged in,
 * whatever they happen to be looking at.
 */
export default function AccountPage() {

  // hasPassword, because a Google-only account has never had one and asking it
  // to prove the current password would be asking for something that does not
  // exist. The API draws the same distinction; this only stops the form
  // demanding a field the request would then reject.
  const { data: me, isLoading } = useQuery<{ email: string; hasPassword: boolean }>({
    queryKey: ['me'],
    queryFn:  () => api.get(API_ROUTES.USERS.ME),
  });
  const hasPassword = me?.hasPassword ?? true;

  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');

  const changePassword = useMutation({
    mutationFn: () =>
      api.post(API_ROUTES.AUTH.CHANGE_PASSWORD, {
        currentPassword: hasPassword ? current : undefined,
        newPassword:     next,
      }),
    onSuccess: async () => {
      toast.success(hasPassword ? 'Password changed' : 'Password set');
      // Not a courtesy redirect. Changing a password revokes every refresh
      // token on the account, this one included, so the session in this tab is
      // already dead. Staying would look signed in until the first request
      // that needed a refresh, then fail in a way nobody could explain.
      await signOut({ callbackUrl: '/login' });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSave =
    next.length >= MIN_PASSWORD &&
    confirm === next &&
    (!hasPassword || current.length > 0) &&
    !changePassword.isPending;

  const field =
    'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20';

  return (
    <div className="w-full max-w-[1400px] space-y-6">
      <AdminPageHeader title="Account" subtitle={me?.email ?? ''} />

      {/* Password */}
      <section className="max-w-xl rounded-card border border-border bg-surface p-4 shadow-card sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-secondary">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {hasPassword ? 'Change password' : 'Set a password'}
        </h2>

        {!hasPassword && !isLoading && (
          <p className="mt-1 text-xs text-muted">
            This account signs in with Google and has no password yet. Setting one
            does not remove Google sign-in; it adds a second way in.
          </p>
        )}

        <div className="mt-4 space-y-3">
          {hasPassword && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className={field}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={field}
            />
            {tooShort && (
              <span className="mt-1 block text-xs text-error">
                At least {MIN_PASSWORD} characters.
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={field}
            />
            {mismatch && (
              <span className="mt-1 block text-xs text-error">These do not match.</span>
            )}
          </label>
        </div>


        <p className="mt-3 text-xs text-muted">
          All sessions will be signed out. You will be asked to sign in again.
        </p>

        <button
          type="button"
          disabled={!canSave}
          onClick={() => changePassword.mutate()}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {changePassword.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {hasPassword ? 'Change password' : 'Set password'}
        </button>
      </section>

      <SignInHistory />
    </div>
  );
}
