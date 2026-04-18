import { useState, useEffect, useCallback } from 'react';
import { orderRepository } from '../repositories/OrderRepository';
import { orderItemRepository } from '../repositories/OrderItemRepository';
import { rowToOrder, OrderWithItems } from '../utils/orderRow.utils';

export type { OrderWithItems };

export const useOrders = () => {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const rows = await orderRepository.findAll();
      const result: OrderWithItems[] = [];

      for (const row of rows) {
        const items = await orderItemRepository.findByOrderId(row.id);
        result.push(rowToOrder(row, items));
      }

      setOrders(result);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const deleteOrder = async (id: string) => {
    try {
      // CASCADE delete removes associated order_items automatically
      await orderRepository.delete(id);
      await fetchOrders();
    } catch (e) {
      setError(e as Error);
      throw e;
    }
  };

  return {
    orders,
    isLoading,
    error,
    fetchOrders,
    deleteOrder,
  };
};
