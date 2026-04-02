import { apiClient } from '@/services/apiClient';

export const orderService = {
  list: (params?: { page?: number; limit?: number; status?: string }) => apiClient.get('marketplace/orders', params),
  history: () => apiClient.get('marketplace/order-history'),
  create: (payload: Record<string, unknown>) => apiClient.post('marketplace/payment/init', payload),
  markPaid: (paymentId: string) => apiClient.post('marketplace/payment/mark-paid', { payment_id: paymentId }),
  retryPayment: (paymentId: string) => apiClient.post('marketplace/payment/retry', { payment_id: paymentId }),
  refund: (paymentId: string) => apiClient.post('marketplace/payment/refund', { payment_id: paymentId }),
  verifyPayment: (payload: Record<string, unknown>) => apiClient.post('marketplace/payment/verify-signature', payload),
};

