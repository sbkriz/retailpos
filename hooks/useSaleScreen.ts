/**
 * useSaleScreen
 *
 * Encapsulates all product-loading, search, category-filter, and barcode-scan
 * logic that previously lived directly in SaleScreen. The screen itself
 * becomes a pure layout/orchestration component.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useCategoryContext } from '../contexts/CategoryProvider';
import { useEcommerceSettings } from './useEcommerceSettings';
import { useProductsForDisplay } from './useProducts';
import { useResponsive, getProductColumns, getSidebarWidths } from './useResponsive';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { ProductServiceFactory } from '../services/product/ProductServiceFactory';
import { ECommercePlatform } from '../utils/platforms';
import type { MainTabParamList } from '../navigation/types';
import { useBasketState } from '../contexts/BasketStateProvider';
import { BasketProduct, useBasketActions } from '../contexts/BasketActionsProvider';

export function useSaleScreen() {
  const { selectedCategory, selectedCategoryName, setSelectedCategory, setSelectedCategoryName } = useCategoryContext();
  const { basketItems, basketItemsMap, itemCount } = useBasketState();
  const { addToBasket, updateQuantity } = useBasketActions();
  const { isTabletOrDesktop, width } = useResponsive();
  const [searchQuery, setSearchQuery] = useState('');

  const route = useRoute<RouteProp<MainTabParamList, 'Sale'>>();
  const handledScanRef = useRef<string | null>(null);

  const { currentPlatform } = useEcommerceSettings();
  const {
    products,
    isLoading: isProductLoading,
    loadMore,
  } = useProductsForDisplay(currentPlatform, selectedCategory, selectedCategoryName);

  const filteredProducts = searchQuery ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())) : products;

  const numColumns = getProductColumns(width);
  const sidebarWidths = getSidebarWidths(width);

  // Keyboard shortcut: Cmd+K to focus search (desktop)
  useKeyboardShortcuts([{ key: 'k', meta: true, handler: () => {}, description: 'Focus search' }], isTabletOrDesktop);

  // Auto-add product when arriving from a barcode scan
  useEffect(() => {
    const scannedId = route.params?.scannedProductId;
    if (!scannedId || scannedId === handledScanRef.current) return;
    handledScanRef.current = scannedId;

    const tryAdd = async () => {
      let product = products.find(p => p.id === scannedId);

      if (!product) {
        try {
          const service = ProductServiceFactory.getInstance().getService(currentPlatform || ECommercePlatform.OFFLINE);
          const result = await service?.getProducts({ ids: [scannedId], limit: 1 }).then(r => r.products[0]);
          if (result) {
            const { getDefaultVariant } = await import('../services/product/types');
            const { mapToUnifiedProducts } = await import('../services/product/mappers');
            const unified = mapToUnifiedProducts([result], currentPlatform || ECommercePlatform.OFFLINE);
            const u = unified[0];
            if (u) {
              const dv = getDefaultVariant(u);
              const img = u.images.find(i => i.isPrimary) || u.images[0];
              product = {
                id: u.id,
                platformId: u.platformId,
                name: u.title,
                price: dv?.price || 0,
                image: img?.url ? { uri: img.url } : null,
                categoryId: u.categoryIds[0] || u.productType || '',
                categoryName: u.productType,
                description: u.description,
                sku: dv?.sku,
                barcode: dv?.barcode,
                stock: dv?.inventoryQuantity || 0,
                isEcommerceProduct: u.platform !== ECommercePlatform.OFFLINE,
                variantId: dv?.id,
                platform: u.platform,
                variants: u.variants.length > 1 ? u.variants : undefined,
                options: u.options.length > 0 ? u.options : undefined,
                taxProfileId: u.taxProfileId,
                taxCode: u.taxCode ?? dv?.taxCode,
              };
            }
          }
        } catch {
          // fall through
        }
      }

      if (!product) return;

      const basketProduct: BasketProduct = {
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        isEcommerceProduct: product.isEcommerceProduct,
        variantId: product.variantId,
        sku: product.sku,
        platformId: product.platformId,
        platform: product.platform,
        taxProfileId: product.taxProfileId,
        taxCode: product.taxCode,
      };
      addToBasket(basketProduct, 1).catch(() => {});
    };

    tryAdd();
  }, [route.params?.scannedProductId, products, addToBasket, currentPlatform]);

  const handleAddToCart = useCallback(
    async (id: string, quantity: number, variantId?: string) => {
      const product = products.find(p => p.id === id);
      if (!product) return;

      const cartItem = basketItems.find(item => item.productId === id);

      if (quantity <= 0 && cartItem) {
        await updateQuantity(cartItem.id, 0);
      } else if (cartItem) {
        await updateQuantity(cartItem.id, quantity);
      } else if (quantity > 0) {
        const basketProduct: BasketProduct = {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          isEcommerceProduct: product.isEcommerceProduct,
          variantId: variantId ?? product.variantId,
          sku: product.sku,
          platformId: product.platformId,
          platform: product.platform,
          taxProfileId: product.taxProfileId,
          taxCode: product.taxCode,
        };
        await addToBasket(basketProduct, quantity);
      }
    },
    [products, basketItems, updateQuantity, addToBasket]
  );

  const clearCategoryFilter = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory(null);
    setSelectedCategoryName(null);
  }, [setSelectedCategory, setSelectedCategoryName]);

  return {
    // Platform
    currentPlatform,
    // Products
    products,
    filteredProducts,
    isProductLoading,
    loadMore,
    // Search
    searchQuery,
    setSearchQuery,
    // Category
    selectedCategory,
    selectedCategoryName,
    setSelectedCategory,
    setSelectedCategoryName,
    clearCategoryFilter,
    // Cart
    basketItemsMap,
    itemCount,
    handleAddToCart,
    // Layout
    isTabletOrDesktop,
    numColumns,
    sidebarWidths,
  };
}
