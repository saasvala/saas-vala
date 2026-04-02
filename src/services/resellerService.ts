import { apiClient } from '@/services/apiClient';

export const resellerService = {
  list: (params?: { page?: number; limit?: number; search?: string }) => apiClient.get('resellers', params),
  create: (payload: Record<string, unknown>) => apiClient.post('resellers', payload),
  update: (resellerId: string, payload: Record<string, unknown>) => apiClient.put(`resellers/${resellerId}`, payload),
  sales: (resellerId: string) => apiClient.get(`resellers/${resellerId}/sales`),
  clients: () => apiClient.get('resellers/clients'),
  applications: () => apiClient.get('reseller/applications'),
  apply: (payload: Record<string, unknown>) => apiClient.post('reseller/apply', payload),
};

