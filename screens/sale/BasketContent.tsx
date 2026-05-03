import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { lightColors, spacing, typography, borderRadius } from '../../utils/theme';
import { formatMoney } from '../../utils/money';
import { CheckoutModal } from '../../components/CheckoutModal';
import { StatusBadge } from '../../components/StatusBadge';
import { ECommercePlatform } from '../../utils/platforms';
import { useCurrency } from '../../hooks/useCurrency';
import CustomerSearchModal from '../../components/CustomerSearchModal';
import { PlatformCustomer } from '../../services/customer/CustomerServiceInterface';
import { useCheckout } from '../../hooks/useCheckout';
import { useLoyaltyBasket } from '../../hooks/useLoyaltyBasket';
import { BasketItem, useBasketState } from '../../contexts/BasketStateProvider';
import { useBasketActions } from '../../contexts/BasketActionsProvider';
import { useCheckoutContext } from '../../contexts/CheckoutProvider';

interface BasketContentProps {
  platform?: ECommercePlatform;
  onCheckout?: () => void;
}

export const BasketContent: React.FC<BasketContentProps> = ({ platform, onCheckout }) => {
  const currency = useCurrency();
  const { isLoading, basket, basketItems } = useBasketState();
  const { incrementQuantity, decrementQuantity, removeFromBasket, setCustomer, applyDiscount } = useBasketActions();
  const { unsyncedOrdersCount, syncAllPendingOrders } = useCheckoutContext();

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
    splitMode,
    paymentLines,
    addPaymentLine,
    removePaymentLine,
    handleCompleteSplit,
    splitCashTenderAmount,
    confirmSplitCashPayment,
  } = useCheckout({ platform, onSuccess: () => onCheckout?.() });

  const [isSyncing, setIsSyncing] = useState(false);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);

  // Loyalty & store credit — load balances when customer changes
  const {
    loyaltyBalance,
    storeCreditDollars,
    activeRedemption,
    isLoading: isRedemptionLoading,
    loadBalances,
    redeemLoyalty,
    redeemStoreCredit,
    reverseActiveRedemption,
  } = useLoyaltyBasket(basket?.customerEmail, currentOrder?.id);

  useEffect(() => {
    loadBalances();
  }, [basket?.customerEmail, loadBalances]);

  const handleDecrement = async (itemId: string, currentQuantity: number) => {
    if (currentQuantity <= 1) {
      await removeFromBasket(itemId);
    } else {
      await decrementQuantity(itemId);
    }
  };

  const handleSelectCustomer = async (customer: PlatformCustomer) => {
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
    await setCustomer(customer.email, name || customer.email);
    setCustomerModalVisible(false);
  };

  const handleSyncOrders = async () => {
    setIsSyncing(true);
    try {
      await syncAllPendingOrders();
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
        {item.sku && <Text style={styles.itemSku}>{item.sku}</Text>}
      </View>
      <View style={styles.quantityContainer}>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => handleDecrement(item.id, item.quantity)}
          accessibilityLabel={`Decrease quantity of ${item.name}`}
          accessibilityRole="button"
        >
          <Text style={styles.quantityButtonText}>−</Text>
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
      <View style={styles.itemRight}>
        <Text style={styles.itemTotal}>{formatMoney(item.price * item.quantity, currency.code)}</Text>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeFromBasket(item.id)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel={`Remove ${item.name} from cart`}
          accessibilityRole="button"
        >
          <MaterialIcons name="delete-outline" size={18} color={lightColors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={lightColors.primary} />
          <Text style={styles.loadingText}>Loading basket...</Text>
        </View>
      ) : basketItems.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyText}>Your cart is empty</Text>
          <Text style={styles.emptyHint}>Tap a product to add it</Text>
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

      {/* Customer section */}
      {basket?.customerEmail ? (
        <View style={styles.customerBadge}>
          <MaterialIcons name="person" size={16} color={lightColors.primary} />
          <View style={styles.customerBadgeInfo}>
            <Text style={styles.customerBadgeName} numberOfLines={1}>
              {basket.customerName || basket.customerEmail}
            </Text>
            {basket.customerName && (
              <Text style={styles.customerBadgeEmail} numberOfLines={1}>
                {basket.customerEmail}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setCustomer(undefined, undefined)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Remove customer"
            accessibilityRole="button"
          >
            <MaterialIcons name="close" size={16} color={lightColors.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addCustomerButton}
          onPress={() => setCustomerModalVisible(true)}
          accessibilityLabel="Add customer to order"
          accessibilityRole="button"
        >
          <MaterialIcons name="person-add" size={16} color={lightColors.primary} />
          <Text style={styles.addCustomerText}>Add Customer</Text>
        </TouchableOpacity>
      )}

      {/* Loyalty & store credit actions — shown only when customer is attached */}
      {basket?.customerEmail && (
        <View style={styles.loyaltyActions}>
          {loyaltyBalance && loyaltyBalance.points > 0 && !activeRedemption && (
            <TouchableOpacity
              style={[styles.loyaltyBtn, isRedemptionLoading && styles.loyaltyBtnDisabled]}
              onPress={async () => {
                try {
                  const discount = await redeemLoyalty(loyaltyBalance.points);
                  await applyDiscount(`LOYALTY_${discount.toFixed(2)}`);
                } catch {
                  // error shown via hook state
                }
              }}
              disabled={isRedemptionLoading}
              accessibilityRole="button"
              accessibilityLabel={`Redeem ${loyaltyBalance.points} loyalty points`}
            >
              <MaterialIcons name="stars" size={14} color={lightColors.primary} />
              <Text style={styles.loyaltyBtnText}>
                Redeem {loyaltyBalance.points} pts ({formatMoney(loyaltyBalance.valueInCents / 100, currency.code)})
              </Text>
            </TouchableOpacity>
          )}
          {storeCreditDollars > 0 && !activeRedemption && (
            <TouchableOpacity
              style={[styles.loyaltyBtn, isRedemptionLoading && styles.loyaltyBtnDisabled]}
              onPress={async () => {
                try {
                  const result = await redeemStoreCredit(storeCreditDollars);
                  await applyDiscount(`CREDIT_${result.toFixed(2)}`);
                } catch {
                  // error shown via hook state
                }
              }}
              disabled={isRedemptionLoading}
              accessibilityRole="button"
              accessibilityLabel={`Use ${formatMoney(storeCreditDollars, currency.code)} store credit`}
            >
              <MaterialIcons name="card-giftcard" size={14} color={lightColors.success} />
              <Text style={[styles.loyaltyBtnText, { color: lightColors.success }]}>
                Use {formatMoney(storeCreditDollars, currency.code)} store credit
              </Text>
            </TouchableOpacity>
          )}
          {activeRedemption && (
            <TouchableOpacity
              style={styles.loyaltyReversalBtn}
              onPress={reverseActiveRedemption}
              accessibilityRole="button"
              accessibilityLabel="Remove redemption"
            >
              <MaterialIcons name="undo" size={14} color={lightColors.warning} />
              <Text style={[styles.loyaltyBtnText, { color: lightColors.warning }]}>
                {activeRedemption.type === 'loyalty' ? 'Points' : 'Credit'} applied (−
                {formatMoney(activeRedemption.discountDollars, currency.code)}) · Undo
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Summary & checkout */}
      <View style={styles.summary}>
        {unsyncedOrdersCount > 0 && (
          <TouchableOpacity style={styles.syncBanner} onPress={handleSyncOrders} disabled={isSyncing}>
            <StatusBadge status="pending" label={isSyncing ? 'Syncing...' : `${unsyncedOrdersCount} pending sync`} />
            {isSyncing && <ActivityIndicator size="small" color={lightColors.textOnPrimary} />}
          </TouchableOpacity>
        )}

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatMoney(subtotal, currency.code)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tax</Text>
          <Text style={styles.summaryValue}>{formatMoney(tax, currency.code)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoney(total, currency.code)}</Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.checkoutButton, (basketItems.length === 0 || isProcessing) && styles.buttonDisabled]}
          onPress={handleStartCheckout}
          disabled={basketItems.length === 0 || isProcessing}
          accessibilityLabel={`Complete order, total ${formatMoney(total, currency.code)}`}
          accessibilityRole="button"
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={lightColors.textOnPrimary} />
          ) : (
            <View style={styles.checkoutButtonInner}>
              <Text style={styles.checkoutButtonLabel}>COMPLETE ORDER</Text>
              <Text style={styles.checkoutButtonTotal}>{formatMoney(total, currency.code)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <CustomerSearchModal
        visible={customerModalVisible}
        platform={platform}
        onSelect={handleSelectCustomer}
        onClose={() => setCustomerModalVisible(false)}
      />

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xl },
  loadingText: { fontSize: typography.fontSize.md, color: lightColors.textSecondary, marginTop: spacing.md },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { fontSize: typography.fontSize.md, color: lightColors.textSecondary, fontWeight: '600' },
  emptyHint: { fontSize: typography.fontSize.sm, color: lightColors.textHint, marginTop: spacing.xs },
  cartList: { flex: 1, paddingHorizontal: spacing.md },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    paddingVertical: spacing.sm,
  },
  itemInfo: { flex: 1, marginRight: spacing.sm },
  itemName: { fontSize: typography.fontSize.sm, fontWeight: '500' },
  itemPrice: { fontSize: typography.fontSize.xs, color: lightColors.textSecondary, marginTop: 2 },
  itemSku: { fontSize: 10, color: lightColors.textHint, marginTop: 1 },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  itemTotal: { fontSize: typography.fontSize.sm, fontWeight: '600', minWidth: 56, textAlign: 'right' },
  removeButton: { padding: 2 },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.sm },
  quantityButton: {
    width: 28,
    height: 28,
    backgroundColor: lightColors.keypadButton,
    borderRadius: borderRadius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
  },
  quantityButtonText: { fontSize: typography.fontSize.md, fontWeight: '700' },
  quantity: { fontSize: typography.fontSize.sm, marginHorizontal: spacing.xs, minWidth: 18, textAlign: 'center' },
  summary: { borderTopWidth: 1, borderTopColor: lightColors.border, padding: spacing.md, backgroundColor: lightColors.surface },
  syncBanner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  summaryLabel: { fontSize: typography.fontSize.sm, color: lightColors.textSecondary },
  summaryValue: { fontSize: typography.fontSize.sm },
  totalRow: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: lightColors.border, paddingTop: spacing.sm },
  totalLabel: { fontSize: typography.fontSize.lg, fontWeight: '700' },
  totalValue: { fontSize: typography.fontSize.lg, fontWeight: '700', color: lightColors.primary },
  errorText: { fontSize: typography.fontSize.sm, color: lightColors.error, marginBottom: spacing.xs, textAlign: 'center' },
  checkoutButton: {
    backgroundColor: lightColors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 56,
  },
  checkoutButtonInner: { alignItems: 'center', gap: 2 },
  checkoutButtonLabel: { color: lightColors.textOnPrimary, fontSize: typography.fontSize.sm, fontWeight: '700', letterSpacing: 0.8 },
  checkoutButtonTotal: { color: lightColors.textOnPrimary, fontSize: typography.fontSize.xl, fontWeight: '800' },
  buttonDisabled: { opacity: 0.5 },
  customerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: lightColors.primary + '10',
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  customerBadgeInfo: { flex: 1 },
  customerBadgeName: { fontSize: typography.fontSize.sm, fontWeight: '600', color: lightColors.textPrimary },
  customerBadgeEmail: { fontSize: typography.fontSize.xs, color: lightColors.textSecondary },
  addCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  addCustomerText: { fontSize: typography.fontSize.sm, color: lightColors.primary, fontWeight: '600' },
  loyaltyActions: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  loyaltyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: lightColors.primary + '10',
    borderRadius: borderRadius.sm,
  },
  loyaltyBtnDisabled: {
    opacity: 0.5,
  },
  loyaltyBtnText: {
    fontSize: typography.fontSize.xs,
    color: lightColors.primary,
    fontWeight: '600',
  },
  loyaltyReversalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: lightColors.warning + '15',
    borderRadius: borderRadius.sm,
  },
});

export default BasketContent;
