import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { lightColors, spacing, typography, borderRadius } from '../../utils/theme';
import { SwipeablePanel } from '../../components/SwipeablePanel';
import { useBasketContext, CartItem } from '../../contexts/BasketProvider';
import { formatMoney } from '../../utils/money';
import { ECommercePlatform } from '../../utils/platforms';
import { useCurrency } from '../../hooks/useCurrency';
import { useTranslate } from '../../hooks/useTranslate';
import { CheckoutModal } from '../../components/CheckoutModal';
import { useCheckout } from '../../hooks/useCheckout';
import { useLoyaltyBasket } from '../../hooks/useLoyaltyBasket';

interface BasketProps {
  onCheckout?: () => void;
  platform?: ECommercePlatform;
}

export const Basket: React.FC<BasketProps> = ({ onCheckout, platform }) => {
  const currency = useCurrency();
  const { t } = useTranslate();
  const {
    isRightPanelOpen,
    setIsRightPanelOpen,
    isLoading,
    cartItems,
    basket,
    incrementQuantity,
    decrementQuantity,
    removeFromCart,
    unsyncedOrdersCount,
    syncAllPendingOrders,
  } = useBasketContext();

  const {
    isProcessing,
    checkoutVisible,
    error,
    currentOrder,
    total,
    subtotal,
    tax,
    itemCount,
    terminalConnected,
    handleStartCheckout,
    handleCancelCheckout,
    handlePayment,
    clearError,
    splitMode,
    paymentLines,
    addPaymentLine,
    removePaymentLine,
    handleCompleteSplit,
    splitCashTenderAmount,
    confirmSplitCashPayment,
  } = useCheckout({
    platform,
    onSuccess: () => {
      setIsRightPanelOpen(false);
      onCheckout?.();
    },
  });

  const { loyaltyBalance, storeCreditDollars, loadBalances } = useLoyaltyBasket(basket?.customerEmail, currentOrder?.id);

  useEffect(() => {
    loadBalances();
  }, [basket?.customerEmail, loadBalances]);

  // Basket surfaces payment errors as Alert.alert per spec 2.9.8
  useEffect(() => {
    if (error) {
      Alert.alert(t('common.error'), error);
      clearError();
    }
  }, [error, clearError, t]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleDecrement = async (itemId: string, currentQuantity: number) => {
    if (currentQuantity <= 1) {
      Alert.alert(t('basket.removeItem'), t('basket.removeItemConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.remove'), style: 'destructive', onPress: () => removeFromCart(itemId) },
      ]);
    } else {
      await decrementQuantity(itemId);
    }
  };

  const handleSyncOrders = async () => {
    setIsSyncing(true);
    try {
      const result = await syncAllPendingOrders();
      if (result.synced > 0) {
        Alert.alert(t('basket.syncCompleteTitle'), t('basket.syncComplete', { count: result.synced }));
      } else if (result.failed > 0) {
        Alert.alert(t('basket.syncFailedTitle'), t('basket.syncFailed', { count: result.failed }));
      } else {
        Alert.alert(t('basket.noOrdersTitle'), t('basket.noOrdersToSync'));
      }
    } catch (err) {
      Alert.alert(t('common.error'), (err as Error).message);
    } finally {
      setIsSyncing(false);
    }
  };

  const renderItem = ({ item }: { item: CartItem }) => (
    <View style={styles.cartItem}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.itemPrice}>{formatMoney(item.price, currency.code)}</Text>
        {item.sku && <Text style={styles.itemSku}>{t('basket.sku', { sku: item.sku })}</Text>}
      </View>
      <View style={styles.quantityContainer}>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => handleDecrement(item.id, item.quantity)}
          accessibilityLabel={`Decrease quantity of ${item.name}`}
          accessibilityRole="button"
        >
          <Text style={styles.quantityButtonText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.quantity} accessibilityLabel={`Quantity: ${item.quantity}`}>
          {item.quantity}
        </Text>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => incrementQuantity(item.id)}
          accessibilityLabel={`Increase quantity of ${item.name}`}
          accessibilityRole="button"
        >
          <Text style={styles.quantityButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.itemTotal}>{formatMoney(item.price * item.quantity, currency.code)}</Text>
    </View>
  );

  return (
    <SwipeablePanel
      isOpen={isRightPanelOpen}
      onClose={() => setIsRightPanelOpen(false)}
      title={t('basket.title')}
      position="right"
      backgroundColor={lightColors.surface}
    >
      <View style={styles.panelContent}>
        <View style={styles.container}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={lightColors.primary} />
              <Text style={styles.loadingText}>{t('basket.loadingBasket')}</Text>
            </View>
          ) : cartItems.length === 0 ? (
            <View style={styles.emptyCart}>
              <Text style={styles.emptyCartText}>{t('basket.empty')}</Text>
            </View>
          ) : (
            <FlatList
              data={cartItems}
              renderItem={renderItem}
              keyExtractor={item => item.id}
              style={styles.cartList}
              showsVerticalScrollIndicator={false}
            />
          )}

          <View style={styles.summary}>
            {unsyncedOrdersCount > 0 && (
              <TouchableOpacity style={styles.syncBanner} onPress={handleSyncOrders} disabled={isSyncing}>
                <Text style={styles.syncBannerText}>
                  {isSyncing ? t('common.syncing') : t('basket.pendingSync', { count: unsyncedOrdersCount })}
                </Text>
                {isSyncing && <ActivityIndicator size="small" color={lightColors.textOnPrimary} />}
              </TouchableOpacity>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('basket.subtotal')}</Text>
              <Text style={styles.summaryValue}>{formatMoney(subtotal, currency.code)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('basket.tax')}</Text>
              <Text style={styles.summaryValue}>{formatMoney(tax, currency.code)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>{t('basket.total')}</Text>
              <Text style={styles.totalValue}>{formatMoney(total, currency.code)}</Text>
            </View>

            {/* no inline error — payment errors shown via Alert.alert (spec 2.9.8) */}

            <TouchableOpacity
              style={[styles.checkoutButton, (cartItems.length === 0 || isProcessing) && styles.buttonDisabled]}
              onPress={handleStartCheckout}
              disabled={cartItems.length === 0 || isProcessing}
              accessibilityLabel="Complete order"
              accessibilityRole="button"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={lightColors.textOnPrimary} />
              ) : (
                <Text style={styles.checkoutButtonText}>{t('basket.completeOrder')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <CheckoutModal
        visible={checkoutVisible}
        orderId={currentOrder?.id || ''}
        orderTotal={total}
        orderSubtotal={subtotal}
        orderTax={tax}
        itemCount={itemCount}
        onSelectPayment={handlePayment}
        onCancel={handleCancelCheckout}
        isProcessing={isProcessing}
        terminalConnected={terminalConnected}
        splitMode={splitMode}
        paymentLines={paymentLines}
        onAddPaymentLine={addPaymentLine}
        onRemovePaymentLine={removePaymentLine}
        onCompleteSplit={handleCompleteSplit}
        splitCashTenderAmount={splitCashTenderAmount}
        onConfirmSplitCash={confirmSplitCashPayment}
        customerEmail={basket?.customerEmail}
        loyaltyPoints={loyaltyBalance?.points || 0}
        storeCreditDollars={storeCreditDollars}
      />
    </SwipeablePanel>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md },
  panelContent: { flex: 1, height: '100%', width: '100%' },
  cartList: { flex: 1 },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    paddingVertical: spacing.sm,
  },
  itemInfo: { flex: 1, marginRight: spacing.sm },
  itemName: { fontSize: typography.fontSize.md, fontWeight: '500' },
  itemPrice: { fontSize: typography.fontSize.sm, color: lightColors.textSecondary, marginTop: spacing.xs },
  itemSku: { fontSize: typography.fontSize.xs, color: lightColors.textHint, marginTop: 2 },
  itemTotal: { fontSize: typography.fontSize.md, fontWeight: '600', minWidth: 60, textAlign: 'right' },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.sm },
  quantityButton: {
    width: 30,
    height: 30,
    backgroundColor: lightColors.keypadButton,
    borderRadius: borderRadius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xs,
  },
  quantityButtonText: { fontSize: typography.fontSize.lg, fontWeight: '700' },
  quantity: { fontSize: typography.fontSize.md, marginHorizontal: spacing.xs, minWidth: 20, textAlign: 'center' },
  summary: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: lightColors.border, paddingTop: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  summaryLabel: { fontSize: typography.fontSize.md, color: lightColors.textSecondary },
  summaryValue: { fontSize: typography.fontSize.md },
  totalRow: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: lightColors.border, paddingTop: spacing.xs },
  totalLabel: { fontSize: typography.fontSize.lg, fontWeight: '700' },
  totalValue: { fontSize: typography.fontSize.lg, fontWeight: '700', color: lightColors.primary },
  checkoutButton: {
    backgroundColor: lightColors.success,
    padding: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: spacing.sm,
    minHeight: 48,
  },
  checkoutButtonText: { color: lightColors.textOnPrimary, fontSize: typography.fontSize.md, fontWeight: '700', textAlign: 'center' },
  buttonDisabled: { opacity: 0.5 },
  emptyCart: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xl },
  emptyCartText: { fontSize: typography.fontSize.md, color: lightColors.textHint, textAlign: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xl },
  loadingText: { fontSize: typography.fontSize.md, color: lightColors.textSecondary, marginTop: spacing.md },
  syncBanner: {
    backgroundColor: lightColors.warning,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  syncBannerText: { color: lightColors.textOnPrimary, fontSize: typography.fontSize.sm, fontWeight: '600' },
});
