import type { ProductCategory } from '../entities/product.entity';

export interface OpenStorefrontCommand {
  providerId: string;
  name: string;
  description?: string | null;
}

export interface AddProductCommand {
  storefrontId: string;
  requestedBy: string; // must equal the storefront's providerId
  name: string;
  description?: string | null;
  priceAmount: number;
  priceCurrency: string;
  stockQuantity?: number | null;
  category: ProductCategory;
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
