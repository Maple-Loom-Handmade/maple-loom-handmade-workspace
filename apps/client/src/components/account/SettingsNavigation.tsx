'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { CLIENT_ROUTES } from '@ezihubb/constants';

export function SettingsNavigation() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('account.settings');
  return (
    <header className="mb-8">
      <Link href={`/${locale}${CLIENT_ROUTES.ACCOUNT_ORDERS}`} className="mb-5 inline-flex items-center gap-2 text-sm text-muted hover:text-secondary">
        <ArrowLeft className="h-4 w-4" />{t('back')}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-secondary">{t('title')}</h1>
      <nav aria-label={t('title')} className="mt-5 flex gap-6 overflow-x-auto border-b border-border">
        {[
          [CLIENT_ROUTES.ACCOUNT_PROFILE, 'profile'],
          [CLIENT_ROUTES.ACCOUNT_ADDRESSES, 'addresses'],
          [CLIENT_ROUTES.ACCOUNT_SETTINGS, 'notifications'],
        ].map(([route, label]) => (
          <Link key={route} href={`/${locale}${route}`} aria-current={pathname.endsWith(route) ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-1 pb-3 text-sm transition-colors ${pathname.endsWith(route) ? 'border-secondary font-semibold text-secondary' : 'border-transparent text-muted hover:border-border hover:text-secondary'}`}>
            {t(label)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
