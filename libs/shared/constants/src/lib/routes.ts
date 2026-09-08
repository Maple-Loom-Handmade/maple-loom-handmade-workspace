export const API_ROUTES = {
  AUTH: {
    REGISTER:        '/auth/register',
    LOGIN:           '/auth/login',
    LOGOUT:          '/auth/logout',
    LOGOUT_ALL:      '/auth/logout-all',
    SESSIONS:        '/auth/sessions',
    SESSION:         (id: string) => `/auth/sessions/${encodeURIComponent(id)}`,
    SESSION_CURRENT: '/auth/sessions/current',
    REFRESH:         '/auth/refresh',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD:  '/auth/reset-password',
    CHANGE_PASSWORD: '/auth/change-password',
    GOOGLE:          '/auth/google',
    GOOGLE_CALLBACK: '/auth/google/callback',
    GOOGLE_TOKEN:    '/auth/google/token',
    VERIFY_EMAIL:    '/auth/verify-email',
    RESEND_VERIFY:   '/auth/resend-verification',
    TOTP_VERIFY:     '/auth/totp/verify',
    TOTP_SETUP:      '/auth/totp/setup',
    TOTP_CONFIRM:    '/auth/totp/confirm',
    TOTP_DISABLE:    '/auth/totp/disable',
  },

  USERS: {
    ME:              '/users/me',
    NOTIFICATION_PREFERENCES: '/users/me/notification-preferences',
    AVATAR:          '/users/me/avatar',
    PASSWORD:        '/users/me/password',
    ADDRESSES:       '/users/me/addresses',
    ADDRESS:         (id: string) => `/users/me/addresses/${id}`,
    ADDRESS_DEFAULT: (id: string) => `/users/me/addresses/${id}/default`,
    WISHLIST:        '/users/me/wishlist',
    WISHLIST_ITEM:   (productId: string) => `/users/me/wishlist/${productId}`,
    WISHLIST_SHARE:  '/users/me/wishlist/share',
    ORDERS:          '/users/me/orders',
    FCM_TOKEN:       '/users/me/fcm-token',
    EXPORT:          '/users/me/export',
    DELETE_ACCOUNT:  '/users/me',
  },

  PRODUCTS: {
    LIST:              '/products',
    DETAIL:            (slug: string) => `/products/${slug}`,
    REVIEWS:           (slug: string) => `/products/${slug}/reviews`,
    REVIEW_SUMMARY:    (slug: string) => `/products/${slug}/reviews/summary`,
    MY_REVIEW:         (slug: string) => `/products/${slug}/reviews/my-review`,
    REVIEW_HELPFUL:    (slug: string, reviewId: string) => `/products/${slug}/reviews/${reviewId}/helpful`,
    RELATED:           (slug: string) => `/products/${slug}/related`,
    RECENTLY_VIEWED:   '/products/recently-viewed',
    VIEWED:            (id: string) => `/products/${id}/viewed`,
    TRENDING:          '/products/trending',
    QA:                (slug: string) => `/products/${slug}/questions`,
    QUESTION_UPVOTE:   (id: string) => `/questions/${id}/upvote`,
    REVIEWABLE_PRODUCTS: '/reviews/me/reviewable-products',
  },

  CATALOG: {
    CATEGORIES:  '/catalog/categories',
    CATEGORY:    (slug: string) => `/catalog/categories/${slug}`,
    CATEGORY_ATTRS: (slug: string) => `/catalog/categories/${slug}/filterable-attributes`,
    COLLECTIONS: '/collections',
    COLLECTION:  (slug: string) => `/collections/${slug}`,
    TAGS:        '/tags',
    MEGA_MENU:   '/catalog/mega-menu',
  },

  CART: {
    GET:               '/cart',
    ADD:               '/cart/items',
    UPDATE_ITEM:       (itemId: string) => `/cart/items/${itemId}`,
    REMOVE_ITEM:       (itemId: string) => `/cart/items/${itemId}`,
    CLEAR:             '/cart/clear',
    MERGE:             '/cart/merge',
    COUPON:            '/cart/coupon',
    ESTIMATE_SHIPPING: '/cart/estimate-shipping',
  },

  ORDERS: {
    LIST:        '/orders',
    DETAIL:      (orderNumber: string) => `/orders/${orderNumber}`,
    CREATE:      '/orders',
    CANCEL:      (orderNumber: string) => `/orders/${orderNumber}/cancel`,
    TRACK:       '/orders/track',
  },

  PAYMENTS: {
    INTENT:               '/payments/intent',
    CONFIRM:              '/payments/confirm',
    GIFT_CARD_APPLY:      '/payments/gift-card/apply',
    GIFT_CARD_BALANCE:    '/payments/gift-card/balance',
    GIFT_CARDS_PURCHASE:  '/payments/gift-cards/purchase',
    GIFT_CARDS_VALIDATE:  '/payments/gift-cards/validate',
    GIFT_CARD_VALIDATE_CODE: (code: string) => `/payments/gift-cards/${code}/validate`,
    WEBHOOK:              '/payments/webhook',
    PAYPAL_CREATE_ORDER:  '/payments/paypal/create-order',
    PAYPAL_CAPTURE:       '/payments/paypal/capture',
  },

  PROMOTIONS: {
    VALIDATE: '/promotions/validate',
  },

  CUSTOMIZATION: {
    UPLOAD:          '/customization/upload-image',
    REMOVE_BG:       '/customization/remove-background',
    APPLY_ART_STYLE: '/customization/apply-art-style',
    JOB_STATUS:      (jobId: string) => `/customization/jobs/${jobId}`,
    PREVIEW:         '/customization/generate-preview',
    DRAFT:           '/customization/save-draft',
    LAST:            (productId: string) => `/customization/last/${productId}`,
    TEMPLATE:        (templateId: string) => `/customization/templates/${templateId}`,
    ART_STYLES:      '/customization/art-styles',
  },

  PRODUCT_CUSTOM_OPTIONS: {
    UPLOAD: (productId: string, optionId: string) =>
      `/products/${productId}/custom-options/${optionId}/upload`,
  },

  REVIEWS: {
    LIST:          '/reviews',
    SUMMARY:       '/reviews/summary',
    UPLOAD_IMAGES: (productSlug: string, reviewId: string) =>
      `/products/${productSlug}/reviews/${reviewId}/images`,
    UPLOAD_IMAGE:  '/reviews/upload-image',
    MY_REVIEWS:    '/reviews/me',
    CAN_REVIEW:    '/reviews/can-review',
  },

  SEARCH: {
    QUERY:        '/search',
    SUGGESTIONS:  '/search/suggestions',
    AUTOCOMPLETE: '/search/autocomplete',
    TRENDING:     '/search/trending',
    RELATED:      '/search/related',
    LOG:          '/search/log',
    CLICK:        '/search/click',
  },

  MARKETPLACE_INSIGHTS: {
    TRENDING:      '/marketplace-insights/trending',
    TERM:          (term: string) => `/marketplace-insights/terms/${encodeURIComponent(term)}`,
    TERM_ANALYSIS: (term: string) => `/marketplace-insights/terms/${encodeURIComponent(term)}/analysis`,
    TERM_RELATED_FEEDBACK: (term: string) => `/marketplace-insights/terms/${encodeURIComponent(term)}/related-feedback`,
    SAVED_SEARCHES:      '/marketplace-insights/saved-searches',
    SAVED_SEARCH:        (id: string) => `/marketplace-insights/saved-searches/${id}`,
    QUOTA:               '/marketplace-insights/quota',
  },

  MESSAGES: {
    CONVERSATIONS:         '/messages/conversations',
    CONVERSATION:          (id: string) => `/messages/conversations/${id}`,
    CONVERSATION_MESSAGES: (id: string) => `/messages/conversations/${id}/messages`,
    CONVERSATION_ATTACHMENTS:   (id: string) => `/messages/conversations/${id}/attachments`,
    CONVERSATION_LINK_PREVIEW:  (id: string) => `/messages/conversations/${id}/link-preview`,
    CONVERSATION_HIDE:          (id: string) => `/messages/conversations/${id}`,
    CONVERSATION_REPORT:        (id: string) => `/messages/conversations/${id}/report`,
    CONVERSATION_READ:     (id: string) => `/messages/conversations/${id}/read`,
  },

  AFFILIATES: {
    TRACK:           '/affiliates/track',
    APPLY:           '/affiliates/apply',
    RESOLVE:         '/affiliates/resolve',
    SETTINGS_PUBLIC: '/affiliates/settings/public',
    ME:              '/affiliates/me',
    ME_DASHBOARD:    '/affiliates/me/dashboard',
    ME_CLICKS:       '/affiliates/me/clicks',
    ME_PAYOUTS:      '/affiliates/me/payouts',
  },

  WISHLIST_PUBLIC: {
    SHARED: (token: string) => `/wishlist/${token}`,
  },

  MARKETING: {
    TRACK_CLICK: '/marketing/track-click',
  },

  OFFERS: {
    CREATE:         '/offers',
    MY:             '/offers/me',
    ELIGIBILITY:    (productId: string) => `/offers/eligibility/${productId}`,
    ACCEPT_COUNTER: (id: string) => `/offers/${id}/accept-counter`,
    REJECT_COUNTER: (id: string) => `/offers/${id}/reject-counter`,
  },

  CURRENCY: {
    RATES: '/currency/rates',
  },

  // BF-02: Live Order Tracking
  ORDER_TRACKING: {
    DETAIL:  (orderId: string) => `/orders/${orderId}/tracking`,
    EVENTS:  (orderId: string) => `/orders/${orderId}/tracking/events`,
  },

  CAMPAIGNS: {
    ACTIVE: '/campaigns/active',
  },

  NOTIFICATIONS: {
    CONTACT:       '/notifications/contact',
    PRODUCT_READY: '/notifications/product-ready',
    // Feed for the signed-in buyer. All four are behind JwtAuthGuard and
    // scoped to the token's own user — none of them takes a user id.
    LIST:          '/notifications',
    UNREAD_COUNT:  '/notifications/unread-count',
    READ_ALL:      '/notifications/read-all',
    READ:          (id: string) => `/notifications/${id}/read`,
  },

  NEWSLETTER: {
    SUBSCRIBE: '/newsletter/subscribe',
  },

  ADMIN: {
    // ── Dashboard ────────────────────────────────────────────────────────────
    DASHBOARD_KPIS:      '/admin/dashboard/kpis',
    DASHBOARD_SHOP_HEALTH: '/admin/dashboard/shop-health',
    DASHBOARD_NAV_BADGES:  '/admin/dashboard/nav-badges',
    DASHBOARD_REVENUE:   '/admin/dashboard/revenue',
    DASHBOARD_BY_STATUS: '/admin/dashboard/orders-by-status',
    DASHBOARD_TOP:       '/admin/dashboard/top-products',
    PENDING_REVIEWS:     '/admin/dashboard/pending-reviews',
    DASHBOARD_PLATFORM:  '/admin/dashboard/platform',
    DASHBOARD_ACTIVITY:  '/admin/dashboard/activity',
    DASHBOARD_TOP_STORES: '/admin/dashboard/top-stores',

    // ── Orders ───────────────────────────────────────────────────────────────
    ORDERS:               '/admin/orders',

    // ── Seller order workflow ────────────────────────────────────────────────
    // Separate from ORDERS above: that list is Order-shaped and platform-wide,
    // these are StoreOrder-shaped and always scoped to one shop's pipeline.
    ORDER_PROGRESS_STEPS:        '/admin/order-progress/steps',
    ORDER_PROGRESS_QUEUE:        '/admin/order-progress/orders',
    ORDER_PROGRESS_DESTINATIONS: '/admin/order-progress/destinations',
    ORDER_PROGRESS_MOVE:         '/admin/order-progress/move',
    ORDER_STAGE:          (storeOrderId: string) => `/admin/order-progress/${storeOrderId}/stage`,
    ORDER_PROGRESS_SHIP_BY:      (storeOrderId: string) => `/admin/order-progress/${storeOrderId}/ship-by-date`,
    ORDER_PROGRESS_GIFT:         (storeOrderId: string) => `/admin/order-progress/${storeOrderId}/gift`,
    // The order detail panel. Nested under `orders/` so these can never be
    // matched by the two bare `:storeOrderId` routes above.
    ORDER_PANEL:                 (storeOrderId: string) => `/admin/order-progress/orders/${storeOrderId}`,
    ORDER_PANEL_EARNINGS:        (storeOrderId: string) => `/admin/order-progress/orders/${storeOrderId}/earnings`,
    ORDER_PANEL_MESSAGES:        (storeOrderId: string) => `/admin/order-progress/orders/${storeOrderId}/messages`,
    ORDER_PANEL_NOTE:            (storeOrderId: string) => `/admin/order-progress/orders/${storeOrderId}/note`,
    ORDER_PANEL_ATTACHMENTS:     (storeOrderId: string) => `/admin/order-progress/orders/${storeOrderId}/attachments`,
    // Saved message bodies a shop reuses; inserted by hand, never sent on their own.
    MESSAGE_SNIPPETS:            '/admin/messages/snippets',
    MESSAGE_SNIPPET:             (snippetId: string) => `/admin/messages/snippets/${snippetId}`,

    ORDER:                (id: string) => `/admin/orders/${id}`,
    ORDER_STATUS:         (id: string) => `/admin/orders/${id}/status`,
    ORDER_TRACKING:       (id: string) => `/admin/orders/${id}/tracking`,
    ORDER_SHIP:           (id: string) => `/admin/orders/${id}/ship`,
    ORDER_INVOICE:        (id: string) => `/admin/orders/${id}/invoice`,
    ORDER_PACKING_SLIP:   (id: string) => `/admin/orders/${id}/packing-slip`,
    ORDER_RATES:          (id: string) => `/admin/orders/${id}/rates`,
    ORDER_BUY_LABEL:      (id: string) => `/admin/orders/${id}/buy-label`,
    ORDERS_BULK_SLIPS:    '/admin/orders/bulk-packing-slips',
    ORDERS_EXPORT:        '/admin/orders/export',
    ORDER_NOTE:           (id: string) => `/admin/orders/${id}/note`,
    ORDER_CANCEL:         (id: string) => `/admin/orders/${id}/cancel`,

    // ── Shop Stats ───────────────────────────────────────────────────────────
    STATS_OVERVIEW:          '/admin/stats/overview',
    STATS_SHOPPER:           '/admin/stats/shopper-stats',
    STATS_TRAFFIC_SOURCES:   '/admin/stats/traffic-sources',
    STATS_TRAFFIC_ATTRIBUTION: '/admin/stats/traffic-attribution',
    STATS_LISTINGS:          '/admin/stats/listings',
    STATS_LISTING:           (id: string) => `/admin/stats/listings/${id}`,
    STATS_SEARCH_TERMS:      '/admin/stats/search-terms',

    // ── Products ─────────────────────────────────────────────────────────────
    PRODUCTS:             '/admin/products',
    PRODUCTS_STATS:       '/admin/products/stats',
    PRODUCT_TITLE_SUGGESTION: '/admin/products/title-suggestion',
    PRODUCT:              (id: string) => `/admin/products/${id}`,
    PRODUCT_STATUS:       (id: string) => `/admin/products/${id}/status`,
    PRODUCT_IMAGES:       (id: string) => `/admin/products/${id}/images`,
    PRODUCT_IMAGE:        (id: string, imgId: string) => `/admin/products/${id}/images/${imgId}`,
    PRODUCT_IMAGES_REORDER: (id: string) => `/admin/products/${id}/images/reorder`,
    PRODUCT_IMAGES_FROM_URLS: (id: string) => `/admin/products/${id}/images/from-urls`,
    PRODUCT_VIDEOS:       (id: string) => `/admin/products/${id}/videos`,
    PRODUCT_VIDEO_FROM_URL: (id: string) => `/admin/products/${id}/videos/from-upload-url`,
    PRODUCT_PRINT_FILES:          (id: string) => `/admin/products/${id}/print-files`,
    PRODUCT_PRINT_FILE_GENERATE:  (id: string) => `/admin/products/${id}/print-files/generate`,
    PRODUCT_PRINT_FILE_JOB:       (id: string, jobId: string) => `/admin/products/${id}/print-files/generate/${jobId}`,
    PRODUCT_PRINT_FILE_APPROVE:   (id: string, side: string) => `/admin/products/${id}/print-files/${side}/approve`,
    PRODUCT_PRINT_FILE_DELETE:    (id: string, side: string) => `/admin/products/${id}/print-files/${side}`,
    PRODUCT_DIGITAL_FILES:        (id: string) => `/admin/products/${id}/digital-files`,
    PRODUCT_DIGITAL_FILE_DELETE:  (id: string, fileId: string) => `/admin/products/${id}/digital-files/${fileId}`,
    PRODUCT_DIGITAL_FILES_REORDER: (id: string) => `/admin/products/${id}/digital-files/reorder`,
    PRODUCT_DETAIL:       (id: string) => `/admin/products/${id}/detail`,
    PRODUCT_VARIANTS:     (id: string) => `/admin/products/${id}/variants`,
    PRODUCT_VARIANTS_REORDER: (id: string) => `/admin/products/${id}/variants/reorder`,
    PRODUCT_ATTRIBUTES:   (id: string) => `/admin/products/${id}/attributes`,
    PRODUCT_RELATED:      (id: string) => `/admin/products/${id}/related`,
    PRODUCT_QUESTIONS:    (id: string) => `/admin/products/${id}/questions`,
    PRODUCT_QUESTION_ANSWER: (id: string, qId: string) => `/admin/products/${id}/questions/${qId}/answer`,
    PRODUCT_QUESTION:     (id: string, qId: string) => `/admin/products/${id}/questions/${qId}`,
    PRODUCT_QUESTION_SPAM: (id: string, qId: string) => `/admin/products/${id}/questions/${qId}/spam`,
    // Variations
    PRODUCT_VARIATIONS:         (id: string) => `/admin/products/${id}/variations`,
    PRODUCT_VARIATION_SETTINGS: (id: string) => `/admin/products/${id}/variation-settings`,
    PRODUCT_VARIATION_GROUPS:   (id: string) => `/admin/products/${id}/variations/groups`,
    PRODUCT_VARIATION_GROUP:    (id: string, gId: string) => `/admin/products/${id}/variations/groups/${gId}`,
    PRODUCT_VARIATION_OPTIONS:  (id: string, gId: string) => `/admin/products/${id}/variations/${gId}/options`,
    PRODUCT_VARIATION_OPTION:   (id: string, gId: string, oId: string) => `/admin/products/${id}/variations/${gId}/options/${oId}`,
    PRODUCT_VARIATION_VARIANT:  (id: string, vId: string) => `/admin/products/${id}/variations/variants/${vId}`,
    PRODUCT_VARIATION_VARIANTS: (id: string) => `/admin/products/${id}/variations/variants`,
    PRODUCT_VARIATIONS_APPLY:   (id: string) => `/admin/products/${id}/variations/apply`,
    // Custom options
    PRODUCT_CUSTOM_OPTIONS:      (id: string) => `/admin/products/${id}/custom-options`,
    PRODUCT_CUSTOM_OPTION:       (id: string, oId: string) => `/admin/products/${id}/custom-options/${oId}`,
    PRODUCT_CUSTOM_OPTIONS_REORDER: (id: string) => `/admin/products/${id}/custom-options/reorder`,
    PRODUCTS_BULK:        '/admin/products/bulk',
    PRODUCTS_EXPORT:      '/admin/products/export',
    PRODUCTS_DRAFT:       '/admin/products/draft',
    PRODUCTS_SEO_STATS:   '/admin/products/seo-stats',
    PRODUCTS_IMPORT_TEMPLATE: '/admin/products/import/template',
    PRODUCTS_IMPORT_VALIDATE: '/admin/products/import/validate',
    PRODUCTS_IMPORT_EXECUTE:  '/admin/products/import/execute',
    QUESTIONS:            '/admin/questions',
    QUESTIONS_UNANSWERED: '/admin/questions/unanswered-count',

    // ── Catalog ──────────────────────────────────────────────────────────────
    CATEGORIES:           '/admin/categories',
    CATEGORY:             (id: string) => `/admin/categories/${id}`,
    COLLECTIONS:          '/admin/collections',
    COLLECTION:           (id: string) => `/admin/collections/${id}`,
    COLLECTION_BANNER:    '/admin/collections/banner',
    CATALOG_SYNC:         '/admin/catalog/sync-mega-menu',
    ATTRIBUTES:           (type: string) => `/admin/attributes/${type}`,
    SHOP_SECTIONS:        '/admin/shop-sections',
    SHOP_SECTION:         (id: string) => `/admin/shop-sections/${id}`,
    SHOP_SECTIONS_REORDER: '/admin/shop-sections/reorder',
    PRODUCTION_PARTNERS:  '/admin/production-partners',
    PRODUCTION_PARTNER:   (id: string) => `/admin/production-partners/${id}`,
    ADMIN_TAGS:           '/admin/tags',
    ADMIN_TAG:            (id: string) => `/admin/tags/${id}`,
    AUDIT_LOGS:           '/admin/audit-logs',

    // ── Users / Customers ─────────────────────────────────────────────────────
    USERS:                '/admin/users',
    USER:                 (id: string) => `/admin/users/${id}`,
    CUSTOMERS:            '/admin/customers',
    CUSTOMER:             (id: string) => `/admin/customers/${id}`,
    CUSTOMER_NOTES:       (id: string) => `/admin/customers/${id}/notes`,
    CUSTOMER_TAGS:        (id: string) => `/admin/customers/${id}/tags`,
    CUSTOMERS_STATS:      '/admin/customers/stats',

    // ── Reviews ──────────────────────────────────────────────────────────────
    REVIEWS:              '/admin/reviews',
    REVIEWS_COUNTS:       '/admin/reviews/counts',
    REVIEW:               (id: string) => `/admin/reviews/${id}`,
    REVIEW_APPROVE:       (id: string) => `/admin/reviews/${id}/approve`,
    REVIEW_HIDE:          (id: string) => `/admin/reviews/${id}/hide`,
    REVIEW_REPLY:         (id: string) => `/admin/reviews/${id}/reply`,

    // ── Promotions ───────────────────────────────────────────────────────────
    PROMOTIONS:             '/promotions',
    PROMOTION:              (id: string) => `/promotions/${id}`,
    PROMOTIONS_PAGE_STATS:  '/promotions/page-stats',
    PROMOTION_STATS:        (id: string) => `/promotions/${id}/stats`,

    // ── Bundle offers ("Buy them together") ───────────────────────────────────
    BUNDLE_OFFERS:          '/bundle-offers',
    BUNDLE_OFFER:           (id: string) => `/bundle-offers/${id}`,

    // ── Marketing: Share & Save / Offsite Ads ──────────────────────────────────
    SHARE_SAVE:              '/marketing/share-save',
    SHARE_SAVE_JOIN:         '/marketing/share-save/join',
    SHARE_SAVE_LEAVE:        '/marketing/share-save/leave',
    OFFSITE_ADS:             '/marketing/offsite-ads',
    OFFSITE_ADS_OPT_OUT:     '/marketing/offsite-ads/opt-out',
    TARGETED_OFFERS:         '/marketing/targeted-offers',

    // ── Marketing: Social media (UI-parity only) ────────────────────────────────
    SOCIAL_CONNECTIONS:      '/marketing/social/connections',
    SOCIAL_CONNECTION:       (platform: string) => `/marketing/social/connections/${platform}`,
    SOCIAL_CONTENT:          '/marketing/social/content',
    SOCIAL_POSTS:            '/marketing/social/posts',

    // ── Marketing: Let buyers make offers ───────────────────────────────────────
    OFFERS_SETTINGS:         '/offers/settings',
    OFFERS_INBOX:            '/offers/inbox',
    OFFER_ACCEPT:            (id: string) => `/offers/${id}/accept`,
    OFFER_REJECT:            (id: string) => `/offers/${id}/reject`,
    OFFER_COUNTER:           (id: string) => `/offers/${id}/counter`,

    // ── Shipping (seller-owned Delivery settings) ─────────────────────────────
    SHIPPING_PROFILES:          '/admin/shipping/profiles',
    SHIPPING_PROFILE:           (id: string) => `/admin/shipping/profiles/${id}`,
    SHIPPING_PROCESSING_PROFILES: '/admin/shipping/processing-profiles',
    SHIPPING_PROCESSING_PROFILE:  (id: string) => `/admin/shipping/processing-profiles/${id}`,
    SHIPPING_PROCESSING_SCHEDULE: '/admin/shipping/processing-schedule',
    SHIPPING_DELIVERY_UPGRADES:   '/admin/shipping/delivery-upgrades',

    // ── Messages ─────────────────────────────────────────────────────────────
    CONVERSATIONS:        '/admin/messages/conversations',
    MESSAGE_WITH_USER:    '/admin/messages/conversations/with-user',
    CONVERSATION:         (id: string) => `/admin/messages/conversations/${id}`,
    CONVERSATION_MESSAGES: (id: string) => `/admin/messages/conversations/${id}/messages`,
    CONVERSATION_ATTACHMENTS:   (id: string) => `/admin/messages/conversations/${id}/attachments`,
    CONVERSATION_LINK_PREVIEW:  (id: string) => `/admin/messages/conversations/${id}/link-preview`,
    CONVERSATION_STATUS:  (id: string) => `/admin/messages/conversations/${id}/status`,
    CONVERSATION_READ:    (id: string) => `/admin/messages/conversations/${id}/read`,
    MESSAGE_DELETE:       (id: string) => `/admin/messages/messages/${id}`,

    // ── Inbox ────────────────────────────────────────────────────────────────
    MESSAGE_FOLDERS:      '/admin/messages/folders',
    CONVERSATIONS_BULK:   '/admin/messages/conversations/bulk',
    MESSAGE_LABELS:       '/admin/messages/labels',
    MESSAGE_LABEL:        (labelId: string) => `/admin/messages/labels/${labelId}`,
    CONVERSATION_LABELS:  (id: string) => `/admin/messages/conversations/${id}/labels`,
    CONVERSATION_BUYER:   (id: string) => `/admin/messages/conversations/${id}/buyer`,
    CONVERSATION_BUYER_NOTE: (id: string) => `/admin/messages/conversations/${id}/buyer/note`,
    MESSAGE_AUTO_REPLY:   '/admin/messages/auto-reply',

    // ── Affiliates ───────────────────────────────────────────────────────────
    AFFILIATES:           '/admin/affiliates',
    AFFILIATE:            (id: string) => `/admin/affiliates/${id}`,
    AFFILIATES_PENDING_COUNT: '/admin/affiliates/pending-count',
    AFFILIATES_SETTINGS:  '/admin/affiliates/settings',
    AFFILIATES_PAYOUTS:   '/admin/affiliates/payouts',
    AFFILIATE_APPROVE:    (id: string) => `/admin/affiliates/${id}/approve`,
    AFFILIATE_REJECT:     (id: string) => `/admin/affiliates/${id}/reject`,
    AFFILIATE_PAYOUT:     (id: string) => `/admin/affiliates/${id}/payout`,
    PAYOUT_PAY:           (id: string) => `/admin/affiliates/payouts/${id}/pay`,
    PAYOUT_REJECT:        (id: string) => `/admin/affiliates/payouts/${id}/reject`,

    // ── Assets ───────────────────────────────────────────────────────────────
    ASSETS_PRESIGN:       '/admin/assets/presign',

    // ── Payments ─────────────────────────────────────────────────────────────
    PAYMENTS_LIST:        '/payments',
    PAYMENTS_STATS:       '/payments/stats',
    PAYMENT_REFUNDS:      (id: string) => `/payments/${id}/refunds`,
    PAYMENT_REFUND:       (id: string) => `/payments/${id}/refund`,
    ORDER_REFUND:         (id: string) => `/payments/${id}/refund`,

    // ── Cache / Admin ops ────────────────────────────────────────────────────
    CACHE_FLUSH:          '/admin/cache/flush',
    EMAIL_TEMPLATES:      '/admin/email-templates',
    EMAIL_TEMPLATE:       (slug: string) => `/admin/email-templates/${slug}`,
    EXPORT_DATA:          '/admin/export/data',
    TEAM:                 '/admin/team',
    TEAM_INVITE:          '/admin/team/invite',
    TEAM_MEMBER:          (id: string) => `/admin/team/${id}`,

    // ── Settings ─────────────────────────────────────────────────────────────
    SETTINGS_STORE:         '/admin/settings/store',
    SETTINGS_EMAIL:         '/admin/settings/email',
    SETTINGS_EMAIL_TEST:    '/admin/settings/email/test',
    SETTINGS_NOTIFICATIONS: '/admin/settings/notifications',
    SETTINGS_SEO:           '/admin/settings/seo',
    SETTINGS_THEME:         '/admin/settings/theme',

    // ── Translations ─────────────────────────────────────────────────────────
    TRANSLATIONS:           (entityType: string, entityId: string) => `/admin/translations/${entityType}/${entityId}`,
    TRANSLATIONS_RETRANSLATE: (entityType: string, entityId: string) => `/admin/translations/${entityType}/${entityId}/retranslate`,

    // ── Stores (multi-vendor marketplace) ────────────────────────────────────
    STORES:                   '/admin/stores',
    STORE:                    (id: string) => `/admin/stores/${id}`,
    STORE_APPROVE:            (id: string) => `/admin/stores/${id}/approve`,
    STORE_REJECT:             (id: string) => `/admin/stores/${id}/reject`,
    STORE_SUSPEND:            (id: string) => `/admin/stores/${id}/suspend`,
    STORE_PLAN:               (id: string) => `/admin/stores/${id}/plan`,
    STORE_BANNER:             (id: string) => `/admin/stores/${id}/banner`,
    STORE_LOGO:               (id: string) => `/admin/stores/${id}/logo`,
    STORE_PRODUCTS:           (id: string) => `/admin/stores/${id}/products`,
    STORE_ORDERS:             (id: string) => `/admin/stores/${id}/orders`,
    STORE_FAQS:               (id: string) => `/admin/stores/${id}/faqs`,
    STORE_FAQ:                (id: string, faqId: string) => `/admin/stores/${id}/faqs/${faqId}`,
    STORE_FAQS_REORDER:       (id: string) => `/admin/stores/${id}/faqs-reorder`,
    STORES_PENDING_COUNT:     '/admin/stores?status=PENDING',
    SELLER_PLANS:             '/admin/plans',
    SELLER_PLAN:              (id: string) => `/admin/plans/${id}`,
    PLATFORM_SETTINGS:        '/admin/platform-settings',

    // ── Ezihubb Plus subscription (SUPER_ADMIN grant/extend/revoke) ──────────
    STORE_SUBSCRIPTION:        (id: string) => `/admin/stores/${id}/subscription`,
    STORE_SUBSCRIPTION_GRANT:  (id: string) => `/admin/stores/${id}/subscription/grant`,
    STORE_SUBSCRIPTION_EXTEND: (id: string) => `/admin/stores/${id}/subscription/extend`,
    STORE_SUBSCRIPTION_REVOKE: (id: string) => `/admin/stores/${id}/subscription/revoke`,
    SELLER_PAYOUTS:           '/admin/seller-payouts',
    SELLER_PAYOUT:            (id: string) => `/admin/seller-payouts/${id}`,
    SELLER_PAYOUT_PAY:        (id: string) => `/admin/seller-payouts/${id}/pay`,
    SELLER_PAYOUTS_STATS:     '/admin/seller-payouts/stats',

    // ── Finance ──────────────────────────────────────────────────────────────
    FINANCE_STATS:            '/admin/finance/stats',
    FINANCE_STORES:           '/admin/finance/stores',
    FINANCE_CHART:            '/admin/finance/chart',
    FINANCE_SHIPPING_SUPPORT_SUMMARY: '/admin/finance/shipping-support/summary',
    FINANCE_SHIPPING_SUPPORT_ORDERS:  '/admin/finance/shipping-support/orders',

    // ── Finances (Etsy-parity shop-owner module — admin-app mirror of SELLER.FINANCES_*) ──
    FINANCES_OVERVIEW:             '/admin/finances/overview',
    FINANCES_ACTIVITY_SUMMARY:     '/admin/finances/activity-summary',
    FINANCES_ACTIVITIES:           '/admin/finances/activities',
    FINANCES_ACTIVITIES_EXPORT:    '/admin/finances/activities/export',
    FINANCES_BANK_ACCOUNT:         '/admin/finances/bank-account',
    FINANCES_BILLING_CARDS:        '/admin/finances/billing-cards',
    FINANCES_BILLING_SETUP_INTENT: '/admin/finances/billing-cards/setup-intent',
    FINANCES_BILLING_CONFIRM:      '/admin/finances/billing-cards/confirm',
    FINANCES_BILLING_CARD_DEFAULT: (id: string) => `/admin/finances/billing-cards/${id}/default`,
    FINANCES_BILLING_CARD:         (id: string) => `/admin/finances/billing-cards/${id}`,
    FINANCES_AUTO_BILLING:         '/admin/finances/auto-billing',
    FINANCES_CURRENCY:             '/admin/finances/currency',
    FINANCES_TAX_INFO:             '/admin/finances/tax-info',

    // ── Moderation / Trust & Safety ──────────────────────────────────────────
    MODERATION_FLAGS:         '/admin/moderation/flags',
    MODERATION_STATS:         '/admin/moderation/stats',
    MODERATION_FLAG:          (id: string) => `/admin/moderation/flags/${id}`,
    MODERATION_FLAG_APPROVE:  (id: string) => `/admin/moderation/flags/${id}/approve`,
    MODERATION_FLAG_REJECT:   (id: string) => `/admin/moderation/flags/${id}/reject`,
    MODERATION_FLAG_ESCALATE: (id: string) => `/admin/moderation/flags/${id}/escalate`,
    MODERATION_RULES:         '/admin/moderation/rules',
    MODERATION_RULE:          (id: string) => `/admin/moderation/rules/${id}`,
    MODERATION_RULE_TOGGLE:   (id: string) => `/admin/moderation/rules/${id}/toggle`,

    MODERATION_QUEUE:        '/admin/moderation/queue',
    MY_VIOLATIONS:           '/admin/stores/me/violations',
    MODERATION_LOGS:         '/admin/moderation/logs',
    MODERATION_LOG:          (id: string) => `/admin/moderation/logs/${id}`,
    MODERATION_LOG_APPROVE:  (id: string) => `/admin/moderation/logs/${id}/approve`,
    MODERATION_LOG_REJECT:   (id: string) => `/admin/moderation/logs/${id}/reject`,
    MODERATION_RECHECK:      '/admin/moderation/recheck',
    MODERATION_SETTINGS:     '/admin/moderation/settings',
    MODERATION_STORE_VIOLATIONS: (storeId: string) => `/admin/stores/${storeId}/violations`,
    MODERATION_STORE_CLEAR_STRIKES: (storeId: string) => `/admin/stores/${storeId}/clear-strikes`,

    // ── Campaigns (admin) ────────────────────────────────────────────────────
    CAMPAIGNS:                '/admin/campaigns',
    CAMPAIGN:                 (id: string) => `/admin/campaigns/${id}`,
    CAMPAIGN_ACTIVATE:        (id: string) => `/admin/campaigns/${id}/activate`,
    CAMPAIGN_DEACTIVATE:      (id: string) => `/admin/campaigns/${id}/deactivate`,
    CAMPAIGN_STATS:           '/admin/campaigns/stats',

    // ── Fulfillment providers (Printify, etc.) ────────────────────────────────
    FULFILLMENT_MODE:              '/admin/fulfillment/mode',
    FULFILLMENT_CONNECTIONS:       '/admin/fulfillment/connections',
    FULFILLMENT_CONNECTION_DELETE: (id: string) => `/admin/fulfillment/connections/${id}`,
    FULFILLMENT_SHOP_PRODUCTS:     (connectionId: string) => `/admin/fulfillment/connections/${connectionId}/shop-products`,
    FULFILLMENT_MAPPINGS:          '/admin/fulfillment/mappings',
    FULFILLMENT_MAPPING_DELETE:    (id: string) => `/admin/fulfillment/mappings/${id}`,
    FULFILLMENT_WEBHOOK_SECRET:    (connectionId: string) => `/admin/fulfillment/connections/${connectionId}/webhook-secret`,

    // ── Partner API keys (3rd-party integrations) ─────────────────────────────
    API_KEYS:        '/admin/api-keys',
    API_KEY_DELETE:  (id: string) => `/admin/api-keys/${id}`,
  },

  STORES: {
    LIST:             '/stores',
    DETAIL:           (slug: string) => `/stores/${slug}`,
    SECTIONS:         (slug: string) => `/stores/${slug}/sections`,
    REVIEWS:          (slug: string) => `/stores/${slug}/reviews`,
    REVIEWS_SUMMARY:  (slug: string) => `/stores/${slug}/reviews/summary`,
    FOLLOW:           (slug: string) => `/stores/${slug}/follow`,
    FOLLOW_STATUS:    (slug: string) => `/stores/${slug}/follow-status`,
  },

  // ── Seller (store-owner portal) ─────────────────────────────────────────────
  SELLER: {
    DASHBOARD_STATS:   '/seller/orders/stats',
    DASHBOARD_RECENT:  '/seller/orders/recent',
    PRODUCTS:          '/seller/products',
    PRODUCT:           (id: string) => `/seller/products/${id}`,
    PRODUCT_STATUS:    (id: string) => `/seller/products/${id}/status`,
    PRODUCT_DRAFT:     '/seller/products/draft',
    PRODUCT_CATEGORIES: '/seller/products/categories',
    ORDERS:            '/seller/orders',
    ORDER:             (id: string) => `/seller/orders/${id}`,
    ORDERS_COUNTS:     '/seller/orders/counts',
    PAYOUTS:           '/seller/payouts',
    PAYOUT_REQUEST:    '/seller/payouts/request',
    PAYOUT_STATS:      '/seller/payouts/stats',

    // ── Finances (Etsy: Shop Manager → Finances) ────────────────────────────
    FINANCES_OVERVIEW:         '/seller/finances/overview',
    FINANCES_ACTIVITY_SUMMARY: '/seller/finances/activity-summary',
    FINANCES_ACTIVITIES:       '/seller/finances/activities',
    FINANCES_ACTIVITIES_EXPORT: '/seller/finances/activities/export',
    FINANCES_BANK_ACCOUNT:      '/seller/finances/bank-account',
    FINANCES_BILLING_CARDS:     '/seller/finances/billing-cards',
    FINANCES_BILLING_SETUP_INTENT: '/seller/finances/billing-cards/setup-intent',
    FINANCES_BILLING_CONFIRM:      '/seller/finances/billing-cards/confirm',
    FINANCES_BILLING_CARD_DEFAULT: (id: string) => `/seller/finances/billing-cards/${id}/default`,
    FINANCES_BILLING_CARD:          (id: string) => `/seller/finances/billing-cards/${id}`,
    FINANCES_AUTO_BILLING:          '/seller/finances/auto-billing',
    FINANCES_CURRENCY:              '/seller/finances/currency',
    FINANCES_TAX_INFO:              '/seller/finances/tax-info',

    STORE_ME:          '/stores/me',
    STORE_ME_UPDATE:   '/stores/me',
    STORE_APPLY:       '/stores/apply',
    STORE_APPLICATION: '/stores/me/application',

    // ── Ezihubb Plus (read-only self-service view) ──────────────────────────
    SUBSCRIPTION:      '/seller/subscription',
  },
} as const;

