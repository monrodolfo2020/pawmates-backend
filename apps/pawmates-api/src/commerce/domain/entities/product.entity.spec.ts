import { InsufficientStockError, Money, ValidationError } from '@pawmates/common';
import { Product } from './product.entity';

function makeProduct(stockQuantity: number | null): Product {
  return Product.list({
    storefrontId: 'storefront-1',
    name: 'Correa reflectante',
    price: Money.of(1500, 'USD'),
    stockQuantity,
    category: 'accessory',
  });
}

describe('Product aggregate', () => {
  it('starts active with a generated id', () => {
    const product = makeProduct(10);
    expect(product.isActive).toBe(true);
    expect(product.id).toBeTruthy();
  });

  it('decrements stock on reserveStock', () => {
    const product = makeProduct(3);
    product.reserveStock(2);
    expect(product.stockQuantity).toBe(1);
  });

  it('throws InsufficientStockError when the quantity exceeds stock', () => {
    const product = makeProduct(1);
    expect(() => product.reserveStock(2)).toThrow(InsufficientStockError);
    expect(product.stockQuantity).toBe(1); // unchanged on failure
  });

  it('treats stockQuantity: null as unlimited', () => {
    const product = makeProduct(null);
    expect(() => product.reserveStock(1000)).not.toThrow();
    expect(product.stockQuantity).toBeNull();
  });

  it('restock adds back a cancelled order line', () => {
    const product = makeProduct(5);
    product.reserveStock(3);
    product.restock(3);
    expect(product.stockQuantity).toBe(5);
  });

  it('updateDetails updates price via Money and leaves omitted fields untouched', () => {
    const product = makeProduct(5);
    product.updateDetails({ price: Money.of(2000, 'USD') });
    expect(product.price.equals(Money.of(2000, 'USD'))).toBe(true);
    expect(product.name).toBe('Correa reflectante');
  });

  it('defaults to an empty photo gallery (legacy/transitional state)', () => {
    const product = makeProduct(5);
    expect(product.photos).toEqual([]);
  });

  it('accepts a 3-6 photo gallery on list()', () => {
    const product = Product.list({
      storefrontId: 'storefront-1',
      name: 'Correa reflectante',
      price: Money.of(1500, 'USD'),
      stockQuantity: 5,
      category: 'accessory',
      photos: ['a', 'b', 'c'],
    });
    expect(product.photos).toEqual(['a', 'b', 'c']);
  });

  it('rejects a photo count outside 3-6 on list()', () => {
    expect(() =>
      Product.list({
        storefrontId: 'storefront-1',
        name: 'Correa reflectante',
        price: Money.of(1500, 'USD'),
        stockQuantity: 5,
        category: 'accessory',
        photos: ['a', 'b'],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects a photo count outside 3-6 on updateDetails()', () => {
    const product = makeProduct(5);
    expect(() =>
      product.updateDetails({ photos: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    ).toThrow(ValidationError);
  });

  it('updateDetails replaces the photo gallery when given a valid count', () => {
    const product = makeProduct(5);
    product.updateDetails({ photos: ['a', 'b', 'c'] });
    expect(product.photos).toEqual(['a', 'b', 'c']);
  });
});
