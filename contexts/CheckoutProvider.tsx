import React, { ReactNode, createContext, useContext, useMemo, useCallback } from 'react';
import { LocalOrder, LocalOrderStatus, CheckoutResult, SyncResult } from '../services/order/order';
import { ECommercePlatform } from '../utils/platforms';
import { useBasketState } from './BasketStateProvider';
import { useAuthContext } from './AuthProvider';
import { queueManager } from '../services/queue/QueueManager';
import { LoggerFactory } from '../services/logger/LoggerFactory';

const logger = LoggerFactory.getInstance().createLogger('CheckoutContext');

/**
 * CheckoutContext - Checkout flow state and operations
 * Only active during checkout, separated to avoid re-renders during normal cart operations
 */
export interface CheckoutContextType {
  // Current order state
  currentOrder: LocalOrder | null;

  // Checkout operations
  startCheckout: (platform?: ECommercePlatform) => Promise<LocalOrder | null>;
  markPaymentProcessing: (orderId: string) => Promise<void>;
  completePayment: (
    orderId: string,
    paymentMethod: string,
    transactionId?: string,
    payments?: import('../services/order/order').PaymentLine[]
  ) => Promise<CheckoutResult>;
  cancelOrder: (orderId: string) => Promise<void>;
  cancelDraftOrder: () => Promise<void>;

  // Sync operations
  unsyncedOrdersCount: number;
  syncOrderToPlatform: (orderId: string) => Promise<CheckoutResult>;
  syncAllPendingOrders: () => Promise<SyncResult>;
  getUnsyncedOrders: () => Promise<LocalOrder[]>;
  getLocalOrders: (status?: LocalOrderStatus) => Promise<LocalOrder[]>;

  // Sync queue status
  getSyncQueueStatus: () => { length: number; isProcessing: boolean; pendingRequests: number; retryingRequests: number };
}

export const CheckoutContext = createContext<CheckoutContextType | null>(null);

export const CheckoutProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const state = useBasketState();
  const { user } = useAuthContext();

  const refreshUnsyncedCount = useCallback(async () => {
    if (!state._containerRef.current) return;

    try {
      const unsyncedOrders = await state._containerRef.current.checkoutService.getUnsyncedOrders();
      if (state._mountedRef.current) {
        state._setUnsyncedOrdersCount(unsyncedOrders.length);
      }
    } catch (err) {
      logger.error({ message: 'Failed to refresh unsynced count' }, err instanceof Error ? err : new Error(String(err)));
    }
  }, [state]);

  const refreshBasket = useCallback(async () => {
    if (!state._containerRef.current) return;

    try {
      const basketData = await state._containerRef.current.basketService.getBasket();
      if (state._mountedRef.current) {
        state._setBasket(basketData);
        state._setError(null);
      }
    } catch (err) {
      if (state._mountedRef.current) {
        state._setError((err as Error).message);
      }
    }
  }, [state]);

  // Checkout operations
  const startCheckout = useCallback(
    async (platform?: ECommercePlatform): Promise<LocalOrder | null> => {
      if (!state._containerRef.current) return null;

      try {
        // Cancel any existing draft before creating a new one
        if (state.currentOrder?.status === 'draft') {
          await state._containerRef.current.checkoutService.cancelDraftOrder(
            state.currentOrder.id,
            state.currentOrder.platform,
            state.currentOrder.platformOrderId
          );
          if (state._mountedRef.current) state._setCurrentOrder(null);
        }

        const order = await state._containerRef.current.checkoutService.startCheckout(platform, user?.id, user?.username);
        if (state._mountedRef.current) {
          state._setCurrentOrder(order);
          state._setError(null);
        }
        return order;
      } catch (err) {
        if (state._mountedRef.current) {
          state._setError((err as Error).message);
        }
        return null;
      }
    },
    [state, user]
  );

  const markPaymentProcessing = useCallback(
    async (orderId: string) => {
      if (!state._containerRef.current) return;

      try {
        const order = await state._containerRef.current.checkoutService.markPaymentProcessing(orderId);
        if (state._mountedRef.current) {
          state._setCurrentOrder(order);
          state._setError(null);
        }
      } catch (err) {
        if (state._mountedRef.current) {
          state._setError((err as Error).message);
        }
      }
    },
    [state]
  );

  const completePayment = useCallback(
    async (
      orderId: string,
      paymentMethod: string,
      transactionId?: string,
      payments?: import('../services/order/order').PaymentLine[]
    ): Promise<CheckoutResult> => {
      if (!state._containerRef.current) {
        return { success: false, orderId, error: 'Service not initialized' };
      }

      try {
        const result = await state._containerRef.current.checkoutService.completePayment(orderId, paymentMethod, transactionId, payments);

        if (result.success && state._mountedRef.current) {
          await refreshBasket();
          await refreshUnsyncedCount();
          state._setCurrentOrder(null);
        }

        return result;
      } catch (err) {
        if (state._mountedRef.current) {
          state._setError((err as Error).message);
        }
        return { success: false, orderId, error: (err as Error).message };
      }
    },
    [state, refreshBasket, refreshUnsyncedCount]
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!state._containerRef.current) return;

      try {
        await state._containerRef.current.checkoutService.cancelOrder(orderId);
        if (state._mountedRef.current) {
          state._setCurrentOrder(null);
          state._setError(null);
        }
      } catch (err) {
        if (state._mountedRef.current) {
          state._setError((err as Error).message);
        }
      }
    },
    [state]
  );

  const cancelDraftOrder = useCallback(async () => {
    if (!state._containerRef.current || !state.currentOrder) return;

    try {
      await state._containerRef.current.checkoutService.cancelDraftOrder(
        state.currentOrder.id,
        state.currentOrder.platform,
        state.currentOrder.platformOrderId
      );
      if (state._mountedRef.current) {
        state._setCurrentOrder(null);
        state._setError(null);
      }
    } catch (err) {
      if (state._mountedRef.current) {
        state._setError((err as Error).message);
      }
    }
  }, [state]);

  // Sync operations
  const syncOrderToPlatform = useCallback(
    async (orderId: string): Promise<CheckoutResult> => {
      if (!state._containerRef.current) {
        return { success: false, orderId, error: 'Service not initialized' };
      }

      try {
        const result = await state._containerRef.current.orderSyncService.syncOrderToPlatform(orderId);
        if (result.success) {
          await refreshUnsyncedCount();
        }
        return result;
      } catch (err) {
        return { success: false, orderId, error: (err as Error).message };
      }
    },
    [state, refreshUnsyncedCount]
  );

  const syncAllPendingOrders = useCallback(async (): Promise<SyncResult> => {
    if (!state._containerRef.current) {
      return { synced: 0, failed: 0, errors: [] };
    }

    try {
      const result = await state._containerRef.current.orderSyncService.syncAllPendingOrders();
      await refreshUnsyncedCount();
      return result;
    } catch (err) {
      return { synced: 0, failed: 0, errors: [{ orderId: 'unknown', error: (err as Error).message }] };
    }
  }, [state, refreshUnsyncedCount]);

  const getUnsyncedOrders = useCallback(async (): Promise<LocalOrder[]> => {
    if (!state._containerRef.current) return [];
    return state._containerRef.current.checkoutService.getUnsyncedOrders();
  }, [state]);

  const getLocalOrders = useCallback(
    async (status?: LocalOrderStatus): Promise<LocalOrder[]> => {
      if (!state._containerRef.current) return [];
      return state._containerRef.current.checkoutService.getLocalOrders(status);
    },
    [state]
  );

  const getSyncQueueStatus = useCallback(() => {
    return queueManager.getQueueStatus();
  }, []);

  const value = useMemo(
    () => ({
      currentOrder: state.currentOrder,
      startCheckout,
      markPaymentProcessing,
      completePayment,
      cancelOrder,
      cancelDraftOrder,
      unsyncedOrdersCount: state.unsyncedOrdersCount,
      syncOrderToPlatform,
      syncAllPendingOrders,
      getUnsyncedOrders,
      getLocalOrders,
      getSyncQueueStatus,
    }),
    [
      state.currentOrder,
      state.unsyncedOrdersCount,
      startCheckout,
      markPaymentProcessing,
      completePayment,
      cancelOrder,
      cancelDraftOrder,
      syncOrderToPlatform,
      syncAllPendingOrders,
      getUnsyncedOrders,
      getLocalOrders,
      getSyncQueueStatus,
    ]
  );

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
};

export const useCheckoutContext = (): CheckoutContextType => {
  const context = useContext(CheckoutContext);
  if (context === null) {
    throw new Error('useCheckout must be used within CheckoutProvider');
  }
  return context;
};
