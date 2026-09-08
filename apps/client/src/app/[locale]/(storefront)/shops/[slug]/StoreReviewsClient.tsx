'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Star, MessageSquare } from 'lucide-react';
import { apiClient } from '@ezihubb/api-client';
import { API_ROUTES } from '@ezihubb/constants';
import { Pagination, Skeleton } from '@ezihubb/ui';
import { usePaginationLabels } from '../../../../../lib/hooks/usePaginationLabels';
import { ImageLightbox } from '../../../../../components/messages/ImageLightbox';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreReviewsSummary {
  averageRating: number;
  totalReviews:  number;
  distribution:  Record<string, number>;
}

interface ReviewAuthor {
  id:         string;
  firstName:  string | null;
  lastName:   string | null;
  avatarUrl:  string | null;
}

interface ReviewItem {
  id:          string;
  rating:      number;
  title:       string | null;
  body:        string;
  imageUrls:   string[];
  createdAt:   string;
  sellerReply: string | null;
  author:      ReviewAuthor;
  product:     { id: string; name: string; slug: string };
}

interface PaginatedReviews {
  data:       ReviewItem[];
  pagination: { page: number; totalPages: number; total: number };
}

// ── Stars ─────────────────────────────────────────────────────────────────────

function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const t = useTranslations('shops');
  const cls = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={t('reviews.starsOutOf5', { rating })}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          aria-hidden
          className={`${cls} ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-muted/25 fill-muted/10'}`}
        />
      ))}
    </span>
  );
}

// ── Rating distribution bar ───────────────────────────────────────────────────

function RatingBar({
  star, count, total, active, onClick,
}: {
  star:    number;
  count:   number;
  total:   number;
  active:  boolean;
  onClick: () => void;
}) {
  const pct      = total > 0 ? Math.round((count / total) * 100) : 0;
  const isEmpty  = count === 0;
  return (
    <button
      type="button"
      onClick={isEmpty ? undefined : onClick}
      disabled={isEmpty}
      className={[
        'w-full flex items-center gap-3 text-sm rounded-md px-2 py-1 -mx-2 transition-colors text-left',
        active  ? 'bg-yellow-50 ring-1 ring-yellow-300' : '',
        isEmpty ? 'opacity-40 cursor-default' : 'hover:bg-gray-50 cursor-pointer',
      ].join(' ')}
    >
      <span className="text-muted w-6 text-right text-xs tabular-nums">{star}★</span>
      <div className="flex-1 h-2.5 bg-muted/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${active ? 'bg-yellow-500' : 'bg-amber-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-muted text-xs tabular-nums w-8">{pct}%</span>
    </button>
  );
}

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: ReviewItem }) {
  const t      = useTranslations('shops');
  const locale = useLocale();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const images = review.imageUrls ?? [];

  const dateFmt = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });

  const fullName = [review.author.firstName, review.author.lastName]
    .filter(Boolean)
    .join(' ') || t('reviews.customerFallback');
  const initial = fullName[0]?.toUpperCase() ?? '?';
  const date    = dateFmt.format(new Date(review.createdAt));

  return (
    <>
      <ImageLightbox
        urls={images}
        index={previewIndex}
        onClose={() => setPreviewIndex(null)}
        onIndex={setPreviewIndex}
      />
      <article className="border-b border-border pb-7 last:border-0 last:pb-0">
      {/* Author row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 border border-border flex items-center justify-center overflow-hidden shrink-0">
          {review.author.avatarUrl ? (
            <Image
              src={review.author.avatarUrl}
              alt={fullName}
              width={36}
              height={36}
              className="object-cover w-full h-full"
            />
          ) : (
            <span className="text-sm font-semibold text-primary">{initial}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-secondary">{fullName}</span>
            <span className="text-xs text-muted">{date}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Stars rating={review.rating} />
            <span className="text-xs text-muted">
              {t.rich('reviews.forProduct', {
                product: review.product.name,
                b: (chunks) => <span className="text-secondary/80">{chunks}</span>,
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Review body */}
      {review.title && (
        <p className="font-semibold text-secondary text-sm mb-1">{review.title}</p>
      )}
      <p className="text-sm text-secondary/80 leading-relaxed">{review.body}</p>

      {/* Review photos */}
      {images.length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {images.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPreviewIndex(i)}
              aria-label={t('reviews.reviewPhotoAlt', { n: i + 1 })}
              className="w-16 h-16 rounded-md overflow-hidden border border-border bg-surface hover:opacity-80 transition-opacity"
            >
              <Image
                src={url}
                alt={t('reviews.reviewPhotoAlt', { n: i + 1 })}
                width={64}
                height={64}
                className="object-cover w-full h-full"
              />
            </button>
          ))}
        </div>
      )}

      {/* Seller reply */}
      {review.sellerReply && (
        <div className="mt-4 pl-4 border-l-2 border-primary/30">
          <p className="text-xs font-semibold text-primary mb-1">{t('reviews.sellerReply')}</p>
          <p className="text-sm text-secondary/80 leading-relaxed">{review.sellerReply}</p>
        </div>
      )}
      </article>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StoreReviewsClient({
  storeSlug,
  storeRating,
}: {
  storeSlug:   string;
  storeRating: number;
}) {
  const t = useTranslations('shops');
  const paginationLabels = usePaginationLabels();

  const [page,       setPage]       = useState(1);
  const [starFilter, setStarFilter] = useState<number | null>(null);

  const handleStarFilter = (star: number) => {
    setStarFilter((prev) => (prev === star ? null : star));
    setPage(1);
  };

  const { data: summary, isLoading: summaryLoading } = useQuery<StoreReviewsSummary>({
    queryKey: ['store-reviews-summary', storeSlug],
    queryFn:  () => apiClient.get(API_ROUTES.STORES.REVIEWS_SUMMARY(storeSlug)),
    staleTime: 120_000,
  });

  const { data: reviewsPage, isLoading: reviewsLoading } = useQuery<PaginatedReviews>({
    queryKey: ['store-reviews', storeSlug, page, starFilter],
    queryFn:  () =>
      apiClient.get(API_ROUTES.STORES.REVIEWS(storeSlug), {
        params: { page, limit: 10, ...(starFilter ? { rating: starFilter } : {}) },
      }),
    staleTime: 30_000,
  });

  const reviews    = reviewsPage?.data                  ?? [];
  const totalPages = reviewsPage?.pagination?.totalPages ?? 1;

  const avg   = summary?.averageRating ?? storeRating ?? 0;
  const total = summary?.totalReviews  ?? 0;
  const dist  = summary?.distribution  ?? {};

  // ── Summary skeleton ──────────────────────────────────────────────────────

  if (summaryLoading) {
    return (
      <div className="max-w-3xl space-y-8">
        <div className="bg-surface border border-border rounded-card p-6 space-y-3">
          <Skeleton variant="text" className="w-32 h-10" />
          {[5, 4, 3, 2, 1].map((s) => (
            <Skeleton key={s} variant="text" className="w-full h-3" />
          ))}
        </div>
      </div>
    );
  }

  // ── No reviews ────────────────────────────────────────────────────────────

  if (total === 0) {
    return (
      <div className="max-w-3xl">
        <div className="bg-surface border border-border rounded-card p-12 text-center">
          <div className="w-16 h-16 bg-muted/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-muted/40" />
          </div>
          <p className="font-semibold text-secondary text-lg mb-1">{t('reviews.noReviewsYet')}</p>
          <p className="text-sm text-muted">{t('reviews.beFirstToReview')}</p>
        </div>
      </div>
    );
  }

  // ── Reviews ───────────────────────────────────────────────────────────────

  return (
    <div className="grid gap-8 md:grid-cols-[210px_minmax(0,1fr)]">
      {/* Rating overview */}
      <div className="md:pr-4">
        <div className="space-y-6">
          {/* Big score */}
          <div className="text-left min-w-[80px]">
            <p className="font-display text-5xl font-bold text-secondary leading-none mb-2">
              {avg.toFixed(1)}
            </p>
            <Stars rating={Math.round(avg)} size="md" />
            <p className="text-xs text-muted mt-2">
              {t('reviews.reviewsCount', { count: total })}
            </p>
          </div>

          {/* Distribution bars */}
          <div className="min-w-[200px] space-y-1">
            {[5, 4, 3, 2, 1].map((star) => (
              <RatingBar
                key={star}
                star={star}
                count={dist[star] ?? 0}
                total={total}
                active={starFilter === star}
                onClick={() => handleStarFilter(star)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Reviews list */}
      <div>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <h3 className="font-display text-lg font-bold text-secondary">
            {starFilter
              ? t('reviews.starReviews', { star: starFilter })
              : t('reviews.reviewsCount', { count: total })}
          </h3>
          {starFilter && (
            <button
              type="button"
              onClick={() => { setStarFilter(null); setPage(1); }}
              className="text-sm text-primary hover:underline"
            >
              {t('reviews.allReviews')}
            </button>
          )}
        </div>

        {reviewsLoading ? (
          <div className="space-y-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 border-b border-border pb-6">
                <div className="flex items-center gap-3">
                  <Skeleton variant="rect" className="w-9 h-9 rounded-full" />
                  <div className="space-y-1 flex-1">
                    <Skeleton variant="text" className="w-32" />
                    <Skeleton variant="text" className="w-24" />
                  </div>
                </div>
                <Skeleton variant="text" className="w-full" />
                <Skeleton variant="text" className="w-3/4" />
              </div>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-semibold text-secondary mb-1">
              {t('reviews.noStarReviews', { star: starFilter ?? 0 })}
            </p>
            <button
              type="button"
              onClick={() => { setStarFilter(null); setPage(1); }}
              className="text-sm text-primary hover:underline mt-1"
            >
              {t('reviews.showAllReviews')}
            </button>
          </div>
        ) : (
          <div className="space-y-7">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}

        {totalPages > 1 && !reviewsLoading && (
          <div className="mt-8">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              labels={paginationLabels}
            />
          </div>
        )}
      </div>
    </div>
  );
}
