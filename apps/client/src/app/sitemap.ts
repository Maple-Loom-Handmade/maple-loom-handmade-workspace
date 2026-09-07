import type { MetadataRoute } from 'next';
import { API_ROUTES } from '@ezihubb/constants';
import {
  GIFT_GUIDE_SLUGS,
  getGiftGuide,
  isGiftGuideProduct,
} from '../lib/gift-guides';

export const revalidate = 3600; // regenerate hourly

const BASE = 'https://ezihubb.com';
// NEXT_PUBLIC_API_URL may include /api/v1 (client lib) or be the bare origin.
// Strip any trailing /api/v1 so the helper can append it consistently.
const API_ORIGIN = (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3002')
  .replace(/\/api\/v1\/?$/, '');

// ── Typed fetch helper ────────────────────────────────────────────────────────

interface ProductItem {
  slug:              string;
  name?:             string;
  shortDescription?: string;
  updatedAt?:        string;
  images?:           { url: string }[];
}

interface SlugItem {
  slug:       string;
  updatedAt?: string;
  level?:     number;
}

/**
 * The API answers in two shapes and this has to handle both.
 *
 * Unpaginated lists (categories, collections, tags) come back as
 * `{ data: [...] }`. Paginated ones (products) come back as
 * `{ data: { data: [...], pagination } }`, so `body.data` is an OBJECT — and
 * the old `body.data ?? body` handed that object back as if it were the array.
 */
function unwrap<T>(body: unknown): { items: T[]; hasNext: boolean } {
  const outer = (body as { data?: unknown })?.data ?? body;
  if (Array.isArray(outer)) return { items: outer as T[], hasNext: false };

  const inner = (outer as { data?: unknown; pagination?: { hasNext?: boolean } } | null);
  if (Array.isArray(inner?.data)) {
    return { items: inner.data as T[], hasNext: !!inner.pagination?.hasNext };
  }
  return { items: [], hasNext: false };
}

/**
 * A failure here empties a whole section of the sitemap, so it says so.
 *
 * It used to swallow everything into `[]`. That is why nobody noticed the
 * product fetch had been asking for `limit=500` against an API that rejects
 * anything over 48: it 400'd on every build, returned no products, and the
 * sitemap was served with a 200 and every product page missing from it.
 */
async function fetchPage<T>(path: string): Promise<{ items: T[]; hasNext: boolean }> {
  const url = `${API_ORIGIN}/api/v1${path}`;
  try {
    // Next.js aborts an entire static route after 60s. A slow/unreachable
    // API (e.g. from a CI build runner) would otherwise hang past that
    // budget instead of hitting the fallback below — bound each request
    // well under it so all fetches always resolve in time.
    const res = await fetch(url, {
      next:   { revalidate: 3600 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[sitemap] ${res.status} from ${path} — that section will be empty`);
      return { items: [], hasNext: false };
    }
    return unwrap<T>(await res.json());
  } catch (err) {
    console.warn(`[sitemap] ${path} failed: ${String(err)} — that section will be empty`);
    return { items: [], hasNext: false };
  }
}

async function fetchApi<T>(path: string): Promise<T[]> {
  return (await fetchPage<T>(path)).items;
}

/** The API's own ceiling. Asking for more is a 400, not a smaller page. */
const API_PAGE_LIMIT = 48;
/** Sitemaps may hold 50,000 URLs; this is well under it and bounds the build. */
const MAX_PRODUCT_PAGES = 40;

/**
 * Every active product, a page at a time.
 *
 * One request asking for all of them is what broke: the limit is capped at 48
 * server-side, and over-asking fails the whole call rather than returning the
 * first 48.
 */
async function fetchAllProducts(): Promise<ProductItem[]> {
  const all: ProductItem[] = [];
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page++) {
    const { items, hasNext } = await fetchPage<ProductItem>(
      `${API_ROUTES.PRODUCTS.LIST}?fields=slug,updatedAt,images,name,shortDescription`
      + `&limit=${API_PAGE_LIMIT}&page=${page}&isActive=true`,
    );
    all.push(...items);
    if (!hasNext || !items.length) break;
  }
  return all;
}

// ── Sitemap ───────────────────────────────────────────────────────────────────

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // All fetches in parallel — individual failures yield empty arrays, never crash
  const [products, categories, collections, tags] = await Promise.all([
    fetchAllProducts(),
    fetchApi<SlugItem>(`${API_ROUTES.CATALOG.CATEGORIES}?isVisible=true&fields=slug,updatedAt,level`),
    fetchApi<SlugItem>(`${API_ROUTES.CATALOG.COLLECTIONS}?isActive=true&fields=slug,updatedAt`),
    fetchApi<SlugItem>(`${API_ROUTES.CATALOG.TAGS}?isFeatured=true&fields=slug`),
  ]);

  // `next-intl` routing has no `localePrefix` override, so it defaults to
  // 'always' — even the default `en` locale is served under `/en`, never at
  // the bare origin. Listing bare (unprefixed) URLs here would tell Google
  // to crawl a URL that 307/308-redirects to `/en/...`, which is exactly
  // what produced the "Page with redirect" / "Alternate page with proper
  // canonical tag" Search Console errors — every entry below must carry the
  // real, self-referencing `/en` prefix to match what `buildAlternates()`
  // now declares as canonical.
  const EN = `${BASE}/en`;

  const footerPages = [
    'our-story', 'how-it-works', 'reviews', 'careers',
    'contact', 'faq', 'shipping-info', 'returns',
    'terms', 'privacy-policy', 'payments', 'about',
  ];

  // Leaf categories only (level 3) — avoids duplicating parent-category content
  const leafCategories = categories.filter((c) => c.level === 3 || c.level === undefined);
  // A guide with no live catalog would be an empty doorway. Its page metadata
  // noindexes that state, and the sitemap must make the same decision.
  const availableGiftGuideSlugs = GIFT_GUIDE_SLUGS.filter((slug) => {
    const guide = getGiftGuide(slug);
    return guide ? products.some((product) => isGiftGuideProduct(guide, product)) : false;
  });
  const giftGuideUrls = availableGiftGuideSlugs
    .map((slug) => ({
        url:             `${EN}/${slug}`,
        changeFrequency: 'weekly' as const,
        priority:        0.82,
      }));

  return [
    // ── Priority 1.0: Homepage ──────────────────────────────────────────────
    {
      url:             EN,
      lastModified:    new Date(),
      changeFrequency: 'daily',
      priority:        1.0,
    },

    // ── Priority 0.9: Main listing / hub pages ──────────────────────────────
    ...(['products', 'collections', 'occasions', 'gift-cards'] as const).map((path) => ({
      url:             `${EN}/${path}`,
      changeFrequency: 'daily' as const,
      priority:        0.9,
    })),

    ...giftGuideUrls,

    // ── Priority 0.85: Product pages (with image sitemaps) ─────────────────
    ...products.map((p) => ({
      url:             `${EN}/products/${p.slug}`,
      lastModified:    p.updatedAt ? new Date(p.updatedAt) : new Date(),
      changeFrequency: 'weekly' as const,
      priority:        0.85,
      // Plain URL strings. Next's Sitemap type declares `images?: string[]`,
      // and it was being handed { url, title, caption } objects — which Next
      // stringified straight into <image:loc>[object Object]</image:loc>.
      // Search Console rejected eight of them as Invalid URL.
      //
      // The return type here IS annotated as MetadataRoute.Sitemap, and it
      // still did not catch this. Verified by putting the object form back and
      // rerunning tsc: it exits 0 either way. Object-literal freshness is lost
      // through .map() and the array spreads that build this list, so nothing
      // compares the element type against the declaration.
      //
      // Which means the compiler is not the guard here. The generated XML is:
      // an <image:loc> must contain a URL, and the only way to know it does is
      // to look at the output.
      //
      // title and caption are gone because Next has nowhere to put them —
      // they were never reaching the XML, only breaking the URL that was.
      images: (p.images ?? []).slice(0, 5).map((img) => img.url),
    })),

    // ── Priority 0.75: Category search pages
    ...leafCategories.map((c) => ({
      url:             `${EN}/search?category=${c.slug}`,
      lastModified:    c.updatedAt ? new Date(c.updatedAt) : undefined,
      changeFrequency: 'weekly' as const,
      priority:        0.75,
    })),

    // ── Priority 0.7: Collection pages ─────────────────────────────────────
    ...collections.map((c) => ({
      url:             `${EN}/collections/${c.slug}`,
      lastModified:    c.updatedAt ? new Date(c.updatedAt) : undefined,
      changeFrequency: 'weekly' as const,
      priority:        0.7,
    })),

    // ── Priority 0.65: Tag landing pages ────────────────────────────────────
    // There is no standalone `/tags/[slug]` route in this app — tags are
    // surfaced as a `/search?tags=` filter (see ExploreRelatedSearches.tsx,
    // SearchResults.tsx). The old `/tags/${slug}` entries here 404'd for
    // every single one of these URLs.
    ...tags.map((t) => ({
      url:             `${EN}/search?tags=${t.slug}`,
      changeFrequency: 'weekly' as const,
      priority:        0.65,
    })),

    // ── Priority 0.5: Static footer pages ──────────────────────────────────
    ...footerPages.map((slug) => ({
      url:             `${EN}/pages/${slug}`,
      changeFrequency: 'monthly' as const,
      priority:        0.5,
    })),

    // ── Priority 0.4: Vietnamese & Chinese locale equivalents (top 100 products) ─────
    ...(['vi', 'zh'] as const).flatMap((locale) => [
      {
        url:             `${BASE}/${locale}`,
        changeFrequency: 'daily' as const,
        priority:        0.4,
      },
      ...products.slice(0, 100).map((p) => ({
        url:             `${BASE}/${locale}/products/${p.slug}`,
        changeFrequency: 'weekly' as const,
        priority:        0.4,
      })),
      ...availableGiftGuideSlugs.map((slug) => ({
            url:             `${BASE}/${locale}/${slug}`,
            changeFrequency: 'weekly' as const,
            priority:        0.55,
          })),
    ]),
  ];
}
