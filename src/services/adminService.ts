import { apiClient } from '@/services/apiClient';

export const adminService = {
  metrics: (params?: { page?: number; limit?: number }) => apiClient.get('admin/metrics', params),
  logs: (params?: { page?: number; limit?: number; type?: string }) => apiClient.get('admin/logs', params),
  alerts: (params?: { page?: number; limit?: number }) => apiClient.get('admin/alerts', params),
  health: () => apiClient.get('server/health'),
};

