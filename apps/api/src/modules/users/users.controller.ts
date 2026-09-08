import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { NotificationPreferencesDto } from './dto/notification-preferences.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateWishlistShareDto } from './dto/update-wishlist-share.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { RegisterFcmTokenDto, UnregisterFcmTokenDto, UpdatePushPreferencesDto } from './dto/fcm-token.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { AddressResponseDto } from './dto/address-response.dto';
import { WishlistItemResponseDto } from './dto/wishlist-item-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResult } from '../../common/dto/paginated-response.dto';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { memoryStorage } from 'multer';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma:       PrismaService,
    private readonly auditLog:     AuditLogService,
  ) {}

  // ─── Profile ───────────────────────────────────────────────────────────────

  // GET /users/me
  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getProfile(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    return this.usersService.getProfile(user.sub);
  }

  // PATCH /users/me
  @Patch('me')
  @ApiOperation({ summary: 'Update own profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(user.sub, dto);
  }

  // GET /users/me/export
  @Get('me/export')
  @ApiOperation({ summary: 'Export all of your own account data (GDPR data portability)' })
  async exportOwnData(@CurrentUser() user: JwtPayload): Promise<Record<string, unknown>> {
    return this.usersService.exportOwnData(user.sub);
  }

  // DELETE /users/me
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your own account (GDPR right to erasure) — anonymizes PII, revokes all sessions' })
  async deleteAccount(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayload,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.usersService.deleteAccount(user.sub, dto.password);
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    this.auditLog.log({
      userId:     user.sub,
      action:     'DELETE_ACCOUNT',
      entityType: 'User',
      entityId:   user.sub,
      ip:         req.ip,
      userAgent:  req.headers['user-agent'],
    });
  }

  // POST /users/me/avatar
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { avatar: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload profile avatar (JPEG/PNG/WebP, max 5 MB)' })
  @ApiResponse({ status: 200, schema: { properties: { avatarUrl: { type: 'string' } } } })
  async uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    return this.usersService.uploadAvatar(user.sub, file);
  }

  // DELETE /users/me/avatar
  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove profile avatar' })
  async deleteAvatar(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.usersService.deleteAvatar(user.sub);
  }

  // ─── Addresses ─────────────────────────────────────────────────────────────

  // GET /users/me/addresses
  @Get('me/addresses')
  @ApiOperation({ summary: 'List all addresses' })
  @ApiResponse({ status: 200, type: [AddressResponseDto] })
  async getAddresses(@CurrentUser() user: JwtPayload): Promise<AddressResponseDto[]> {
    return this.usersService.getAddresses(user.sub);
  }

  // POST /users/me/addresses
  @Post('me/addresses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new address (max 10)' })
  @ApiResponse({ status: 201, type: AddressResponseDto })
  async createAddress(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.usersService.createAddress(user.sub, dto);
  }

  // PATCH /users/me/addresses/:id
  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Update an address' })
  @ApiResponse({ status: 200, type: AddressResponseDto })
  async updateAddress(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.usersService.updateAddress(user.sub, id, dto);
  }

  // DELETE /users/me/addresses/:id
  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an address' })
  async deleteAddress(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<void> {
    return this.usersService.deleteAddress(user.sub, id);
  }

  // PATCH /users/me/addresses/:id/default
  @Patch('me/addresses/:id/default')
  @ApiOperation({ summary: 'Set address as default' })
  @ApiResponse({ status: 200, type: AddressResponseDto })
  async setDefaultAddress(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<AddressResponseDto> {
    return this.usersService.setDefaultAddress(user.sub, id);
  }

  // ─── Customization History ─────────────────────────────────────────────────

  // GET /users/me/customization-history
  @Get('me/customization-history')
  @ApiOperation({ summary: 'Get past customization drafts for the current user' })
  async getCustomizationHistory(
    @CurrentUser() user: JwtPayload,
    @Query() pagination: PaginationDto,
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;
    const drafts = await this.prisma.customizationDraft.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        productId: true,
        templateId: true,
        previewUrl: true,
        createdAt: true,
      },
    });
    return { data: drafts, page, limit };
  }

  // ─── Wishlist ──────────────────────────────────────────────────────────────

  // GET /users/me/wishlist
  @Get('me/wishlist')
  @ApiOperation({ summary: 'Get wishlist (paginated)' })
  async getWishlist(
    @CurrentUser() user: JwtPayload,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResult<WishlistItemResponseDto>> {
    return this.usersService.getWishlist(user.sub, pagination);
  }

  // ─── Wishlist Sharing — static routes MUST precede dynamic /:productId ───────

  // GET /users/me/wishlist/share
  @Get('me/wishlist/share')
  @ApiOperation({ summary: 'Get current wishlist sharing status' })
  async getWishlistShareStatus(@CurrentUser() user: JwtPayload) {
    return this.usersService.getWishlistShareStatus(user.sub);
  }

  // POST /users/me/wishlist/share
  @Post('me/wishlist/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable wishlist sharing (generates share token)' })
  async shareWishlist(@CurrentUser() user: JwtPayload) {
    return this.usersService.shareWishlist(user.sub);
  }

  // PATCH /users/me/wishlist/share
  @Patch('me/wishlist/share')
  @ApiOperation({ summary: 'Update shared wishlist name or visibility' })
  async updateWishlistShare(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateWishlistShareDto,
  ) {
    return this.usersService.updateWishlistShare(user.sub, dto);
  }

  // DELETE /users/me/wishlist/share
  @Delete('me/wishlist/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke wishlist sharing link' })
  async revokeWishlistShare(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.usersService.revokeWishlistShare(user.sub);
  }

  // POST /users/me/wishlist/:productId
  @Post('me/wishlist/:productId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add product to wishlist' })
  async addToWishlist(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseCuidPipe) productId: string,
  ): Promise<{ id: string }> {
    return this.usersService.addToWishlist(user.sub, productId);
  }

  // DELETE /users/me/wishlist/:productId
  @Delete('me/wishlist/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove product from wishlist' })
  async removeFromWishlist(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseCuidPipe) productId: string,
  ): Promise<void> {
    return this.usersService.removeFromWishlist(user.sub, productId);
  }

  // GET /users/me/wishlist/:productId
  @Get('me/wishlist/:productId')
  @ApiOperation({ summary: 'Check if product is in wishlist' })
  async isInWishlist(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseCuidPipe) productId: string,
  ): Promise<{ inWishlist: boolean }> {
    return this.usersService.isInWishlist(user.sub, productId);
  }

  // ─── Push Notifications ────────────────────────────────────────────────────

  // POST /users/me/fcm-token
  @Post('me/fcm-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register a device FCM token' })
  async registerFcmToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterFcmTokenDto,
  ): Promise<{ registered: boolean }> {
    await this.prisma.fcmToken.upsert({
      where:  { token: dto.token },
      create: { userId: user.sub, token: dto.token, platform: dto.platform ?? 'web' },
      update: { lastSeen: new Date(), userId: user.sub },
    });

    // Enforce max 5 tokens per user — remove oldest beyond the cap
    const tokens = await this.prisma.fcmToken.findMany({
      where:   { userId: user.sub },
      orderBy: { lastSeen: 'desc' },
      select:  { id: true },
    });
    if (tokens.length > 5) {
      const staleIds = tokens.slice(5).map((t) => t.id);
      await this.prisma.fcmToken.deleteMany({ where: { id: { in: staleIds } } });
    }

    return { registered: true };
  }

  // DELETE /users/me/fcm-token
  @Delete('me/fcm-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unregister a device FCM token (on logout)' })
  async unregisterFcmToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UnregisterFcmTokenDto,
  ): Promise<{ unregistered: boolean }> {
    await this.prisma.fcmToken.deleteMany({
      where: { token: dto.token, userId: user.sub },
    });
    return { unregistered: true };
  }

  // PATCH /users/me/push-preferences
  @Get('me/notification-preferences')
  async notificationPreferences(@CurrentUser() user: JwtPayload) {
    return this.usersService.getNotificationPreferences(user.sub);
  }

  @Patch('me/notification-preferences')
  async saveNotificationPreferences(@CurrentUser() user: JwtPayload, @Body() dto: NotificationPreferencesDto) {
    return this.usersService.saveNotificationPreferences(user.sub, dto);
  }

  @Patch('me/push-preferences')
  @ApiOperation({ summary: 'Update push notification preference' })
  async updatePushPreferences(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePushPreferencesDto,
  ): Promise<{ updated: boolean }> {
    await this.prisma.user.update({
      where: { id: user.sub },
      data:  { pushEnabled: dto.pushEnabled },
    });
    return { updated: true };
  }
}

// ── Public wishlist by share token ────────────────────────────────────────────

@ApiTags('Wishlist')
@Controller('wishlist')
export class WishlistPublicController {
  constructor(private readonly usersService: UsersService) {}

  // GET /wishlist/:token
  @Get(':token')
  @Public()
  @ApiOperation({ summary: 'Get a publicly shared wishlist by token' })
  async getPublicWishlist(@Param('token') token: string) {
    return this.usersService.getPublicWishlist(token);
  }
}
