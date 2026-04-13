import { ReturnRepository, ReturnRow, CreateReturnInput } from './ReturnRepository';
import { localApiClient } from '../services/clients/localapi/LocalApiClient';

export class LocalApiReturnRepository implements ReturnRepository {
  async create(input: CreateReturnInput): Promise<string> {
    return localApiClient.createReturn(input);
  }

  async findById(_id: string): Promise<ReturnRow | null> {
    return null; // not needed on client
  }

  async findByOrderId(orderId: string): Promise<ReturnRow[]> {
    return localApiClient.getReturnsByOrder(orderId);
  }

  async findAll(status?: string): Promise<ReturnRow[]> {
    return localApiClient.getReturns(status);
  }

  async findByDateRange(_from: number, _to: number): Promise<ReturnRow[]> {
    return localApiClient.getReturns();
  }

  async updateStatus(_id: string, _status: string, _processedBy?: string): Promise<void> {
    // Status is set by the server on create — no-op on client
  }

  async delete(_id: string): Promise<void> {
    // not needed on client
  }
}
