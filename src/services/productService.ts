import { apiClient } from '@/services/apiClient';

export const productService = {
  list: () => apiClient.get('products'),
  getById: (productId: string) => apiClient.get(`products/${productId}`),
  create: (payload: Record<string, unknown>) => apiClient.post('products', payload),
  update: (productId: string, payload: Record<string, unknown>) => apiClient.put(`products/${productId}`, payload),
  remove: (productId: string) => apiClient.del(`products/${productId}`),
};

