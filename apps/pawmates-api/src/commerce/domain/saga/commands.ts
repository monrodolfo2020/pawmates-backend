import type { ProductCategory } from '../entities/product.entity';

export interface OpenStorefrontCommand {
  // The admin creating the (one, singleton) store — not a shop owner
  // in any lasting sense, see Storefront's comment.
  providerId: string;
  name: string;
  description?: string | null;
}

export interface AddProductCommand {
  storefrontId: string;
  requestedBy: string; // an admin — checked by the controller's role guard, not here
  catalogItemId?: string | null;
  name: string;
  description?: string | null;
  priceAmount: number;
  priceCurrency: string;
  stockQuantity?: number | null;
  category: ProductCategory;
  photos: string[];
}

export interface PlaceOrderLineCommand {
  productId: string;
  quantity: number;
}

export interface PlaceOrderCommand {
  ownerId: string;
  storefrontId: string;
  paymentMethodId: string;
  idempotencyKey: string;
  lines: PlaceOrderLineCommand[];
}
