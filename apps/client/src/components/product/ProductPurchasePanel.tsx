'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import {
  Star, CheckCircle2, Clock, ShoppingCart,
  Loader2, Plus, Users, Paperclip, X,
} from 'lucide-react';
import { Select } from '@ezihubb/ui';
import { ShareButton } from './ShareButton';
import {
  ItemDetailsAccordion,
  ShippingReturnsAccordion,
  DigitalDeliveryAccordion,
  PurchaseProtectionAccordion,
  FAQsAccordion,
  MeetYourSellersAccordion,
} from './ProductAccordions';
import { useCartStore } from '../../lib/store/cart.store';
import { MobileStickyCartBar } from './MobileStickyCartBar';
import { useCurrency } from '../../lib/currency/currency-context';
import { analytics } from '../../lib/analytics';
import type { ProductDetailDto, ProductVariantDto, ReviewSummaryDto } from '@ezihubb/types';
import { fmtRating, safeNum } from '@ezihubb/utils';
import { useVariationPhoto } from './VariationPhotoContext';
import { API_BASE } from '../../lib/api-client';
import { API_ROUTES } from '@ezihubb/constants';
import { applySalePrice } from '../../lib/product-pricing';

// ── Date helpers (no date-fns) ────────────────────────────────────────────────

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

function addCalendarDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

// Sellers often enter variant option names/values in ALL CAPS ("SIZE",
// "ADULT TEE - XS") — display-only transform, the raw string is still what's
// used for matching/selection everywhere else.
//
// Size tokens are preserved rather than title-cased. A plain title-case turns
// "XS" into "Xs" and "2XL" into "2xl", which is wrong on the one variant almost
// every apparel listing has — the shopper picks a size from this dropdown, and
// "2xl" reads like a typo. A token is left alone when it is already all-caps
// and either contains a digit ("2XL", "3XL") or is built only from the letters
// sizes use ("S", "XL", "XXL", "XXXL").
//
// Deliberately narrow. It does not try to protect every acronym — "USB-C" still
// becomes "Usb-c" — because guessing which all-caps words are meaningful in
// free text is not solvable, and sizes are the case that actually occurs here.
function toTitleCase(s: string): string {
  return s.replace(/\S+/g, (word) => {
    const isAllCaps = word === word.toUpperCase() && /[A-Z]/.test(word);
    if (isAllCaps && (/\d/.test(word) || /^[XSML]{1,4}$/.test(word))) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

// ── Field type from ProductDetailDto['customization'] ───────────────────────────────

type CustomField = NonNullable<ProductDetailDto['customization']>['fields'][number];
type CustomOption = NonNullable<ProductDetailDto['customOptions']>[number];

interface UploadedCustomOptionFile {
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

interface TextWithFileAnswer {
  text: string;
  file?: UploadedCustomOptionFile;
}

type CustomOptionAnswer = string | string[] | boolean | UploadedCustomOptionFile | TextWithFileAnswer;

function isUploadedFile(value: CustomOptionAnswer | undefined): value is UploadedCustomOptionFile {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'url' in value;
}

function isTextWithFileAnswer(value: CustomOptionAnswer | undefined): value is TextWithFileAnswer {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'text' in value;
}

function textAnswerOf(value: CustomOptionAnswer | undefined): string {
  if (typeof value === 'string') return value;
  return isTextWithFileAnswer(value) ? value.text : '';
}

function fileAnswerOf(value: CustomOptionAnswer | undefined): UploadedCustomOptionFile | undefined {
  if (isUploadedFile(value)) return value;
  return isTextWithFileAnswer(value) ? value.file : undefined;
}

function hasAnyCustomOptionAnswer(value: CustomOptionAnswer | undefined): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  if (isUploadedFile(value)) return true;
  return isTextWithFileAnswer(value)
    && (value.text.trim().length > 0 || isUploadedFile(value.file));
}

function hasRequiredCustomOptionAnswer(option: CustomOption, value: CustomOptionAnswer | undefined): boolean {
  if (option.type === 'TEXT_BOX' && option.allowFileUpload) {
    return textAnswerOf(value).trim().length > 0 && isUploadedFile(fileAnswerOf(value));
  }
  return hasAnyCustomOptionAnswer(value);
}

// ── InDemandBadge ─────────────────────────────────────────────────────────────

function InDemandBadge({ count }: { count: number }) {
  const t = useTranslations('product.purchasePanel');
  return (
    <div className="flex items-center gap-2 text-sm text-secondary">
      <span className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
      <span>
        {t.rich('boughtInDemand', { count, strong: (chunks) => <strong>{chunks}</strong> })}
      </span>
    </div>
  );
}

// ── PriceBlock ────────────────────────────────────────────────────────────────

function PriceBlock({
  price,
  compareAtPrice,
  discountPercent,
}: {
  price:          number;
  compareAtPrice?: number;
  discountPercent: number | null;
}) {
  const t = useTranslations('product.purchasePanel');
  const { format } = useCurrency();
  const isSale = discountPercent !== null && discountPercent > 0;
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        {/* Same rule as the grid card: a discounted price is red
            (badge-sale), a plain one is not. The two surfaces used to
            disagree — the card said red, the detail page said neutral with a
            green pill beside it, so the same listing changed colour on the
            way from the grid to the page it links to. */}
        <span className={['text-2xl font-bold', isSale ? 'text-badge-sale' : 'text-secondary'].join(' ')}>
          {format(price)}
        </span>
        {compareAtPrice && compareAtPrice > price && (
          <span className="text-base text-muted line-through decoration-1">
            {format(compareAtPrice)}
          </span>
        )}
        {isSale && (
          /* A solid sale-red pill, the same language as the sticker on the
             cards that lead here. Muted grey was the opposite mistake to the
             green pill it replaced: it stated the saving in the quietest
             voice on the panel. It stays smaller than the price, so the
             number they pay is still what leads. */
          <span className="rounded-pill bg-badge-sale px-2 py-0.5 text-xs font-bold text-white">
            {t('discountOff', { percent: discountPercent })}
          </span>
        )}
      </div>
      {isSale && (
        <p className="text-xs text-muted mt-0.5">{t('limitedTimeSale')}</p>
      )}
    </div>
  );
}

// ── BuyTogetherCard ──────────────────────────────────────────────────────────

function BuyTogetherCard({
  bundleOffer,
  currentProductId,
}: {
  bundleOffer: NonNullable<ProductDetailDto['bundleOffer']>;
  currentProductId: string;
}) {
  const t = useTranslations('product.purchasePanel');
  const { format } = useCurrency();
  const addItem = useCartStore((s) => s.addItem);
  const openDrawer = useCartStore((s) => s.openDrawer);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const partners = bundleOffer.products.filter((p) => p.id !== currentProductId);
  if (partners.length === 0) return null;

  const originalTotal = bundleOffer.products.reduce((sum, p) => sum + p.price, 0);
  const bundleTotal = Math.round(originalTotal * (1 - bundleOffer.discountPercent / 100) * 100) / 100;

  const handleAddBundle = async () => {
    setIsAdding(true);
    setAddError(null);
    try {
      await Promise.all([
        addItem({ productId: currentProductId, variantId: null, quantity: 1, customizationData: null }),
        ...partners.map((p) => addItem({ productId: p.id, variantId: null, quantity: 1, customizationData: null })),
      ]);
      openDrawer();
    } catch {
      setAddError(t('couldNotAddToCart'));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="border border-primary/20 bg-primary/[0.03] rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-secondary">
        <Users className="w-4 h-4 text-primary" />
        {t('buyTogether', { percent: bundleOffer.discountPercent })}
      </div>

      <div className="flex items-center gap-2">
        {bundleOffer.products.map((p) => (
          p.images[0]
            ? <Image key={p.id} src={p.images[0]} alt={p.name} width={48} height={48} sizes="48px" className="w-12 h-12 rounded-lg object-cover border border-border" />
            : <div key={p.id} className="w-12 h-12 rounded-lg bg-background border border-border" />
        ))}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-badge-sale">{format(bundleTotal)}</span>
        <span className="text-sm text-muted line-through">{format(originalTotal)}</span>
      </div>

      <button
        type="button"
        onClick={handleAddBundle}
        disabled={isAdding}
        className="w-full py-2.5 rounded-full font-semibold text-sm bg-secondary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isAdding ? t('actions.adding') : t('addBundleToCart')}
      </button>
      {addError && (
        <p role="alert" className="text-xs text-red-600">
          {addError}
        </p>
      )}
    </div>
  );
}

// ── DeliveryInfo ──────────────────────────────────────────────────────────────

function DeliveryInfo({ processingDays, freeShipping }: { processingDays: number; freeShipping: boolean }) {
  const t      = useTranslations('product.purchasePanel');
  const locale = useLocale();
  const today       = new Date();
  const shipBy      = addBusinessDays(today, processingDays);
  const deliveryMin = addCalendarDays(shipBy, 5);
  const deliveryMax = addCalendarDays(shipBy, 10);

  return (
    <div className="space-y-1.5 text-sm">
      {/* Same rule as the grid: claimed only when the shipping profile is free
          to every destination it serves. */}
      {freeShipping && (
        <div className="flex items-center gap-2 text-secondary">
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span>{t('freeShipping')}</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-secondary">
        <Clock className="w-4 h-4 flex-shrink-0" />
        <span>
          {t.rich('arrivesSoon', {
            min: fmtDate(deliveryMin, locale),
            max: fmtDate(deliveryMax, locale),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </span>
      </div>
      <div className="flex items-center gap-2 text-secondary">
        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        <span>{t('returnsAccepted')}</span>
      </div>
    </div>
  );
}

// ── RatingRow ─────────────────────────────────────────────────────────────────

function RatingRow({
  averageRating,
  totalReviews,
}: {
  averageRating: number;
  totalReviews:  number;
}) {
  const t = useTranslations('product.info');
  const rounded = Math.round(safeNum(averageRating));
  return (
    <a href="#reviews" className="flex items-center gap-1.5 text-sm hover:underline w-fit">
      <span className="font-semibold">{fmtRating(averageRating)}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`w-3.5 h-3.5 ${
              s <= rounded
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-gray-200 text-gray-200'
            }`}
          />
        ))}
      </div>
      <span className="text-muted">({t('reviewCount', { count: safeNum(totalReviews) })})</span>
    </a>
  );
}

// ── VariantDropdown ───────────────────────────────────────────────────────────

// Variants carry a price per full option combination, not per single option
// value — so "Embroidered Hat (510,193đ)" only resolves to one number when
// every OTHER already-picked group narrows it down to a single price. With
// groups still unpicked (or a group, like Size here, that spans many prices),
// show the min–max range across the matching variants instead of a false-
// precise single figure.
function priceRangeForValue(
  variants:    ProductVariantDto[],
  optionName:  string,
  value:       string,
  allSelected: Record<string, string>,
): { min: number; max: number } | null {
  const matches = variants.filter((v) => {
    if (v.options?.[optionName] !== value) return false;
    return Object.entries(allSelected).every(
      ([k, val]) => k === optionName || !val || v.options?.[k] === val,
    );
  });
  if (matches.length === 0) return null;
  const prices = matches.map((v) => v.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function VariantDropdown({
  label,
  optionName,
  values,
  selected,
  onChange,
  hasError,
  id,
  variants,
  allSelected,
}: {
  label:    string;
  optionName: string;
  values:   string[];
  selected: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  id?:       string;
  variants:   ProductVariantDto[];
  allSelected: Record<string, string>;
}) {
  const t = useTranslations('product.purchasePanel');
  const { format } = useCurrency();

  const priceLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const v of values) {
      const range = priceRangeForValue(variants, optionName, v, allSelected);
      if (!range) continue;
      labels[v] = range.min === range.max
        ? format(range.min)
        : `${format(range.min)}–${format(range.max)}`;
    }
    return labels;
  }, [values, variants, optionName, allSelected, format]);

  return (
    <div id={id}>
      <label htmlFor={`${id}-select`} className="text-sm font-medium block mb-1.5">
        {toTitleCase(label)} <span className="text-red-500">*</span>
      </label>
      {hasError && !selected && (
        <p className="text-xs text-red-500 mb-1">{t('pleaseSelectOption')}</p>
      )}
      <Select
        id={`${id}-select`}
        required
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('selectOptionPlaceholder')}
        options={values.map((optionValue) => ({
          value: optionValue,
          label: priceLabels[optionValue]
            ? `${toTitleCase(optionValue)} (${priceLabels[optionValue]})`
            : toTitleCase(optionValue),
        }))}
        error={hasError && !selected}
      />
    </div>
  );
}

// ── QuantityDropdown ──────────────────────────────────────────────────────────

function QuantityDropdown({
  value,
  onChange,
  label,
}: {
  value:    number;
  onChange: (n: number) => void;
  label:    string;
}) {
  return (
    <div>
      <label htmlFor="product-quantity" className="text-sm font-medium block mb-1.5">{label}</label>
      <Select
        id="product-quantity"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        options={Array.from({ length: 10 }, (_, index) => ({
          value: String(index + 1),
          label: String(index + 1),
        }))}
      />
    </div>
  );
}

// ── CustomOptionsFields ──────────────────────────────────────────────────────

function CompactFileUpload({
  option,
  file,
  uploading,
  onFileChange,
  onRemove,
}: {
  option: CustomOption;
  file: UploadedCustomOptionFile | undefined;
  uploading: boolean;
  onFileChange: (file: File) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('product.purchasePanel');

  return (
    <div className="flex min-h-11 items-center gap-2 border-t border-border bg-background/60 px-3 py-2">
      {file ? (
        <>
          <Paperclip className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-secondary">{file.name}</span>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-1 text-muted hover:bg-red-50 hover:text-red-600"
            aria-label={t('removeUploadedFile')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <label className={`inline-flex min-w-0 cursor-pointer items-center gap-2 text-xs font-semibold ${uploading ? 'text-muted' : 'text-primary hover:text-primary-dark'}`}>
          {uploading
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            : <Paperclip className="h-4 w-4 shrink-0" />}
          <span>{uploading ? t('uploadingFile') : t('chooseFile')}</span>
          <input
            type="file"
            className="sr-only"
            disabled={uploading}
            accept={(option.acceptedFileTypes?.length ? option.acceptedFileTypes : ['image/*']).join(',')}
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) onFileChange(picked);
              event.currentTarget.value = '';
            }}
          />
        </label>
      )}
      {!file && !uploading && (
        <span className="ml-auto shrink-0 text-[11px] text-muted">
          ≤ {option.maxFileSizeMB || 10} MB
        </span>
      )}
    </div>
  );
}

function CustomOptionsFields({
  options,
  values,
  errors,
  uploadingOptionId,
  onChange,
  onFileChange,
}: {
  options: ProductDetailDto['customOptions'];
  values: Record<string, CustomOptionAnswer>;
  errors: Record<string, string>;
  uploadingOptionId: string | null;
  onChange: (optionId: string, value: CustomOptionAnswer) => void;
  onFileChange: (option: CustomOption, file: File) => void;
}) {
  const t = useTranslations('product.purchasePanel');

  if (!options?.length) return null;

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <p className="text-sm font-semibold text-secondary">{t('customOptions')}</p>
      {options.map((option) => {
        const value = values[option.id];
        const error = errors[option.id];
        const textValue = textAnswerOf(value);
        const uploadedFile = fileAnswerOf(value);
        const combinesTextAndFile = option.type === 'TEXT_BOX' && option.allowFileUpload;
        const inputClass = [
          'w-full border rounded-lg px-3 py-2.5 text-sm bg-white text-secondary',
          'focus:outline-none focus:ring-2 focus:ring-primary/20',
          error ? 'border-red-500' : 'border-border',
        ].join(' ');

        return (
          <fieldset id={`custom-option-${option.id}`} key={option.id} aria-describedby={[option.instructionText ? `custom-option-${option.id}-instruction` : '', error ? `custom-option-${option.id}-error` : ''].filter(Boolean).join(' ') || undefined}>
            <legend className="text-sm font-medium text-secondary block mb-1.5">
              {option.label}
              {option.required && <span className="text-red-500 ml-0.5">*</span>}
            </legend>
            {option.instructionText && (
              <p id={`custom-option-${option.id}-instruction`} className="text-xs text-muted mb-1.5">{option.instructionText}</p>
            )}

            {option.type === 'TEXT_BOX' && (
              combinesTextAndFile ? (
                <div className={`overflow-hidden rounded-lg border bg-white ${error ? 'border-red-500' : 'border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'}`}>
                  {option.isMultiline ? (
                    <textarea
                      aria-label={option.label}
                      aria-invalid={Boolean(error)}
                      required={option.required}
                      value={textValue}
                      onChange={(event) => onChange(option.id, { text: event.target.value, file: uploadedFile })}
                      placeholder={option.placeholder}
                      maxLength={option.maxLength || 250}
                      rows={3}
                      className="block w-full resize-y border-0 bg-white px-3 py-2.5 text-sm text-secondary focus:outline-none focus:ring-0"
                    />
                  ) : (
                    <input
                      type="text"
                      aria-label={option.label}
                      aria-invalid={Boolean(error)}
                      required={option.required}
                      value={textValue}
                      onChange={(event) => onChange(option.id, { text: event.target.value, file: uploadedFile })}
                      placeholder={option.placeholder}
                      maxLength={option.maxLength || 250}
                      className="block w-full border-0 bg-white px-3 py-2.5 text-sm text-secondary focus:outline-none focus:ring-0"
                    />
                  )}
                  <CompactFileUpload
                    option={option}
                    file={uploadedFile}
                    uploading={uploadingOptionId === option.id}
                    onFileChange={(file) => onFileChange(option, file)}
                    onRemove={() => onChange(option.id, { text: textValue })}
                  />
                </div>
              ) : option.isMultiline ? (
                <textarea
                  aria-label={option.label}
                  aria-invalid={Boolean(error)}
                  required={option.required}
                  value={textValue}
                  onChange={(event) => onChange(option.id, event.target.value)}
                  placeholder={option.placeholder}
                  maxLength={option.maxLength || 250}
                  rows={4}
                  className={`${inputClass} resize-y`}
                />
              ) : (
                <input
                  type="text"
                  aria-label={option.label}
                  aria-invalid={Boolean(error)}
                  required={option.required}
                  value={textValue}
                  onChange={(event) => onChange(option.id, event.target.value)}
                  placeholder={option.placeholder}
                  maxLength={option.maxLength || 250}
                  className={inputClass}
                />
              )
            )}

            {option.type === 'LIST_OF_OPTIONS' && (option.allowMultiSelect ? (
              <div className={`space-y-2 rounded-lg border px-3 py-2.5 ${error ? 'border-red-500' : 'border-border'}`}>
                {option.choices.map((choice) => {
                  const selected = Array.isArray(value) && value.includes(choice);
                  return (
                    <label key={choice} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          const current = Array.isArray(value) ? value : [];
                          onChange(option.id, selected
                            ? current.filter((item) => item !== choice)
                            : [...current, choice]);
                        }}
                        className="accent-primary"
                      />
                      {choice}
                    </label>
                  );
                })}
              </div>
            ) : (
              <Select
                aria-label={option.label}
                required={option.required}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(option.id, event.target.value)}
                placeholder={option.placeholder || t('selectOptionPlaceholder')}
                options={option.choices.map((choice) => ({ value: choice, label: choice }))}
                error={Boolean(error)}
              />
            ))}

            {option.type === 'FILE_UPLOAD' && (
              isUploadedFile(value) ? (
                <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <Paperclip className="w-4 h-4 text-muted shrink-0" />
                  <span className="text-sm text-secondary truncate flex-1">{value.name}</span>
                  <button
                    type="button"
                    onClick={() => onChange(option.id, '')}
                    className="p-1 text-muted hover:text-red-600"
                    aria-label={t('removeUploadedFile')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className={`flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 cursor-pointer hover:border-primary/60 ${error ? 'border-red-500' : 'border-border'}`}>
                  {uploadingOptionId === option.id
                    ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    : <Paperclip className="w-4 h-4 text-muted" />}
                  <span className="text-sm font-medium text-secondary">
                    {uploadingOptionId === option.id ? t('uploadingFile') : t('chooseFile')}
                  </span>
                  <input
                    type="file"
                    aria-label={option.label}
                    className="sr-only"
                    disabled={uploadingOptionId !== null}
                    accept={(option.acceptedFileTypes?.length ? option.acceptedFileTypes : ['image/*']).join(',')}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onFileChange(option, file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              )
            )}

            {option.type === 'CHECKBOX' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={option.label}
                  checked={value === true}
                  onChange={(event) => onChange(option.id, event.target.checked)}
                  className="accent-primary"
                />
                {option.placeholder || option.label}
              </label>
            )}

            {option.type === 'COLOR_SWATCH' && (
              <input
                type="color"
                aria-label={option.label}
                value={typeof value === 'string' && value ? value : '#000000'}
                onChange={(event) => onChange(option.id, event.target.value)}
                className="h-11 w-20 rounded-lg border border-border cursor-pointer"
              />
            )}

            {error && <p id={`custom-option-${option.id}-error`} role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
            {option.type === 'TEXT_BOX' && option.maxLength > 0 && (
              <p className="text-xs text-muted text-right mt-0.5">
                {textValue.length}/{option.maxLength}
              </p>
            )}
            {option.type === 'FILE_UPLOAD' && !isUploadedFile(value) && (
              <p className="text-xs text-muted mt-1">
                {t('maxFileSize', { size: option.maxFileSizeMB || 10 })}
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

// ── PersonalizationCollapsible ────────────────────────────────────────────────

function PersonalizationCollapsible({
  fields,
  isOpen,
  onToggle,
  label,
}: {
  fields:   CustomField[];
  isOpen:   boolean;
  onToggle: () => void;
  label:    string;
}) {
  const t = useTranslations('common');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const set = (id: string, val: string) =>
    setResponses((prev) => ({ ...prev, [id]: val }));

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium text-secondary hover:text-primary transition-colors"
      >
        <Plus className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-45' : ''}`} />
        {label}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-4 pl-4 border-l-2 border-border">
          {fields.map((field) => {
            const val = responses[field.id] ?? '';
            return (
              <div key={field.id}>
                <label htmlFor={`personalization-${field.id}`} className="text-xs font-medium text-secondary block mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>

                {field.type === 'textarea' ? (
                  <textarea
                    id={`personalization-${field.id}`}
                    value={val}
                    onChange={(e) => set(field.id, e.target.value)}
                    rows={3}
                    maxLength={field.maxLength}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                ) : field.type === 'text' ? (
                  <input
                    id={`personalization-${field.id}`}
                    type="text"
                    value={val}
                    onChange={(e) => set(field.id, e.target.value)}
                    maxLength={field.maxLength}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                ) : field.type === 'select' ? (
                  <Select
                    id={`personalization-${field.id}`}
                    value={val}
                    onChange={(e) => set(field.id, e.target.value)}
                    placeholder={t('selectEllipsis')}
                    options={(field.options ?? []).map((option) => ({
                      value: option,
                      label: option,
                    }))}
                    size="sm"
                  />
                ) : field.type === 'color' ? (
                  <input
                    id={`personalization-${field.id}`}
                    type="color"
                    value={val || '#000000'}
                    onChange={(e) => set(field.id, e.target.value)}
                    className="h-10 w-20 border border-border rounded-lg cursor-pointer"
                  />
                ) : (
                  // image upload
                  <input id={`personalization-${field.id}`} type="file" accept="image/*" className="text-sm" />
                )}

                {field.maxLength && (field.type === 'text' || field.type === 'textarea') && (
                  <p className="text-xs text-muted text-right mt-0.5">
                    {val.length}/{field.maxLength}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── StarSellerBadge ───────────────────────────────────────────────────────────

function StarSellerBadge({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex gap-3 p-3 border border-border rounded-xl bg-[#FAFAF8]">
      <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
        <Star className="w-5 h-5 text-primary fill-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ── ProductPurchasePanel ──────────────────────────────────────────────────────

interface Props {
  product:       ProductDetailDto;
  reviewSummary: ReviewSummaryDto | null;
  locale?:       string;
}

export function ProductPurchasePanel({ product, reviewSummary }: Props) {
  const t      = useTranslations('product');
  const tPanel = useTranslations('product.purchasePanel');
  const [selectedOptions,       setSelectedOptions]       = useState<Record<string, string>>({});
  const [isPersonalizationOpen, setIsPersonalizationOpen] = useState(false);
  const [isAdding,              setIsAdding]              = useState(false);
  const [quantity,              setQuantity]              = useState(1);
  const [hasAttemptedSubmit,    setHasAttemptedSubmit]    = useState(false);
  const [customOptionValues,    setCustomOptionValues]    = useState<Record<string, CustomOptionAnswer>>({});
  const [customOptionErrors,    setCustomOptionErrors]    = useState<Record<string, string>>({});
  const [uploadingOptionId,     setUploadingOptionId]     = useState<string | null>(null);
  const [addToCartError,        setAddToCartError]        = useState<string | null>(null);

  const addItem    = useCartStore((s) => s.addItem);
  const openDrawer = useCartStore((s) => s.openDrawer);

  const { focusImage }   = useVariationPhoto();
  const variationPhotos  = product.variationPhotos;

  // Fire viewItem once on mount
  useEffect(() => {
    analytics.viewItem({
      id:       product.id,
      name:     product.name,
      category: product.category.name,
      price:    Number(product.basePrice),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // ── Variant resolution ────────────────────────────────────────────────────

  const selectedVariant = useMemo(() => {
    if (!product.variants?.length) return null;
    const lc = (s: unknown) => String(s).toLowerCase();
    // Exact match first; case-insensitive fallback handles admin-entered options
    // whose keys/values don't perfectly match VariationGroup casing.
    return (
      product.variants.find((v) =>
        Object.entries(selectedOptions).every(([k, val]) => v.options[k] === val),
      ) ??
      product.variants.find((v) =>
        Object.entries(selectedOptions).every(([k, val]) =>
          Object.entries(v.options ?? {}).some(
            ([vk, vv]) => lc(vk) === lc(k) && lc(vv) === lc(val),
          ),
        ),
      ) ??
      null
    );
  }, [selectedOptions, product.variants]);

  // Before a full option combination is picked, fall back to the cheapest real
  // variant price rather than product.basePrice — basePrice is seller-entered
  // and never auto-synced to per-variant prices, so it can silently disagree
  // with what the product actually costs once variants exist.
  const minVariantPrice = useMemo(
    () => (product.variants?.length ? Math.min(...product.variants.map((v) => v.price)) : undefined),
    [product.variants],
  );
  const rawPrice        = selectedVariant?.price ?? minVariantPrice ?? product.basePrice;
  // No per-variant compareAtPrice exists (ProductVariant has no such column —
  // see ProductVariantDto) — only the product-level one.
  const rawCompareAtPrice = product.compareAtPrice ?? undefined;

  // Etsy "Set up a sale" — applied to whichever price is currently selected
  // (base or variant), same math as the server (checkout recomputes this
  // itself regardless, so this is purely a display preview).
  const salePromo = product.salePromo;
  const currentPrice = useMemo(
    () => applySalePrice(rawPrice, salePromo),
    [rawPrice, salePromo],
  );
  // The sale price becomes the new "current price", so the original
  // (seller's own price, or their manually-set compareAtPrice if higher)
  // becomes the struck-through reference.
  const compareAtPrice = salePromo
    ? Math.max(rawPrice, rawCompareAtPrice ?? 0) || rawPrice
    : rawCompareAtPrice;
  const discountPercent =
    compareAtPrice && compareAtPrice > currentPrice
      ? Math.round((1 - currentPrice / compareAtPrice) * 100)
      : null;

  const variantCount  = product.variantOptions?.length ?? 0;
  const allOptionsSelected = Object.keys(selectedOptions).length === variantCount;
  const canAddToCart  =
    variantCount === 0 ||
    (allOptionsSelected && selectedVariant !== null);

  const customFields = product.customization?.fields ?? [];
  const customOptions = product.customOptions ?? [];

  const setCustomOptionValue = (optionId: string, value: CustomOptionAnswer) => {
    setAddToCartError(null);
    setCustomOptionValues((previous) => ({ ...previous, [optionId]: value }));
    setCustomOptionErrors((previous) => {
      if (!previous[optionId]) return previous;
      const next = { ...previous };
      delete next[optionId];
      return next;
    });
  };

  const uploadCustomOptionFile = async (option: CustomOption, file: File) => {
    const maxSizeMB = option.maxFileSizeMB || 10;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setCustomOptionErrors((previous) => ({
        ...previous,
        [option.id]: tPanel('fileTooLarge', { size: maxSizeMB }),
      }));
      return;
    }

    setUploadingOptionId(option.id);
    setCustomOptionErrors((previous) => {
      const next = { ...previous };
      delete next[option.id];
      return next;
    });

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(
        `${API_BASE}/api/v1${API_ROUTES.PRODUCT_CUSTOM_OPTIONS.UPLOAD(product.id, option.id)}`,
        { method: 'POST', body: formData, credentials: 'include' },
      );
      const body = await response.json() as {
        data?: UploadedCustomOptionFile;
        message?: string;
      } & Partial<UploadedCustomOptionFile>;
      if (!response.ok) throw new Error(body.message || tPanel('fileUploadFailed'));
      const uploaded = (body.data ?? body) as UploadedCustomOptionFile;
      if (option.type === 'TEXT_BOX' && option.allowFileUpload) {
        // Preserve the latest text even when the buyer keeps typing while the
        // upload request is in flight.
        setCustomOptionValues((previous) => ({
          ...previous,
          [option.id]: {
            text: textAnswerOf(previous[option.id]),
            file: uploaded,
          },
        }));
        setCustomOptionErrors((previous) => {
          if (!previous[option.id]) return previous;
          const next = { ...previous };
          delete next[option.id];
          return next;
        });
      } else {
        setCustomOptionValue(option.id, uploaded);
      }
    } catch (error) {
      setCustomOptionErrors((previous) => ({
        ...previous,
        [option.id]: error instanceof Error ? error.message : tPanel('fileUploadFailed'),
      }));
    } finally {
      setUploadingOptionId(null);
    }
  };

  // ── Add to cart ───────────────────────────────────────────────────────────

  const handleAddToCart = async () => {
    setAddToCartError(null);
    if (!canAddToCart) {
      setHasAttemptedSubmit(true);
      if (allOptionsSelected && selectedVariant === null) {
        // All options chosen but no DB variant matches — data mismatch
        setAddToCartError(tPanel('combinationNotAvailable'));
      } else {
        // Some options still need to be selected
        const firstMissing = product.variantOptions?.find(
          (opt) => !selectedOptions[opt.name],
        );
        if (firstMissing) {
          document.getElementById(`variant-${firstMissing.name}`)?.scrollIntoView({
            behavior: 'smooth', block: 'center',
          });
        }
      }
      return;
    }
    if (uploadingOptionId) {
      setAddToCartError(tPanel('waitForUpload'));
      return;
    }

    const missingCustomOptions = customOptions.filter(
      (option) => option.required && !hasRequiredCustomOptionAnswer(option, customOptionValues[option.id]),
    );
    if (missingCustomOptions.length > 0) {
      const errors = Object.fromEntries(
        missingCustomOptions.map((option) => [option.id, tPanel('customOptionRequired')]),
      );
      setCustomOptionErrors(errors);
      document.getElementById(`custom-option-${missingCustomOptions[0].id}`)?.scrollIntoView({
        behavior: 'smooth', block: 'center',
      });
      return;
    }
    if (isAdding) return;
    setIsAdding(true);
    try {
      const submittedCustomOptions = customOptions
        .filter((option) => hasAnyCustomOptionAnswer(customOptionValues[option.id]))
        .map((option) => {
          const value = customOptionValues[option.id];
          if (option.type === 'TEXT_BOX' && option.allowFileUpload) {
            const file = fileAnswerOf(value);
            return {
              id: option.id,
              label: option.label,
              type: option.type,
              value: textAnswerOf(value).trim(),
              ...(file ? { file } : {}),
            };
          }
          return isUploadedFile(value)
            ? { id: option.id, label: option.label, type: option.type, file: value }
            : {
                id: option.id,
                label: option.label,
                type: option.type,
                value: typeof value === 'string' ? value.trim() : value,
              };
        });
      await addItem({
        productId:         product.id,
        variantId:         selectedVariant?.id ?? null,
        quantity,
        customizationData: submittedCustomOptions.length > 0
          ? { customOptions: submittedCustomOptions }
          : null,
      });
      // No success toast here: the drawer slides open showing the item, its
      // quantity and the new subtotal, which says everything the toast said and
      // proves it rather than asserting it. The toast also rendered on top of
      // the drawer's own heading, so the two pieces of feedback fought for the
      // same corner of the screen.
      openDrawer();
    } catch {
      setAddToCartError(tPanel('couldNotAddToCart'));
    } finally {
      setIsAdding(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="lg:sticky lg:top-4 space-y-3">

      {/* ── IN-DEMAND BADGE ── */}
      {(product.inDemandCount ?? 0) >= 2 && (
        <InDemandBadge count={product.inDemandCount!} />
      )}

      {/* ── FEATURED BADGE ── */}
      {product.isFeatured && (
        <div className="inline-flex items-center gap-1.5 bg-primary-light text-primary text-xs font-medium px-2.5 py-1 rounded-full">
          <Star className="w-3 h-3 fill-primary" />
          {tPanel('editorsPick')}
        </div>
      )}

      {/* ── TITLE ── */}
      <h1 className="text-2xl font-semibold text-secondary leading-snug">
        {product.name}
      </h1>

      {/* ── PRICE ── */}
      <PriceBlock
        price={currentPrice}
        compareAtPrice={compareAtPrice}
        discountPercent={discountPercent}
      />

      {/* ── DELIVERY INFO ── */}
      {/* Digital: Etsy shows nothing inline here — "Instant Download" only
          appears in the Delivery accordion below, alongside "Digital
          download" in Item details' highlights. */}
      {product.productType !== 'DIGITAL' && (
        <DeliveryInfo processingDays={product.processingDays ?? 3} freeShipping={product.freeShipping} />
      )}

      {/* ── RATING + SHARE ROW ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {reviewSummary && reviewSummary.totalReviews > 0 && (
            <RatingRow
              averageRating={reviewSummary.averageRating}
              totalReviews={reviewSummary.totalReviews}
            />
          )}
        </div>
        <ShareButton productSlug={product.slug} productName={product.name} />
      </div>

      {/* ── VARIANT DROPDOWNS ── */}
      {variantCount > 0 && (
        <div className="space-y-3">
          {product.variantOptions!.map((opt) => (
            <VariantDropdown
              key={opt.name}
              id={`variant-${opt.name}`}
              label={opt.name}
              optionName={opt.name}
              values={opt.values}
              selected={selectedOptions[opt.name] ?? ''}
              onChange={(v) => {
                setAddToCartError(null);
                setSelectedOptions((prev) => ({ ...prev, [opt.name]: v }));
                // Only the one variation the seller linked photos to moves the
                // gallery, and only for options that actually have one — an
                // unlinked option leaves the shopper on the slide they were
                // already looking at rather than snapping back to the first.
                if (variationPhotos?.groupName === opt.name) {
                  const imageId = variationPhotos.imageIdByValue[v];
                  if (imageId) focusImage(imageId);
                }
              }}
              hasError={hasAttemptedSubmit && !selectedOptions[opt.name]}
              variants={product.variants}
              allSelected={selectedOptions}
            />
          ))}
        </div>
      )}

      {/* ── ADD PERSONALIZATION ── */}
      {product.isPersonalizable && customFields.length > 0 && (
        <PersonalizationCollapsible
          fields={customFields}
          isOpen={isPersonalizationOpen}
          onToggle={() => setIsPersonalizationOpen((o) => !o)}
          label={t('actions.addPersonalization')}
        />
      )}

      <CustomOptionsFields
        options={customOptions}
        values={customOptionValues}
        errors={customOptionErrors}
        uploadingOptionId={uploadingOptionId}
        onChange={setCustomOptionValue}
        onFileChange={uploadCustomOptionFile}
      />

      {/* ── QUANTITY ── */}
      <QuantityDropdown value={quantity} onChange={setQuantity} label={t('actions.quantity')} />

      {/* ── ADD TO CART ── */}
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={isAdding || uploadingOptionId !== null}
        className={[
          'w-full py-3.5 rounded-full font-semibold text-sm transition-all',
          'flex items-center justify-center gap-2',
          'bg-primary text-white hover:bg-primary-dark active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        {isAdding ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('actions.adding')}
          </>
        ) : (
          <>
            <ShoppingCart className="w-4 h-4" />
            {t('actions.addToCart')}
          </>
        )}
      </button>
      {addToCartError && (
        <p role="alert" className="text-sm text-red-600">
          {addToCartError}
        </p>
      )}

      {/* ── BUY THEM TOGETHER ── */}
      {product.bundleOffer && (
        <BuyTogetherCard
          bundleOffer={product.bundleOffer}
          currentProductId={product.id}
        />
      )}

      {/* ── STAR SELLER BADGE ── */}
      <StarSellerBadge title={t('starSeller.title')} description={t('starSeller.description')} />

      {/* ── ACCORDIONS ── */}
      <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
        <ItemDetailsAccordion product={product} />
        {product.productType === 'DIGITAL'
          ? <DigitalDeliveryAccordion />
          : <ShippingReturnsAccordion product={product} />}
        <PurchaseProtectionAccordion />
        <FAQsAccordion />
        <MeetYourSellersAccordion />
      </div>

      {/* ── MOBILE STICKY BAR (fixed, escapes column layout) ── */}
      <MobileStickyCartBar
        product={product}
        selectedVariant={selectedVariant}
        canAddToCart={canAddToCart && uploadingOptionId === null}
        onAddToCart={handleAddToCart}
      />

    </div>
  );
}
