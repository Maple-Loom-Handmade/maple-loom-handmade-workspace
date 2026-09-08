import { IsBoolean } from 'class-validator';

export class NotificationPreferencesDto {
  @IsBoolean() pushEnabled!: boolean;
  @IsBoolean() emailMessages!: boolean;
  @IsBoolean() emailReviewReminders!: boolean;
  @IsBoolean() emailOffers!: boolean;
}
