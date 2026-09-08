'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useRef } from 'react';
import { Heart, ShoppingCart, HeartOff, Share2, Copy, Check, X, Globe } from 'lucide-react';
import { queryKeys, useMutateCart, useWishlist } from '@ezihubb/api-client';
import { API_ROUTES } from '@ezihubb/constants';
import { useToast } from '@ezihubb/ui';
import type { WishlistItemDto } from '@ezihubb/types';
import { useAuthQuery, useAuthMutation } from '../../../../../lib/hooks/useAuthQuery';
import { useAuthStore } from '../../../../../lib/store/auth.store';
import { apiClient } from '@ezihubb/api-client';
import { fmtAmount } from '@ezihubb/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WishlistShareStatus {
  token:    string | null;
  isPublic: boolean;
  name:     string | null;
}

// ── Wishlist product card ─────────────────────────────────────────────────────

function WishlistCard({
  item,
  locale,
  onRemove,
  onAddToCart,
  isRemovingId: removingId,
  isAddingId:   addingId,
}: {
  item:           WishlistItemDto;
  locale:         string;
  onRemove:       (productId: string) => void;
  onAddToCart:    (productId: string) => void;
  isRemovingId:   string | null;
  isAddingId:     string | null;
}) {
  const t = useTranslations('account.wishlist');
  const p = item.product;

  return (
    <article className="relative border border-border rounded-card overflow-hidden hover:shadow-card-hover transition-shadow">
      {/* Image */}
      <Link href={`/${locale}/products/${p.slug}`} className="block relative aspect-[4/5] overflow-hidden bg-background">
        <Image
          src={p.imageUrl ?? 'https://placehold.co/400x500.png?text=No+Image'}
          alt={p.name}
          fill
          sizes="(max-width: 640px) 50vw, 25vw"
          className="object-cover hover:scale-105 transition-transform duration-300"
        />
      </Link>

      {/* Remove from wishlist */}
      <button
        type="button"
        onClick={() => onRemove(p.id)}
        disabled={removingId === p.id}
        aria-label={t('removeAria')}
        className="absolute top-2 right-2 p-2 rounded-full bg-white/90 backdrop-blur-sm shadow-sm text-error hover:bg-error hover:text-white transition-colors disabled:opacity-50"
      >
        <Heart className="w-4 h-4 fill-current" />
      </button>

      {/* Info */}
      <div className="p-3 md:p-4 space-y-3">
        <Link href={`/${locale}/products/${p.slug}`}>
          <h3 className="text-sm font-medium text-secondary hover:text-primary transition-colors line-clamp-2 leading-snug">
            {p.name}
          </h3>
        </Link>
        <p className="text-sm font-bold text-secondary tabular-nums">
          {fmtAmount(p.basePrice)}
        </p>

        {/* Add to Cart */}
        <button
          type="button"
          onClick={() => onAddToCart(p.id)}
          disabled={addingId === p.id || !p.isActive}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-primary text-primary text-xs font-semibold rounded-button hover:bg-primary hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          {addingId === p.id
            ? t('adding')
            : p.isActive
            ? t('addToCart')
            : t('outOfStock')}
        </button>
      </div>
    </article>
  );
}

// ── Sharing Panel ─────────────────────────────────────────────────────────────

function SharingPanel() {
  const t = useTranslations('account.wishlist');
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const { data: shareStatus, refetch } = useAuthQuery<WishlistShareStatus>(
    ['wishlist', 'share'],
    API_ROUTES.USERS.WISHLIST_SHARE,
  );

  const enableMutation = useAuthMutation(
    (_: void, token: string) =>
      apiClient.post<WishlistShareStatus>(API_ROUTES.USERS.WISHLIST_SHARE, {}, { token }),
    { onSuccess: () => refetch() },
  );

  const updateMutation = useAuthMutation(
    (dto: { name?: string | null; isPublic?: boolean }, token: string) =>
      apiClient.patch<WishlistShareStatus>(API_ROUTES.USERS.WISHLIST_SHARE, dto, { token }),
    { onSuccess: () => refetch() },
  );

  const revokeMutation = useAuthMutation(
    (_: void, token: string) => apiClient.delete<void>(API_ROUTES.USERS.WISHLIST_SHARE, { token }),
    {
      onSuccess: () => {
        refetch();
        toast.info(t('linkRevoked'));
      },
    },
  );

  const shareToken = shareStatus?.token ?? null;
  const shareUrl =
    typeof window !== 'undefined' && shareToken
      ? `${window.location.origin}/wishlist/${shareToken}`
      : '';

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleEnable = () => enableMutation.mutate(undefined);
  const handleRevoke = () => revokeMutation.mutate(undefined);

  const handleNameBlur = () => {
    const name = nameRef.current?.value.trim() ?? '';
    updateMutation.mutate({ name: name || null });
  };

  const togglePublic = (checked: boolean) => {
    updateMutation.mutate({ isPublic: checked });
  };

  return (
    <div className="border border-border rounded-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-secondary text-sm">{t('shareTitle')}</h2>
        </div>
        {shareToken && (
          <button
            type="button"
            onClick={handleRevoke}
            disabled={revokeMutation.isPending}
            className="text-xs text-muted hover:text-error transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            {t('revokeLink')}
          </button>
        )}
      </div>

      {!shareToken ? (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            {t('createLinkHint')}
          </p>
          <button
            type="button"
            onClick={handleEnable}
            disabled={enableMutation.isPending}
            className="flex items-center gap-2 bg-primary text-white text-xs font-semibold px-4 py-2 rounded-button hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            <Globe className="w-3.5 h-3.5" />
            {enableMutation.isPending ? t('creating') : t('createShareLink')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Name input */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              {t('nameLabel')} <span className="text-muted font-normal">{t('optional')}</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              maxLength={100}
              defaultValue={shareStatus?.name ?? ''}
              onBlur={handleNameBlur}
              placeholder={t('namePlaceholder')}
              className="w-full border border-border rounded-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Visibility toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={shareStatus?.isPublic ?? false}
                onChange={(e) => togglePublic(e.target.checked)}
              />
              <div
                className={`w-10 h-5 rounded-full transition-colors ${
                  shareStatus?.isPublic ? 'bg-primary' : 'bg-border'
                }`}
              />
              <div
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  shareStatus?.isPublic ? 'translate-x-5' : ''
                }`}
              />
            </div>
            <span className="text-xs text-secondary">
              {shareStatus?.isPublic
                ? t('visiblePublic')
                : t('hiddenInactive')}
            </span>
          </label>

          {/* Share URL */}
          {shareStatus?.isPublic && shareUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 border border-border rounded-input px-3 py-2 text-xs text-muted bg-background/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-button text-xs font-medium text-secondary hover:bg-background transition-colors"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>

              {/* Social share */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{t('shareOn')}</span>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-2.5 py-1 rounded border border-border text-secondary hover:bg-background transition-colors"
                >
                  Facebook
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(
                    t('shareCheckOut'),
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-2.5 py-1 rounded border border-border text-secondary hover:bg-background transition-colors"
                >
                  X
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WishlistPage() {
  const t      = useTranslations('account.wishlist');
  const locale = useLocale();
  const toast  = useToast();
  const accessToken = useAuthStore((state) => state.accessToken);

  // Keep the shared wishlist cache normalized as WishlistItemDto[]. Using the
  // raw paginated endpoint here used to replace that cache with an object and
  // crash every product card consumer that calls `.some()` on it.
  const { data: items = [], isLoading } = useWishlist(Boolean(accessToken));

  const removeMutation = useAuthMutation(
    (productId: string, token: string) =>
      apiClient.delete<void>(API_ROUTES.USERS.WISHLIST_ITEM(productId), { token }),
    {
      invalidateKeys: [queryKeys.wishlist()],
      onSuccess:      () => toast.info(t('removedFromWishlist')),
    },
  );

  const { addItem } = useMutateCart();

  const removingId =
    removeMutation.isPending ? (removeMutation.variables as string) : null;
  const addingId =
    addItem.isPending ? (addItem.variables as { productId: string }).productId : null;

  const handleRemove = (productId: string) => {
    removeMutation.mutate(productId);
  };

  const handleAddToCart = (productId: string) => {
    addItem.mutate(
      { productId, quantity: 1 },
      {
        onSuccess: () => toast.success(t('addedToCart')),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : t('failedToAddToCart')),
      },
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-secondary">{t('pageTitle')}</h1>

      {/* Sharing panel */}
      <SharingPanel />

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse border border-border rounded-card overflow-hidden">
              <div className="aspect-[4/5] bg-border/30" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-border/30 rounded w-3/4" />
                <div className="h-4 bg-border/30 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
          <HeartOff className="w-14 h-14 text-muted/30" aria-hidden />
          <div>
            <p className="font-semibold text-secondary text-base">{t('nothingSaved')}</p>
            <p className="text-sm text-muted mt-1">
              {t('nothingSavedHint')}
            </p>
          </div>
          <Link
            href={`/${locale}/search`}
            className="mt-2 bg-primary hover:bg-primary-dark text-white font-bold text-sm px-6 py-3 rounded-button transition-colors uppercase tracking-wide"
          >
            {t('exploreGifts')}
          </Link>
        </div>
      )}

      {/* Grid */}
      {!isLoading && items.length > 0 && (
        <>
          <p className="text-sm text-muted">
            <span className="font-semibold text-secondary">{items.length}</span>{' '}
            {t('savedItems', { count: items.length })}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {items.map((item: WishlistItemDto) => (
              <WishlistCard
                key={item.id}
                item={item}
                locale={locale}
                onRemove={handleRemove}
                onAddToCart={handleAddToCart}
                isRemovingId={removingId}
                isAddingId={addingId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
