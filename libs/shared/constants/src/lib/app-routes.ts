// ── Admin app routes (apps/admin — locale-less, rooted at /) ─────────────────

export const ADMIN_ROUTES = {
  LOGIN:         '/login',
  TOTP_VERIFY:   '/totp-verify',
  TOTP_SETUP:    '/totp-setup',

  DASHBOARD:     '/dashboard',

  ORDERS:        '/orders',
  ORDER:         (id: string) => `/orders/${id}`,

  PRODUCTS:      '/products',
  PRODUCT_NEW:   '/products/new',
  PRODUCT_EDIT:  (id: string) => `/products/${id}/edit`,
  PRODUCT_COPY:  (id: string) => `/products/copy/${id}`,
  PRODUCTS_SEO:  '/products/seo',
  PRODUCTS_IMPORT: '/products/import',

  CATALOG:            '/catalog',
  CATALOG_CATEGORIES: '/catalog/categories',
  CATALOG_COLLECTIONS: '/catalog/collections',

  CUSTOMERS:     '/customers',
  CUSTOMER:      (id: string) => `/customers/${id}`,

  MESSAGES:      '/messages',
  MESSAGES_ORDER: (orderId: string) => `/messages?orderId=${orderId}`,

  PROMOTIONS:    '/promotions',

  REVIEWS:       '/reviews',

  SETTINGS_DELIVERY: '/settings/delivery',

  PAYMENTS:      '/payments',

  AFFILIATES:    '/affiliates',
  AFFILIATE:     (id: string) => `/affiliates/${id}`,
  AFFILIATES_PAYOUTS: '/affiliates/payouts',

  MODERATION:       '/moderation',
  MODERATION_QUEUE: '/moderation/queue',

  FINANCE:                  '/finance',
  FINANCE_SHIPPING_SUPPORT: '/finance/shipping-support',

  STORES:             '/stores',
  STORE:              (id: string) => `/stores/${id}`,
  STORE_PERMISSIONS:  (id: string) => `/stores/${id}/permissions`,
  STORES_PLANS:       '/stores/plans',
  STORES_SETTINGS:    '/stores/settings',

  PAYOUTS:       '/payouts',
  CAMPAIGNS:     '/campaigns',

  SETTINGS:           '/settings',
  SETTINGS_AUDIT_LOG: '/settings/audit-log',

  STATS:          '/stats',
  STATS_LISTINGS: '/stats/listings',
  STATS_LISTING:  (id: string) => `/stats/listings/${id}`,
} as const;

// ── Client app routes (apps/client — without /${locale} prefix) ───────────────

export const CLIENT_ROUTES = {
  HOME:     '/',
  PRODUCTS: '/products',
  PRODUCT:  (slug: string) => `/products/${slug}`,
  PRODUCT_CUSTOMIZE: (slug: string) => `/products/${slug}/customize`,

  SHOP:     (slug: string) => `/shops/${slug}`,

  CATEGORIES:  '/categories',
  CATEGORY:    (slug: string) => `/categories/${slug}`,

  COLLECTIONS: '/collections',
  COLLECTION:  (slug: string) => `/collections/${slug}`,

  OCCASIONS:   '/occasions',
  OCCASION:    (slug: string) => `/occasions/${slug}`,

  CART:        '/cart',
  CHECKOUT:    '/checkout',
  CHECKOUT_SUCCESS: (orderNumber: string) => `/checkout/success?order=${orderNumber}`,

  SEARCH:      '/search',

  ORDERS_TRACK: '/orders/track',

  GIFT_CARDS:  '/gift-cards',

  WISHLIST_SHARED: (token: string) => `/wishlist/${token}`,

  LOGIN:           '/login',
  REGISTER:        '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD:  '/reset-password',
  LOGIN_REDIRECT:  (redirect: string) => `/login?redirect=${encodeURIComponent(redirect)}`,

  ACCOUNT:         '/account',
  ACCOUNT_PROFILE: '/account/profile',
  ACCOUNT_SETTINGS: '/account/settings',
  ACCOUNT_ORDERS:  '/account/orders',
  ACCOUNT_ORDER:   (orderNumber: string) => `/account/orders/${orderNumber}`,
  ACCOUNT_WISHLIST: '/account/wishlist',
  ACCOUNT_ADDRESSES: '/account/addresses',
  ACCOUNT_MESSAGES: '/account/messages',
  ACCOUNT_OFFERS:   '/account/offers',

  AFFILIATE:           '/affiliate',
  AFFILIATE_REGISTER:  '/affiliate/register',
  AFFILIATE_DASHBOARD: '/affiliate/dashboard',
  AFFILIATE_LINKS:     '/affiliate/links',
  AFFILIATE_PAYOUTS:   '/affiliate/payouts',

  OPEN_SHOP:     '/open-shop',

  PAGE_CONTACT:       '/pages/contact',
  PAGE_REVIEWS:       '/pages/reviews',
  PAGE_TERMS:         '/pages/terms',
  PAGE_PRIVACY:       '/pages/privacy',
  PAGE_PRIVACY_POLICY: '/pages/privacy-policy',
  PAGE_OUR_STORY:     '/pages/our-story',
  PAGE_HOW_IT_WORKS:  '/pages/how-it-works',
  PAGE_SHIPPING_INFO: '/pages/shipping-info',
  PAGE_RETURNS:       '/pages/returns',
  PAGE_FAQ:           '/pages/faq',
  PAGE_CAREERS:       '/pages/careers',
  PAGE_PAYMENTS:      '/pages/payments',
} as const;
