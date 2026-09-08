import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { JOBS, QUEUES, DEFAULT_JOB_OPTIONS } from '../../queue/queue.constants';
import { TargetedOfferTrigger, DiscountType } from '@prisma/client';

const SHOP_URL = process.env['CLIENT_URL'] ?? 'https://ezihubb.com';

export interface UpsertCampaignInput {
  trigger:          TargetedOfferTrigger;
  discountType:     DiscountType;
  discountValue:    number;
  expiresAfterDays: number;
  lookbackDays:     number;
  isActive:         boolean;
}

// Real default expiry windows confirmed from Etsy reference screenshots —
// each trigger has a different default, not a single generic value.
const DEFAULT_EXPIRES_AFTER_DAYS: Record<TargetedOfferTrigger, number> = {
  INTERESTED_SHOPPER: 7,
  THANK_YOU:           365,
  ABANDONED_BASKET:    60,
  FAVOURITED_ITEM:     60,
};

const TRIGGER_COPY: Record<TargetedOfferTrigger, { headline: string; message: string }> = {
  INTERESTED_SHOPPER: {
    headline: 'Still thinking it over?',
    message:  "We noticed you've been checking out our shop — here's a little something to help you decide.",
  },
  THANK_YOU: {
    headline: 'Thank you for your order!',
    message:  "As a thank you for shopping with us, here's a discount for your next order.",
  },
  ABANDONED_BASKET: {
    headline: 'You left something in your cart',
    message:  "Your cart is still waiting for you — here's a discount to complete your order.",
  },
  FAVOURITED_ITEM: {
    headline: 'You favourited an item!',
    message:  "Loved something in our shop? Here's a discount to make it yours.",
  },
};

@Injectable()
export class TargetedOffersService {
  private readonly logger = new Logger(TargetedOffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  // ── Admin CRUD ───────────────────────────────────────────────────────────────

  async listCampaigns(storeId: string) {
    const campaigns = await this.prisma.targetedOfferCampaign.findMany({ where: { storeId } });
    const byTrigger = new Map(campaigns.map((c) => [c.trigger, c]));
    return Object.values(TargetedOfferTrigger).map((trigger) => {
      const c = byTrigger.get(trigger);
      return c
        ? { ...c, discountValue: Number(c.discountValue) }
        : {
            id: null, storeId, trigger, discountType: 'PERCENTAGE' as DiscountType, discountValue: 10,
            expiresAfterDays: DEFAULT_EXPIRES_AFTER_DAYS[trigger], lookbackDays: 7, isActive: false,
          };
    });
  }

  async upsertCampaign(storeId: string, input: UpsertCampaignInput) {
    const campaign = await this.prisma.targetedOfferCampaign.upsert({
      where:  { storeId_trigger: { storeId, trigger: input.trigger } },
      create: { storeId, ...input },
      update: { ...input },
    });
    return { ...campaign, discountValue: Number(campaign.discountValue) };
  }

  // ── Firing ───────────────────────────────────────────────────────────────────

  /**
   * Creates a personalized single-use Promotion (maxUsesPerUser: 1, short
   * expiry, targetUserId set) and emails it — no-op if the store has no
   * active campaign for this trigger. `dedupKey` prevents re-firing the same
   * trigger for the same user/store combo within the campaign's lookback
   * window (checked via existing targeted Promotions rather than new state).
   */
  async fireOffer(
    storeId: string,
    trigger: TargetedOfferTrigger,
    user: { id: string; email: string; firstName?: string | null },
  ): Promise<void> {
    const campaign = await this.prisma.targetedOfferCampaign.findUnique({
      where: { storeId_trigger: { storeId, trigger } },
    });
    if (!campaign || !campaign.isActive) return;

    const lookbackCutoff = new Date(Date.now() - campaign.lookbackDays * 24 * 60 * 60 * 1000);
    const recent = await this.prisma.promotion.findFirst({
      where: { storeId, targetUserId: user.id, description: `targeted-offer:${trigger}`, createdAt: { gte: lookbackCutoff } },
    });
    if (recent) return; // already sent for this trigger within the window

    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { name: true, slug: true } });
    if (!store) return;

    const code = `SAVE-${randomBytes(4).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + campaign.expiresAfterDays * 24 * 60 * 60 * 1000);

    await this.prisma.promotion.create({
      data: {
        code,
        type:           campaign.discountType,
        value:          campaign.discountValue,
        maxUsesPerUser: 1,
        maxUses:        1,
        storeId,
        expiresAt,
        targetUserId:   user.id,
        description:    `targeted-offer:${trigger}`,
      },
    });

    const copy = TRIGGER_COPY[trigger];
    const discountLabel = campaign.discountType === 'PERCENTAGE'
      ? `${Number(campaign.discountValue)}%`
      : `$${Number(campaign.discountValue).toFixed(2)}`;

    this.emailQueue
      .add(JOBS.SEND_EMAIL, {
        to:       user.email,
        template: 'targeted-offer',
        subject:  `${copy.headline} — a gift from ${store.name}`,
        data: {
          isMarketing:   true,
          storeName:     store.name,
          firstName:     user.firstName ?? 'there',
          headline:      copy.headline,
          message:       copy.message,
          code,
          discountLabel,
          expiresAt:     expiresAt.toLocaleDateString(),
          shopUrl:       `${SHOP_URL}/shops/${store.slug}`,
          year:          new Date().getFullYear(),
        },
      }, DEFAULT_JOB_OPTIONS)
      .catch((err) => this.logger.warn(`Failed to queue targeted-offer email: ${(err as Error).message}`));
  }
}
