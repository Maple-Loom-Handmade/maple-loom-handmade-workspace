'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Loader2, ShieldCheck } from 'lucide-react';
import { apiClient } from '@ezihubb/api-client';
import { API_ROUTES, CLIENT_ROUTES } from '@ezihubb/constants';
import type { NotificationPreferences } from '@ezihubb/types';
import { useAuthQuery, useAuthMutation } from '../../../../../lib/hooks/useAuthQuery';
import { useAuthStore } from '../../../../../lib/store/auth.store';

const preferenceKeys = ['pushEnabled', 'emailMessages', 'emailReviewReminders', 'emailOffers'] as const;

export default function SettingsPage() {
  const t = useTranslations('account.settings');
  const locale = useLocale();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const queryKey = ['notification-preferences', user?.id];
  const settings = useAuthQuery<NotificationPreferences>(queryKey, API_ROUTES.USERS.NOTIFICATION_PREFERENCES);
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [saved, setSaved] = useState(false);
  const values = draft ?? settings.data;
  const dirty = Boolean(draft && settings.data && preferenceKeys.some((key) => draft[key] !== settings.data?.[key]));
  const save = useAuthMutation(
    (preferences: NotificationPreferences, token) => apiClient.patch<NotificationPreferences>(API_ROUTES.USERS.NOTIFICATION_PREFERENCES, preferences, { token }),
    { onSuccess: (preferences) => {
      queryClient.setQueryData(queryKey, preferences);
      setDraft(null);
      setSaved(true);
    } },
  );

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank' || link.href === window.location.href) return;
      if (!window.confirm(t('leaveWarning'))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty, t]);

  const update = (key: keyof NotificationPreferences, checked: boolean) => {
    if (!values) return;
    setDraft({ ...values, [key]: checked });
    setSaved(false);
    save.reset();
  };

  if (settings.isError) return (
    <div role="alert" className="rounded-xl border border-border p-8 text-center">
      <p>{t('loadError')}</p>
      <button onClick={() => settings.refetch()} className="mt-4 font-semibold underline">{t('retry')}</button>
    </div>
  );
  if (!values) return <div role="status" aria-label={t('loading')} className="space-y-5 animate-pulse">{[1, 2, 3].map((key) => <div key={key} className="h-48 rounded-xl bg-border/30" />)}</div>;

  const checkbox = (key: keyof NotificationPreferences) => (
    <label htmlFor={`preference-${key}`} className="flex cursor-pointer items-start gap-3 py-2" key={key}>
      <input id={`preference-${key}`} type="checkbox" checked={values[key]} onChange={(event) => update(key, event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
      <span><span className="block text-sm font-medium text-secondary">{t(`${key}.label`)}</span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">{t(`${key}.hint`)}</span></span>
    </label>
  );

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (dirty) save.mutate(values); }} className="space-y-6 pb-8">
      <section className="rounded-xl border border-border p-5 sm:p-7" aria-labelledby="account-security">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-secondary" />
          <div>
            <h2 id="account-security" className="font-semibold text-secondary">{t('securityTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t('securityHint')}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-lg bg-primary/5 p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-secondary">{t('securityNote')}</p>
          <Link href={`/${locale}${CLIENT_ROUTES.ACCOUNT_PROFILE}`} className="shrink-0 rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">{t('manageSecurity')}</Link>
        </div>
      </section>

      <fieldset disabled={save.isPending} className="min-w-0 space-y-6 disabled:opacity-70">
        <legend className="sr-only">{t('notifications')}</legend>
        <section className="rounded-xl border border-border p-5 sm:p-7" aria-labelledby="browser-notifications">
          <div className="flex items-center gap-2"><Bell className="h-5 w-5" /><h2 id="browser-notifications" className="font-semibold text-secondary">{t('browserTitle')}</h2></div>
          <div className="mt-4">{checkbox('pushEnabled')}</div>
          <p className="mt-2 text-xs leading-relaxed text-muted">{t('browserNote')}</p>
        </section>

        <section className="rounded-xl border border-border p-5 sm:p-7" aria-labelledby="email-notifications">
          <h2 id="email-notifications" className="break-words font-semibold text-secondary">{t('emailTitle', { email: user?.email ?? '' })}</h2>
          <p className="mb-2 mt-5 text-sm font-semibold text-secondary">{t('emailWhen')}</p>
          {checkbox('emailMessages')}
          {checkbox('emailReviewReminders')}
          <p className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-muted">{t('essentialNote')}</p>
        </section>

        <section className="rounded-xl border border-border p-5 sm:p-7" aria-labelledby="subscriptions">
          <h2 id="subscriptions" className="font-semibold text-secondary">{t('subscriptionsTitle')}</h2>
          <p className="mb-2 mt-2 text-sm text-muted">{t('subscriptionsHint')}</p>
          {checkbox('emailOffers')}
        </section>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={!dirty || save.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t(save.isPending ? 'saving' : 'save')}
        </button>
        {dirty && <span className="text-sm text-muted">{t('unsaved')}</span>}
        {saved && <span role="status" className="inline-flex items-center gap-2 text-sm text-success"><Check className="h-4 w-4" />{t('saved')}</span>}
        {save.isError && <p role="alert" className="text-sm text-error">{t('saveError')}</p>}
      </div>
    </form>
  );
}
