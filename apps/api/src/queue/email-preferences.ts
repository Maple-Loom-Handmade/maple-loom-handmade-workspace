import type { NotificationPreferences } from '@ezihubb/types';

export function emailPreference(template: string, data: Record<string, unknown>): keyof NotificationPreferences | null {
  if (template === 'new-message' && !data['isForAdmin']) return 'emailMessages';
  if (template === 'review-reminder') return 'emailReviewReminders';
  if (template === 'abandoned-cart' || (template === 'targeted-offer' && data['isMarketing'] === true)) return 'emailOffers';
  // Order, security and responses to offers explicitly made by the buyer are essential.
  return null;
}
