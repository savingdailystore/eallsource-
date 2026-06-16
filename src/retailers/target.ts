import { BaseRetailer } from './base';
import type { RetailerProduct } from '@/types';

export class TargetRetailer extends BaseRetailer {
  name         = 'Target';
  baseUrl      = 'https://www.target.com';
  supportsApi  = true; // Target has a partner API

  async search(query: string, category?: string): Promise<RetailerProduct[]> {
    // TODO: Use Target Partner API or Redsky API
    // https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1?tcin={tcin}
    console.log('[target] search:', query, category);
    return [];
  }

  async getProduct(url: string): Promise<RetailerProduct | null> {
    // TODO: Extract TCIN from URL, call Redsky API
    console.log('[target] getProduct:', url);
    return null;
  }
}
