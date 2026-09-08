import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { OrderStatus, Prisma, PlatformSettings } from '@prisma/client';
import { ModerationService } from '../moderation/moderation.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../common/services/storage.service';
import { RedisService } from '../../common/services/redis.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { JOBS, QUEUES, DEFAULT_JOB_OPTIONS } from '../../queue/queue.constants';
import { ApplyStoreDto, isReservedSlug } from './dto/apply-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { isEntitled } from '../subscriptions/subscription-status.util';
import { PlusFeature } from '@ezihubb/constants';
import {
  ApproveStoreDto,
  RejectStoreDto,
  SuspendStoreDto,
  AdminListStoresDto,
  UpdatePlatformSettingsDto,
} from './dto/admin-stores.dto';
import { paginatedResponse } from '../../common/dto/paginated-response.dto';
import {
  ShippingSupportOrdersQueryDto,
  ShippingSupportSort,
  ShippingSupportStatus,
} from './dto/shipping-support-query.dto';

const sharp = require('sharp');

const SHOP_URL   = process.env['CLIENT_URL'] ?? 'https://ezihubb.com';
const ADMIN_URL  = process.env['ADMIN_URL']  ?? 'http://localhost:3001';
const REALIZED_SHIPPING_STATUSES: OrderStatus[] = [
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];
const EXCLUDED_SHIPPING_STATUSES: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
];
export const STORE_BANNER_MAX_BYTES = 10 * 1024 * 1024;
export const STORE_BANNER_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const STORE_BANNER_MAX_WIDTH = 2400;
const STORE_BANNER_MAX_HEIGHT = 1200;

@Injectable()
export class StoresService {
  private readonly logger = new Logger(StoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
    private readonly storageService: StorageService,
    private readonly redis: RedisService,
    private readonly analyticsService: AnalyticsService,
    private readonly entitlements: EntitlementsService,
    @Optional() private readonly moderationService?: ModerationService,
  ) {}

  // ─── Seller: Apply ────────────────────────────────────────────────────────

  async applyForStore(userId: string, dto: ApplyStoreDto) {
    // Guard: user must not already own a store
    const existingStore = await this.prisma.store.findUnique({ where: { ownerId: userId } });
    if (existingStore) {
      throw new ConflictException({ code: 'ERR_STORE_EXISTS', message: 'You already have a store' });
    }

    // Guard: slug uniqueness + reserved check
    if (isReservedSlug(dto.slug)) {
      throw new BadRequestException({ code: 'ERR_SLUG_RESERVED', message: 'This slug is reserved' });
    }
    const existingSlug = await this.prisma.store.findUnique({ where: { slug: dto.slug } });
    if (existingSlug) {
      throw new ConflictException({ code: 'ERR_SLUG_TAKEN', message: 'This store URL is already taken' });
    }

    // Guard: platform settings allow registration
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!settings?.allowPublicRegistration && user?.role === 'CUSTOMER') {
      throw new ForbiddenException({ code: 'ERR_REGISTRATION_CLOSED', message: 'Store applications are by invitation only' });
    }

    const store = await this.prisma.store.create({
      data: {
        slug:        dto.slug,
        name:        dto.name,
        description: dto.description,
        ownerId:     userId,
        status:      'PENDING',
      },
    });

    // fire-and-forget
    this.moderationService?.queueStoreModeration(store.id).catch((e) => this.logger.error('mod queue failed', e));

    // Notify seller
    await this.emailQueue.add(JOBS.SEND_EMAIL, {
      to:       user?.email,
      template: 'store-application-received',
      subject:  'We received your EziHubb store application',
      data:     { firstName: user?.firstName, storeName: store.name, shopUrl: SHOP_URL },
    }, DEFAULT_JOB_OPTIONS);

    // Notify admins
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { email: true, firstName: true },
    });
    for (const admin of admins) {
      await this.emailQueue.add(JOBS.SEND_EMAIL, {
        to:       admin.email,
        template: 'new-store-application',
        subject:  `New store application: ${store.name}`,
        data:     { adminName: admin.firstName, storeName: store.name, sellerEmail: user?.email, adminUrl: `${SHOP_URL}/admin` },
      }, DEFAULT_JOB_OPTIONS);
    }

    return store;
  }

  // ─── Seller: Get / Update ─────────────────────────────────────────────────

  async getMyStore(userId: string) {
    return this.prisma.store.findUnique({
      where: { ownerId: userId },
    });
  }

  async getMyStoreApplication(userId: string) {
    const store = await this.prisma.store.findUnique({
      where:  { ownerId: userId },
      select: { id: true, name: true, status: true, rejectedReason: true, createdAt: true, updatedAt: true },
    });
    return store ?? { status: 'NONE' };
  }

  async updateMyStore(userId: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findUnique({ where: { ownerId: userId } });
    if (!store) throw new NotFoundException('Store not found');
    if (store.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active stores can be updated');
    }

    const updatedStore = await this.prisma.store.update({
      where: { id: store.id },
      data:  {
        name:        dto.name        ?? undefined,
        description: dto.description ?? undefined,
        logoUrl:     dto.logoUrl     ?? undefined,
        bannerUrl:   dto.bannerUrl   ?? undefined,
      },
    });

    // fire-and-forget
    this.moderationService?.queueStoreModeration(updatedStore.id).catch((e) => this.logger.error('mod queue failed', e));

    return updatedStore;
  }

  // ─── Public: Store list ───────────────────────────────────────────────────

  async listStores(page = 1, limit = 12) {
    const where = { status: 'ACTIVE' as const };
    const skip  = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { rating: 'desc' },
        select: {
          id: true, slug: true, name: true, description: true,
          logoUrl: true, bannerUrl: true, rating: true,
          // Store.totalProducts is a denormalized counter with no write path
          // anywhere in the codebase (never incremented/decremented on
          // create/delete) — always compute live instead of trusting it.
          _count: { select: { products: { where: { isActive: true, deletedAt: null } } } },
        },
      }),
    ]);
    const data = rows.map(({ _count, ...s }) => ({ ...s, totalProducts: _count.products }));
    return paginatedResponse(data, total, page, limit);
  }

  // ─── Public: Store page ───────────────────────────────────────────────────

  async getStoreBySlug(slug: string, viewLockId?: string, referer?: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: {
        id: true, slug: true, name: true, description: true,
        logoUrl: true, bannerUrl: true, status: true,
        totalOrders: true, rating: true,
        createdAt: true, verifiedAt: true,
        shareSaveEnabled: true,
        tagline: true,
        location: true,
        announcement: true,
        announcementUpdatedAt: true,
        aboutHeadline: true,
        aboutVideoUrl: true,
        aboutPhotoUrls: true,
        ownerBio: true,
        socialLinks: true,
        owner: { select: { firstName: true, lastName: true, avatarUrl: true } },
        faqs: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, question: true, answer: true, sortOrder: true },
        },
        // Ezihubb Plus (colorTheme only — featuredProductIds stays FREE,
        // never gated; do not extend this gate to other fields without
        // confirming scope first, see docs/etsy-ui-audit.md Backlog).
        colorTheme: true,
        featuredProductIds: true,
        featuredLayout: true,
        // Joined here (not a separate canUseFeature() call) so this hot,
        // public, uncached (force-dynamic) page costs exactly 1 query.
        subscription: { select: { status: true, currentPeriodEnd: true } },
        // Store.totalProducts is a denormalized counter with no write path
        // anywhere in the codebase — always compute live instead.
        _count: { select: { products: { where: { isActive: true, deletedAt: null } }, followers: true } },
      },
    });

    if (!store || store.status === 'PENDING' || store.status === 'REJECTED') {
      throw new NotFoundException('Store not found');
    }

    // Computed once, reused for every Plus-gated field below — no matter how
    // many, this never costs an extra query (see EntitlementsService for the
    // DB-querying variant used where the subscription isn't already loaded).
    const hasPlus = isEntitled(store.subscription);

    // Debounced store-visit tracking — one increment per session/IP per hour,
    // same dedup pattern as the product view counter. Traffic-source
    // attribution rides the same dedup window so a single visit is only
    // classified once, same as the visit counter itself.
    if (viewLockId) {
      const lockKey = `store:view-lock:${slug}:${viewLockId}`;
      const seen = await this.redis.exists(lockKey);
      if (!seen) {
        await this.redis.set(lockKey, 1, 3600);
        this.analyticsService.trackStoreMetric(store.id, 'visits').catch(() => undefined);
        this.analyticsService
          .trackVisitSource(store.id, this.classifyTrafficSource(referer))
          .catch(() => undefined);
      }
    }

    // `subscription` discarded here on purpose — already consumed above via
    // `hasPlus`; never returned to the public API response.
    const { _count, subscription: _subscription, ...rest } = store;
    return {
      ...rest,
      colorTheme:    hasPlus ? rest.colorTheme : null, // gated — see field comment above
      // Gated the same way, but degrades instead of nulling: a store without
      // Plus (or whose Plus lapsed while 'mixed' was stored) renders the free
      // standard grid. The stored preference is left untouched in the DB, so
      // re-subscribing restores the mixed layout — same policy as colorTheme.
      // "none" is a free opt-out and must remain effective after Plus lapses.
      // Only the paid mixed layout is downgraded to the standard grid.
      featuredLayout: hasPlus
        ? (rest.featuredLayout ?? 'grid')
        : (rest.featuredLayout === 'none' ? 'none' : 'grid'),
      totalProducts: _count.products,
      followerCount: _count.followers,
    };
  }

  /**
   * Buckets a visit's HTTP Referer into 6 categories, splitting Etsy's "How
   * shoppers found you" into its real two super-groups: signals the
   * *platform* brought (on-platform search/browse, other on-platform pages,
   * arriving via an external search engine — i.e. found through SEO) vs
   * signals the *seller* brought (true direct/bookmarked, social media,
   * other external referrers e.g. the seller's own blog or ad).
   * `ShopStatsService.getTrafficSources` reads these keys generically, so
   * adding buckets here doesn't require a matching frontend change.
   * Best-effort — a stripped/missing Referer (increasingly common under
   * strict browser referrer policies) falls back to "direct", same as most
   * analytics tools.
   */
  private classifyTrafficSource(referer?: string): 'platform_search' | 'platform_pages' | 'external_search' | 'direct' | 'social' | 'external' {
    if (!referer) return 'direct';
    let url: URL;
    try {
      url = new URL(referer);
    } catch {
      return 'direct';
    }
    const host = url.hostname.toLowerCase();

    let ownHost: string;
    try {
      ownHost = new URL(SHOP_URL).hostname.toLowerCase();
    } catch {
      ownHost = '';
    }
    if (host === ownHost) {
      // On-platform navigation — only count it as "search" attribution when
      // it came from a search/browse surface, not e.g. the homepage.
      return /^\/[a-z]{2}\/(search|products|collections)(\/|$)/.test(url.pathname)
        ? 'platform_search'
        : 'platform_pages';
    }

    const socialHosts = ['facebook.com', 'instagram.com', 'tiktok.com', 'pinterest.com', 'twitter.com', 'x.com', 't.co'];
    if (socialHosts.some((h) => host === h || host.endsWith(`.${h}`))) return 'social';

    // Arriving via an external search engine means the platform's own SEO
    // surfaced the listing — credited to the platform, not the seller.
    const searchEngineHosts = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'baidu.'];
    if (searchEngineHosts.some((h) => host.includes(h))) return 'external_search';

    return 'external';
  }

  // ─── Public: Follow a shop ─────────────────────────────────────────────────

  async getFollowStatus(slug: string, userId?: string): Promise<{ following: boolean }> {
    if (!userId) return { following: false };
    const store = await this.prisma.store.findUnique({ where: { slug }, select: { id: true } });
    if (!store) return { following: false };
    const existing = await this.prisma.storeFollow.findUnique({
      where: { userId_storeId: { userId, storeId: store.id } },
    });
    return { following: !!existing };
  }

  async followStore(slug: string, userId: string): Promise<{ following: true; followerCount: number }> {
    const store = await this.prisma.store.findUnique({ where: { slug }, select: { id: true } });
    if (!store) throw new NotFoundException('Store not found');
    await this.prisma.storeFollow.upsert({
      where:  { userId_storeId: { userId, storeId: store.id } },
      create: { userId, storeId: store.id },
      update: {},
    });
    const followerCount = await this.prisma.storeFollow.count({ where: { storeId: store.id } });
    return { following: true, followerCount };
  }

  async unfollowStore(slug: string, userId: string): Promise<{ following: false; followerCount: number }> {
    const store = await this.prisma.store.findUnique({ where: { slug }, select: { id: true } });
    if (!store) throw new NotFoundException('Store not found');
    await this.prisma.storeFollow.deleteMany({ where: { userId, storeId: store.id } });
    const followerCount = await this.prisma.storeFollow.count({ where: { storeId: store.id } });
    return { following: false, followerCount };
  }

  // ─── Public: Store sections (shop sections sidebar) ───────────────────────

  async getStoreSections(slug: string) {
    const store = await this.prisma.store.findUnique({
      where:  { slug },
      select: { id: true, status: true },
    });
    if (!store || store.status === 'PENDING' || store.status === 'REJECTED') {
      throw new NotFoundException('Store not found');
    }

    const baseWhere = { storeId: store.id, isActive: true, deletedAt: null as null };

    const [total, onSaleCount, shopSections] = await Promise.all([
      this.prisma.product.count({ where: baseWhere }),
      this.prisma.product.count({
        where: { ...baseWhere, NOT: { compareAtPrice: null } },
      }),
      this.prisma.shopSection.findMany({
        where:   { storeId: store.id },
        select: {
          id:       true,
          name:     true,
          sortOrder: true,
          _count:   { select: { products: { where: baseWhere } } },
        },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    return {
      total,
      onSale: onSaleCount,
      sections: shopSections
        .filter((s) => s._count.products > 0)
        .map((s) => ({
          id:    s.id,
          name:  s.name,
          count: s._count.products,
        })),
    };
  }

  // ─── Public: Store performance score ─────────────────────────────────────

  async getStoreScorePublic(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      select: {
        performanceScore: true, scoreShipping: true, scoreRefund: true,
        scoreReview: true, scoreResponse: true, scoreBadge: true, scoreLastCalculatedAt: true,
      },
    });
    if (!store) return null;
    return store;
  }

  // ─── Admin: List stores ───────────────────────────────────────────────────

  async adminListStores(dto: AdminListStoresDto, scopedOwnerId?: string) {
    const page  = dto.page  ?? 1;
    const limit = dto.limit ?? 20;
    const skip  = (page - 1) * limit;

    const where: any = {};
    // Shop owners (ADMIN role) can only see their own store(s)
    if (scopedOwnerId) where.ownerId = scopedOwnerId;
    if (dto.status) where.status = dto.status;
    if (dto.search) {
      where.OR = [
        { name:  { contains: dto.search, mode: 'insensitive' } },
        { slug:  { contains: dto.search, mode: 'insensitive' } },
      ];
    }

    const [stores, total] = await Promise.all([
      this.prisma.store.findMany({
        where,
        skip,
        take: limit,
        include: { owner: { select: { email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.store.count({ where }),
    ]);

    return paginatedResponse(stores, page, limit, total);
  }

  async adminGetStore(storeId: string, scopedOwnerId?: string) {
    const store = await this.prisma.store.findUnique({
      where:   { id: storeId },
      include: {
        owner:   { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true } },
        payouts: { orderBy: { createdAt: 'desc' }, take: 5 },
        faqs:    { orderBy: { sortOrder: 'asc' } },
        _count:  { select: { followers: true } },
      },
    });
    if (!store) throw new NotFoundException('Store not found');
    // Shop owners (ADMIN role) can only access their own store
    if (scopedOwnerId && store.ownerId !== scopedOwnerId) {
      throw new NotFoundException('Store not found');
    }

    // Store.totalProducts is a denormalized counter with no write path
    // anywhere in the codebase (never incremented/decremented on product
    // create/delete) — always compute live instead of trusting the stale column.
    const totalProducts = await this.prisma.product.count({
      where: { storeId, isActive: true, deletedAt: null },
    });

    return {
      ...store,
      // Prisma Decimal values are serialized as JSON strings. Normalize them
      // at the API boundary so admin consumers receive the numeric shape they
      // declare and can safely format ratings and revenue.
      rating: Number(store.rating),
      totalRevenue: Number(store.totalRevenue),
      totalProducts,
      followerCount: store._count.followers,
    };
  }

  // ─── Admin: Approve ───────────────────────────────────────────────────────

  async adminApproveStore(storeId: string, adminId: string, dto: ApproveStoreDto) {
    const store = await this.prisma.store.findUnique({
      where:   { id: storeId },
      include: { owner: { select: { email: true, firstName: true } } },
    });
    if (!store) throw new NotFoundException('Store not found');
    if (store.status !== 'PENDING') {
      throw new BadRequestException('Only pending stores can be approved');
    }

    const updatedStore = await this.prisma.$transaction(async (tx) => {
      const s = await tx.store.update({
        where: { id: storeId },
        data: {
          status:       'ACTIVE',
          verifiedAt:   new Date(),
          approvedById: adminId,
        },
      });

      // Link the store to its owner. Only promote role to ADMIN when the
      // applicant is a plain CUSTOMER — a SUPER_ADMIN who applies for their
      // own store (e.g. platform staff running a personal shop) keeps full
      // platform privileges; approval must never silently demote them.
      const owner = await tx.user.findUniqueOrThrow({ where: { id: store.ownerId }, select: { role: true } });
      await tx.user.update({
        where: { id: store.ownerId },
        data:  {
          isSeller:    true,
          storeId:     store.id,
          ...(owner.role === 'CUSTOMER' ? { role: 'ADMIN' as const } : {}),
          permissions: { roles: ['shop_owner'] },
        },
      });

      return s;
    });

    // fire-and-forget
    this.moderationService?.queueStoreModeration(storeId).catch((e) => this.logger.error('mod queue failed', e));

    await this.emailQueue.add(JOBS.SEND_EMAIL, {
      to:       store.owner.email,
      template: 'store-approved',
      subject:  `🎉 Your store "${store.name}" is approved — here's how to get started`,
      data: {
        firstName:       store.owner.firstName,
        storeName:       store.name,
        storeUrl:        `${SHOP_URL}/shops/${store.slug}`,
        adminPanelUrl:   ADMIN_URL,
        adminLoginUrl:   `${ADMIN_URL}/login`,
      },
    }, DEFAULT_JOB_OPTIONS);

    return updatedStore;
  }

  // ─── Admin: Reject ────────────────────────────────────────────────────────

  async adminRejectStore(storeId: string, adminId: string, dto: RejectStoreDto) {
    const store = await this.prisma.store.findUnique({
      where:   { id: storeId },
      include: { owner: { select: { email: true, firstName: true } } },
    });
    if (!store) throw new NotFoundException('Store not found');

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data:  { status: 'REJECTED', rejectedReason: dto.reason, approvedById: adminId },
    });

    await this.emailQueue.add(JOBS.SEND_EMAIL, {
      to:       store.owner.email,
      template: 'store-rejected',
      subject:  'Update on your EziHubb store application',
      data: {
        firstName: store.owner.firstName,
        storeName: store.name,
        reason:    dto.reason,
        shopUrl:   SHOP_URL,
      },
    }, DEFAULT_JOB_OPTIONS);

    return updated;
  }

  // ─── Admin: Suspend ───────────────────────────────────────────────────────

  async adminSuspendStore(storeId: string, adminId: string, dto: SuspendStoreDto) {
    const store = await this.prisma.store.findUnique({
      where:   { id: storeId },
      include: { owner: { select: { email: true, firstName: true } } },
    });
    if (!store) throw new NotFoundException('Store not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const s = await tx.store.update({
        where: { id: storeId },
        data:  { status: 'SUSPENDED', adminNotes: dto.reason },
      });
      // Hide all store products from storefront
      await tx.product.updateMany({
        where: { storeId },
        data:  { status: 'INACTIVE' },
      });
      return s;
    });

    await this.emailQueue.add(JOBS.SEND_EMAIL, {
      to:       store.owner.email,
      template: 'store-suspended',
      subject:  'Your EziHubb store has been suspended',
      data: {
        firstName: store.owner.firstName,
        storeName: store.name,
        reason:    dto.reason,
        shopUrl:   SHOP_URL,
      },
    }, DEFAULT_JOB_OPTIONS);

    return updated;
  }

  // ─── Platform Settings ────────────────────────────────────────────────────

  /**
   * Every Decimal column on this row, as plain numbers.
   *
   * Prisma serialises Decimal to a JSON *string*, and returning the raw row
   * handed every caller `"0.05"` where the type said `number`. Arithmetic then
   * behaved in whichever way JavaScript felt like: `price * "0.05"` coerces
   * and works, but `thatResult + "0.25"` concatenates, so the admin's
   * estimated-earnings preview showed "$NaN to $NaN" and expanding it threw
   * "toFixed is not a function" on the one field that never went through
   * arithmetic at all.
   *
   * Converted here rather than in each of the three consumers: this is the
   * boundary where the shape stops being Prisma's and starts being the API's,
   * and a caller cannot reasonably be expected to know which fields are
   * Decimal underneath.
   *
   * `plusAnnualPrice` stays nullable — null means "no annual price set" and
   * must not collapse to 0, which is a real price.
   */
  private toPlatformSettingsDto(row: PlatformSettings) {
    return {
      ...row,
      transactionFeeRate:        Number(row.transactionFeeRate),
      paymentProcessingFeeRate:  Number(row.paymentProcessingFeeRate),
      paymentProcessingFixedFee: Number(row.paymentProcessingFixedFee),
      listingFee:                Number(row.listingFee),
      regulatoryFeeRate:         Number(row.regulatoryFeeRate),
      vatOnFeesRate:             Number(row.vatOnFeesRate),
      offsiteAdsFeeRate:         Number(row.offsiteAdsFeeRate),
      minPayoutAmount:           Number(row.minPayoutAmount),
      freeShippingThreshold:     Number(row.freeShippingThreshold),
      plusMonthlyPrice:          Number(row.plusMonthlyPrice),
      plusAnnualPrice:           row.plusAnnualPrice === null ? null : Number(row.plusAnnualPrice),
    };
  }

  async getPlatformSettings() {
    const row = await this.prisma.platformSettings.upsert({
      where:  { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    return this.toPlatformSettingsDto(row);
  }

  async updatePlatformSettings(dto: UpdatePlatformSettingsDto) {
    const row = await this.prisma.platformSettings.upsert({
      where:  { id: 'singleton' },
      update: dto,
      create: { id: 'singleton', ...dto },
    });
    // Same shape as the GET: a client that re-reads the response after saving
    // must not get strings back where the read gave it numbers.
    return this.toPlatformSettingsDto(row);
  }

  // ─── Admin: Seller Payouts ────────────────────────────────────────────────

  /** `storeId` is set whenever the caller isn't a platform-context SUPER_ADMIN
   *  (i.e. a shop-owner ADMIN, or a SUPER_ADMIN switched into "My Store") —
   *  scopes every query below to that one store instead of the whole
   *  platform. Previously these ran totally unscoped for both roles, so a
   *  shop owner hitting /payouts or /finance could see every other store's
   *  payouts and revenue. */
  async adminListPayouts(params: { page?: number; limit?: number; status?: string; storeId?: string }) {
    const page  = params.page  ?? 1;
    const limit = params.limit ?? 20;
    const skip  = (page - 1) * limit;
    const where: Prisma.SellerPayoutWhereInput = {};
    if (params.status) where.status = params.status as Prisma.EnumSellerPayoutStatusFilter['equals'];
    if (params.storeId) where.storeId = params.storeId;

    const [payouts, total] = await Promise.all([
      this.prisma.sellerPayout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { store: { select: { name: true, slug: true } } },
      }),
      this.prisma.sellerPayout.count({ where }),
    ]);

    return paginatedResponse(payouts, page, limit, total);
  }

  async adminMarkPayoutPaid(
    payoutId: string,
    adminId: string,
    dto: { paymentMethod: string; paymentDetail?: string; adminNotes?: string },
    storeId?: string,
  ) {
    const payout = await this.prisma.sellerPayout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    // A shop-owner ADMIN (storeId set) may only mark their own payouts paid —
    // without this check, any authenticated shop owner could pay out ANY
    // other store's pending payout by guessing/enumerating its id.
    if (storeId && payout.storeId !== storeId) {
      throw new ForbiddenException('You do not have access to this payout');
    }
    if (payout.status === 'PAID') throw new BadRequestException('Payout already paid');

    return this.prisma.sellerPayout.update({
      where: { id: payoutId },
      data: {
        status:        'PAID',
        paidAt:        new Date(),
        processedById: adminId,
        paymentMethod: dto.paymentMethod,
        paymentDetail: dto.paymentDetail ?? null,
        adminNotes:    dto.adminNotes    ?? null,
      },
    });
  }

  // ─── Admin: Finance Stats ─────────────────────────────────────────────────

  async getFinanceStats(storeId?: string) {
    const today      = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const orderWhere: Prisma.StoreOrderWhereInput = { status: { not: 'CANCELLED' } };
    if (storeId) orderWhere.storeId = storeId;
    const payoutWhere: Prisma.SellerPayoutWhereInput = {};
    if (storeId) payoutWhere.storeId = storeId;

    const [
      totalFees,
      feesThisMonth,
      pendingPayouts,
      paidPayouts,
      activeStores,
    ] = await Promise.all([
      this.prisma.storeOrder.aggregate({
        where:  orderWhere,
        _sum:   { platformFee: true },
      }),
      this.prisma.storeOrder.aggregate({
        where:  { ...orderWhere, createdAt: { gte: monthStart } },
        _sum:   { platformFee: true },
      }),
      this.prisma.sellerPayout.aggregate({
        where: { ...payoutWhere, status: { in: ['PENDING', 'PROCESSING'] } },
        _sum:  { amount: true },
        _count: true,
      }),
      this.prisma.sellerPayout.aggregate({
        where: { ...payoutWhere, status: 'PAID' },
        _sum:  { amount: true },
        _count: true,
      }),
      storeId ? Promise.resolve(1) : this.prisma.store.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      totalFeesCollected:    Number(totalFees._sum.platformFee    ?? 0),
      feesThisMonth:         Number(feesThisMonth._sum.platformFee ?? 0),
      pendingPayoutAmount:   Number(pendingPayouts._sum.amount ?? 0),
      pendingPayoutCount:    pendingPayouts._count,
      totalPaidOutAmount:    Number(paidPayouts._sum.amount ?? 0),
      totalPaidOutCount:     paidPayouts._count,
      activeStores,
    };
  }

  async getFinanceChart(days = 30, storeId?: string) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    const rows = storeId
      ? await this.prisma.$queryRaw<{ date: string; fees: number; payouts: number }[]>`
          SELECT
            TO_CHAR(so."createdAt", 'YYYY-MM-DD') AS date,
            COALESCE(SUM(so."platformFee"), 0)::float AS fees,
            0::float AS payouts
          FROM "StoreOrder" so
          WHERE so."createdAt" >= ${since} AND so.status <> 'CANCELLED' AND so."storeId" = ${storeId}
          GROUP BY date
          ORDER BY date ASC
        `
      : await this.prisma.$queryRaw<{ date: string; fees: number; payouts: number }[]>`
          SELECT
            TO_CHAR(so."createdAt", 'YYYY-MM-DD') AS date,
            COALESCE(SUM(so."platformFee"), 0)::float AS fees,
            0::float AS payouts
          FROM "StoreOrder" so
          WHERE so."createdAt" >= ${since} AND so.status <> 'CANCELLED'
          GROUP BY date
          ORDER BY date ASC
        `;
    return rows.map((r) => ({ date: r.date, fees: Number(r.fees), payouts: Number(r.payouts) }));
  }

  async getStoreFinanceList(query: { page: number; limit: number; storeId?: string }) {
    const { page, limit, storeId } = query;
    const where: Prisma.StoreWhereInput = storeId ? { id: storeId } : { status: 'ACTIVE' };
    const [stores, total] = await Promise.all([
      this.prisma.store.findMany({
        where,
        select: {
          id: true, name: true, slug: true,
          _count: { select: { storeOrders: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.store.count({ where }),
    ]);
    return { data: stores, total, page, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Marketplace shipping support is recorded per StoreOrder because one buyer
   * order can contain parcels from multiple shops. `committedSubsidy` is the
   * support promised on every live order; `realizedSubsidy` is the subset whose
   * parcel has reached SHIPPED or later. Cancelled/refunded orders are excluded
   * so they never inflate platform expense reporting.
   */
  async getShippingSupportSummary(days = 30) {
    const since = this.shippingSupportSince(days);

    type AggregateRow = {
      committedSubsidy: number;
      realizedSubsidy: number;
      supportedOrders: number;
      supportedShipments: number;
      merchandiseSubtotal: number;
    };
    type SeriesRow = { date: string; committed: number; realized: number; orders: number };
    type StoreRow = { storeId: string; storeName: string; subsidy: number; orders: number };

    const [aggregateRows, seriesRows, topStores] = await Promise.all([
      this.prisma.$queryRaw<AggregateRow[]>`
        SELECT
          COALESCE(SUM(so."shippingSubsidy"), 0)::float AS "committedSubsidy",
          COALESCE(SUM(so."shippingSubsidy") FILTER (
            WHERE so.status IN ('SHIPPED', 'DELIVERED', 'COMPLETED')
          ), 0)::float AS "realizedSubsidy",
          COUNT(DISTINCT so."orderId")::int AS "supportedOrders",
          COUNT(*)::int AS "supportedShipments",
          COALESCE(SUM(GREATEST(so.subtotal - so."discountAmount", 0)), 0)::float AS "merchandiseSubtotal"
        FROM "StoreOrder" so
        WHERE so."createdAt" >= ${since}
          AND so."shippingSubsidy" > 0
          AND so.status NOT IN ('CANCELLED', 'REFUNDED')
      `,
      this.prisma.$queryRaw<SeriesRow[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', so."createdAt"), 'YYYY-MM-DD') AS date,
          COALESCE(SUM(so."shippingSubsidy"), 0)::float AS committed,
          COALESCE(SUM(so."shippingSubsidy") FILTER (
            WHERE so.status IN ('SHIPPED', 'DELIVERED', 'COMPLETED')
          ), 0)::float AS realized,
          COUNT(DISTINCT so."orderId")::int AS orders
        FROM "StoreOrder" so
        WHERE so."createdAt" >= ${since}
          AND so."shippingSubsidy" > 0
          AND so.status NOT IN ('CANCELLED', 'REFUNDED')
        GROUP BY DATE_TRUNC('day', so."createdAt")
        ORDER BY DATE_TRUNC('day', so."createdAt") ASC
      `,
      this.prisma.$queryRaw<StoreRow[]>`
        SELECT
          s.id AS "storeId",
          s.name AS "storeName",
          COALESCE(SUM(so."shippingSubsidy"), 0)::float AS subsidy,
          COUNT(DISTINCT so."orderId")::int AS orders
        FROM "StoreOrder" so
        JOIN "Store" s ON s.id = so."storeId"
        WHERE so."createdAt" >= ${since}
          AND so."shippingSubsidy" > 0
          AND so.status NOT IN ('CANCELLED', 'REFUNDED')
        GROUP BY s.id, s.name
        ORDER BY subsidy DESC
        LIMIT 5
      `,
    ]);

    const aggregate = aggregateRows[0] ?? {
      committedSubsidy: 0,
      realizedSubsidy: 0,
      supportedOrders: 0,
      supportedShipments: 0,
      merchandiseSubtotal: 0,
    };
    const committedSubsidy = Number(aggregate.committedSubsidy);
    const realizedSubsidy = Number(aggregate.realizedSubsidy);
    const supportedOrders = Number(aggregate.supportedOrders);
    const merchandiseSubtotal = Number(aggregate.merchandiseSubtotal);

    return {
      periodDays: days,
      committedSubsidy,
      realizedSubsidy,
      pendingSubsidy: Math.max(0, committedSubsidy - realizedSubsidy),
      supportedOrders,
      supportedShipments: Number(aggregate.supportedShipments),
      averageSubsidyPerOrder: supportedOrders > 0 ? committedSubsidy / supportedOrders : 0,
      subsidyToMerchandisePercent: merchandiseSubtotal > 0
        ? (committedSubsidy / merchandiseSubtotal) * 100
        : 0,
      series: seriesRows.map((row) => ({
        date: row.date,
        committed: Number(row.committed),
        realized: Number(row.realized),
        orders: Number(row.orders),
      })),
      topStores: topStores.map((row) => ({
        ...row,
        subsidy: Number(row.subsidy),
        orders: Number(row.orders),
      })),
    };
  }

  async getShippingSupportOrders(query: ShippingSupportOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const since = this.shippingSupportSince(query.days ?? 30);

    const status = query.status === ShippingSupportStatus.REALIZED
      ? { in: REALIZED_SHIPPING_STATUSES }
      : query.status === ShippingSupportStatus.PENDING
        ? { notIn: [...EXCLUDED_SHIPPING_STATUSES, ...REALIZED_SHIPPING_STATUSES] }
        : { notIn: EXCLUDED_SHIPPING_STATUSES };

    const where: Prisma.StoreOrderWhereInput = {
      shippingSubsidy: { gt: 0 },
      createdAt: { gte: since },
      status,
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(search
        ? {
            OR: [
              { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
              { order: { shippingName: { contains: search, mode: 'insensitive' } } },
              { order: { guestEmail: { contains: search, mode: 'insensitive' } } },
              { store: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const primaryOrder: Prisma.StoreOrderOrderByWithRelationInput =
      query.sort === ShippingSupportSort.SUBSIDY
        ? { shippingSubsidy: 'desc' }
        : query.sort === ShippingSupportSort.ORDER_VALUE
          ? { subtotal: 'desc' }
          : { createdAt: 'desc' };

    const [rows, total] = await Promise.all([
      this.prisma.storeOrder.findMany({
        where,
        select: {
          id: true,
          orderId: true,
          status: true,
          subtotal: true,
          discountAmount: true,
          shippingCost: true,
          shippingSubsidy: true,
          createdAt: true,
          store: { select: { id: true, name: true, slug: true } },
          order: {
            select: {
              orderNumber: true,
              shippingName: true,
              guestEmail: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [primaryOrder, { createdAt: 'desc' }],
      }),
      this.prisma.storeOrder.count({ where }),
    ]);

    return paginatedResponse(rows.map((row) => {
      const quotedShippingCost = Number(row.shippingCost);
      const platformSubsidy = Number(row.shippingSubsidy);
      const merchandiseSubtotal = Math.max(0, Number(row.subtotal) - Number(row.discountAmount));
      const accountName = [row.order.user?.firstName, row.order.user?.lastName]
        .filter(Boolean)
        .join(' ');

      return {
        storeOrderId: row.id,
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        storeId: row.store.id,
        storeName: row.store.name,
        storeSlug: row.store.slug,
        buyerName: row.order.shippingName || accountName || 'Guest',
        buyerEmail: row.order.guestEmail || row.order.user?.email || null,
        orderStatus: row.status,
        fundingStatus: REALIZED_SHIPPING_STATUSES.includes(row.status) ? 'REALIZED' : 'PENDING',
        orderedAt: row.createdAt,
        merchandiseSubtotal,
        quotedShippingCost,
        platformSubsidy,
        buyerShippingPaid: Math.max(0, quotedShippingCost - platformSubsidy),
        buyerStoreTotal: merchandiseSubtotal + Math.max(0, quotedShippingCost - platformSubsidy),
      };
    }), page, limit, total);
  }

  private shippingSupportSince(days: number): Date {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - Math.max(0, days - 1));
    return since;
  }

  async adminPayoutStats(storeId?: string) {
    const where: Prisma.SellerPayoutWhereInput = storeId ? { storeId } : {};
    const [pending, processing, paid, totalPaidAmount] = await Promise.all([
      this.prisma.sellerPayout.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.sellerPayout.count({ where: { ...where, status: 'PROCESSING' } }),
      this.prisma.sellerPayout.count({ where: { ...where, status: 'PAID' } }),
      this.prisma.sellerPayout.aggregate({ where: { ...where, status: 'PAID' }, _sum: { amount: true } }),
    ]);
    return { pending, processing, paid, totalPaidAmount: Number(totalPaidAmount._sum.amount ?? 0) };
  }

  async adminGetStoreProducts(storeId: string, query: { page: number; limit: number }) {
    const { page, limit } = query;
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        select: { id: true, name: true, slug: true, status: true, basePrice: true, soldCount: true, createdAt: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where: { storeId, deletedAt: null } }),
    ]);
    return { data: products, total, page, totalPages: Math.ceil(total / limit) };
  }

  async adminGetStoreOrders(storeId: string, query: { page: number; limit: number }) {
    const { page, limit } = query;
    const [orders, total] = await Promise.all([
      this.prisma.storeOrder.findMany({
        where: { storeId },
        include: { order: { select: { id: true, createdAt: true, total: true, status: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.storeOrder.count({ where: { storeId } }),
    ]);
    return { data: orders, total, page, totalPages: Math.ceil(total / limit) };
  }

  // ─── Admin: Update store profile (name, description, urls) ──────────────

  async adminUpdateStore(
    storeId: string,
    dto: {
      name?: string; description?: string; bannerUrl?: string; logoUrl?: string;
      tagline?: string; location?: string; colorTheme?: string;
      announcement?: string; aboutHeadline?: string; aboutVideoUrl?: string;
      aboutPhotoUrls?: string[]; ownerBio?: string; featuredProductIds?: string[];
      featuredLayout?: string;
      socialLinks?: { platform: string; url: string }[];
    },
  ) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store not found');

    // Ezihubb Plus gate — colorTheme, and featuredLayout ONLY when set to
    // 'mixed'. Everything else on this DTO (featuredProductIds, tagline,
    // announcement, about*, socialLinks …) is FREE; do not extend the gate to
    // another field without confirming scope first — see docs/etsy-ui-audit.md.
    if (dto.colorTheme !== undefined) {
      const allowed = await this.entitlements.canUseFeature(storeId, PlusFeature.SHOP_COLOR_THEME);
      if (!allowed) {
        throw new ForbiddenException({
          code:    'ERR_PLUS_REQUIRED',
          message: 'This feature requires Ezihubb Plus.',
        });
      }
    }

    // Only the 'mixed' layout is paid — switching BACK to 'grid' must always
    // be allowed, including for a store whose Plus has lapsed, or it would be
    // trapped on a layout it can no longer edit.
    if (dto.featuredLayout === 'mixed') {
      const allowed = await this.entitlements.canUseFeature(storeId, PlusFeature.SHOP_FEATURED_MIXED_GRID);
      if (!allowed) {
        throw new ForbiddenException({
          code:    'ERR_PLUS_REQUIRED',
          message: 'The mixed grid layout requires Ezihubb Plus.',
        });
      }
    }

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data:  {
        name:        dto.name        ?? undefined,
        description: dto.description ?? undefined,
        bannerUrl:   dto.bannerUrl   ?? undefined,
        logoUrl:     dto.logoUrl     ?? undefined,
        tagline:            dto.tagline            ?? undefined,
        location:           dto.location           ?? undefined,
        colorTheme:         dto.colorTheme          ?? undefined,
        aboutHeadline:      dto.aboutHeadline       ?? undefined,
        aboutVideoUrl:      dto.aboutVideoUrl       ?? undefined,
        aboutPhotoUrls:     dto.aboutPhotoUrls      ?? undefined,
        ownerBio:           dto.ownerBio            ?? undefined,
        featuredProductIds: dto.featuredProductIds  ?? undefined,
        featuredLayout:     dto.featuredLayout      ?? undefined,
        socialLinks:        dto.socialLinks         ?? undefined,
        ...(dto.announcement !== undefined
          ? { announcement: dto.announcement, announcementUpdatedAt: new Date() }
          : {}),
      },
    });

    if (dto.bannerUrl) {
      this.moderationService?.queueStoreImageModeration(storeId, dto.bannerUrl, 'banner').catch((e) => this.logger.error('mod queue failed', e));
    }
    if (dto.logoUrl) {
      this.moderationService?.queueStoreImageModeration(storeId, dto.logoUrl, 'logo').catch((e) => this.logger.error('mod queue failed', e));
    }

    return updated;
  }

  // ─── Admin: Shop Home FAQ (Etsy: Shop Manager → edit your storefront) ────

  async adminCreateFaq(storeId: string, question: string, answer: string) {
    const maxOrder = await this.prisma.storeFaq.aggregate({
      where: { storeId },
      _max:  { sortOrder: true },
    });
    return this.prisma.storeFaq.create({
      data: { storeId, question, answer, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });
  }

  async adminUpdateFaq(storeId: string, faqId: string, dto: { question?: string; answer?: string }) {
    const faq = await this.prisma.storeFaq.findUnique({ where: { id: faqId } });
    if (!faq || faq.storeId !== storeId) throw new NotFoundException('FAQ not found');
    return this.prisma.storeFaq.update({
      where: { id: faqId },
      data:  { question: dto.question ?? undefined, answer: dto.answer ?? undefined },
    });
  }

  async adminDeleteFaq(storeId: string, faqId: string) {
    const faq = await this.prisma.storeFaq.findUnique({ where: { id: faqId } });
    if (!faq || faq.storeId !== storeId) throw new NotFoundException('FAQ not found');
    await this.prisma.storeFaq.delete({ where: { id: faqId } });
  }

  async adminReorderFaqs(storeId: string, orderedIds: string[]) {
    const owned = await this.prisma.storeFaq.findMany({ where: { storeId, id: { in: orderedIds } }, select: { id: true } });
    const ownedIds = new Set(owned.map((f) => f.id));
    await this.prisma.$transaction(
      orderedIds
        .filter((id) => ownedIds.has(id))
        .map((id, index) => this.prisma.storeFaq.update({ where: { id }, data: { sortOrder: index } })),
    );
  }

  async adminUploadStoreBanner(storeId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'ERR_FILE_REQUIRED', message: 'Banner file is required' });
    if (file.size > STORE_BANNER_MAX_BYTES) {
      throw new BadRequestException({
        code: 'ERR_FILE_TOO_LARGE',
        message: 'Banner must be smaller than 10 MB',
      });
    }
    if (!STORE_BANNER_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'ERR_FILE_TYPE_INVALID',
        message: 'Banner must be a JPEG, PNG or WebP image',
      });
    }

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store not found');

    // Shop banners are rendered at 4:1 and never need their full camera/export
    // resolution. Normalising before the second network hop (API -> R2/S3)
    // avoids making the browser wait while a multi-megabyte PNG is uploaded a
    // second time, while `fit: inside` preserves the seller's chosen crop.
    let buffer: Buffer;
    try {
      buffer = await sharp(file.buffer)
        .rotate()
        .resize(STORE_BANNER_MAX_WIDTH, STORE_BANNER_MAX_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 86 })
        .toBuffer();
    } catch {
      throw new BadRequestException({
        code: 'ERR_FILE_INVALID',
        message: 'Banner image could not be read',
      });
    }
    const webpName = file.originalname.replace(/\.[^.]+$/, '') + '.webp';
    const key = this.storageService.generateKey(`stores/${storeId}`, webpName);
    const url = await this.storageService.uploadFile(buffer, key, 'image/webp');

    await this.prisma.store.update({
      where: { id: storeId },
      data:  { bannerUrl: url },
    });

    this.moderationService?.queueStoreImageModeration(storeId, url, 'banner').catch((e) => this.logger.error('mod queue failed', e));

    // The editor only needs the canonical URL. Returning the full raw Store
    // record made it tempting for callers to replace a richer cached store
    // (owner, FAQs, counts) with an incomplete object.
    return { bannerUrl: url };
  }

  async adminUploadStoreLogo(storeId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'ERR_FILE_REQUIRED', message: 'Logo file is required' });

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store not found');

    const key = this.storageService.generateKey(`stores/${storeId}`, file.originalname);
    const url = await this.storageService.uploadFile(file.buffer, key, file.mimetype);

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data:  { logoUrl: url },
    });

    this.moderationService?.queueStoreImageModeration(storeId, url, 'logo').catch((e) => this.logger.error('mod queue failed', e));

    return { logoUrl: url, store: updated };
  }

  // ─── Public: Store Reviews ────────────────────────────────────────────────

  async getStoreReviewsSummary(slug: string) {
    const store = await this.prisma.store.findUnique({
      where:  { slug },
      select: { id: true, status: true },
    });
    if (!store || store.status === 'PENDING' || store.status === 'REJECTED') {
      throw new NotFoundException('Store not found');
    }

    const ratings = await this.prisma.review.findMany({
      where:  { product: { storeId: store.id }, status: 'APPROVED' },
      select: { rating: true },
    });

    const totalReviews = ratings.length;
    if (totalReviews === 0) {
      return { averageRating: 0, totalReviews: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    }

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of ratings) {
      distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
      sum += r.rating;
    }

    return {
      averageRating: parseFloat((sum / totalReviews).toFixed(1)),
      totalReviews,
      distribution,
    };
  }

  async getStoreReviews(slug: string, page: number, limit: number) {
    const store = await this.prisma.store.findUnique({
      where:  { slug },
      select: { id: true, status: true },
    });
    if (!store || store.status === 'PENDING' || store.status === 'REJECTED') {
      throw new NotFoundException('Store not found');
    }

    const skip = (page - 1) * limit;

    const [reviews, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { product: { storeId: store.id }, status: 'APPROVED' },
        select: {
          id:          true,
          rating:      true,
          title:       true,
          body:        true,
          imageUrls:   true,
          createdAt:   true,
          sellerReply: true,
          user: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          product: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({
        where: { product: { storeId: store.id }, status: 'APPROVED' },
      }),
    ]);

    const mapped = reviews.map((r) => ({
      id:          r.id,
      rating:      r.rating,
      title:       r.title,
      body:        r.body,
      imageUrls:   r.imageUrls,
      createdAt:   r.createdAt,
      sellerReply: r.sellerReply,
      author: r.user
        ? { id: r.user.id, firstName: r.user.firstName, lastName: r.user.lastName, avatarUrl: r.user.avatarUrl }
        : { id: '', firstName: 'Customer', lastName: null, avatarUrl: null },
      product: r.product,
    }));

    return paginatedResponse(mapped, page, limit, total);
  }
}
