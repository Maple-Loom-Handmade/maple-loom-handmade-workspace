import { StoresService } from './stores.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EntitlementsService } from '../subscriptions/entitlements.service';
import {
  ShippingSupportSort,
  ShippingSupportStatus,
} from './dto/shipping-support-query.dto';

function makePrismaMock() {
  return {
    store: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    product: {
      count: jest.fn(),
    },
    platformSettings: {
      upsert: jest.fn(),
    },
    storeOrder: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
}

describe('StoresService.adminGetStore — Decimal response normalization', () => {
  it('returns numeric rating and revenue values for admin clients', async () => {
    const prisma = makePrismaMock();
    prisma.store.findUnique.mockResolvedValue({
      id: 'store_1',
      ownerId: 'owner_1',
      rating: '4.75',
      totalRevenue: '123.45',
      _count: { followers: 2 },
    });
    prisma.product.count.mockResolvedValue(3);
    const service = makeService(prisma, jest.fn());

    const result = await service.adminGetStore('store_1');

    expect(result).toEqual(expect.objectContaining({
      rating: 4.75,
      totalRevenue: 123.45,
      totalProducts: 3,
      followerCount: 2,
    }));
  });
});

function makeService(prisma: ReturnType<typeof makePrismaMock>, canUseFeature: jest.Mock) {
  return new StoresService(
    prisma as unknown as PrismaService,
    {} as ConstructorParameters<typeof StoresService>[1], // emailQueue
    {} as ConstructorParameters<typeof StoresService>[2], // storageService
    {} as ConstructorParameters<typeof StoresService>[3], // redis
    {} as ConstructorParameters<typeof StoresService>[4], // analyticsService
    { canUseFeature } as unknown as EntitlementsService,
    undefined, // moderationService — optional, unused unless bannerUrl/logoUrl is set
  );
}

describe('StoresService.adminUploadStoreBanner — validation', () => {
  it('rejects files larger than 10 MB before loading them into image processing', async () => {
    const service = makeService(makePrismaMock(), jest.fn());
    const file = {
      size: 10 * 1024 * 1024 + 1,
      mimetype: 'image/png',
    } as Express.Multer.File;

    await expect(service.adminUploadStoreBanner('store_1', file)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.adminUploadStoreBanner('store_1', file)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_FILE_TOO_LARGE' }),
    });
  });

  it('rejects image formats that the storefront cannot render consistently', async () => {
    const service = makeService(makePrismaMock(), jest.fn());
    const file = {
      size: 1024,
      mimetype: 'image/svg+xml',
    } as Express.Multer.File;

    await expect(service.adminUploadStoreBanner('store_1', file)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_FILE_TYPE_INVALID' }),
    });
  });
});

describe('StoresService.adminUpdateStore — Plus gate on colorTheme', () => {
  it('rejects with 403 ERR_PLUS_REQUIRED when setting colorTheme without an active Plus subscription', async () => {
    const prisma = makePrismaMock();
    prisma.store.findUnique.mockResolvedValue({ id: 'store_1' });
    const canUseFeature = jest.fn().mockResolvedValue(false);
    const service = makeService(prisma, canUseFeature);

    await expect(service.adminUpdateStore('store_1', { colorTheme: 'burgundy' })).rejects.toThrow(ForbiddenException);
    await expect(service.adminUpdateStore('store_1', { colorTheme: 'burgundy' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_PLUS_REQUIRED' }),
    });
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('allows setting colorTheme when the store has an active Plus subscription', async () => {
    const prisma = makePrismaMock();
    prisma.store.findUnique.mockResolvedValue({ id: 'store_1' });
    prisma.store.update.mockResolvedValue({ id: 'store_1', colorTheme: 'burgundy' });
    const canUseFeature = jest.fn().mockResolvedValue(true);
    const service = makeService(prisma, canUseFeature);

    await service.adminUpdateStore('store_1', { colorTheme: 'burgundy' });

    expect(prisma.store.update).toHaveBeenCalled();
  });

  it('does NOT call the entitlement check at all when colorTheme is not part of the update (other fields untouched)', async () => {
    const prisma = makePrismaMock();
    prisma.store.findUnique.mockResolvedValue({ id: 'store_1' });
    prisma.store.update.mockResolvedValue({ id: 'store_1' });
    const canUseFeature = jest.fn();
    const service = makeService(prisma, canUseFeature);

    await service.adminUpdateStore('store_1', { tagline: 'hello' });

    expect(canUseFeature).not.toHaveBeenCalled();
    expect(prisma.store.update).toHaveBeenCalled();
  });
});

describe('StoresService.getStoreBySlug — Plus gate on colorTheme only, featuredProductIds always free', () => {
  it('selects the public Shop Home customizations without exposing owner credentials', async () => {
    const prisma = makePrismaMock();
    (prisma.store as any).findUnique.mockResolvedValue({
      id: 'store_1', slug: 'my-shop', name: 'My Shop', description: null,
      logoUrl: null, bannerUrl: null, status: 'ACTIVE',
      totalOrders: 0, rating: 0, createdAt: new Date(), verifiedAt: null,
      shareSaveEnabled: false, colorTheme: null, featuredProductIds: [],
      subscription: null,
      _count: { products: 0, followers: 0 },
    });
    const service = makeService(prisma, jest.fn());

    await service.getStoreBySlug('my-shop');

    const select = (prisma.store as any).findUnique.mock.calls[0][0].select;
    expect(select).toEqual(expect.objectContaining({
      tagline: true,
      location: true,
      announcement: true,
      aboutHeadline: true,
      aboutVideoUrl: true,
      aboutPhotoUrls: true,
      ownerBio: true,
      socialLinks: true,
      faqs: expect.any(Object),
      owner: { select: { firstName: true, lastName: true, avatarUrl: true } },
    }));
    expect(select.owner.select).not.toHaveProperty('email');
    expect(select.owner.select).not.toHaveProperty('passwordHash');
  });

  it('nulls out colorTheme but returns featuredProductIds unchanged when the store has no Plus', async () => {
    const prisma = makePrismaMock();
    (prisma.store as any).findUnique.mockResolvedValue({
      id: 'store_1', slug: 'my-shop', name: 'My Shop', description: null,
      logoUrl: null, bannerUrl: null, status: 'ACTIVE',
      totalOrders: 0, rating: 0, createdAt: new Date(), verifiedAt: null,
      shareSaveEnabled: false,
      colorTheme: 'burgundy',
      featuredProductIds: ['p1', 'p2', 'p3'],
      subscription: null, // no Plus at all
      _count: { products: 3, followers: 0 },
    });
    const service = makeService(prisma, jest.fn());

    const result = await service.getStoreBySlug('my-shop');

    expect(result.colorTheme).toBeNull();
    expect(result.featuredProductIds).toEqual(['p1', 'p2', 'p3']); // NOT gated — the exact bug that was caught in review
  });

  it('preserves the free featured-area opt-out when the store has no Plus', async () => {
    const prisma = makePrismaMock();
    (prisma.store as any).findUnique.mockResolvedValue({
      id: 'store_1', slug: 'my-shop', name: 'My Shop', description: null,
      logoUrl: null, bannerUrl: null, status: 'ACTIVE',
      totalOrders: 0, rating: 0, createdAt: new Date(), verifiedAt: null,
      shareSaveEnabled: false,
      colorTheme: null,
      featuredProductIds: [],
      featuredLayout: 'none',
      subscription: null,
      _count: { products: 0, followers: 0 },
    });
    const service = makeService(prisma, jest.fn());

    const result = await service.getStoreBySlug('my-shop');

    expect(result.featuredLayout).toBe('none');
  });

  it('returns colorTheme unchanged when the store has an active Plus subscription', async () => {
    const prisma = makePrismaMock();
    (prisma.store as any).findUnique.mockResolvedValue({
      id: 'store_1', slug: 'my-shop', name: 'My Shop', description: null,
      logoUrl: null, bannerUrl: null, status: 'ACTIVE',
      totalOrders: 0, rating: 0, createdAt: new Date(), verifiedAt: null,
      shareSaveEnabled: false,
      colorTheme: 'burgundy',
      featuredProductIds: ['p1'],
      subscription: { status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01') },
      _count: { products: 1, followers: 0 },
    });
    const service = makeService(prisma, jest.fn());

    const result = await service.getStoreBySlug('my-shop');

    expect(result.colorTheme).toBe('burgundy');
    expect(result.featuredProductIds).toEqual(['p1']);
  });

  it('does not leak the raw `subscription` object in the response', async () => {
    const prisma = makePrismaMock();
    (prisma.store as any).findUnique.mockResolvedValue({
      id: 'store_1', slug: 'my-shop', name: 'My Shop', description: null,
      logoUrl: null, bannerUrl: null, status: 'ACTIVE',
      totalOrders: 0, rating: 0, createdAt: new Date(), verifiedAt: null,
      shareSaveEnabled: false,
      colorTheme: null,
      featuredProductIds: [],
      subscription: { status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01') },
      _count: { products: 0, followers: 0 },
    });
    const service = makeService(prisma, jest.fn());

    const result = await service.getStoreBySlug('my-shop');

    expect(result).not.toHaveProperty('subscription');
  });
});

describe('StoresService.updatePlatformSettings — plusMonthlyPrice / plusAnnualPrice reach Prisma untouched', () => {
  it('forwards and normalizes the platform free-shipping threshold', async () => {
    const prisma = makePrismaMock();
    prisma.platformSettings.upsert.mockResolvedValue({
      id: 'singleton',
      freeShippingThreshold: '125.50',
    });
    const service = makeService(prisma, jest.fn());

    const result = await service.updatePlatformSettings({ freeShippingThreshold: 125.5 });

    expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ freeShippingThreshold: 125.5 }),
      }),
    );
    expect(result.freeShippingThreshold).toBe(125.5);
  });

  it('forwards a new plusMonthlyPrice into the upsert update payload', async () => {
    const prisma = makePrismaMock();
    prisma.platformSettings.upsert.mockResolvedValue({ id: 'singleton', plusMonthlyPrice: 8 });
    const service = makeService(prisma, jest.fn());

    await service.updatePlatformSettings({ plusMonthlyPrice: 8 });

    expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'singleton' },
        update: expect.objectContaining({ plusMonthlyPrice: 8 }),
      }),
    );
  });

  it('forwards an explicit null plusAnnualPrice into the upsert update payload (clears it, not dropped)', async () => {
    const prisma = makePrismaMock();
    prisma.platformSettings.upsert.mockResolvedValue({ id: 'singleton', plusAnnualPrice: null });
    const service = makeService(prisma, jest.fn());

    await service.updatePlatformSettings({ plusAnnualPrice: null });

    expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ plusAnnualPrice: null }),
      }),
    );
  });

  it('forwards a new offsiteAdsFeeRate into the upsert update payload', async () => {
    const prisma = makePrismaMock();
    prisma.platformSettings.upsert.mockResolvedValue({ id: 'singleton', offsiteAdsFeeRate: 0.2 });
    const service = makeService(prisma, jest.fn());

    await service.updatePlatformSettings({ offsiteAdsFeeRate: 0.2 });

    expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ offsiteAdsFeeRate: 0.2 }),
      }),
    );
  });
});

describe('StoresService shipping support finance report', () => {
  it('separates committed, realized, and pending platform shipping support', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw
      .mockResolvedValueOnce([{
        committedSubsidy: 25,
        realizedSubsidy: 10,
        supportedOrders: 2,
        supportedShipments: 3,
        merchandiseSubtotal: 250,
      }])
      .mockResolvedValueOnce([{
        date: '2026-09-01', committed: 25, realized: 10, orders: 2,
      }])
      .mockResolvedValueOnce([{
        storeId: 'store_1', storeName: 'Shop One', subsidy: 25, orders: 2,
      }]);
    const service = makeService(prisma, jest.fn());

    const result = await service.getShippingSupportSummary(30);

    expect(result).toEqual(expect.objectContaining({
      committedSubsidy: 25,
      realizedSubsidy: 10,
      pendingSubsidy: 15,
      supportedOrders: 2,
      supportedShipments: 3,
      averageSubsidyPerOrder: 12.5,
      subsidyToMerchandisePercent: 10,
    }));
  });

  it('returns an auditable parcel row and keeps pending status distinct', async () => {
    const prisma = makePrismaMock();
    prisma.storeOrder.findMany.mockResolvedValue([{
      id: 'so_1',
      orderId: 'order_1',
      status: 'CONFIRMED',
      subtotal: '120.00',
      discountAmount: '20.00',
      shippingCost: '8.00',
      shippingSubsidy: '8.00',
      createdAt: new Date('2026-09-01T08:00:00Z'),
      store: { id: 'store_1', name: 'Shop One', slug: 'shop-one' },
      order: {
        orderNumber: 'EZH-123456',
        shippingName: 'Jane Buyer',
        guestEmail: 'jane@example.com',
        user: null,
      },
    }]);
    prisma.storeOrder.count.mockResolvedValue(1);
    const service = makeService(prisma, jest.fn());

    const result = await service.getShippingSupportOrders({
      days: 30,
      page: 1,
      limit: 20,
      status: ShippingSupportStatus.PENDING,
      sort: ShippingSupportSort.NEWEST,
    });

    expect(result.data[0]).toEqual(expect.objectContaining({
      orderNumber: 'EZH-123456',
      merchandiseSubtotal: 100,
      quotedShippingCost: 8,
      platformSubsidy: 8,
      buyerShippingPaid: 0,
      buyerStoreTotal: 100,
      fundingStatus: 'PENDING',
    }));
    expect(prisma.storeOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        shippingSubsidy: { gt: 0 },
        status: expect.objectContaining({ notIn: expect.arrayContaining(['CANCELLED', 'REFUNDED']) }),
      }),
    }));
  });
});
