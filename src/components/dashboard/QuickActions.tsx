import { Button } from '@/components/ui/button';
import { Plus, KeyRound, Upload, Server, Wallet, Headset, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRecentActions } from '@/hooks/useRecentActions';
import { useProducts } from '@/hooks/useProducts';
import { useServers } from '@/hooks/useServers';
import { useQuickActionEngine } from '@/hooks/useQuickActionEngine';
import { apkApi, keysApi, serversApi, walletApi } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const actions = [
  {
    key: 'add_product',
    label: 'Add Product',
    icon: Plus,
    href: '/products',
    apiMapped: true,
    eventType: 'product_added' as const,
    className: 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm',
  },
  {
    key: 'generate_key',
    label: 'Generate Key',
    icon: KeyRound,
    href: '/keys',
    apiMapped: true,
    eventType: 'key_generated' as const,
    className: 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20',
  },
  {
    key: 'upload_apk',
    label: 'Upload APK',
    icon: Upload,
    href: '/products',
    apiMapped: true,
    eventType: 'apk_uploaded' as const,
    className: 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 border border-violet-500/20',
  },
  {
    key: 'deploy_server',
    label: 'Deploy Server',
    icon: Server,
    href: '/servers',
    apiMapped: true,
    eventType: 'server_deployed' as const,
    role: 'admin' as const,
    className: 'bg-muted hover:bg-muted/80 text-foreground border border-border/40',
  },
  {
    key: 'add_credits',
    label: 'Add Credits',
    icon: Wallet,
    href: '/wallet',
    apiMapped: true,
    eventType: 'credits_added' as const,
    role: 'admin' as const,
    className: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20',
  },
  {
    key: 'support_ticket',
    label: 'Support Ticket',
    icon: Headset,
    href: '/support/ticket',
    apiMapped: false,
    className: 'bg-muted hover:bg-muted/80 text-foreground border border-border/40',
  },
];

const VALID_ROUTES = new Set([
  '/products',
  '/keys',
  '/servers',
  '/wallet',
  '/support/ticket',
]);

export function QuickActions() {
  const navigate = useNavigate();
  const { actions: recentActions, pushAction } = useRecentActions();
  const { products, createProduct, fetchProducts } = useProducts();
  const { servers, fetchServers } = useServers();
  const { isSuperAdmin } = useAuth();
  const { handleQuickAction, getActionState } = useQuickActionEngine();

  const createProductSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56);
  };

  const getActionButtonClass = (actionKey: string, baseClass: string) => {
    const state = getActionState(actionKey);
    return cn(
      'gap-1.5 text-xs font-medium h-8 transition-all',
      baseClass,
      state === 'loading' && 'shadow-[0_0_18px_rgba(59,130,246,0.55)]',
      state === 'success' && 'ring-2 ring-emerald-400/70 bg-emerald-500/20 text-emerald-500 border-emerald-400/40',
    );
  };

  const runQuickAction = async (action: typeof actions[number]) => {
    const routeValid = VALID_ROUTES.has(action.href);
    if (!routeValid) {
      console.error('[quick-action] invalid route', action.href);
      toast.error('Route is invalid');
      return;
    }

    if (action.key === 'support_ticket') {
      pushAction({ label: action.label, href: action.href });
      navigate(action.href);
      return;
    }

    if (!action.apiMapped) {
      console.error('[quick-action] api not mapped', action.key);
      toast.error('API not mapped');
      return;
    }
    if (!action.eventType) {
      console.error('[quick-action] event not mapped', action.key);
      toast.error('Event mapping missing');
      return;
    }

    const configByKey: Record<string, { run: () => Promise<void>; validate?: () => string | null }> = {
      add_product: {
        run: async () => {
          const suffix = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID().slice(0, 8)
            : `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const name = `Quick Product ${suffix}`;
          await createProduct({
            name,
            slug: createProductSlug(name),
            description: 'Created from dashboard quick action',
            status: 'draft',
            price: 0,
            version: '1.0.0',
          });
          await fetchProducts();
        },
      },
      generate_key: {
        validate: () => (!products[0]?.id ? 'Add a product first' : null),
        run: async () => {
          const product = products[0];
          if (!product?.id) throw new Error('Product missing');
          const seed = Math.random().toString(36).slice(2, 14).toUpperCase();
          const key = `${seed.slice(0, 4)}-${seed.slice(4, 8)}-${seed.slice(8, 12)}`;
          await keysApi.generate({
            product_id: product.id,
            key_type: 'trial',
            license_key: key,
            owner_name: 'Quick Action',
            owner_email: null,
            max_devices: 1,
          });
        },
      },
      upload_apk: {
        validate: () => (!products[0]?.id ? 'Add a product first' : null),
        run: async () => {
          const product = products[0];
          if (!product?.id) throw new Error('Product missing');
          await apkApi.build({ product_id: product.id, mode: 'rebuild' });
        },
      },
      deploy_server: {
        validate: () => {
          if (!isSuperAdmin) return 'Access denied';
          if (!servers[0]?.id) return 'Add a server first';
          return null;
        },
        run: async () => {
          const server = servers[0];
          if (!server?.id) throw new Error('Server missing');
          await serversApi.triggerDeploy(server.id);
          await fetchServers();
        },
      },
      add_credits: {
        validate: () => (!isSuperAdmin ? 'Access denied' : null),
        run: async () => {
          const wallet = await walletApi.get();
          const walletId = wallet?.data?.id as string | undefined;
          await walletApi.add(100, 'Quick action credit', 'internal', walletId);
        },
      },
    };

    const selectedConfig = configByKey[action.key];
    if (!selectedConfig || typeof selectedConfig.run !== 'function') {
      console.error('[quick-action] handler missing', action.key);
      toast.error('Handler missing');
      return;
    }

    await handleQuickAction({
      key: action.key,
      role: action.role,
      eventType: action.eventType,
      validate: selectedConfig.validate,
      action: selectedConfig.run,
      onSuccess: () => {
        pushAction({ label: action.label, href: action.href });
        toast.success(`${action.label} completed`);
      },
      retryLabel: 'Retry',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-5"
    >
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        Quick Actions
      </h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, i) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35 + i * 0.05 }}
          >
            <Button
              onClick={() => void runQuickAction(action)}
              size="sm"
              disabled={getActionState(action.key) === 'loading'}
              className={getActionButtonClass(action.key, action.className)}
            >
              {getActionState(action.key) === 'loading'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <action.icon className="h-3.5 w-3.5" />}
              {action.label}
            </Button>
          </motion.div>
        ))}
      </div>
      {recentActions.length > 0 && (
        <div className="mt-4 border-t border-border/40 pt-3">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Recent Actions</h4>
          <div className="flex flex-wrap gap-2">
            {recentActions.slice(0, 5).map((item) => (
              <Button
                key={`${item.href}-${item.at}`}
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => navigate(item.href)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
