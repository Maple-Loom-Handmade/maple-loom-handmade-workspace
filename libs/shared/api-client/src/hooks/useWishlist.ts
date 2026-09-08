import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import { API_ROUTES } from '@ezihubb/constants';
import type { WishlistItemDto } from '@ezihubb/types';
import { queryKeys } from '../queryKeys';

const WISHLIST_PAGE_SIZE = 48;

interface WishlistWireItem {
  id?: unknown;
  productId?: unknown;
  productName?: unknown;
  productSlug?: unknown;
  productImageUrl?: unknown;
  productBasePrice?: unknown;
  productIsActive?: unknown;
  addedAt?: unknown;
  product?: {
    id?: unknown;
    name?: unknown;
    slug?: unknown;
    basePrice?: unknown;
    imageUrl?: unknown;
    isActive?: unknown;
  };
}

interface WishlistPage {
  data?: unknown;
  pagination?: {
    page?: unknown;
    totalPages?: unknown;
    hasNext?: unknown;
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asPrice(value: unknown): number {
  const price = Number(value);
  return Number.isFinite(price) ? price : 0;
}

/** Normalize both the current flat API DTO and the legacy nested product DTO. */
export function normalizeWishlistItem(value: unknown): WishlistItemDto | null {
  if (!value || typeof value !== 'object') return null;

  const item = value as WishlistWireItem;
  const productId = asString(item.productId, asString(item.product?.id));
  const id = asString(item.id);
  if (!id || !productId) return null;

  return {
    id,
    productId,
    addedAt: asString(item.addedAt),
    product: {
      id: productId,
      name: asString(item.product?.name, asString(item.productName)),
      slug: asString(item.product?.slug, asString(item.productSlug)),
      basePrice: asPrice(item.product?.basePrice ?? item.productBasePrice),
      imageUrl: asString(item.product?.imageUrl, asString(item.productImageUrl)) || undefined,
      isActive: typeof item.product?.isActive === 'boolean'
        ? item.product.isActive
        : item.productIsActive !== false,
    },
  };
}

function parseWishlistPage(value: unknown): {
  items: WishlistItemDto[];
  nextPage: number | null;
} {
  const page = value && typeof value === 'object' ? value as WishlistPage : null;
  const rawItems = Array.isArray(value)
    ? value
    : Array.isArray(page?.data) ? page.data : [];
  const items = rawItems
    .map(normalizeWishlistItem)
    .filter((item): item is WishlistItemDto => item !== null);

  const currentPage = Number(page?.pagination?.page);
  const totalPages = Number(page?.pagination?.totalPages);
  const hasNext = page?.pagination?.hasNext === true
    || (Number.isFinite(currentPage) && Number.isFinite(totalPages) && currentPage < totalPages);

  return {
    items,
    nextPage: hasNext && Number.isFinite(currentPage) ? currentPage + 1 : null,
  };
}

export function useWishlist(enabled = false) {
  return useQuery<WishlistItemDto[]>({
    queryKey: queryKeys.wishlist(),
    queryFn: async () => {
      const allItems: WishlistItemDto[] = [];
      let page = 1;

      do {
        const response = await api.get<unknown>(API_ROUTES.USERS.WISHLIST, {
          params: { page, limit: WISHLIST_PAGE_SIZE },
        });
        const parsed = parseWishlistPage(response);
        allItems.push(...parsed.items);
        page = parsed.nextPage ?? 0;
      } while (page > 0);

      return allItems;
    },
    staleTime: 60_000,
    retry:    false,
    enabled,
  });
}
