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

export function AiQuickActions() {
  const navigate = useNavigate();

  const actionCosts: Record<string, number> = {
    'add-model': 0,
    'test-ai': 0.01,
    'force-sync': 0.005,
    'view-logs': 0,
    'auto-bug-fix': 0.1,
    'security-scan': 0.05,
    'performance-fix': 0.08,
    'auto-deploy': 0.2,
  };

  const ensureWalletBalance = async (cost: number) => {
    if (cost <= 0) return;
    const wallet = await walletApi.get();
    const balance = Number(wallet?.data?.balance || 0);
    if (balance < cost) {
      throw new Error(`Low balance. Need $${cost.toFixed(3)} but wallet has $${balance.toFixed(3)}.`);
    }
  };

  const runAction = async (action: string) => {
    const cost = actionCosts[action] ?? 0;
    await ensureWalletBalance(cost);

    switch (action) {
      case 'add-model': {
        const payload = {
          name: `Auto Model ${new Date().toISOString().slice(0, 16)}`,
          provider: 'custom_api',
          model_id: `custom-auto-${Date.now()}`,
          description: 'Auto-created from SaaS AI control panel',
          is_active: true,
          max_tokens: 4096,
        };
        await aiApi.modelsCreate(payload);
        return { title: 'AI model added', desc: 'New model saved in centralized AI hub.' };
      }
      case 'test-ai': {
        const list = await aiApi.models();
        const models = Array.isArray(list?.data) ? list.data : [];
        const firstActive = models.find((m: any) => m?.model_id) || { model_id: 'openai/gpt-5-mini' };
        await aiApi.modelsTest({ model: firstActive.model_id });
        return { title: 'AI test successful', desc: `Live test completed for ${firstActive.model_id}.` };
      }
      case 'force-sync': {
        const res = await aiApi.forceSync({ source: 'quick_actions' });
        return { title: 'Force sync complete', desc: res?.message || 'Models and routing state synchronized.' };
      }
      case 'view-logs': {
        const logsRes = await aiApi.logs({ limit: 20 });
        const count = Array.isArray(logsRes?.data) ? logsRes.data.length : 0;
        navigate('/audit-logs');
        return { title: 'Logs opened', desc: `Loaded ${count} AI log entries and opened logs panel.` };
      }
      case 'auto-bug-fix': {
        const res = await aiApi.autoFix({ source: 'quick_actions', include_security: true, include_performance: true });
        return { title: 'Auto bug fix started', desc: res?.message || 'Scan and fix pipeline triggered.' };
      }
      case 'security-scan': {
        const res = await aiApi.securityScan({ source: 'quick_actions' });
        return { title: 'Security scan complete', desc: res?.message || 'Key and usage security checks executed.' };
      }
      case 'performance-fix': {
        const res = await aiApi.performanceOptimize({ source: 'quick_actions' });
        return { title: 'Performance optimization complete', desc: res?.message || 'Routing and model performance optimized.' };
      }
      case 'auto-deploy': {
        const res = await aiApi.deploy({ source: 'quick_actions' });
        return { title: 'Auto deploy started', desc: res?.message || 'Auto deploy pipeline triggered.' };
      }
      default:
        return { title: 'Action completed', desc: 'Operation finished successfully.' };
    }
  };

  const handleAction = async (action: string) => {
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
      onClick: () => void handleAction('add-model')
    },
    {
      label: 'Test AI (Live)',
      icon: Play,
      variant: 'secondary',
      onClick: () => void handleAction('test-ai')
    },
    {
      label: 'Force Sync',
      icon: RefreshCw,
      variant: 'outline',
      onClick: () => void handleAction('force-sync')
    },
    {
      label: 'View Logs',
      icon: FileText,
      variant: 'outline',
      onClick: () => void handleAction('view-logs')
    }
  ];

  const autoActions: ActionButton[] = [
    {
      label: 'Auto Bug Fix',
      icon: Bug,
      variant: 'outline',
      onClick: () => void handleAction('auto-bug-fix')
    },
    {
      label: 'Security Scan',
      icon: Shield,
      variant: 'outline',
      onClick: () => void handleAction('security-scan')
    },
    {
      label: 'Performance Fix',
      icon: Zap,
      variant: 'outline',
      onClick: () => void handleAction('performance-fix')
    },
    {
      label: 'Auto Deploy',
      icon: Rocket,
      variant: 'outline',
      onClick: () => void handleAction('auto-deploy')
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
