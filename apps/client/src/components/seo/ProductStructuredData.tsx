import type { ProductDetailDto } from '@ezihubb/types';
import type { ReviewSummaryDto } from '@ezihubb/types';
import { fmtRating } from '@ezihubb/utils';
import { getProductSeoPrice } from '../../lib/product-pricing';
import { serializeJsonLd } from '../../lib/seo';

const BASE_URL = 'https://ezihubb.com';

export interface ProductStructuredDataProps {
  product:       ProductDetailDto;
  reviewSummary?: ReviewSummaryDto | null;
  locale?:        string;
}

/**
 * Injects Product JSON-LD structured data.
 * Place inside a Next.js Server Component page alongside the page content.
 *
 * @example
 * <ProductStructuredData product={product} reviewSummary={summary} locale={locale} />
 */
export function ProductStructuredData({
  product,
  reviewSummary,
  locale = 'en',
}: ProductStructuredDataProps) {
  const { price } = getProductSeoPrice(product);
  const productUrl = `${BASE_URL}/${locale}/products/${product.slug}`;
  const offer: Record<string, unknown> = {
    '@type':        'Offer',
    price,
    priceCurrency:  'USD',
    sku:            product.sku,
    itemCondition:  'https://schema.org/NewCondition',
    availability:   product.isActive
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    url:             productUrl,
    seller: {
      '@type': 'Organization',
      name:    product.store?.name ?? 'EziHubb',
    },
    // Mirrors the published policy at /pages/returns. Keeping the policy on
    // every offer lets Google connect it to a product without inventing a
    // platform-wide price or shipping promise.
    hasMerchantReturnPolicy: {
      '@type':               'MerchantReturnPolicy',
      applicableCountry:     'US',
      returnPolicyCategory:  'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays:    30,
      returnMethod:          'https://schema.org/ReturnByMail',
      returnFees:            'https://schema.org/FreeReturn',
      merchantReturnLink:    `${BASE_URL}/${locale}/pages/returns`,
    },
  };

  // ProductDetailDto can prove a listing is free everywhere, but it does not
  // expose the actual paid rate for destination-specific profiles. Publish a
  // zero rate only when it is true; omitting unknown paid shipping is safer
  // than the old hard-coded $5.99 claim that disagreed with checkout.
  if (product.freeShipping) {
    offer['shippingDetails'] = {
      '@type': 'OfferShippingDetails',
      shippingRate: {
        '@type':  'MonetaryAmount',
        value:    0,
        currency: 'USD',
      },
      shippingDestination: {
        '@type':        'DefinedRegion',
        addressCountry: 'US',
      },
    };
  }

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type':    'Product',
    name:       product.name,
    description: product.shortDescription ?? product.description,
    image:      product.images?.map((i) => i.url) ?? [],
    sku:        product.sku,
    mpn:        product.sku,
    url:        productUrl,
    category:   product.category.name,
    brand: {
      '@type': 'Brand',
      name:    product.store?.name ?? 'EziHubb',
    },
    offers:      offer,
  };

  if (product.attributes?.length) {
    data['additionalProperty'] = product.attributes.map((attribute) => ({
      '@type': 'PropertyValue',
      name:    attribute.key,
      value:   attribute.unit ? `${attribute.value} ${attribute.unit}` : attribute.value,
    }));
  }

  if (reviewSummary && reviewSummary.totalReviews > 0) {
    data['aggregateRating'] = {
      '@type':       'AggregateRating',
      ratingValue:   fmtRating(reviewSummary.averageRating),
      reviewCount:   reviewSummary.totalReviews,
      bestRating:    '5',
      worstRating:   '1',
    };
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- serializeJsonLd escapes seller-controlled text
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
