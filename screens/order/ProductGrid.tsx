import React, { memo, useCallback, useState } from 'react';
import { View, FlatList, StyleSheet, ImageSourcePropType } from 'react-native';
import { spacing } from '../../utils/theme';
import { ProductCard } from './ProductCard';
import { ECommercePlatform } from '../../utils/platforms';
import VariantPicker from '../../components/VariantPicker';
import { UnifiedProductVariant, UnifiedProductOption } from '../../services/product/types';
import { useCurrency } from '../../hooks/useCurrency';

/**
 * Display-ready product interface
 * This is the format expected by ProductGrid, derived from UnifiedProduct
 */
export interface DisplayProduct {
  /** Unique app ID (platform-prefixed) */
  id: string;
  /** Original platform ID */
  platformId?: string;
  /** Product name/title */
  name: string;
  /** Price of default variant */
  price: number;
  /** Product image */
  image: ImageSourcePropType | null;
  /** Quantity in cart */
  quantity?: number;
  /** Category ID */
  categoryId?: string;
  /** Category name (productType) */
  categoryName?: string;
  /** SKU */
  sku?: string;
  /** Barcode */
  barcode?: string;
  /** Stock quantity */
  stock?: number;
  /** Whether this is from an ecommerce platform */
  isEcommerceProduct?: boolean;
  /** Variant ID */
  variantId?: string;
  /** Source platform */
  platform?: ECommercePlatform;
  /** Product description */
  description?: string;
  /** All variants — present when product has multiple variants */
  variants?: UnifiedProductVariant[];
  /** Product options (e.g. Size, Color) — present when product has variants */
  options?: UnifiedProductOption[];
  /** Offline: tax profile ID */
  taxProfileId?: string;
  /** Online: platform tax code/class */
  taxCode?: string;
}

interface ProductGridProps {
  products: DisplayProduct[];
  onAddToCart: (id: string, quantity: number, variantId?: string) => void;
  cartItems?: Record<string, number>;
  numColumns?: number;
  onLoadMore?: () => void;
}

const ProductGridInner: React.FC<ProductGridProps> = ({ products, onAddToCart, cartItems = {}, numColumns = 2, onLoadMore }) => {
  const currency = useCurrency();
  const [pickerProduct, setPickerProduct] = useState<DisplayProduct | null>(null);

  const cardWidthPercent = Math.floor(100 / numColumns) - 2;

  const handleCardPress = useCallback(
    (id: string, quantity: number) => {
      const product = products.find(p => p.id === id);
      // Open variant picker for multi-variant products
      if (product && product.variants && product.variants.length > 1) {
        setPickerProduct(product);
        return;
      }
      onAddToCart(id, quantity);
    },
    [products, onAddToCart]
  );

  const handleVariantSelect = useCallback(
    (variant: UnifiedProductVariant) => {
      if (!pickerProduct) return;
      onAddToCart(pickerProduct.id, 1, variant.id);
      setPickerProduct(null);
    },
    [pickerProduct, onAddToCart]
  );

  const renderItem = useCallback(
    ({ item }: { item: DisplayProduct }) => (
      <ProductCard
        id={item.id}
        name={item.name}
        price={item.price}
        image={item.image}
        stock={item.stock}
        onAddToCart={handleCardPress}
        inCart={!!cartItems[item.id]}
        initialQuantity={cartItems[item.id] || 0}
        widthPercent={cardWidthPercent}
      />
    ),
    [handleCardPress, cartItems, cardWidthPercent]
  );

  const keyExtractor = useCallback((item: DisplayProduct) => item.id, []);

  return (
    <View style={styles.container}>
      <FlatList
        key={`grid-${numColumns}`}
        data={products}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={numColumns}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
      />

      {pickerProduct && pickerProduct.variants && (
        <VariantPicker
          visible={true}
          productTitle={pickerProduct.name}
          variants={pickerProduct.variants}
          options={pickerProduct.options ?? []}
          currencyCode={currency.code}
          onSelect={handleVariantSelect}
          onClose={() => setPickerProduct(null)}
        />
      )}
    </View>
  );
};

export const ProductGrid = memo(ProductGridInner);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xs,
  },
  row: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
