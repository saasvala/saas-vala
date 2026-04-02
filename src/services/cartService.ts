import { apiClient } from '@/services/apiClient';

export const cartService = {
  list: () => apiClient.get('cart'),
  add: (productId: string, qty = 1) => apiClient.post('cart', { product_id: productId, qty }),
  update: (productId: string, qty: number) => apiClient.put('cart', { product_id: productId, qty }),
  remove: (productId: string) => apiClient.del('cart', { product_id: productId }),
  clear: () => apiClient.del('cart/clear'),
};

