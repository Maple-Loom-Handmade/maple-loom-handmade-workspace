import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WishlistItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty() productName: string;
  @ApiProperty() productSlug: string;
  @ApiPropertyOptional() productImageUrl: string | null;
  @ApiProperty() productBasePrice: number;
  @ApiProperty() productIsActive: boolean;
  @ApiProperty() addedAt: Date;
}
