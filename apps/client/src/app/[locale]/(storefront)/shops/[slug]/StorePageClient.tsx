'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, HelpCircle, Megaphone, PlayCircle, Search, UserRound } from 'lucide-react';
import { StoreProductsClient } from './StoreProductsClient';
import { StoreReviewsClient, type StoreReviewsSummary } from './StoreReviewsClient';
import { safeNum } from '@ezihubb/utils';
import { API_ROUTES, type ShopColorTheme } from '@ezihubb/constants';
import { apiClient } from '@ezihubb/api-client';

type Tab = 'items' | 'reviews' | 'about';

interface StoreDto {
  id:            string;
  name:          string;
  slug:          string;
  description:   string | null;
  rating:        number;
  totalProducts: number;
  totalOrders:   number;
  createdAt:     string;
  announcement: string | null;
  announcementUpdatedAt: string | null;
  aboutHeadline: string | null;
  aboutVideoUrl: string | null;
  aboutPhotoUrls: string[];
  ownerBio:      string | null;
  socialLinks:   { platform: string; url: string }[];
  faqs:          { id: string; question: string; answer: string; sortOrder: number }[];
  owner: {
    firstName: string | null;
    lastName:  string | null;
    avatarUrl: string | null;
  };
  /** Listings pinned in Shop Home; empty = fall back to the isFeatured flag. */
  featuredProductIds: string[];
  /** 'grid' | 'mixed' — API already forces 'grid' without Plus. */
  featuredLayout: string | null;
}

// ── About section ─────────────────────────────────────────────────────────────

function AboutSection({
  store,
  locale,
  theme,
}: {
  store: StoreDto;
  locale: string;
  theme?: ShopColorTheme | null;
}) {
  const t = useTranslations('shops');
  const ownerName = [store.owner.firstName, store.owner.lastName].filter(Boolean).join(' ')
    || t('storePage.about.shopOwner');
  const memberSince = new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(new Date(store.createdAt));
  const hasStory = Boolean(store.aboutHeadline || store.description);
  const hasMedia = Boolean(store.aboutVideoUrl || store.aboutPhotoUrls.length);
  const hasProfile = Boolean(store.ownerBio || store.owner.avatarUrl || store.owner.firstName || store.owner.lastName);
  const hasCustomContent = hasStory || hasMedia || hasProfile || store.socialLinks.length > 0 || store.faqs.length > 0;

  return (
    <div className="space-y-8 md:space-y-10 py-2">
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="p-5 md:p-7">
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] text-primary"
              style={theme ? { color: theme.textSafeHex } : undefined}
            >
              {t('storePage.about.title')}
            </p>
            <h2 className="mt-2 max-w-3xl font-display text-2xl md:text-3xl font-bold leading-tight text-secondary">
              {store.aboutHeadline || store.name}
            </h2>
            {store.description && (
              <p className="mt-3 max-w-3xl whitespace-pre-line text-sm md:text-base leading-relaxed text-secondary/75">
                {store.description}
              </p>
            )}
          </div>
          <dl className="grid grid-cols-3 border-t border-border bg-background/50 md:min-w-[390px] md:self-stretch md:border-l md:border-t-0">
            {[
              [t('storePage.about.totalSales'), safeNum(store.totalOrders).toLocaleString(locale)],
              [t('storePage.about.activeListings'), safeNum(store.totalProducts).toLocaleString(locale)],
              [t('storePage.about.onPlatformSince'), memberSince],
            ].map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-col justify-center border-r border-border px-3 py-5 text-center last:border-r-0 md:px-4">
                <dd className="text-xl md:text-2xl font-bold tabular-nums text-secondary">{value}</dd>
                <dt className="mt-1 text-[11px] md:text-xs leading-tight text-muted">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {hasMedia && (
        <section>
          <h3 className="mb-4 font-display text-xl font-bold text-secondary">
            {t('storePage.about.photosAndVideo')}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
            {store.aboutVideoUrl && (
              <div className="group relative col-span-2 aspect-video overflow-hidden rounded-2xl border border-border bg-black md:col-span-2 md:row-span-2">
                <video
                  src={store.aboutVideoUrl}
                  controls
                  preload="metadata"
                  playsInline
                  className="h-full w-full object-cover"
                  aria-label={t('storePage.about.shopVideo', { name: store.name })}
                />
                <PlayCircle className="pointer-events-none absolute left-4 top-4 h-8 w-8 text-white drop-shadow md:hidden" aria-hidden />
              </div>
            )}
            {store.aboutPhotoUrls.map((url, index) => (
              <div
                key={url}
                className={`relative overflow-hidden rounded-2xl border border-border bg-background ${
                  !store.aboutVideoUrl && index === 0 ? 'col-span-2 aspect-[16/9] md:row-span-2' : 'aspect-square'
                }`}
              >
                <Image
                  src={url}
                  alt={t('storePage.about.shopPhoto', { name: store.name, number: index + 1 })}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 hover:scale-[1.03]"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {hasProfile && (
            <section className="rounded-2xl border border-border bg-surface p-5 md:p-6">
              <div className="flex items-start gap-4">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
                  {store.owner.avatarUrl ? (
                    <Image src={store.owner.avatarUrl} alt={ownerName} fill sizes="64px" className="object-cover" />
                  ) : (
                    <UserRound className="h-7 w-7" aria-hidden />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('storePage.about.meetTheOwner')}</p>
                  <h3 className="mt-1 text-lg font-bold text-secondary">{ownerName}</h3>
                  {store.ownerBio && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-secondary/75">{store.ownerBio}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {store.socialLinks.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-secondary">{t('storePage.about.followOnline')}</h3>
              <div className="flex flex-wrap gap-2">
                {store.socialLinks.map((link) => (
                  <a
                    key={`${link.platform}-${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <span className="capitalize">{link.platform}</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        {store.faqs.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-5 md:p-6">
            <div className="mb-3 flex items-center gap-2">
              <HelpCircle
                className="h-5 w-5 text-primary"
                style={theme ? { color: theme.textSafeHex } : undefined}
                aria-hidden
              />
              <h3 className="font-display text-lg font-bold text-secondary">
                {t('storePage.about.frequentlyAskedQuestions')}
              </h3>
            </div>
            <div className="divide-y divide-border">
              {store.faqs.map((faq) => (
                <details key={faq.id} className="group py-3 first:pt-1 last:pb-0">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-semibold text-secondary marker:content-none">
                    {faq.question}
                    <span className="mt-0.5 text-lg leading-none text-muted transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="pt-2 whitespace-pre-line text-sm leading-relaxed text-secondary/70">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>

      {!hasCustomContent && <p className="text-sm text-muted">{t('storePage.about.noDescription')}</p>}
    </div>
  );
}

// ── Tab nav + content ─────────────────────────────────────────────────────────

export function StorePageClient({
  store,
  locale,
  theme,
}: {
  store:  StoreDto;
  locale: string;
  /** Ezihubb Plus colour theme, or null for the default app styling. */
  theme?: ShopColorTheme | null;
}) {
  const t = useTranslations('shops');

  const [activeTab, setActiveTab] = useState<Tab>('items');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data: reviewsSummary } = useQuery<StoreReviewsSummary>({
    queryKey: ['store-reviews-summary', store.slug],
    queryFn: () => apiClient.get(API_ROUTES.STORES.REVIEWS_SUMMARY(store.slug)),
    staleTime: 120_000,
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'items', label: t('storePage.tabItems', { count: store.totalProducts }) },
    {
      id: 'reviews',
      label: reviewsSummary
        ? `${t('storePage.tabReviews')} (${reviewsSummary.totalReviews})`
        : t('storePage.tabReviews'),
    },
    { id: 'about', label: t('storePage.tabAbout') },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const announcementDate = store.announcementUpdatedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(store.announcementUpdatedAt))
    : null;

  return (
    <main className="mx-auto mt-6 max-w-[1280px] space-y-14 px-4 pb-8 md:px-8">
      {/* ── Sticky Tab Navigation ──────────────────────────────────────────── */}
      <section id="shop-items" aria-labelledby="shop-items-heading">
        <div className="mb-6 flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 id="shop-items-heading" className="font-display text-2xl font-bold text-secondary">
              {t('storePage.shopItems')}
            </h2>
            <p className="mt-0.5 text-sm text-muted">{t('storePage.tabItems', { count: store.totalProducts })}</p>
          </div>
          <form onSubmit={handleSearch} className="w-full sm:w-auto">
            <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 transition-colors hover:border-primary/40 focus-within:border-primary/60">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('storePage.searchPlaceholder', { count: store.totalProducts })}
                className="w-full bg-transparent text-sm text-secondary outline-none placeholder:text-muted sm:w-56"
              />
            </div>
          </form>
        </div>

      <div className="hidden">
        <div className="max-w-[1280px] mx-auto px-4 md:px-8">
          <div className="flex items-center gap-4">
            {/* Tabs */}
            <div
              role="tablist"
              aria-label={t('storePage.sectionsAriaLabel')}
              className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden flex-1"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  // textSafeHex, not the raw swatch hex — this color is the
                  // tab's text + underline directly on the page's light
                  // background, same AA-contrast reasoning as
                  // FollowShopButton (see that file's comment).
                  style={theme && activeTab === tab.id ? { borderColor: theme.textSafeHex, color: theme.textSafeHex } : undefined}
                  className={[
                    'px-5 py-4 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors shrink-0',
                    activeTab === tab.id
                      ? theme ? '' : 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-secondary',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search bar — only on items tab */}
            {activeTab === 'items' && (
              <form onSubmit={handleSearch} className="shrink-0 hidden sm:flex">
                <div className="flex items-center gap-2 border border-border rounded-full px-3.5 py-1.5 bg-surface hover:border-primary/40 focus-within:border-primary/60 transition-colors">
                  <Search className="w-3.5 h-3.5 text-muted shrink-0" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t('storePage.searchPlaceholder', { count: store.totalProducts })}
                    className="bg-transparent text-xs text-secondary placeholder:text-muted outline-none w-44"
                  />
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      <div className="min-h-[400px]">

        {activeTab === 'items' && (
          <StoreProductsClient
            storeSlug={store.slug}
            locale={locale}
            searchQuery={searchQuery}
            onSearchClear={() => { setSearchQuery(''); setSearchInput(''); }}
            featuredProductIds={store.featuredProductIds}
            featuredLayout={store.featuredLayout ?? 'grid'}
          />
        )}

      </div>
      </section>

      {store.announcement && (
        <section id="announcement" className="grid gap-4 border-t border-border pt-8 md:grid-cols-[210px_minmax(0,1fr)] md:gap-8">
          <div>
            <h2 className="font-display text-xl font-bold text-secondary">{t('storePage.announcement')}</h2>
            {announcementDate && (
              <p className="mt-1 text-xs text-muted">{t('storePage.announcementUpdated', { date: announcementDate })}</p>
            )}
          </div>
          <div className="flex items-start gap-3">
            <Megaphone
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              style={theme ? { color: theme.textSafeHex } : undefined}
              aria-hidden
            />
            <p className="whitespace-pre-line text-sm leading-relaxed text-secondary/75">{store.announcement}</p>
          </div>
        </section>
      )}

      <section id="shop-reviews" className="border-t border-border pt-8" aria-labelledby="shop-reviews-heading">
        <h2 id="shop-reviews-heading" className="mb-6 font-display text-2xl font-bold text-secondary">
          {t('storePage.tabReviews')}
        </h2>
        <StoreReviewsClient storeSlug={store.slug} storeRating={store.rating} />
      </section>

      <section id="about-shop" className="border-t border-border pt-8">
        <AboutSection store={store} locale={locale} theme={theme} />
      </section>
    </main>
  );
}
