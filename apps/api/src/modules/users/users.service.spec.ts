import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../common/services/storage.service';
import type { RedisService } from '../../common/services/redis.service';
import type { TargetedOffersService } from '../marketing/targeted-offers.service';
import { UsersService } from './users.service';

function makePrismaMock() {
  return {
    product: {
      findUnique: jest.fn(),
    },
    wishlistItem: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
}

function makeService(prisma: ReturnType<typeof makePrismaMock>) {
  return new UsersService(
    prisma as unknown as PrismaService,
    {} as StorageService,
    {} as RedisService,
    { fireOffer: jest.fn() } as unknown as TargetedOffersService,
  );
}

describe('UsersService wishlist', () => {
  it('reads and saves notification preferences only for the authenticated account', async () => {
    const prisma = makePrismaMock();
    const preferences = { pushEnabled: false, emailMessages: true, emailReviewReminders: false, emailOffers: false };
    prisma.user.findUnique.mockResolvedValue(preferences);
    prisma.user.update.mockResolvedValue(preferences);
    const service = makeService(prisma);
    await expect(service.getNotificationPreferences('user-1')).resolves.toEqual(preferences);
    await expect(service.saveNotificationPreferences('user-1', preferences)).resolves.toEqual(preferences);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' }, data: preferences }));
  });
  it('treats adding an existing product as a successful idempotent operation', async () => {
    const prisma = makePrismaMock();
    prisma.product.findUnique.mockResolvedValue({ id: 'product-1', storeId: 'store-1' });
    prisma.wishlistItem.findUnique.mockResolvedValue({ id: 'wishlist-1' });
    const service = makeService(prisma);

    await expect(service.addToWishlist('user-1', 'product-1')).resolves.toEqual({ id: 'wishlist-1' });
    expect(prisma.wishlistItem.create).not.toHaveBeenCalled();
  });

  it('recovers when concurrent add requests race on the unique constraint', async () => {
    const prisma = makePrismaMock();
    prisma.product.findUnique.mockResolvedValue({ id: 'product-1', storeId: null });
    prisma.wishlistItem.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'wishlist-1' });
    prisma.wishlistItem.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    ));
    const service = makeService(prisma);

    await expect(service.addToWishlist('user-1', 'product-1')).resolves.toEqual({ id: 'wishlist-1' });
  });

  it('includes product availability in the paginated wishlist response', async () => {
    const prisma = makePrismaMock();
    prisma.wishlistItem.findMany.mockResolvedValue([{
      id: 'wishlist-1',
      productId: 'product-1',
      createdAt: new Date('2026-09-07T00:00:00.000Z'),
      product: {
        name: 'Personalized ornament',
        slug: 'personalized-ornament',
        basePrice: 24.99,
        isActive: false,
        images: [],
      },
    }]);
    prisma.wishlistItem.count.mockResolvedValue(1);
    const service = makeService(prisma);

    const result = await service.getWishlist('user-1', {
      page: 1,
      limit: 48,
      skip: 0,
    } as never);

    expect(result.data[0]).toEqual(expect.objectContaining({
      productId: 'product-1',
      productIsActive: false,
    }));
    expect(result.pagination.total).toBe(1);
  });
});
