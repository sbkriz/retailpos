/* eslint-disable @typescript-eslint/no-explicit-any -- raw platform API response mapping */
import { CustomerSearchOptions, CustomerSearchResult, PlatformCustomer } from '../CustomerServiceInterface';
import { BaseCustomerService } from './BaseCustomerService';
import { CommerceFullApiClient, CommerceFullConfig } from '../../clients/commercefull/CommerceFullApiClient';
import { ECommercePlatform } from '../../../utils/platforms';
import { LoggerFactory } from '../../logger/LoggerFactory';

/**
 * CommerceFull platform implementation of the customer service.
 *
 * Endpoint mapping:
 *   GET /business/customers?search=...  → searchCustomers
 *   GET /business/customers/:id         → getCustomer
 */
export class CommerceFullCustomerService extends BaseCustomerService {
  private config: Record<string, any>;
  private apiClient: CommerceFullApiClient;

  constructor(config: Record<string, any> = {}) {
    super();
    this.config = config;
    this.apiClient = CommerceFullApiClient.getInstance();
    // Override the logger with a more specific name
    this.logger = LoggerFactory.getInstance().createLogger('CommerceFullCustomerService');
  }

  async initialize(): Promise<boolean> {
    try {
      const clientConfig: CommerceFullConfig = {
        storeUrl: this.config.storeUrl,
        apiKey: this.config.apiKey,
        apiSecret: this.config.apiSecret,
        apiVersion: this.config.apiVersion,
      };

      this.apiClient.configure(clientConfig);
      const ok = await this.apiClient.initialize();
      if (ok) {
        this.initialized = true;
      }
      return ok;
    } catch (error) {
      this.logger.error(
        { message: 'Failed to initialize CommerceFull customer service' },
        error instanceof Error ? error : new Error(String(error))
      );
      return false;
    }
  }

  async searchCustomers(options: CustomerSearchOptions): Promise<CustomerSearchResult> {
    if (!this.isInitialized()) {
      throw new Error('CommerceFull customer service not initialized');
    }

    try {
      const params: Record<string, string> = {};
      if (options.query) params.search = options.query;
      if (options.limit) params.limit = String(options.limit);
      if (options.cursor) params.page = options.cursor;

      const data = await this.apiClient.get<any>('/business/customers', params);
      const customers: PlatformCustomer[] = (data.data || data.customers || data || []).map((c: any) => this.mapToCustomer(c));

      const pagination = data.pagination || data.meta || {};
      return {
        customers,
        hasMore: !!pagination.nextPage || !!pagination.hasMore,
        nextCursor: pagination.nextPage ? String(pagination.nextPage) : undefined,
      };
    } catch (error) {
      this.logger.error(
        { message: 'Error searching customers on CommerceFull' },
        error instanceof Error ? error : new Error(String(error))
      );
      return { customers: [], hasMore: false };
    }
  }

  async getCustomer(_customerId: string): Promise<PlatformCustomer | null> {
    return null;
  }

  private mapToCustomer(c: any): PlatformCustomer {
    if (!c) {
      return {
        id: '',
        platformId: '',
        platform: ECommercePlatform.COMMERCEFULL,
        email: '',
      };
    }

    return {
      id: String(c.customerId || c.id || ''),
      platformId: String(c.customerId || c.id || ''),
      platform: ECommercePlatform.COMMERCEFULL,
      email: c.email || '',
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      phone: c.phone || '',
      tags: c.tags || [],
      orderCount: c.orderCount,
      totalSpent: c.totalSpent,
      currency: c.currency,
      note: c.note || c.notes || '',
      createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
      updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
    };
  }
}
