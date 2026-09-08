// Ezihubb Plus — paid feature gate. Phase 1: every value here maps to the
// SAME underlying check (does the store have an active, unexpired
// StoreSubscription) — see apps/api/src/modules/subscriptions/
// entitlements.service.ts's canUseFeature(). The parameter exists so future
// per-feature/per-tier differentiation doesn't require touching every call
// site, not because one exists today.
export enum PlusFeature {
  SHOP_COLOR_THEME = 'SHOP_COLOR_THEME',
  SHOP_FEATURED_MIXED_GRID = 'SHOP_FEATURED_MIXED_GRID',
  MARKETPLACE_INSIGHTS_EXTENDED_QUOTA = 'MARKETPLACE_INSIGHTS_EXTENDED_QUOTA',
}

/** The two layouts `Store.featuredLayout` accepts. 'mixed' requires Plus. */
export const FEATURED_LAYOUTS = ['grid', 'mixed', 'none'] as const;
export type FeaturedLayout = (typeof FEATURED_LAYOUTS)[number];
