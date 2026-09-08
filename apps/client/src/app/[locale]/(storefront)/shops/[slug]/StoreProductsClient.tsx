'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, PackageOpen, X } from 'lucide-react';
import { apiClient, useWishlist, useWishlistToggle } from '@ezihubb/api-client';
import { API_ROUTES } from '@ezihubb/constants';
import { ProductCard, Pagination, Skeleton } from '@ezihubb/ui';
import { useAuthStore } from '../../../../../lib/store/auth.store';
import { usePaginationLabels } from '../../../../../lib/hooks/usePaginationLabels';
import { useProductCardLabels } from '../../../../../lib/hooks/useProductCardLabels';
import type { ProductListItemDto } from '@ezihubb/types';
import { deriveProductBadge } from '../../../../../lib/product-badge';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaginatedProducts {
  data:       ProductListItemDto[];
  pagination: { page: number; totalPages: number; total: number };
}

interface StoreSection {
  id:    string;
  name:  string;
  count: number;
}

interface StoreSectionsResponse {
  total:    number;
  onSale:   number;
  sections: StoreSection[];
}

// ── Sort options ───────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: string; key: string }[] = [
  { value: 'newest',     key: 'newest'     },
  { value: 'bestseller', key: 'bestseller' },
  { value: 'rating',     key: 'rating'     },
  { value: 'price_asc',  key: 'priceAsc'   },
  { value: 'price_desc', key: 'priceDesc'  },
];

// ── Sort dropdown ─────────────────────────────────────────────────────────────

function SortDropdown({ sort, onChange }: { sort: string; onChange: (v: string) => void }) {
  const t = useTranslations('shops');
  const [open, setOpen] = useState(false);
  const currentKey = SORT_OPTIONS.find((o) => o.value === sort)?.key ?? 'newest';
  const current    = t(`products.sortOptions.${currentKey}`);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-primary transition-colors"
      >
        {t('products.sortLabel', { label: current })}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-surface border border-border rounded-card shadow-lg py-1 min-w-[190px]">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={[
                  'w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary/5',
                  sort === opt.value ? 'text-primary font-semibold' : 'text-secondary',
                ].join(' ')}
              >
                {t(`products.sortOptions.${opt.key}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sections sidebar ──────────────────────────────────────────────────────────

function SectionsSidebar({
  storeSlug,
  selected,
  onSaleSelected,
  onSelect,
}: {
  storeSlug:      string;
  selected:       string | null;
  onSaleSelected: boolean;
  onSelect:       (sectionId: string | null, onSale?: boolean) => void;
}) {
  const t = useTranslations('shops');
  const { data } = useQuery<StoreSectionsResponse>({
    queryKey:  ['store-sections', storeSlug],
    queryFn:   () => apiClient.get<StoreSectionsResponse>(API_ROUTES.STORES.SECTIONS(storeSlug)),
    staleTime: 60_000,
  });

  if (!data) return null;

  const isAllSelected = !selected && !onSaleSelected;

  return (
    <nav className="w-52 shrink-0 hidden md:block" aria-label={t('products.sectionsAriaLabel')}>
      <ul className="space-y-0.5">
        {/* All */}
        <li>
          <button
            type="button"
            onClick={() => onSelect(null, false)}
            className={[
              'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left',
              isAllSelected
                ? 'font-semibold text-secondary bg-secondary/5'
                : 'text-secondary/70 hover:text-secondary hover:bg-secondary/5',
            ].join(' ')}
          >
            <span>{t('products.all')}</span>
            <span className="text-muted text-xs tabular-nums">{data.total}</span>
          </button>
        </li>

        {/* On sale */}
        {data.onSale > 0 && (
          <li>
            <button
              type="button"
              onClick={() => onSelect(null, true)}
              className={[
                'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left',
                onSaleSelected
                  ? 'font-semibold text-secondary bg-secondary/5'
                  : 'text-secondary/70 hover:text-secondary hover:bg-secondary/5',
              ].join(' ')}
            >
              <span>{t('products.onSale')}</span>
              <span className="text-muted text-xs tabular-nums">{data.onSale}</span>
            </button>
          </li>
        )}

        {/* Divider */}
        {data.sections.length > 0 && <li><div className="my-2 border-t border-border" /></li>}

        {/* Category sections */}
        {data.sections.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id, false)}
              className={[
                'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left',
                selected === s.id
                  ? 'font-semibold text-secondary bg-secondary/5'
                  : 'text-secondary/70 hover:text-secondary hover:bg-secondary/5',
              ].join(' ')}
            >
              <span className="truncate pr-2">{s.name}</span>
              <span className="text-muted text-xs shrink-0 tabular-nums">{s.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  const t = useTranslations('shops');
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <PackageOpen className="w-14 h-14 text-muted/30" aria-hidden />
      <div>
        <p className="font-semibold text-secondary">{t('products.emptyTitle')}</p>
        <p className="text-sm text-muted mt-1">{t('products.emptyDesc')}</p>
      </div>
    </div>
  );
}

// ── Product grid skeleton ─────────────────────────────────────────────────────

function GridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="rect" className="aspect-[4/5] rounded-card" />
      ))}
    </div>
  );
}

// ── Product grid ──────────────────────────────────────────────────────────────

function ProductGrid({
  products,
  wishlistedIds,
  onWishlistToggle,
}: {
  products:         ProductListItemDto[];
  wishlistedIds:    Set<string>;
  onWishlistToggle: (id: string) => void;
}) {
  const { locale, labels, badgeLabels } = useProductCardLabels();
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          id={product.id}
          slug={product.slug}
          name={product.name}
          imageUrl={product.primaryImage ?? 'https://placehold.co/400x500.png?text=No+Image'}
          basePrice={product.basePrice}
          compareAtPrice={product.compareAtPrice ?? undefined}
          sale={product.sale ?? null}
          rating={product.averageRating ?? undefined}
          reviewCount={product.reviewCount}
          badge={deriveProductBadge(product)}
          badgeLabel={(() => { const b = deriveProductBadge(product); return b ? badgeLabels[b] : undefined; })()}
          isPersonalizable={product.isPersonalizable}
          isDigital={product.productType === 'DIGITAL'}
          isWishlisted={wishlistedIds.has(product.id)}
          onWishlistToggle={onWishlistToggle}
          locale={locale}
          basePath={`/${locale}`}
          labels={labels}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StoreProductsClient({
  storeSlug,
  locale,
  searchQuery,
  onSearchClear,
  featuredProductIds,
  featuredLayout,
}: {
  storeSlug:      string;
  locale:         string;
  searchQuery?:   string;
  onSearchClear?: () => void;
  /** Listings the seller pinned in Shop Home. Takes priority over the
   *  per-product `isFeatured` flag; empty means "fall back to the flag". */
  featuredProductIds?: string[];
  /** 'grid' (free) or 'mixed' (Plus). Already forced to 'grid' by the API for
   *  stores without an active subscription — never gate on it here. */
  featuredLayout?: string;
}) {
  const t = useTranslations('shops');
  const paginationLabels = usePaginationLabels();
  const { labels: cardLabels, badgeLabels } = useProductCardLabels();

  const [page,            setPage]            = useState(1);
  const [sort,            setSort]            = useState('newest');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [onSaleFilter,    setOnSaleFilter]    = useState(false);

  const router      = useRouter();
  const pathname    = usePathname();
  const wishlistToggle = useWishlistToggle();
  const token          = useAuthStore((s) => s.accessToken);
  const isAuthReady    = useAuthStore((s) => s.isAuthReady);

  const { data: wishlistData } = useWishlist(isAuthReady && !!token);
  const wishlistedIds = new Set((wishlistData ?? []).map((w) => w.productId));

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [sort, selectedSection, onSaleFilter, searchQuery]);

  const hasFilter = !!selectedSection || onSaleFilter || !!searchQuery?.trim();

  // Featured items query (only shown in default state: no section/sale/search filter)
  //
  // Two sources, in priority order. The seller's Shop Home picker writes
  // `Store.featuredProductIds`; before this, the storefront ignored it
  // entirely and only ever queried the per-product `isFeatured` flag, so the
  // picker had no visible effect at all. Pinned ids now win, and the flag
  // stays as the fallback so shops that never used the picker keep the exact
  // behaviour they have today.
  const pinnedIds = featuredProductIds ?? [];
  const hasPinned = pinnedIds.length > 0;

  const { data: featuredData, isLoading: featuredLoading } = useQuery<PaginatedProducts>({
    queryKey: ['store-products-featured', storeSlug, hasPinned ? pinnedIds.join(',') : 'flag'],
    queryFn:  () => apiClient.get<PaginatedProducts>(API_ROUTES.PRODUCTS.LIST, {
      params: hasPinned
        ? { storeSlug, ids: pinnedIds.join(','), isActive: true, limit: pinnedIds.length }
        : { storeSlug, isFeatured: true, isActive: true, limit: 4, sort: 'featured' },
    }),
    staleTime: 60_000,
    enabled:   !hasFilter && featuredLayout !== 'none',
  });

  // All items query
  type QP = Record<string, string | number | boolean | undefined>;
  const allParams: QP = {
    storeSlug,
    isActive:      true,
    sort,
    page,
    limit:         24,
    shopSectionId: selectedSection ?? undefined,
    onSale:        onSaleFilter ? true : undefined,
    search:        searchQuery?.trim() || undefined,
  };

  const { data: allData, isLoading: allLoading } = useQuery<PaginatedProducts>({
    queryKey: ['store-products', storeSlug, sort, page, selectedSection, onSaleFilter, searchQuery],
    queryFn:  () => apiClient.get<PaginatedProducts>(API_ROUTES.PRODUCTS.LIST, { params: allParams }),
    staleTime: 30_000,
  });

  // Re-order to the seller's chosen sequence — `where: { id: { in } }` returns
  // rows in index order, not the order the ids were passed, and the picker's
  // whole purpose is that the seller controls which listing sits first.
  // Ids that no longer resolve (archived/deleted since being pinned) simply
  // drop out here rather than leaving a hole.
  const featuredRaw = featuredData?.data ?? [];
  const featured    = hasPinned
    ? pinnedIds.map((id) => featuredRaw.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
    : featuredRaw;
  const products   = allData?.data                       ?? [];
  const totalPages = allData?.pagination?.totalPages     ?? 1;
  const total      = allData?.pagination?.total          ?? 0;

  const handleWishlistToggle = (productId: string) => {
    if (!token) {
      router.push(`/${locale}/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    wishlistToggle(productId, wishlistedIds.has(productId));
  };

  const handleSectionSelect = (section: string | null, onSale?: boolean) => {
    setSelectedSection(section);
    setOnSaleFilter(!!onSale);
    setPage(1);
  };

  const handleSortChange = (v: string) => { setSort(v); setPage(1); };

  const handlePageChange = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex gap-8">
      {/* ── Sections sidebar ─────────────────────────────────────────────── */}
      <SectionsSidebar
        storeSlug={storeSlug}
        selected={selectedSection}
        onSaleSelected={onSaleFilter}
        onSelect={handleSectionSelect}
      />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-10">

        {/* ── Featured Items (only shown when no filter active) ─────────── */}
        {!hasFilter && featuredLayout !== 'none' && (featuredLoading || featured.length > 0) && (
          <section>
            <h2 className="font-display text-xl font-bold text-secondary mb-5">{t('products.featuredItems')}</h2>
            {featuredLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} variant="rect" className="aspect-[4/5] rounded-card" />
                ))}
              </div>
            ) : featured.length > 0 ? (
              /* Ezihubb Plus "Mixed grid": the first pinned listing takes a
                 2x2 cell, the rest flow beside it. Falls back to the free
                 even 4-across grid for any other value — the server already
                 forces 'grid' for a store without an active subscription, so
                 this never needs to check entitlement itself. */
              <div className={featuredLayout === 'mixed'
                ? 'grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 [&>*:first-child]:col-span-2 [&>*:first-child]:row-span-2'
                : 'grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5'}>
                {featured.map((product) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    slug={product.slug}
                    name={product.name}
                    imageUrl={product.primaryImage ?? 'https://placehold.co/400x500.png?text=No+Image'}
                    basePrice={product.basePrice}
                    compareAtPrice={product.compareAtPrice ?? undefined}
                    sale={product.sale ?? null}
                    rating={product.averageRating ?? undefined}
                    reviewCount={product.reviewCount}
                    badge={deriveProductBadge(product)}
                    badgeLabel={(() => { const b = deriveProductBadge(product); return b ? badgeLabels[b] : undefined; })()}
                    isPersonalizable={product.isPersonalizable}
                    isDigital={product.productType === 'DIGITAL'}
                    isWishlisted={wishlistedIds.has(product.id)}
                    onWishlistToggle={handleWishlistToggle}
                    locale={locale}
                    basePath={`/${locale}`}
                    labels={cardLabels}
                  />
                ))}
              </div>
            ) : null}
          </section>
        )}

        {/* ── All Items section ─────────────────────────────────────────── */}
        <section>
          {/* Header row */}
          <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
            <div>
              <h2 className="font-display text-xl font-bold text-secondary">
                {onSaleFilter ? t('products.onSaleHeading') : selectedSection ? t('products.sectionItemsHeading') : t('products.allItemsHeading')}
              </h2>

              {/* Active search filter chip */}
              {searchQuery && (
                <span className="inline-flex items-center gap-1 mt-1 text-xs bg-primary/10 text-primary rounded-full px-2.5 py-0.5">
                  "{searchQuery}"
                  <button type="button" onClick={onSearchClear} aria-label={t('products.clearSearchAria')}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {!allLoading && (
                <p className="text-sm text-muted mt-0.5">
                  {t('products.results', { count: total })}
                </p>
              )}
            </div>
            <SortDropdown sort={sort} onChange={handleSortChange} />
          </div>

          {/* Grid */}
          {allLoading ? (
            <GridSkeleton count={12} />
          ) : products.length === 0 ? (
            <EmptyState />
          ) : (
            <ProductGrid products={products} wishlistedIds={wishlistedIds} onWishlistToggle={handleWishlistToggle} />
          )}

          {totalPages > 1 && (
            <div className="mt-8">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                labels={paginationLabels}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
