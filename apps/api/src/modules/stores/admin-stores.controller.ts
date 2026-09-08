import {
  Get, Post, Patch, Delete, Body, Param, Query, Req,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsOptional, IsString, IsUrl, MaxLength, IsArray, ArrayMaxSize, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminController } from '../../common/decorators/admin-controller.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, FEATURED_LAYOUTS, type FeaturedLayout } from '@ezihubb/constants';
import { STORE_BANNER_MAX_BYTES, StoresService } from './stores.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { StoreContextService } from '../../common/services/store-context.service';
import {
  ShippingSupportOrdersQueryDto,
  ShippingSupportSummaryQueryDto,
} from './dto/shipping-support-query.dto';

const SOCIAL_LINK_PLATFORMS = ['facebook', 'instagram', 'pinterest', 'twitter', 'youtube', 'tiktok', 'website'] as const;

class SocialLinkDto {
  @IsIn(SOCIAL_LINK_PLATFORMS)
  platform: typeof SOCIAL_LINK_PLATFORMS[number];

  @IsUrl()
  url: string;
}

class AdminUpdateStoreDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsUrl()
  bannerUrl?: string;

  @IsOptional() @IsUrl()
  logoUrl?: string;

  // ── Shop Home editor fields (Etsy: Shop Manager -> edit your storefront) ──
  @IsOptional() @IsString() @MaxLength(150)
  tagline?: string;

  @IsOptional() @IsString() @MaxLength(150)
  location?: string;

  @IsOptional() @IsString() @MaxLength(32)
  colorTheme?: string;

  // Restricted to the known layouts at the DTO layer, so an unknown value
  // can never reach the column (the DB stores plain TEXT). 'mixed' is
  // additionally Plus-gated in StoresService.adminUpdateStore.
  @IsOptional() @IsIn(FEATURED_LAYOUTS)
  featuredLayout?: FeaturedLayout;

  @IsOptional() @IsString() @MaxLength(2000)
  announcement?: string;

  @IsOptional() @IsString() @MaxLength(150)
  aboutHeadline?: string;

  @IsOptional() @IsUrl()
  aboutVideoUrl?: string;

  @IsOptional() @IsArray() @IsUrl({}, { each: true }) @ArrayMaxSize(5)
  aboutPhotoUrls?: string[];

  @IsOptional() @IsString() @MaxLength(2000)
  ownerBio?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(4)
  featuredProductIds?: string[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @ArrayMaxSize(5) @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];
}

class FaqDto {
  @IsString() @MaxLength(300)
  question: string;

  @IsString() @MaxLength(2000)
  answer: string;
}

// A real class, not `Partial<FaqDto>` — NestJS's ValidationPipe resolves which
// class-validator decorators to run from the parameter's reflected design-time
// type, and TypeScript's mapped types (`Partial<X>`) erase to `Object` in that
// reflection, which silently skips validation entirely (whitelist/length/type
// checks) rather than just making the fields optional as the syntax implies.
class UpdateFaqDto {
  @IsOptional() @IsString() @MaxLength(300)
  question?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  answer?: string;
}

class ReorderFaqsDto {
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(100)
  orderedIds: string[];
}

export class MarkPayoutPaidDto {
  paymentMethod: string;
  @IsOptional() @IsString() paymentDetail?: string;
  @IsOptional() @IsString() adminNotes?: string;
}
import {
  ApproveStoreDto, RejectStoreDto, SuspendStoreDto,
  AdminListStoresDto, UpdatePlatformSettingsDto,
} from './dto/admin-stores.dto';

@AdminController('stores')
export class AdminStoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly auditLog:      AuditLogService,
    private readonly storeContext:  StoreContextService,
  ) {}

  private logStoreDecision(req: any, id: string, action: string, dto?: Record<string, unknown>): void {
    this.auditLog.log({
      userId:     req.user.sub ?? req.user.id,
      action,
      entityType: 'Store',
      entityId:   id,
      after:      dto,
      ip:         req.ip,
      userAgent:  req.headers?.['user-agent'],
    });
  }

  @Get()
  listStores(@Query() dto: AdminListStoresDto, @Req() req: any) {
    const isShopOwner = req.user?.role === 'ADMIN';
    const scopedOwnerId = isShopOwner ? (req.user?.sub ?? req.user?.id) : undefined;
    return this.storesService.adminListStores(dto, scopedOwnerId);
  }

  @Get(':id')
  getStore(@Param('id') id: string, @Req() req: any) {
    const isShopOwner = req.user?.role === 'ADMIN';
    const scopedOwnerId = isShopOwner ? (req.user?.sub ?? req.user?.id) : undefined;
    return this.storesService.adminGetStore(id, scopedOwnerId);
  }

  // Moderation actions on another seller's store — SUPER_ADMIN-only (method
  // override narrows past @AdminController's ADMIN+SUPER_ADMIN class default;
  // RolesGuard's Reflector.getAllAndOverride checks method-level metadata
  // first, so this @Roles() fully replaces the class default for this route).
  @Post(':id/approve')
  @Roles(Role.SUPER_ADMIN)
  async approveStore(@Param('id') id: string, @Req() req: any, @Body() dto: ApproveStoreDto) {
    const result = await this.storesService.adminApproveStore(id, req.user.sub ?? req.user.id, dto);
    this.logStoreDecision(req, id, 'APPROVE', dto as unknown as Record<string, unknown>);
    return result;
  }

  @Post(':id/reject')
  @Roles(Role.SUPER_ADMIN)
  async rejectStore(@Param('id') id: string, @Req() req: any, @Body() dto: RejectStoreDto) {
    const result = await this.storesService.adminRejectStore(id, req.user.sub ?? req.user.id, dto);
    this.logStoreDecision(req, id, 'REJECT', dto as unknown as Record<string, unknown>);
    return result;
  }

  @Post(':id/suspend')
  @Roles(Role.SUPER_ADMIN)
  async suspendStore(@Param('id') id: string, @Req() req: any, @Body() dto: SuspendStoreDto) {
    const result = await this.storesService.adminSuspendStore(id, req.user.sub ?? req.user.id, dto);
    this.logStoreDecision(req, id, 'SUSPEND', dto as unknown as Record<string, unknown>);
    return result;
  }

  // These 5 methods are reachable by both ADMIN (own store) and SUPER_ADMIN
  // (any store, when platform-context) — assertOwnership() blocks an ADMIN
  // (or an in-store SUPER_ADMIN) from acting on any :id other than their own.
  @Patch(':id')
  async updateStore(@Param('id') id: string, @Req() req: Request, @Body() dto: AdminUpdateStoreDto) {
    const context = await this.storeContext.resolve(req);
    this.storeContext.assertOwnership(context, id);
    return this.storesService.adminUpdateStore(id, dto);
  }

  @Post(':id/banner')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: STORE_BANNER_MAX_BYTES },
  }))
  async uploadBanner(
    @Param('id') id: string,
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const context = await this.storeContext.resolve(req);
    this.storeContext.assertOwnership(context, id);
    if (!file) throw new BadRequestException({ code: 'ERR_FILE_REQUIRED', message: 'file is required' });
    return this.storesService.adminUploadStoreBanner(id, file);
  }

  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadLogo(
    @Param('id') id: string,
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const context = await this.storeContext.resolve(req);
    this.storeContext.assertOwnership(context, id);
    if (!file) throw new BadRequestException({ code: 'ERR_FILE_REQUIRED', message: 'file is required' });
    return this.storesService.adminUploadStoreLogo(id, file);
  }

  @Post(':id/faqs')
  async createFaq(@Param('id') id: string, @Req() req: Request, @Body() dto: FaqDto) {
    const context = await this.storeContext.resolve(req);
    this.storeContext.assertOwnership(context, id);
    return this.storesService.adminCreateFaq(id, dto.question, dto.answer);
  }

  @Patch(':id/faqs/:faqId')
  async updateFaq(
    @Param('id') id: string,
    @Param('faqId') faqId: string,
    @Req() req: Request,
    @Body() dto: UpdateFaqDto,
  ) {
    const context = await this.storeContext.resolve(req);
    this.storeContext.assertOwnership(context, id);
    return this.storesService.adminUpdateFaq(id, faqId, dto);
  }

  @Delete(':id/faqs/:faqId')
  async deleteFaq(@Param('id') id: string, @Param('faqId') faqId: string, @Req() req: Request) {
    const context = await this.storeContext.resolve(req);
    this.storeContext.assertOwnership(context, id);
    await this.storesService.adminDeleteFaq(id, faqId);
    return { success: true };
  }

  @Patch(':id/faqs-reorder')
  async reorderFaqs(@Param('id') id: string, @Req() req: Request, @Body() dto: ReorderFaqsDto) {
    const context = await this.storeContext.resolve(req);
    this.storeContext.assertOwnership(context, id);
    await this.storesService.adminReorderFaqs(id, dto.orderedIds);
    return { success: true };
  }

  @Get(':id/products')
  async getStoreProducts(
    @Param('id') id: string,
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const context = await this.storeContext.resolve(req);
    this.storeContext.assertOwnership(context, id);
    return this.storesService.adminGetStoreProducts(id, { page: page ? +page : 1, limit: limit ? +limit : 20 });
  }

  @Get(':id/orders')
  async getStoreOrders(
    @Param('id') id: string,
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const context = await this.storeContext.resolve(req);
    this.storeContext.assertOwnership(context, id);
    return this.storesService.adminGetStoreOrders(id, { page: page ? +page : 1, limit: limit ? +limit : 20 });
  }
}

// ─── Platform Settings sub-controller ────────────────────────────────────────

// Class-level override fully replaces @AdminController's default
// ADMIN+SUPER_ADMIN — every route here is SUPER_ADMIN only. These are
// platform-wide fee rates, payout thresholds, and the Ezihubb Plus list
// price — a shop owner has no legitimate reason to change any of them, and
// the frontend already blocks this route for ADMIN via route-categories.ts's
// PLATFORM_ONLY entry for /stores/settings; this closes the same hole at the
// API layer, which the frontend guard alone doesn't.
//
// @Roles MUST be listed BEFORE @AdminController in source — decorators on
// the same declaration apply bottom-to-top, and @AdminController(...)
// internally sets its own 'roles' metadata (ADMIN+SUPER_ADMIN). With the
// order reversed, that internal call runs last and silently overwrites this
// one — verified via Reflect.getMetadata; this file originally had the
// wrong order and the override never actually took effect. Caught by
// admin-stores-platform-settings.controller.spec.ts.
@Roles(Role.SUPER_ADMIN)
@AdminController('platform-settings')
export class AdminPlatformSettingsController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  getSettings() {
    return this.storesService.getPlatformSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
    return this.storesService.updatePlatformSettings(dto);
  }
}

// ─── Seller Payouts sub-controller ───────────────────────────────────────────

@AdminController('seller-payouts')
export class AdminSellerPayoutsController {
  constructor(
    private readonly storesService: StoresService,
    private readonly storeContext:  StoreContextService,
  ) {}

  @Get()
  async listPayouts(
    @Req() req: Request,
    @Query('page')   page?: string,
    @Query('limit')  limit?: string,
    @Query('status') status?: string,
  ) {
    const context = await this.storeContext.resolve(req);
    return this.storesService.adminListPayouts({
      page:   page  ? +page  : undefined,
      limit:  limit ? +limit : undefined,
      status,
      storeId: context.isPlatformContext ? undefined : context.storeId ?? undefined,
    });
  }

  @Get('stats')
  async getPayoutStats(@Req() req: Request) {
    const context = await this.storeContext.resolve(req);
    return this.storesService.adminPayoutStats(context.isPlatformContext ? undefined : context.storeId ?? undefined);
  }

  @Post(':id/pay')
  async markPaid(@Param('id') id: string, @Req() req: any, @Body() dto: MarkPayoutPaidDto) {
    const context = await this.storeContext.resolve(req);
    return this.storesService.adminMarkPayoutPaid(
      id,
      req.user.sub ?? req.user.id,
      dto,
      context.isPlatformContext ? undefined : context.storeId ?? undefined,
    );
  }
}

// ─── Finance Stats sub-controller ────────────────────────────────────────────

@AdminController('finance')
export class AdminFinanceController {
  constructor(
    private readonly storesService: StoresService,
    private readonly storeContext:  StoreContextService,
  ) {}

  @Get('stats')
  async getStats(@Req() req: Request) {
    const context = await this.storeContext.resolve(req);
    return this.storesService.getFinanceStats(context.isPlatformContext ? undefined : context.storeId ?? undefined);
  }

  @Get('chart')
  async getChart(@Req() req: Request, @Query('days') days?: string) {
    const context = await this.storeContext.resolve(req);
    return this.storesService.getFinanceChart(
      days ? +days : 30,
      context.isPlatformContext ? undefined : context.storeId ?? undefined,
    );
  }

  @Get('stores')
  async getStoreFinance(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const context = await this.storeContext.resolve(req);
    return this.storesService.getStoreFinanceList({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      storeId: context.isPlatformContext ? undefined : context.storeId ?? undefined,
    });
  }

  /** Platform-funded shipping is marketplace finance data, never seller data. */
  @Roles(Role.SUPER_ADMIN)
  @Get('shipping-support/summary')
  getShippingSupportSummary(@Query() query: ShippingSupportSummaryQueryDto) {
    return this.storesService.getShippingSupportSummary(query.days);
  }

  @Roles(Role.SUPER_ADMIN)
  @Get('shipping-support/orders')
  getShippingSupportOrders(@Query() query: ShippingSupportOrdersQueryDto) {
    return this.storesService.getShippingSupportOrders(query);
  }
}
