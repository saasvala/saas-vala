import { apiClient } from '@/services/apiClient';

export const subscriptionService = {
  list: () => apiClient.get('subscriptions'),
  renew: (subscriptionId: string) => apiClient.post('subscriptions/renew', { subscription_id: subscriptionId }),
  runCron: (cronSecret?: string) =>
    apiClient.post('subscriptions/cron-run', cronSecret ? { cron_secret: cronSecret } : {}),
};

