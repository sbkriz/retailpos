import { ECommercePlatform } from '../../utils/platforms';
import { LocalOrder, LocalOrderStatus, CheckoutResult } from '../order/order';

export interface CheckoutServiceInterface {
  startCheckout(platform?: ECommercePlatform, cashierId?: string, cashierName?: string): Promise<LocalOrder>;
  markPaymentProcessing(orderId: string): Promise<LocalOrder>;
  completePayment(orderId: string, paymentMethod: string, transactionId?: string): Promise<CheckoutResult>;
  cancelOrder(orderId: string): Promise<void>;
  /** Cancel a draft order and delete it locally — basket is preserved for editing */
  cancelDraftOrder(orderId: string, platform?: ECommercePlatform, platformOrderId?: string): Promise<void>;
  getLocalOrders(status?: LocalOrderStatus): Promise<LocalOrder[]>;
  getUnsyncedOrders(): Promise<LocalOrder[]>;
  getLocalOrder(orderId: string): Promise<LocalOrder | null>;
}
