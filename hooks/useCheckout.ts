/**
 * useCheckout
 *
 * Shared checkout + payment-method-change logic consumed by both
 * BasketContent (desktop sidebar) and Basket (mobile panel).
 *
 * Implements the full flow from the checkout spec:
 *  - startCheckout → creates platform draft order
 *  - cancelDraftOrder → returns to basket for editing
 *  - markPaymentProcessing → locks the order
 *  - completePayment → records payment, clears basket
 *  - cancelOrder → hard cancel after markPaymentProcessing
 *
 * Payment method change mid-checkout (spec 2.7):
 *  - Before "Pay" tapped: pure local state, no API calls
 *  - After markPaymentProcessing: cancelOrder → restart checkout
 *  - On cash tender back button: setStep('method'), no API call
 */

import { useState, useCallback } from 'react';
import { ECommercePlatform } from '../utils/platforms';
import { useBasketContext } from '../contexts/BasketProvider';
import { usePayment } from './usePayment';
import { cashDrawerServiceFactory } from '../services/drawer/CashDrawerServiceFactory';
import { PrinterServiceFactory } from '../services/printer/PrinterServiceFactory';
import { customerDisplayServiceFactory } from '../services/display/CustomerDisplayServiceFactory';
import { keyValueRepository } from '../repositories/KeyValueRepository';
import { PaymentSelection } from '../components/CheckoutModal';

interface UseCheckoutOptions {
  platform?: ECommercePlatform;
  onSuccess?: (orderId: string) => void;
}

export function useCheckout({ platform, onSuccess }: UseCheckoutOptions = {}) {
  const {
    cartItems,
    total,
    subtotal,
    tax,
    itemCount,
    currentOrder,
    startCheckout,
    markPaymentProcessing,
    completePayment,
    cancelOrder,
    cancelDraftOrder,
  } = useBasketContext();

  const { processPayment, isTerminalConnected } = usePayment();

  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Start checkout — creates platform draft ──────────────────────────
  const handleStartCheckout = useCallback(async () => {
    if (cartItems.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      const order = await startCheckout(platform);
      if (order) {
        setCheckoutVisible(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }, [cartItems.length, startCheckout, platform]);

  // ── Cancel draft — return to basket for editing ──────────────────────
  // Called when cashier closes CheckoutModal before paying
  const handleCancelCheckout = useCallback(async () => {
    setCheckoutVisible(false);
    if (!currentOrder) return;

    try {
      if (currentOrder.status === 'draft') {
        // Soft cancel: delete draft, basket stays intact
        await cancelDraftOrder();
      } else if (currentOrder.status === 'processing') {
        // Hard cancel: payment was initiated, order must be cancelled
        await cancelOrder(currentOrder.id);
      }
      // 'pending' (offline fallback) — just close, no platform call needed
    } catch (err) {
      setError((err as Error).message);
    }
  }, [currentOrder, cancelDraftOrder, cancelOrder]);

  // ── Process payment ──────────────────────────────────────────────────
  const handlePayment = useCallback(
    async (selection: PaymentSelection) => {
      if (!currentOrder) return;

      setIsProcessing(true);
      setError(null);
      try {
        await markPaymentProcessing(currentOrder.id);

        // Show payment screen on customer display
        customerDisplayServiceFactory
          .getService()
          .showPayment(total, 'GBP')
          .catch(() => {});

        let transactionId: string | undefined;

        // Card / terminal: go through PaymentService first
        if (selection.method === 'card' || selection.method === 'terminal') {
          const response = await processPayment({
            amount: total,
            reference: `ORDER-${Date.now()}`,
            orderId: currentOrder.id,
            itemCount,
          });

          if (!response.success) {
            // Payment failed — cancel the order so cashier can retry with a
            // different method (spec 2.7.1–2.7.2)
            await cancelOrder(currentOrder.id);
            setCheckoutVisible(false);
            setError(response.errorMessage || 'Payment failed');
            return;
          }

          transactionId = response.transactionId;
        }

        const paymentMethod = selection.method === 'terminal' ? 'card_terminal' : selection.method;
        const result = await completePayment(currentOrder.id, paymentMethod, transactionId);

        if (result.success) {
          if (result.openDrawer) {
            cashDrawerServiceFactory
              .getService()
              .open()
              .catch(() => {});
          }

          // Show thank-you on customer display
          customerDisplayServiceFactory
            .getService()
            .showThankYou()
            .catch(() => {});

          // Auto-print receipt if printer is connected and printReceipts is enabled
          try {
            const printerSettings = await keyValueRepository.getObject<{ printReceipts?: boolean }>('printerSettings');
            const printerFactory = PrinterServiceFactory.getInstance();
            if (printerSettings?.printReceipts !== false && printerFactory.isConnectedToPrinter()) {
              const order = currentOrder;
              if (order) {
                printerFactory
                  .printReceipt({
                    orderId: order.id.slice(-8),
                    items: order.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
                    subtotal,
                    tax,
                    total,
                    paymentMethod: paymentMethod,
                    date: new Date(),
                    cashierName: order.cashierName ?? 'Cashier',
                    customerName: order.customerName,
                  })
                  .catch(() => {});
              }
            }
          } catch {
            // Receipt printing is best-effort — never block the success path
          }

          setCheckoutVisible(false);
          onSuccess?.(result.orderId);
        } else {
          setError(result.error || 'Payment failed');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsProcessing(false);
      }
    },
    [currentOrder, markPaymentProcessing, processPayment, completePayment, cancelOrder, total, tax, itemCount, subtotal, onSuccess]
  );

  return {
    // State
    isProcessing,
    checkoutVisible,
    error,
    currentOrder,
    // Totals (from basket context — updated by draft order)
    total,
    subtotal,
    tax,
    itemCount,
    // Terminal
    terminalConnected: isTerminalConnected(),
    // Actions
    handleStartCheckout,
    handleCancelCheckout,
    handlePayment,
    clearError: () => setError(null),
  };
}
