import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../common/services/storage.service';
import { RedisService } from '../../common/services/redis.service';
import { ModerationService } from '../moderation/moderation.service';
import { TargetedOffersService } from '../marketing/targeted-offers.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { NotificationPreferencesDto } from './dto/notification-preferences.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateWishlistShareDto } from './dto/update-wishlist-share.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { AddressResponseDto } from './dto/address-response.dto';
import { WishlistItemResponseDto } from './dto/wishlist-item-response.dto';
import { PaginatedResult, paginatedResponse } from '../../common/dto/paginated-response.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

const MAX_ADDRESSES = 10;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const AVATAR_ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
    private readonly targetedOffersService: TargetedOffersService,
    @Optional() private readonly moderationService?: ModerationService,
  ) {}

  // ─── Profile ───────────────────────────────────────────────────────────────

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'User not found' });
    return UserResponseDto.fromPrisma(user);
  }

  async getNotificationPreferences(userId: string) {
    const preferences = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushEnabled: true, emailMessages: true, emailReviewReminders: true, emailOffers: true },
    });
    if (!preferences) throw new NotFoundException('User not found');
    return preferences;
  }

  async saveNotificationPreferences(userId: string, dto: NotificationPreferencesDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        pushEnabled: dto.pushEnabled, emailMessages: dto.emailMessages,
        emailReviewReminders: dto.emailReviewReminders, emailOffers: dto.emailOffers,
      },
      select: { pushEnabled: true, emailMessages: true, emailReviewReminders: true, emailOffers: true },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
      },
    });
    return UserResponseDto.fromPrisma(user);
  }

  // ─── GDPR: data export ───────────────────────────────────────────────────────

  /** Everything the account holder itself has a right to see about their own data. */
  async exportOwnData(userId: string): Promise<Record<string, unknown>> {
    const [user, addresses, wishlistItems, orders, reviews] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.address.findMany({ where: { userId } }),
      this.prisma.wishlistItem.findMany({ where: { userId } }),
      this.prisma.order.findMany({
        where: { userId },
        select: {
          id: true, orderNumber: true, status: true, total: true, createdAt: true,
          shippingName: true, shippingAddress: true, shippingCity: true, shippingState: true,
          shippingZip: true, shippingCountry: true,
        },
      }),
      this.prisma.review.findMany({ where: { userId } }),
    ]);
    if (!user) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'User not found' });

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: user.role, isEmailVerified: user.isEmailVerified, provider: user.provider,
        createdAt: user.createdAt,
      },
      addresses,
      wishlistItems,
      orders,
      reviews,
    };
  }

  // ─── GDPR: account deletion (right to erasure) ────────────────────────────────
  // Soft-delete + anonymize PII rather than a hard delete: Order/Payment rows must
  // survive for accounting/tax retention obligations (a recognised GDPR erasure
  // exception), and Order stores its own shipping snapshot independent of User —
  // anonymizing User doesn't touch that historical record.

  async deleteAccount(userId: string, password?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'User not found' });
    }

    const ownedStore = await this.prisma.store.findUnique({ where: { ownerId: userId }, select: { id: true } });
    if (ownedStore) {
      throw new BadRequestException({
        code: 'ERR_OWNS_STORE',
        message: 'This account owns a store. Transfer or close the store before deleting your account — contact support for help.',
      });
    }

    if (user.passwordHash) {
      if (!password) {
        throw new BadRequestException({ code: 'ERR_PASSWORD_REQUIRED', message: 'Password confirmation is required to delete your account' });
      }
      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        throw new UnauthorizedException({ code: 'ERR_CREDENTIALS_INVALID', message: 'Password is incorrect' });
      }
    }

    const anonymizedEmail = `deleted-${userId}@deleted.ezihubb.invalid`;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          passwordHash: null,
          firstName: null,
          lastName: null,
          avatarUrl: null,
          providerId: null,
          totpSecret: null,
          totpEnabled: false,
          backupCodes: [],
          deletedAt: new Date(),
        },
      }),
      this.prisma.address.deleteMany({ where: { userId } }),
      this.prisma.wishlistItem.deleteMany({ where: { userId } }),
      this.prisma.cart.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    if (user.avatarUrl) {
      await this.storage.deleteFile(this.storage.extractKey(user.avatarUrl)).catch((err) =>
        this.logger.warn(`Failed to delete avatar on account deletion: ${err.message}`),
      );
    }
    await this.redis.del(`user:${userId}`);
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    if (!file) {
      throw new BadRequestException({
        code: 'ERR_MISSING_FILE',
        message: 'Avatar file is required — send it as the "avatar" field in a multipart/form-data request',
      });
    }

    if (!AVATAR_ALLOWED_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'ERR_INVALID_FILE_TYPE',
        message: 'Avatar must be a JPEG, PNG, or WebP image',
      });
    }

    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException({
        code: 'ERR_FILE_TOO_LARGE',
        message: 'Avatar must be smaller than 5 MB',
      });
    }

    // Delete old avatar if it exists
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (existing?.avatarUrl) {
      const oldKey = this.storage.extractKey(existing.avatarUrl);
      await this.storage.deleteFile(oldKey).catch((err) =>
        this.logger.warn(`Failed to delete old avatar: ${err.message}`),
      );
    }

    const key = this.storage.generateKey(`avatars/${userId}`, file.originalname);
    await this.storage.uploadFile(file.buffer, key, file.mimetype);
    const avatarUrl = this.storage.getPublicUrl(key);

    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    await this.redis.del(`user:${userId}`);

    this.moderationService?.queueUserAvatarModeration(userId, avatarUrl).catch((e) => this.logger.error('avatar mod queue failed', e));

    return { avatarUrl };
  }

  async deleteAvatar(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (user?.avatarUrl) {
      const key = this.storage.extractKey(user.avatarUrl);
      await this.storage.deleteFile(key).catch((err) =>
        this.logger.warn(`Failed to delete avatar from storage: ${err.message}`),
      );
    }

    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
  }

  // ─── Addresses ─────────────────────────────────────────────────────────────

  async getAddresses(userId: string): Promise<AddressResponseDto[]> {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return addresses.map(AddressResponseDto.fromPrisma);
  }

  async createAddress(userId: string, dto: CreateAddressDto): Promise<AddressResponseDto> {
    const count = await this.prisma.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) {
      throw new BadRequestException({
        code: 'ERR_ADDRESS_LIMIT',
        message: `Maximum of ${MAX_ADDRESSES} addresses allowed`,
      });
    }

    const isFirst = count === 0;
    const shouldBeDefault = dto.isDefault ?? isFirst;

    const address = await this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: {
          userId,
          fullName: dto.fullName,
          addressLine1: dto.line1,
          addressLine2: dto.line2 ?? null,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          country: dto.country,
          phone: dto.phone ?? '',
          isDefault: shouldBeDefault,
        },
      });
    });

    return AddressResponseDto.fromPrisma(address);
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto): Promise<AddressResponseDto> {
    await this.requireOwnAddress(userId, addressId);

    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({
        where: { id: addressId },
        data: {
          ...(dto.fullName !== undefined && { fullName: dto.fullName }),
          ...(dto.line1 !== undefined && { addressLine1: dto.line1 }),
          ...(dto.line2 !== undefined && { addressLine2: dto.line2 }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.state !== undefined && { state: dto.state }),
          ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
          ...(dto.country !== undefined && { country: dto.country }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        },
      });
    });

    return AddressResponseDto.fromPrisma(address);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    await this.requireOwnAddress(userId, addressId);
    await this.prisma.address.delete({ where: { id: addressId } });
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<AddressResponseDto> {
    await this.requireOwnAddress(userId, addressId);

    const address = await this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });

    return AddressResponseDto.fromPrisma(address);
  }

  // ─── Wishlist ──────────────────────────────────────────────────────────────

  async getWishlist(
    userId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<WishlistItemResponseDto>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.wishlistItem.findMany({
        where: { userId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              basePrice: true,
              isActive: true,
              images: { where: { isPrimary: true }, select: { url: true }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.wishlistItem.count({ where: { userId } }),
    ]);

    const data = items.map((item): WishlistItemResponseDto => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      productSlug: item.product.slug,
      productImageUrl: item.product.images[0]?.url ?? null,
      productBasePrice: Number(item.product.basePrice),
      productIsActive: item.product.isActive,
      addedAt: item.createdAt,
    }));

    return paginatedResponse<WishlistItemResponseDto>(data, pagination.page ?? 1, pagination.limit ?? 24, total);
  }

  async addToWishlist(userId: string, productId: string): Promise<{ id: string }> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, storeId: true } });
    if (!product) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Product not found' });
    }

    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (existing) {
      return { id: existing.id };
    }

    let item: { id: string };
    try {
      item = await this.prisma.wishlistItem.create({ data: { userId, productId } });
    } catch (error) {
      // Treat concurrent duplicate requests as the same successful, idempotent
      // operation. This also prevents a harmless double-click from surfacing as
      // a red 409 request in the browser console.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrentItem = await this.prisma.wishlistItem.findUnique({
          where: { userId_productId: { userId, productId } },
          select: { id: true },
        });
        if (concurrentItem) return concurrentItem;
      }
      throw error;
    }

    const storeId = product.storeId;
    if (storeId) {
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } })
        .then((user) => {
          if (!user) return;
          return this.targetedOffersService.fireOffer(storeId, 'FAVOURITED_ITEM', { id: userId, email: user.email, firstName: user.firstName });
        })
        .catch((err) => this.logger.warn(`Failed to fire FAVOURITED_ITEM targeted offer: ${(err as Error).message}`));
    }

    return { id: item.id };
  }

  async removeFromWishlist(userId: string, productId: string): Promise<void> {
    const item = await this.prisma.wishlistItem.findFirst({ where: { userId, productId } });
    if (!item) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Product not in wishlist' });
    }
    await this.prisma.wishlistItem.delete({ where: { id: item.id } });
  }

  async isInWishlist(userId: string, productId: string): Promise<{ inWishlist: boolean }> {
    const item = await this.prisma.wishlistItem.findFirst({ where: { userId, productId } });
    return { inWishlist: !!item };
  }

  // ─── Wishlist Sharing ──────────────────────────────────────────────────────

  async getWishlistShareStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { wishlistShareToken: true, wishlistIsPublic: true, wishlistName: true },
    });
    if (!user) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'User not found' });
    return {
      token:    user.wishlistShareToken,
      isPublic: user.wishlistIsPublic,
      name:     user.wishlistName,
    };
  }

  async shareWishlist(userId: string) {
    // Reuse existing token if already shared; generate new one otherwise
    const existing = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { wishlistShareToken: true },
    });
    const token = existing?.wishlistShareToken ?? randomBytes(16).toString('hex');

    const user = await this.prisma.user.update({
      where: { id: userId },
      data:  { wishlistShareToken: token, wishlistIsPublic: true },
      select: { wishlistShareToken: true, wishlistIsPublic: true, wishlistName: true },
    });
    return { token: user.wishlistShareToken!, isPublic: user.wishlistIsPublic, name: user.wishlistName };
  }

  async updateWishlistShare(userId: string, dto: UpdateWishlistShareDto) {
    const current = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { wishlistShareToken: true },
    });
    if (!current?.wishlistShareToken) {
      throw new BadRequestException({ code: 'ERR_WISHLIST_NOT_SHARED', message: 'Wishlist is not shared yet' });
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { wishlistName: dto.name ?? null }),
        ...(dto.isPublic !== undefined && { wishlistIsPublic: dto.isPublic }),
      },
      select: { wishlistShareToken: true, wishlistIsPublic: true, wishlistName: true },
    });
    return { token: user.wishlistShareToken!, isPublic: user.wishlistIsPublic, name: user.wishlistName };
  }

  async revokeWishlistShare(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data:  { wishlistShareToken: null, wishlistIsPublic: false, wishlistName: null },
    });
  }

  async getPublicWishlist(token: string): Promise<{ wishlistName: string | null; ownerName: string | null; items: WishlistItemResponseDto[] }> {
    const user = await this.prisma.user.findUnique({
      where:  { wishlistShareToken: token },
      select: { id: true, wishlistIsPublic: true, wishlistName: true, firstName: true },
    });

    // 404 for non-public or missing — prevent token enumeration
    if (!user || !user.wishlistIsPublic) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Wishlist not found' });
    }

    const items = await this.prisma.wishlistItem.findMany({
      where:   { userId: user.id },
      include: {
        product: {
          select: {
            id:        true,
            name:      true,
            slug:      true,
            basePrice: true,
            isActive:  true,
            images:    { where: { isPrimary: true }, select: { url: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const activeItems = items.filter((item) => item.product.isActive);

    return {
      wishlistName: user.wishlistName,
      ownerName:    user.firstName,
      items: activeItems.map((item): WishlistItemResponseDto => ({
        id:               item.id,
        productId:        item.productId,
        productName:      item.product.name,
        productSlug:      item.product.slug,
        productImageUrl:  item.product.images[0]?.url ?? null,
        productBasePrice: Number(item.product.basePrice),
        productIsActive:  true,
        addedAt:          item.createdAt,
      })),
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async requireOwnAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Address not found' });
    }
  }

}
