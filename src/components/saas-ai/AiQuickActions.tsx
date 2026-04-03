import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Play, 
  RefreshCw, 
  FileText,
  Zap,
  Shield,
  Bug,
  Rocket
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { aiApi, walletApi } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

interface ActionButton {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'default' | 'outline' | 'secondary';
  onClick: () => void;
}

const ACTIONS = {
  ADD_MODEL: 'add-model',
  TEST_AI: 'test-ai',
  FORCE_SYNC: 'force-sync',
  VIEW_LOGS: 'view-logs',
  AUTO_BUG_FIX: 'auto-bug-fix',
  SECURITY_SCAN: 'security-scan',
  PERFORMANCE_FIX: 'performance-fix',
  AUTO_DEPLOY: 'auto-deploy',
} as const;

type QuickAction = (typeof ACTIONS)[keyof typeof ACTIONS];

export function AiQuickActions() {
  const navigate = useNavigate();

  const actionCosts: Record<QuickAction, number> = {
    [ACTIONS.ADD_MODEL]: 0,
    [ACTIONS.TEST_AI]: 0.01,
    [ACTIONS.FORCE_SYNC]: 0.005,
    [ACTIONS.VIEW_LOGS]: 0,
    [ACTIONS.AUTO_BUG_FIX]: 0.1,
    [ACTIONS.SECURITY_SCAN]: 0.05,
    [ACTIONS.PERFORMANCE_FIX]: 0.08,
    [ACTIONS.AUTO_DEPLOY]: 0.2,
  };

  const ensureWalletBalance = async (cost: number) => {
    if (cost <= 0) return;
    const wallet = await walletApi.get();
    const balance = Number(wallet?.data?.balance || 0);
    if (balance < cost) {
      throw new Error(`Low balance. Need $${cost.toFixed(3)} but wallet has $${balance.toFixed(3)}.`);
    }
  };

  const runAction = async (action: QuickAction) => {
    const cost = actionCosts[action] ?? 0;
    await ensureWalletBalance(cost);

    switch (action) {
      case ACTIONS.ADD_MODEL: {
        const timestampSlug = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const payload = {
          name: `Auto Model ${timestampSlug}`,
          provider: 'custom_api',
          model_id: `custom-auto-${Date.now()}`,
          description: 'Auto-created from SaaS AI control panel',
          is_active: true,
          max_tokens: 4096,
        };
        await aiApi.modelsCreate(payload);
        return { title: 'AI model added', desc: 'New model saved in centralized AI hub.' };
      }
      case ACTIONS.TEST_AI: {
        const list = await aiApi.models();
        const models = Array.isArray(list?.data) ? list.data : [];
        const firstActive = models.find((m: any) => m?.model_id) || { model_id: 'openai/gpt-5-mini' };
        await aiApi.modelsTest({ model: firstActive.model_id });
        return { title: 'AI test successful', desc: `Live test completed for ${firstActive.model_id}.` };
      }
      case ACTIONS.FORCE_SYNC: {
        const res = await aiApi.forceSync({ source: 'quick_actions' });
        return { title: 'Force sync complete', desc: res?.message || 'Models and routing state synchronized.' };
      }
      case ACTIONS.VIEW_LOGS: {
        const logsRes = await aiApi.logs({ limit: 20 });
        const count = Array.isArray(logsRes?.data) ? logsRes.data.length : 0;
        navigate('/audit-logs');
        return { title: 'Logs opened', desc: `Loaded ${count} AI log entries and opened logs panel.` };
      }
      case ACTIONS.AUTO_BUG_FIX: {
        const res = await aiApi.autoFix({ source: 'quick_actions', include_security: true, include_performance: true });
        return { title: 'Auto bug fix started', desc: res?.message || 'Scan and fix pipeline triggered.' };
      }
      case ACTIONS.SECURITY_SCAN: {
        const res = await aiApi.securityScan({ source: 'quick_actions' });
        return { title: 'Security scan complete', desc: res?.message || 'Key and usage security checks executed.' };
      }
      case ACTIONS.PERFORMANCE_FIX: {
        const res = await aiApi.performanceOptimize({ source: 'quick_actions' });
        return { title: 'Performance optimization complete', desc: res?.message || 'Routing and model performance optimized.' };
      }
      case ACTIONS.AUTO_DEPLOY: {
        const res = await aiApi.deploy({ source: 'quick_actions' });
        return { title: 'Auto deploy started', desc: res?.message || 'Auto deploy pipeline triggered.' };
      }
      default:
        return { title: 'Action completed', desc: 'Operation finished successfully.' };
    }
  };

  const handleAction = async (action: QuickAction) => {
    try {
      const result = await runAction(action);
      toast.success(result.title, { description: result.desc });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Operation failed';
      toast.error('Action failed', { description: message });
    }
  };

  const primaryActions: ActionButton[] = [
    {
      label: 'Add AI Model',
      icon: Plus,
      variant: 'default',
      onClick: () => handleAction(ACTIONS.ADD_MODEL)
    },
    {
      label: 'Test AI (Live)',
      icon: Play,
      variant: 'secondary',
      onClick: () => handleAction(ACTIONS.TEST_AI)
    },
    {
      label: 'Force Sync',
      icon: RefreshCw,
      variant: 'outline',
      onClick: () => handleAction(ACTIONS.FORCE_SYNC)
    },
    {
      label: 'View Logs',
      icon: FileText,
      variant: 'outline',
      onClick: () => handleAction(ACTIONS.VIEW_LOGS)
    }
  ];

  const autoActions: ActionButton[] = [
    {
      label: 'Auto Bug Fix',
      icon: Bug,
      variant: 'outline',
      onClick: () => handleAction(ACTIONS.AUTO_BUG_FIX)
    },
    {
      label: 'Security Scan',
      icon: Shield,
      variant: 'outline',
      onClick: () => handleAction(ACTIONS.SECURITY_SCAN)
    },
    {
      label: 'Performance Fix',
      icon: Zap,
      variant: 'outline',
      onClick: () => handleAction(ACTIONS.PERFORMANCE_FIX)
    },
    {
      label: 'Auto Deploy',
      icon: Rocket,
      variant: 'outline',
      onClick: () => handleAction(ACTIONS.AUTO_DEPLOY)
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-4"
    >
      {/* Primary Actions */}
      <div className="flex flex-wrap gap-2">
        {primaryActions.map((action, index) => (
          <Button
            key={index}
            variant={action.variant}
            onClick={action.onClick}
            className="gap-2"
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </Button>
        ))}
      </div>

      {/* Auto Actions */}
      <div className="flex flex-wrap gap-2">
        {autoActions.map((action, index) => (
          <Button
            key={index}
            variant={action.variant}
            size="sm"
            onClick={action.onClick}
            className="gap-2 text-xs"
          >
            <action.icon className="h-3.5 w-3.5" />
            {action.label}
          </Button>
        ))}
      </div>
    </motion.div>
  );
}
