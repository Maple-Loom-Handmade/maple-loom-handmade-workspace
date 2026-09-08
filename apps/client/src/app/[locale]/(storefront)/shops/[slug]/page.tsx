import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { MapPin, ShieldCheck, Star, ShoppingBag, Share2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '@ezihubb/api-client';
import { API_ROUTES, getShopColorTheme } from '@ezihubb/constants';
import { StorePageClient } from './StorePageClient';
import { FollowShopButton } from '../../../../../components/shops/FollowShopButton';
import { MarketingTracker } from '../../../../../components/providers/MarketingTracker';
import { ShareSaveWidget } from '../../../../../components/shops/ShareSaveWidget';
import { buildAlternates } from '../../../../../lib/seo';
import { fmtRating, safeNum } from '@ezihubb/utils';

interface StorePublicDto {
  id:            string;
  name:          string;
  slug:          string;
  description:   string | null;
  logoUrl:       string | null;
  bannerUrl:     string | null;
  status:        string;
  rating:        number;
  totalOrders:   number;
  totalProducts: number;
  followerCount: number;
  verifiedAt:    string | null;
  createdAt:     string;
  shareSaveEnabled: boolean;
  // Ezihubb Plus — null for non-Plus stores (server already gates this in
  // getStoreBySlug) AND for any value outside the 12-entry palette
  // (getShopColorTheme returns null for both — never crashes, never
  // renders a broken/unstyled swatch).
  colorTheme:    string | null;
  featuredProductIds: string[];
  /** Already forced to 'grid' by getStoreBySlug for a store without Plus. */
  featuredLayout: string | null;
  tagline:        string | null;
  location:       string | null;
  announcement:   string | null;
  announcementUpdatedAt: string | null;
  aboutHeadline:  string | null;
  aboutVideoUrl:  string | null;
  aboutPhotoUrls: string[];
  ownerBio:       string | null;
  socialLinks:    unknown;
  faqs:           { id: string; question: string; answer: string; sortOrder: number }[];
  owner: {
    firstName: string | null;
    lastName:  string | null;
    avatarUrl: string | null;
  };
}

interface StoreSocialLink {
  platform: string;
  url: string;
}

function normalizeSocialLinks(value: unknown): StoreSocialLink[] {
  if (!Array.isArray(value)) return [];

  return value.filter((link): link is StoreSocialLink => {
    if (!link || typeof link !== 'object') return false;
    const candidate = link as Record<string, unknown>;
    return typeof candidate.platform === 'string'
      && candidate.platform.trim().length > 0
      && typeof candidate.url === 'string'
      && /^https?:\/\//i.test(candidate.url);
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'shops' });
  const store = await apiClient
    .get<StorePublicDto>(API_ROUTES.STORES.DETAIL(slug))
    .catch(() => null);

  if (!store) return { title: t('storePage.storeNotFoundTitle'), robots: { index: false, follow: false } };

  return {
    title:       store.name,
    description: (store.description ?? store.aboutHeadline ?? store.tagline)?.slice(0, 160)
      ?? t('storePage.metaDescriptionFallback', { name: store.name }),
    openGraph: {
      title:       store.name,
      description: (store.description ?? store.aboutHeadline ?? store.tagline)?.slice(0, 160),
      images:      store.bannerUrl ? [store.bannerUrl] : [],
      url:         `/shops/${slug}`,
    },
    alternates: buildAlternates(`/shops/${slug}`, locale),
  };
}

export const dynamic = 'force-dynamic';

// ── Share buttons ─────────────────────────────────────────────────────────────

async function ShareButtons({ name, slug, locale }: { name: string; slug: string; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'shops' });
  const url     = `https://ezihubb.com/${locale}/shops/${slug}`;
  const encoded = encodeURIComponent(url);
  const text    = encodeURIComponent(t('storePage.shareCheckOut', { name }));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="flex items-center gap-1 text-xs text-muted font-medium">
        <Share2 className="w-3.5 h-3.5" /> {t('storePage.share')}
      </span>
      {[
        { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`, color: 'text-[#1877F2] bg-[#1877F2]/10 hover:bg-[#1877F2]/20' },
        { label: 'Twitter',  href: `https://twitter.com/intent/tweet?url=${encoded}&text=${text}`, color: 'text-[#1DA1F2] bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20' },
        { label: 'WhatsApp', href: `https://wa.me/?text=${text}%20${encoded}`, color: 'text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20' },
      ].map(({ label, href, color }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${color}`}
        >
          {label}
        </a>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StorePublicPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'shops' });

  const store = await apiClient
    .get<StorePublicDto>(API_ROUTES.STORES.DETAIL(slug))
    .catch(() => null);

  if (!store) notFound();

  const memberSince = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year:  'numeric',
  }).format(new Date(store.verifiedAt ?? store.createdAt));

  const rating = Number(store.rating ?? 0);
  // null for free stores (server-gated) and for any stale/unrecognized value
  // (hand-edited DB row, or a palette entry retired later) — never crashes,
  // callers below all fall back to the app's default look when this is null.
  const theme = getShopColorTheme(store.colorTheme);

  return (
    <div className="bg-background pb-16">
      <MarketingTracker storeId={store.id} />
      {/* ── Banner ────────────────────────────────────────────────────────────── */}
      {/* Fallback gradient only shows when the seller hasn't uploaded a real
          banner image — a real bannerUrl always renders on top and this is
          never visible, so tinting it with the theme color is purely
          decorative (no text sits on it, no contrast concern). */}
      <div className="max-w-[1280px] mx-auto px-3 sm:px-4 md:px-8 pt-4 md:pt-7">
        <div className="relative aspect-[3/1] md:aspect-[4/1] min-h-36 max-h-80 overflow-hidden rounded-2xl bg-surface border border-border shadow-sm">
          <div
            className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5"
            style={theme ? { background: `linear-gradient(135deg, ${theme.hex}40, ${theme.hex}12)` } : undefined}
          />
          {store.bannerUrl && (
            <Image
              src={store.bannerUrl}
              alt={t('storePage.bannerAlt', { name: store.name })}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-black/5" />
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 md:px-8">
        {/* ── Store header ──────────────────────────────────────────────────────── */}
        <div className="relative flex flex-col gap-4 border-b border-border py-5 md:flex-row md:items-center md:gap-5 md:py-6">
          {/* Logo */}
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-surface md:h-20 md:w-20">
            {store.logoUrl ? (
              <Image
                src={store.logoUrl}
                alt={t('storePage.logoAlt', { name: store.name })}
                width={80}
                height={80}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                <span className="text-3xl font-bold text-primary">
                  {store.name[0]?.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Name + stats */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl md:text-[28px] leading-tight font-bold text-secondary">
                {store.name}
              </h1>
              {store.verifiedAt && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> {t('storePage.verifiedSeller')}
                </span>
              )}
            </div>
            {store.tagline && (
              <p className="mt-1 text-sm md:text-base text-secondary/80 leading-relaxed">
                {store.tagline}
              </p>
            )}
            {store.location && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
                <MapPin className="w-3.5 h-3.5" aria-hidden />
                {store.location}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted">
              {rating > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span className="font-semibold text-secondary">{fmtRating(rating)}</span>
                  <span>{t('storePage.rating')}</span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <ShoppingBag className="w-3.5 h-3.5" />
                {t('storePage.sales', { count: safeNum(store.totalOrders) })}
              </span>
              <span>{t('storePage.listings', { count: safeNum(store.totalProducts) })}</span>
              <span>{t('storePage.memberSince', { date: memberSince })}</span>
            </div>
          </div>

          {/* Follow + Share — desktop only */}
          <div className="hidden md:flex flex-col items-end gap-3 shrink-0">
            <FollowShopButton slug={store.slug} initialFollowerCount={store.followerCount} theme={theme} />
            <ShareButtons name={store.name} slug={store.slug} locale={locale} />
          </div>
        </div>

        {/* Mobile follow/share */}
        <div className="mb-0">
          <div className="md:hidden flex items-center gap-3">
            <FollowShopButton slug={store.slug} initialFollowerCount={store.followerCount} theme={theme} />
            <ShareButtons name={store.name} slug={store.slug} locale={locale} />
          </div>
        </div>

        {store.shareSaveEnabled && (
          <div className="mt-4">
            <ShareSaveWidget />
          </div>
        )}
      </div>

      {/* ── Tab navigation + tab content (client) ────────────────────────────── */}
      <StorePageClient
        store={{
          id:            store.id,
          name:          store.name,
          slug:          store.slug,
          description:   store.description,
          rating,
          totalProducts: store.totalProducts,
          totalOrders:   store.totalOrders,
          createdAt:     store.createdAt,
          announcement: store.announcement,
          announcementUpdatedAt: store.announcementUpdatedAt,
          aboutHeadline: store.aboutHeadline,
          aboutVideoUrl: store.aboutVideoUrl,
          aboutPhotoUrls: store.aboutPhotoUrls ?? [],
          ownerBio:      store.ownerBio,
          socialLinks:   normalizeSocialLinks(store.socialLinks),
          faqs:          store.faqs ?? [],
          owner:         store.owner,
          // Never gated — featuredProductIds is a FREE feature; only
          // colorTheme (and, below, featuredLayout) are Plus-gated.
          featuredProductIds: store.featuredProductIds ?? [],
          featuredLayout:     store.featuredLayout ?? 'grid',
        }}
        locale={locale}
        theme={theme}
      />
    </div>
  );
}
