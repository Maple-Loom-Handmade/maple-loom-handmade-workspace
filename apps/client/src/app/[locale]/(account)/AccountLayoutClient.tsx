'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import { ToastProvider } from '@ezihubb/ui';
import { useProfile } from '@ezihubb/api-client';
import { useSession } from 'next-auth/react';
import { useAuthStore } from '../../../lib/store/auth.store';
import { AccountSidebar } from '../../../components/account/AccountSidebar';
import { SettingsNavigation } from '../../../components/account/SettingsNavigation';

export default function AccountLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const t        = useTranslations('common');
  const locale   = useLocale();
  const router   = useRouter();
  const pathname = usePathname();
  const isSettings = ['/account/settings', '/account/profile', '/account/addresses'].some((route) => pathname.endsWith(route));

  const { status } = useSession();
  // SessionSyncer syncs next-auth token → Zustand after session loads.
  // Gate useProfile on both conditions to avoid fetching with a missing token.
  const token    = useAuthStore((s) => s.accessToken);
  const canFetch = status === 'authenticated' && !!token;

  const { data: profile, isLoading, isError } = useProfile(canFetch);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Auth guard: not logged in ──────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'unauthenticated') return;
    router.replace(`/${locale}/login?redirect=${encodeURIComponent(pathname)}`);
  }, [status, router, locale, pathname]);

  // ── Auth guard: profile fetch failed ──────────────────────────────────────
  // Gated on `status` (not `canFetch`) — a failed refresh clears the Zustand
  // token, which flips `canFetch` to false on the very next render. Gating
  // on `canFetch` here meant that exact failure made this effect return
  // early forever, leaving the page stuck on the loading spinner below
  // instead of ever redirecting. `useAuthStore`'s setTokenUpdater also signs
  // next-auth out on a failed refresh, which flips `status` to
  // 'unauthenticated' and lets the guard above handle it — this one is a
  // fallback for the brief window before that propagates, or if `canFetch`
  // was already true and the fetch simply erred out for another reason.
  useEffect(() => {
    if (status !== 'authenticated' || isLoading) return;
    if (isError || (!canFetch && !profile)) {
      router.replace(`/${locale}/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [status, canFetch, isLoading, isError, profile, router, locale, pathname]);

  // Show spinner while session loading, token syncing, or profile fetching
  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ToastProvider dismissLabel={t('dismissNotification')}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-4 md:py-6">

        {/* ── Mobile header bar ──────────────────────────────────────────── */}
        <div className="md:hidden flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open account menu"
            className="p-2 border border-border rounded-button text-secondary hover:border-primary transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <p className="font-semibold text-secondary text-sm">
              {profile.firstName} {profile.lastName}
            </p>
            <p className="text-xs text-muted">{profile.email}</p>
          </div>
        </div>

        {/* ── Main 2-col layout ──────────────────────────────────────────── */}
        <div className={isSettings ? 'mx-auto max-w-[1000px]' : 'flex gap-6 items-start'}>
          {/* Desktop sidebar */}
          <div className={isSettings ? 'hidden' : 'hidden md:block w-[260px] shrink-0'}>
            <AccountSidebar profile={profile} />
          </div>

          {/* Page content */}
          <div className="flex-1 min-w-0">{isSettings && <SettingsNavigation />}{children}</div>
        </div>

        {/* ── Mobile bottom sheet nav ────────────────────────────────────── */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex items-end">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Sheet */}
            <div className="relative w-full bg-surface rounded-t-2xl z-10 pb-safe animate-slide-up">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-border rounded-full" />
              </div>
              <div className="px-2 pb-6">
                <AccountSidebar
                  profile={profile}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </ToastProvider>
  );
}
