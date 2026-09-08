export type UserRole = 'CUSTOMER' | 'ADMIN' | 'SUPER_ADMIN';

export interface UserDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  phone?: string;
  role: UserRole;
  isEmailVerified: boolean;
  /** False for accounts that signed up/in via Google and never set a password. */
  hasPassword?: boolean;
  // backward compat
  /** @deprecated use isEmailVerified */
  emailVerified?: boolean;
  displayName?: string;
  isActive?: boolean;
}

export interface AddressDto {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  // backward compat — old shape had flat firstName/lastName/label
  label?: string;
  firstName: string;
  lastName: string;
  userId?: string;
}

export interface WishlistItemDto {
  id: string;
  productId: string;
  addedAt: string;
  product: {
    id: string;
    name: string;
    slug: string;
    basePrice: number;
    imageUrl?: string;
    isActive: boolean;
  };
}
export interface NotificationPreferences {
  pushEnabled: boolean;
  emailMessages: boolean;
  emailReviewReminders: boolean;
  emailOffers: boolean;
}
