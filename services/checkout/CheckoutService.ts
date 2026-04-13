import { ECommercePlatform, isOnlinePlatform } from '../../utils/platforms';
import { BasketItem } from '../basket/basket';
import { LocalOrder, LocalOrderStatus, CheckoutResult } from '../order/order';
import { BasketServiceInterface } from '../basket/BasketServiceInterface';
import { CheckoutServiceInterface } from './CheckoutServiceInterface';
import { OrderRepository } from '../../repositories/OrderRepository';
import { OrderRow } from '../../repositories/OrderRepository';
import { OrderItemRepository } from '../../repositories/OrderItemRepository';
import { LoggerInterface } from '../logger/LoggerInterface';
import { posConfig } from '../config/POSConfigService';
import { generateUUID } from '../../utils/uuid';
import { auditLogService } from '../audit/AuditLogService';
import { OrderServiceFactory } from '../order/OrderServiceFactory';

/**
 * Handles checkout flow and order queries.
 * Depends on BasketService for reading/clearing the basket.
 */
export class CheckoutService implements CheckoutServiceInterface {
  constructor(
    private basketService: BasketServiceInterface,
    private orderRepo: OrderRepository,
    private orderItemRepo: OrderItemRepository,
    private logger: LoggerInterface
  ) {}

  async startCheckout(platform?: ECommercePlatform, cashierId?: string, cashierName?: string): Promise<LocalOrder> {
    const basket = await this.basketService.getBasket();

    if (basket.items.length === 0) {
      throw new Error('Cannot checkout with empty basket');
    }

    const now = Date.now();
    const orderId = generateUUID();

    // ── Draft order on platform (online only) ──────────────────────────
    let subtotal = basket.subtotal;
    let tax = basket.tax;
    let total = basket.total;
    let platformOrderId: string | undefined;
    let status: LocalOrderStatus = 'pending';
    let platformTaxRates: (number | undefined)[] = basket.items.map(() => undefined);

    if (platform && isOnlinePlatform(platform)) {
      try {
        const orderService = OrderServiceFactory.getInstance().getService(platform);
        const draftOrder = await orderService.createDraftOrder({
          customerEmail: basket.customerEmail,
          customerName: basket.customerName,
          note: basket.note,
          lineItems: basket.items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
          })),
          subtotal: basket.subtotal,
          tax: basket.tax,
          total: basket.total,
          discounts: basket.discountCode
            ? [{ code: basket.discountCode, amount: basket.discountAmount ?? 0, type: 'fixed_amount' }]
            : undefined,
        });

        // Use platform-authoritative values
        subtotal = draftOrder.subtotal;
        tax = draftOrder.tax;
        total = draftOrder.total;
        platformOrderId = draftOrder.platformOrderId ?? draftOrder.id;
        status = 'draft';

        // Capture platform tax rates by position for order_items persistence
        platformTaxRates = basket.items.map((_, i) => draftOrder.lineItems[i]?.taxRate);
      } catch (err) {
        this.logger.warn(
          { message: `Draft order creation failed for ${platform}, falling back to basket totals` },
          err instanceof Error ? err : new Error(String(err))
        );
        // status stays 'pending', totals stay from basket
      }
    }

    const localOrder: LocalOrder = {
      id: orderId,
      platformOrderId,
      platform,
      items: basket.items,
      subtotal,
      tax,
      total,
      discountAmount: basket.discountAmount,
      discountCode: basket.discountCode,
      customerEmail: basket.customerEmail,
      customerName: basket.customerName,
      note: basket.note,
      cashierId,
      cashierName,
      status,
      syncStatus: 'pending',
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    const orderInput = {
      id: orderId,
      platform: platform ?? null,
      subtotal,
      tax,
      total,
      discountAmount: basket.discountAmount ?? null,
      discountCode: basket.discountCode ?? null,
      customerEmail: basket.customerEmail ?? null,
      customerName: basket.customerName ?? null,
      note: basket.note ?? null,
      cashierId: cashierId ?? null,
      cashierName: cashierName ?? null,
      platformOrderId: platformOrderId ?? null,
      status,
    };

    const itemInputs = basket.items.map((item, i) => ({
      orderId,
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      image: item.image,
      taxable: false,
      taxRate: platformTaxRates[i] ?? null,
      isEcommerceProduct: item.isEcommerceProduct,
      originalId: item.originalId,
      properties: item.properties,
    }));

    await this.orderRepo.createWithItems(orderInput, itemInputs);

    auditLogService.log('order:created', {
      userId: cashierId,
      userName: cashierName,
      details: `Order ${orderId} created — ${basket.items.length} item(s), total ${total.toFixed(2)}`,
      metadata: { orderId, itemCount: basket.items.length, total },
    });

    return localOrder;
  }

  /**
   * Cancel a draft order — deletes the platform draft and the local row.
   * The basket is NOT cleared. The cashier can edit and start a new checkout.
   */
  async cancelDraftOrder(orderId: string, platform?: ECommercePlatform, platformOrderId?: string): Promise<void> {
    // Cancel on platform (best-effort — don't block if it fails)
    if (platform && isOnlinePlatform(platform) && platformOrderId) {
      try {
        const orderService = OrderServiceFactory.getInstance().getService(platform);
        await orderService.cancelDraftOrder(platformOrderId);
      } catch (err) {
        this.logger.warn(
          { message: `Failed to cancel platform draft ${platformOrderId} on ${platform}, removing local draft anyway` },
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }

    // Always remove the local draft row
    await this.orderRepo.delete(orderId);
  }

  async markPaymentProcessing(orderId: string): Promise<LocalOrder> {
    await this.orderRepo.updateStatus(orderId, 'processing');

    const order = await this.getLocalOrder(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    return order;
  }

  async completePayment(orderId: string, paymentMethod: string, transactionId?: string): Promise<CheckoutResult> {
    try {
      await this.orderRepo.updatePayment(orderId, paymentMethod, transactionId ?? null);

      // If this order has a platform draft, mark it as paid on the platform
      const orderRow = await this.orderRepo.findById(orderId);
      if (orderRow?.platform_order_id && orderRow.platform) {
        const platform = orderRow.platform as ECommercePlatform;
        if (isOnlinePlatform(platform)) {
          try {
            const orderService = OrderServiceFactory.getInstance().getService(platform);
            await orderService.completeOrder(orderRow.platform_order_id, paymentMethod, transactionId);
          } catch (err) {
            // Non-blocking — local payment is already recorded
            this.logger.warn(
              { message: `Failed to complete platform order ${orderRow.platform_order_id} on ${platform}` },
              err instanceof Error ? err : new Error(String(err))
            );
          }
        }
      }

      // Only clear basket after the order is successfully recorded
      await this.basketService.clearBasket();

      const isCash = paymentMethod.toLowerCase() === 'cash';
      const openDrawer = isCash && posConfig.values.drawerOpenOnCash;

      auditLogService.log('order:paid', {
        details: `Order ${orderId} paid via ${paymentMethod}`,
        metadata: { orderId, paymentMethod, transactionId },
      });

      return { success: true, orderId, openDrawer };
    } catch (error) {
      this.logger.error({ message: `Failed to complete payment for order ${orderId}` }, error as Error);
      await this.orderRepo.updateStatus(orderId, 'failed');
      return { success: false, orderId, error: (error as Error).message };
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.orderRepo.updateStatus(orderId, 'cancelled');
    auditLogService.log('order:cancelled', {
      details: `Order ${orderId} cancelled`,
      metadata: { orderId },
    });
  }

  // ── Order queries ───────────────────────────────────────────────────

  async getLocalOrders(status?: LocalOrderStatus): Promise<LocalOrder[]> {
    const rows = await this.orderRepo.findAll(status);
    return Promise.all(rows.map(row => this.mapOrderRowToLocalOrder(row)));
  }

  async getUnsyncedOrders(): Promise<LocalOrder[]> {
    const rows = await this.orderRepo.findUnsynced();
    return Promise.all(rows.map(row => this.mapOrderRowToLocalOrder(row)));
  }

  async getLocalOrder(orderId: string): Promise<LocalOrder | null> {
    const row = await this.orderRepo.findById(orderId);
    if (!row) return null;
    return this.mapOrderRowToLocalOrder(row);
  }

  // ── Mapping ─────────────────────────────────────────────────────────

  private async mapOrderRowToLocalOrder(row: OrderRow): Promise<LocalOrder> {
    const itemRows = await this.orderItemRepo.findByOrderId(row.id);
    const items: BasketItem[] = itemRows.map(ir => ({
      id: ir.id,
      productId: ir.product_id,
      variantId: ir.variant_id ?? undefined,
      sku: ir.sku ?? undefined,
      name: ir.name,
      price: ir.price,
      quantity: ir.quantity,
      image: ir.image ?? undefined,
      taxable: ir.taxable === 1,
      taxRate: ir.tax_rate ?? undefined,
      isEcommerceProduct: ir.is_ecommerce_product === 1,
      originalId: ir.original_id ?? undefined,
      properties: ir.properties ? JSON.parse(ir.properties) : undefined,
    }));

    return {
      id: row.id,
      platformOrderId: row.platform_order_id ?? undefined,
      platform: row.platform as ECommercePlatform | undefined,
      items,
      subtotal: row.subtotal,
      tax: row.tax,
      total: row.total,
      discountAmount: row.discount_amount ?? undefined,
      discountCode: row.discount_code ?? undefined,
      cashierId: row.cashier_id ?? undefined,
      cashierName: row.cashier_name ?? undefined,
      customerEmail: row.customer_email ?? undefined,
      customerName: row.customer_name ?? undefined,
      note: row.note ?? undefined,
      paymentMethod: row.payment_method ?? undefined,
      paymentTransactionId: row.payment_transaction_id ?? undefined,
      status: row.status as LocalOrderStatus,
      syncStatus: row.sync_status as 'pending' | 'synced' | 'failed',
      syncError: row.sync_error ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
      syncedAt: row.synced_at ? new Date(row.synced_at) : undefined,
    };
  }
}
