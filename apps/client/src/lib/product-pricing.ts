import type { ProductDetailDto } from '@ezihubb/types';

type SalePromotion = ProductDetailDto['salePromo'];

export function applySalePrice(rawPrice: number, sale: SalePromotion): number {
  if (!sale) return rawPrice;

  const discounted = sale.type === 'PERCENTAGE'
    ? rawPrice - Math.round(rawPrice * sale.value) / 100
    : Math.max(0, rawPrice - sale.value);

  return Math.round(Math.max(0, discounted) * 100) / 100;
}

export function getLowestProductPrice(
  product: Pick<ProductDetailDto, 'basePrice' | 'variants'>,
): number {
  return product.variants.length > 0
    ? Math.min(...product.variants.map((variant) => variant.price))
    : product.basePrice;
}

export function getProductSeoPrice(
  product: Pick<ProductDetailDto, 'basePrice' | 'variants' | 'salePromo' | 'compareAtPrice'>,
): { price: number; originalPrice: number | null } {
  const rawPrice = getLowestProductPrice(product);
  const price = applySalePrice(rawPrice, product.salePromo);
  const originalPrice = product.salePromo
    ? Math.max(rawPrice, product.compareAtPrice ?? 0) || rawPrice
    : product.compareAtPrice;

  return { price, originalPrice };
}
