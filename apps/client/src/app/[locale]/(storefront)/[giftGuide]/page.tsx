import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { ArrowRight, Check, Gift, Heart, Sparkles } from 'lucide-react';
import { apiClient } from '@ezihubb/api-client';
import { API_ROUTES } from '@ezihubb/constants';
import type { PaginatedResponse, ProductListItemDto } from '@ezihubb/types';
import { SearchProductCard } from '../../../../components/search/SearchProductCard';
import { BreadcrumbStructuredData } from '../../../../components/seo/BreadcrumbStructuredData';
import { FAQStructuredData } from '../../../../components/seo/FAQStructuredData';
import { buildAlternates, SEO_DOMAIN, serializeJsonLd } from '../../../../lib/seo';
import {
  GIFT_GUIDE_SLUGS,
  getGiftGuide,
  getGiftGuideContent,
  isGiftGuideProduct,
} from '../../../../lib/gift-guides';
import { routing } from '../../../../i18n/routing';

export const revalidate = 900;
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    GIFT_GUIDE_SLUGS.map((giftGuide) => ({ locale, giftGuide })),
  );
}

const getGuideProducts = cache(async (
  guideSlug: string,
  locale: string,
): Promise<ProductListItemDto[]> => {
  const guide = getGiftGuide(guideSlug);
  if (!guide) return [];

  const commonParams = {
    limit: 8,
    isActive: true,
    isPersonalizable: true,
    sort: 'bestseller',
  } as const;

  const resultPages = await Promise.all([
    ...guide.searchTerms.map((q) =>
      apiClient
        .get<PaginatedResponse<ProductListItemDto>>(API_ROUTES.PRODUCTS.LIST, {
          params: { ...commonParams, q },
          headers: { 'X-Locale': locale },
          next: { revalidate },
        })
        .then((result) => result.data)
        .catch(() => [] as ProductListItemDto[]),
    ),
  ]);

  const unique = new Map<string, ProductListItemDto>();
  for (const products of resultPages) {
    for (const product of products) {
      if (!isGiftGuideProduct(guide, product)) continue;
      if (!unique.has(product.id)) unique.set(product.id, product);
      if (unique.size >= 12) return [...unique.values()];
    }
  }

  return [...unique.values()];
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; giftGuide: string }>;
}): Promise<Metadata> {
  const { locale, giftGuide: slug } = await params;
  const guide = getGiftGuide(slug);
  if (!guide) return { title: 'Gift guide not found', robots: { index: false, follow: false } };

  const content = getGiftGuideContent(guide, locale);
  const products = await getGuideProducts(slug, locale);
  const image = products[0]?.images?.[0]?.url ?? products[0]?.primaryImageUrl;

  return {
    title: content.title,
    description: content.description,
    keywords: guide.keywords,
    robots: { index: products.length > 0, follow: true },
    alternates: buildAlternates(`/${slug}`, locale),
    openGraph: {
      title: content.title,
      description: content.description,
      type: 'website',
      url: `/${locale}/${slug}`,
      images: image
        ? [{ url: image, width: 800, height: 800, alt: content.heading }]
        : [{ url: '/og-default.jpg', width: 1200, height: 630, alt: content.heading }],
    },
    twitter: {
      card: 'summary_large_image',
      title: content.title,
      description: content.description,
      images: image ? [image] : ['/og-default.jpg'],
    },
  };
}

export default async function GiftGuidePage({
  params,
}: {
  params: Promise<{ locale: string; giftGuide: string }>;
}) {
  const { locale, giftGuide: slug } = await params;
  const guide = getGiftGuide(slug);
  if (!guide) notFound();

  const content = getGiftGuideContent(guide, locale);
  const products = await getGuideProducts(slug, locale);
  const heroImage = products[0]?.images?.[0]?.url ?? products[0]?.primaryImageUrl;
  const searchHref = `/${locale}/search?q=${encodeURIComponent(guide.searchTerms[0])}`;
  const allGiftsHref = `/${locale}/products`;
  const guideUrl = `${SEO_DOMAIN}/${locale}/${slug}`;

  const itemListSchema = products.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: content.productsHeading,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: product.name,
      url: `${SEO_DOMAIN}/${locale}/products/${product.slug}`,
    })),
  } : null;

  return (
    <>
      <BreadcrumbStructuredData items={[
        { name: 'EziHubb', url: `${SEO_DOMAIN}/${locale}` },
        { name: content.title, url: guideUrl },
      ]} />
      <FAQStructuredData faqs={content.faqs} />
      {itemListSchema && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- serializeJsonLd escapes seller-controlled text
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListSchema) }}
        />
      )}

      <section className="overflow-hidden border-b border-border bg-gradient-to-br from-[#FFF8F3] via-white to-[#F5EEE8]">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-20">
          <div>
            <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-muted">
              <Link href={`/${locale}`} className="hover:text-primary">EziHubb</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page" className="line-clamp-1">{content.title}</span>
            </nav>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              {content.eyebrow}
            </p>
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight text-secondary sm:text-5xl lg:text-6xl">
              {content.heading}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              {content.intro}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="#personalized-gifts"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                {content.cta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={allGiftsHref}
                className="inline-flex min-h-12 items-center rounded-full border border-border bg-white px-6 py-3 font-semibold text-secondary transition-colors hover:border-secondary"
              >
                {locale === 'vi' ? 'Xem tất cả quà tặng' : locale === 'zh' ? '浏览全部礼物' : 'Browse all gifts'}
              </Link>
            </div>
          </div>

          <div className="relative mx-auto aspect-[4/3] w-full max-w-xl overflow-hidden rounded-[32px] bg-[#EDE4DC] shadow-[0_24px_60px_rgba(80,52,37,0.16)]">
            {heroImage ? (
              <Image
                src={heroImage}
                alt={products[0]?.name ?? content.heading}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 46vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-primary">
                <Gift className="h-20 w-20" aria-hidden="true" />
              </div>
            )}
            <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur">
              <p className="flex items-center gap-2 text-sm font-semibold text-secondary">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                {content.eyebrow}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="personalized-gifts" className="scroll-mt-32 py-14 md:py-20">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">
                {content.productsHeading}
              </h2>
              <p className="mt-2 max-w-2xl leading-7 text-muted">{content.productsDescription}</p>
            </div>
            <Link href={searchHref} className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
              {locale === 'vi' ? 'Xem thêm thiết kế' : locale === 'zh' ? '查看更多设计' : 'See more designs'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {products.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:gap-[22px]">
              {products.map((product, index) => (
                <SearchProductCard key={product.id} product={product} priority={index < 4} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-surface p-8 text-center">
              <p className="text-muted">{content.emptyProducts}</p>
              <Link href={allGiftsHref} className="mt-4 inline-flex font-semibold text-primary hover:underline">
                {locale === 'vi' ? 'Khám phá quà cá nhân hóa' : locale === 'zh' ? '浏览个性化礼物' : 'Explore personalized gifts'}
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="border-y border-border bg-[#FAF8F5] py-14 md:py-20">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6">
          <h2 className="max-w-2xl font-display text-3xl font-semibold text-secondary sm:text-4xl">
            {content.whyHeading}
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {content.reasons.map((reason, index) => {
              const Icon = [Heart, Gift, Sparkles][index] ?? Heart;
              return (
                <article key={reason.title} className="rounded-3xl border border-border bg-white p-6">
                  <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary-light text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-semibold text-secondary">{reason.title}</h3>
                  <p className="mt-2 leading-7 text-muted">{reason.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto grid max-w-[1100px] gap-12 px-4 md:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-semibold text-secondary">{content.tipsHeading}</h2>
            <ul className="mt-6 space-y-4">
              {content.tips.map((tip) => (
                <li key={tip} className="flex gap-3 leading-7 text-muted">
                  <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-3xl font-semibold text-secondary">{content.faqHeading}</h2>
            <div className="mt-6 divide-y divide-border rounded-3xl border border-border bg-white px-5">
              {content.faqs.map((faq) => (
                <details key={faq.q} className="group py-5">
                  <summary className="cursor-pointer list-none pr-6 font-semibold text-secondary marker:hidden">
                    {faq.q}
                  </summary>
                  <p className="pt-3 leading-7 text-muted">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
