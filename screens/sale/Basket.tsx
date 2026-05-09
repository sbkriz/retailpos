import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { lightColors, spacing, typography, borderRadius } from '../../utils/theme';
import { SwipeablePanel } from '../../components/SwipeablePanel';
import { BasketBlockers } from '../../components/BasketBlockers';
import { RecoveryModal, RecoveryAction } from '../../components/RecoveryModal';
import { usePanelState } from '../../contexts/PanelStateProvider';
import { formatMoney } from '../../utils/money';
import { ECommercePlatform } from '../../utils/platforms';
import { useCurrency } from '../../hooks/useCurrency';
import { useTranslate } from '../../hooks/useTranslate';
import { CheckoutModal } from '../../components/CheckoutModal';
import { useCheckout } from '../../hooks/useCheckout';
import { useLoyaltyBasket } from '../../hooks/useLoyaltyBasket';
import { BasketItem, useBasketState } from '../../contexts/BasketStateProvider';
import { useBasketActions } from '../../contexts/BasketActionsProvider';
import { useCheckoutContext } from '../../contexts/CheckoutProvider';
import { useSaleScreen } from '../../hooks/useSaleScreen';

interface BasketProps {
  onCheckout?: () => void;
  platform?: ECommercePlatform;
}

export const Basket: React.FC<BasketProps> = ({ onCheckout, platform }) => {
  const currency = useCurrency();
  const { t } = useTranslate();
  const { isRightPanelOpen, setIsRightPanelOpen } = usePanelState();
  const { isLoading, basketItems, basket } = useBasketState();
  const { incrementQuantity, decrementQuantity, removeFromBasket } = useBasketActions();
  const { unsyncedOrdersCount, syncAllPendingOrders } = useCheckoutContext();
  const { blockers, saleState } = useSaleScreen();

  // Pulse animation for "Fix Issues" button
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (saleState === 'needs-attention') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [saleState, pulseAnim]);

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
    paymentMode,
    activeProvider,
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

  // Recovery modal state
  const [recoveryModal, setRecoveryModal] = useState<{
    visible: boolean;
    type: 'error' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    details?: string;
    actions: RecoveryAction[];
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    actions: [],
  });

  useEffect(() => {
    loadBalances();
  }, [basket?.customerEmail, loadBalances]);

  // Show payment errors via RecoveryModal (Sales UX spec §2.5)
  useEffect(() => {
    if (error) {
      setRecoveryModal({
        visible: true,
        type: 'error',
        title: t('common.error'),
        message: error,
        actions: [
          {
            label: t('common.ok'),
            type: 'primary',
            onPress: () => {
              setRecoveryModal(prev => ({ ...prev, visible: false }));
              clearError();
            },
          },
        ],
      });
    }
  }, [error, clearError, t]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleDecrement = async (itemId: string, currentQuantity: number) => {
    if (currentQuantity <= 1) {
      setRecoveryModal({
        visible: true,
        type: 'warning',
        title: t('basket.removeItem'),
        message: t('basket.removeItemConfirm'),
        actions: [
          {
            label: t('common.remove'),
            type: 'primary',
            destructive: true,
            onPress: () => {
              removeFromBasket(itemId);
              setRecoveryModal(prev => ({ ...prev, visible: false }));
            },
          },
          {
            label: t('common.cancel'),
            type: 'secondary',
            onPress: () => setRecoveryModal(prev => ({ ...prev, visible: false })),
          },
        ],
      });
    } else {
      await decrementQuantity(itemId);
    }
  };

  const handleSyncOrders = async () => {
    setIsSyncing(true);
    try {
      await syncAllPendingOrders();
      // Show success message via RecoveryModal
      setRecoveryModal({
        visible: true,
        type: 'success',
        title: t('basket.syncCompleteTitle'),
        message: t('basket.syncComplete'),
        actions: [
          {
            label: t('common.ok'),
            type: 'primary',
            onPress: () => setRecoveryModal(prev => ({ ...prev, visible: false })),
          },
        ],
      });
    } catch (err) {
      setRecoveryModal({
        visible: true,
        type: 'error',
        title: t('common.error'),
        message: (err as Error).message,
        actions: [
          {
            label: t('common.ok'),
            type: 'primary',
            onPress: () => setRecoveryModal(prev => ({ ...prev, visible: false })),
          },
        ],
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const renderItem = ({ item }: { item: BasketItem }) => (
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
          ) : basketItems.length === 0 ? (
            <View style={styles.emptyCart}>
              <Text style={styles.emptyCartText}>{t('basket.empty')}</Text>
            </View>
          ) : (
            <FlatList
              data={basketItems}
              renderItem={renderItem}
              keyExtractor={item => item.id}
              style={styles.cartList}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Blockers - show validation issues */}
          {blockers.length > 0 && (
            <View style={styles.blockersContainer}>
              <BasketBlockers
                blockers={blockers.map(blocker => ({
                  ...blocker,
                  action: blocker.action
                    ? {
                        ...blocker.action,
                        onPress: () => {
                          // Wire up blocker actions
                          if (blocker.message.includes('pending sync')) {
                            handleSyncOrders();
                          } else {
                            blocker.action?.onPress();
                          }
                        },
                      }
                    : undefined,
                }))}
              />
            </View>
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

            {/* Payment errors shown via RecoveryModal (Sales UX spec §2.5) */}

            {/* ENHANCED: Animated checkout button */}
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.checkoutButton,
                  (basketItems.length === 0 || isProcessing || saleState === 'needs-attention') && styles.buttonDisabled,
                  saleState === 'needs-attention' && styles.buttonWarning,
                ]}
                onPress={() => {
                  if (saleState === 'needs-attention') {
                    setRecoveryModal({
                      visible: true,
                      type: 'warning',
                      title: t('basket.issuesTitle'),
                      message: t('basket.issuesMessage', { count: blockers.length }),
                      actions: [
                        {
                          label: t('common.ok'),
                          type: 'primary',
                          onPress: () => setRecoveryModal(prev => ({ ...prev, visible: false })),
                        },
                      ],
                    });
                    return;
                  }
                  handleStartCheckout();
                }}
                disabled={basketItems.length === 0 || isProcessing}
                accessibilityLabel="Complete order"
                accessibilityRole="button"
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={lightColors.textOnPrimary} />
                ) : (
                  <Text style={styles.checkoutButtonText}>
                    {saleState === 'needs-attention'
                      ? t('basket.fixIssues', { count: blockers.length })
                      : saleState === 'preparing-checkout'
                        ? t('basket.preparing')
                        : saleState === 'processing-payment'
                          ? t('basket.processing')
                          : saleState === 'paid' || saleState === 'synced'
                            ? t('basket.newSale')
                            : t('basket.completeOrder')}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
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
        paymentMode={paymentMode}
        activeProvider={activeProvider}
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

      {/* Recovery Modal for errors and confirmations */}
      <RecoveryModal
        visible={recoveryModal.visible}
        type={recoveryModal.type}
        title={recoveryModal.title}
        message={recoveryModal.message}
        details={recoveryModal.details}
        actions={recoveryModal.actions}
        onDismiss={() => setRecoveryModal(prev => ({ ...prev, visible: false }))}
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
  buttonWarning: {
    backgroundColor: lightColors.warning,
  },
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
  blockersContainer: {
    marginBottom: spacing.md,
  },
});
