import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Plus, 
  Play, 
  Edit2, 
  Trash2, 
  Eye, 
  EyeOff,
  Zap,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { aiApi } from '@/lib/api';

interface AiModel {
  id: string;
  name: string;
  provider: 'openai' | 'google' | 'anthropic' | 'custom';
  version: string;
  apiKey: string;
  tokenCost: number;
  maxTokens: number;
  priority: number;
  enabled: boolean;
  status: 'active' | 'inactive' | 'error';
  isFailover: boolean;
}

const initialModels: AiModel[] = [
  {
    id: '1',
    name: 'GPT-5',
    provider: 'openai',
    version: '5.0',
    apiKey: 'sk-...xxxx',
    tokenCost: 0.03,
    maxTokens: 128000,
    priority: 1,
    enabled: true,
    status: 'active',
    isFailover: false
  },
  {
    id: '2',
    name: 'GPT-5 Mini',
    provider: 'openai',
    version: '5.0-mini',
    apiKey: 'sk-...xxxx',
    tokenCost: 0.01,
    maxTokens: 64000,
    priority: 2,
    enabled: true,
    status: 'active',
    isFailover: true
  },
  {
    id: '3',
    name: 'GPT-5 Nano',
    provider: 'openai',
    version: '5.0-nano',
    apiKey: 'sk-...xxxx',
    tokenCost: 0.005,
    maxTokens: 32000,
    priority: 3,
    enabled: true,
    status: 'active',
    isFailover: true
  },
  {
    id: '4',
    name: 'Gemini 3 Flash',
    provider: 'google',
    version: '3.0-flash',
    apiKey: 'AIza...xxxx',
    tokenCost: 0.0075,
    maxTokens: 1000000,
    priority: 4,
    enabled: true,
    status: 'active',
    isFailover: true
  },
  {
    id: '5',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    version: '2.5-pro',
    apiKey: 'AIza...xxxx',
    tokenCost: 0.025,
    maxTokens: 2000000,
    priority: 5,
    enabled: true,
    status: 'active',
    isFailover: false
  },
  {
    id: '6',
    name: 'Claude',
    provider: 'anthropic',
    version: '3.5-sonnet',
    apiKey: 'sk-ant...xxxx',
    tokenCost: 0.015,
    maxTokens: 200000,
    priority: 6,
    enabled: false,
    status: 'inactive',
    isFailover: true
  },
  {
    id: '7',
    name: 'Custom Internal AI',
    provider: 'custom',
    version: '1.0',
    apiKey: 'custom-...xxxx',
    tokenCost: 0.001,
    maxTokens: 16000,
    priority: 7,
    enabled: false,
    status: 'inactive',
    isFailover: true
  }
];

const providerColors = {
  openai: 'bg-green-500/10 text-green-500 border-green-500/20',
  google: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  anthropic: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  custom: 'bg-purple-500/10 text-purple-500 border-purple-500/20'
};

const providerLabels = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
  custom: 'Custom'
};

export function AiModelManager() {
  const [models, setModels] = useState<AiModel[]>(initialModels);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AiModel | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await aiApi.modelsList();
      const rows = Array.isArray(res?.data) ? res.data : [];
      if (rows.length) {
        const mapped: AiModel[] = rows.map((m: any, idx: number) => ({
          id: m.id,
          name: m.name || m.model_id || `Model ${idx + 1}`,
          provider: (String(m.provider || 'custom').toLowerCase() as AiModel['provider']) || 'custom',
          version: m.model_id || m.name || '1.0',
          apiKey: '••••••••••••',
          tokenCost: Number(m.input_cost_per_1k || 0),
          maxTokens: Number(m.max_tokens || 0),
          priority: idx + 1,
          enabled: !!m.is_active,
          status: m.is_active ? 'active' : 'inactive',
          isFailover: true,
        }));
        setModels(mapped);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const toggleModel = async (id: string) => {
    const current = models.find((m) => m.id === id);
    if (!current) return;
    const enabled = !current.enabled;
    try {
      await aiApi.modelsUpdate({ id, is_active: enabled });
      setModels(prev => prev.map(m =>
        m.id === id ? { ...m, enabled, status: enabled ? 'active' : 'inactive' } : m
      ));
      toast.success('Model status updated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update model status');
    }
  };

  const toggleApiKeyVisibility = (id: string) => {
    setShowApiKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleTest = async (model: AiModel) => {
    try {
      await aiApi.modelsTest({ model: model.version });
      toast.success(`${model.name} is responding correctly!`);
    } catch (e: any) {
      toast.error(e?.message || `${model.name} test failed`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await aiApi.modelsDelete({ id });
      setModels(prev => prev.filter(m => m.id !== id));
      toast.success('Model removed');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove model');
    }
  };

  const handleSaveModel = async (formData: FormData) => {
    const newModel: AiModel = {
      id: crypto.randomUUID(),
      name: formData.get('name') as string,
      provider: formData.get('provider') as AiModel['provider'],
      version: formData.get('version') as string,
      apiKey: formData.get('apiKey') as string,
      tokenCost: parseFloat(formData.get('tokenCost') as string),
      maxTokens: parseInt(formData.get('maxTokens') as string),
      priority: models.length + 1,
      enabled: true,
      status: 'active',
      isFailover: true
    };
    try {
      const res = await aiApi.modelsCreate({
        name: newModel.name,
        provider: newModel.provider,
        model_id: newModel.version,
        description: `${newModel.name} (${newModel.version})`,
        input_cost_per_1k: newModel.tokenCost,
        output_cost_per_1k: newModel.tokenCost,
        max_tokens: newModel.maxTokens,
        is_active: true,
      });
      const createdId = res?.data?.id || newModel.id;
      setModels(prev => [...prev, { ...newModel, id: createdId }]);
      setIsAddDialogOpen(false);
      toast.success('Model added successfully');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add model');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">AI Model Manager</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Manage AI providers with auto-failover enabled
            </p>
            {loading && <p className="text-xs text-muted-foreground mt-1">Loading models...</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Shield className="h-3 w-3" />
              Auto Failover
            </Badge>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Model
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add AI Model</DialogTitle>
                </DialogHeader>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveModel(new FormData(e.currentTarget));
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="name">Model Name</Label>
                    <Input id="name" name="name" placeholder="e.g., GPT-5" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select name="provider" defaultValue="openai">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                        <SelectItem value="google">Google (Gemini)</SelectItem>
                        <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                        <SelectItem value="custom">Custom Internal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="version">Version</Label>
                    <Input id="version" name="version" placeholder="e.g., 5.0" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key (Encrypted)</Label>
                    <Input id="apiKey" name="apiKey" type="password" placeholder="Enter API key" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tokenCost">Token Cost ($)</Label>
                      <Input id="tokenCost" name="tokenCost" type="number" step="0.001" defaultValue="0.01" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxTokens">Max Tokens</Label>
                      <Input id="maxTokens" name="maxTokens" type="number" defaultValue="128000" required />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Add Model</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-12">Priority</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead className="text-right">Token Cost</TableHead>
                  <TableHead className="text-right">Max Tokens</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Enable</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.id} className="group">
                    <TableCell>
                      <Badge variant="outline" className="w-8 justify-center">
                        {model.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{model.name}</span>
                        {model.isFailover && (
                          <Badge variant="secondary" className="text-[10px]">
                            Failover
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={providerColors[model.provider]}>
                        {providerLabels[model.provider]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{model.version}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {showApiKeys[model.id] ? model.apiKey : '••••••••••••'}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleApiKeyVisibility(model.id)}
                        >
                          {showApiKeys[model.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${model.tokenCost.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {model.maxTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={model.status === 'active' ? 'default' : model.status === 'error' ? 'destructive' : 'secondary'}
                        className={model.status === 'active' ? 'bg-success text-success-foreground' : ''}
                      >
                        {model.status === 'error' && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {model.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={model.enabled}
                        onCheckedChange={() => toggleModel(model.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleTest(model)}
                          title="Live Test"
                        >
                          <Play className="h-4 w-4 text-success" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditingModel(model)}
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDelete(model.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
