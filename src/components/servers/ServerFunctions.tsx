import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Zap,
  Clock,
  BarChart3,
  MoreVertical,
  Play,
  Eye,
  Edit,
  Trash2,
  Globe,
  Server,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Mock functions data
const mockFunctions = [
  {
    id: '1',
    name: 'api/user',
    type: 'serverless',
    runtime: 'Node.js 18',
    region: 'us-east-1',
    invocations: 12453,
    avgDuration: '45ms',
    errors: 12,
    status: 'active',
  },
  {
    id: '2',
    name: 'api/products',
    type: 'serverless',
    runtime: 'Node.js 18',
    region: 'us-east-1',
    invocations: 8234,
    avgDuration: '89ms',
    errors: 3,
    status: 'active',
  },
  {
    id: '3',
    name: 'api/webhook',
    type: 'edge',
    runtime: 'Edge Runtime',
    region: 'global',
    invocations: 45678,
    avgDuration: '12ms',
    errors: 0,
    status: 'active',
  },
  {
    id: '4',
    name: 'api/analytics',
    type: 'serverless',
    runtime: 'Node.js 18',
    region: 'eu-west-1',
    invocations: 2341,
    avgDuration: '156ms',
    errors: 45,
    status: 'error',
  },
  {
    id: '5',
    name: 'api/cron/cleanup',
    type: 'cron',
    runtime: 'Node.js 18',
    region: 'us-east-1',
    invocations: 24,
    avgDuration: '2.3s',
    errors: 0,
    status: 'active',
    schedule: '0 0 * * *',
  },
];

const typeConfig = {
  serverless: { label: 'Serverless', color: 'bg-primary/20 text-primary border-primary/30', icon: Server },
  edge: { label: 'Edge', color: 'bg-cyan/20 text-cyan border-cyan/30', icon: Globe },
  cron: { label: 'Cron', color: 'bg-purple/20 text-purple border-purple/30', icon: Clock },
};

export function ServerFunctions() {
  const [showCreate, setShowCreate] = useState(false);
  const [newFunction, setNewFunction] = useState({ name: '', runtime: 'nodejs18', type: 'serverless' });
  const { toast } = useToast();

  const handleCreate = () => {
    if (!newFunction.name.trim()) return;
    toast({
      title: 'Function created',
      description: `${newFunction.name} has been created successfully.`,
    });
    setNewFunction({ name: '', runtime: 'nodejs18', type: 'serverless' });
    setShowCreate(false);
  };

  const totalInvocations = mockFunctions.reduce((sum, f) => sum + f.invocations, 0);
  const totalErrors = mockFunctions.reduce((sum, f) => sum + f.errors, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">Functions</h3>
          <p className="text-sm text-muted-foreground">
            Serverless, Edge, and Cron functions
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="bg-orange-gradient hover:opacity-90 text-white gap-2">
              <Plus className="h-4 w-4" />
              Create Function
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create Function</DialogTitle>
              <DialogDescription>
                Create a new serverless or edge function
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="fn-name" className="text-foreground">Function Path</Label>
                <Input
                  id="fn-name"
                  placeholder="api/my-function"
                  value={newFunction.name}
                  onChange={(e) => setNewFunction({ ...newFunction, name: e.target.value })}
                  className="bg-muted/50 border-border font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Function Type</Label>
                <Select
                  value={newFunction.type}
                  onValueChange={(value) => setNewFunction({ ...newFunction, type: value })}
                >
                  <SelectTrigger className="bg-muted/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="serverless">Serverless Function</SelectItem>
                    <SelectItem value="edge">Edge Function</SelectItem>
                    <SelectItem value="cron">Cron Job</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Runtime</Label>
                <Select
                  value={newFunction.runtime}
                  onValueChange={(value) => setNewFunction({ ...newFunction, runtime: value })}
                >
                  <SelectTrigger className="bg-muted/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="nodejs18">Node.js 18.x</SelectItem>
                    <SelectItem value="nodejs20">Node.js 20.x</SelectItem>
                    <SelectItem value="edge">Edge Runtime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border">
                Cancel
              </Button>
              <Button onClick={handleCreate} className="bg-orange-gradient hover:opacity-90 text-white">
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{mockFunctions.length}</p>
            <p className="text-sm text-muted-foreground">Functions</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{(totalInvocations / 1000).toFixed(1)}K</p>
            <p className="text-sm text-muted-foreground">Invocations</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">67ms</p>
            <p className="text-sm text-muted-foreground">Avg Duration</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{totalErrors}</p>
            <p className="text-sm text-muted-foreground">Errors (24h)</p>
          </CardContent>
        </Card>
      </div>

      {/* Functions List */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">All Functions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mockFunctions.map((fn) => {
            const type = typeConfig[fn.type as keyof typeof typeConfig];
            const TypeIcon = type.icon;

            return (
              <div
                key={fn.id}
                className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="font-medium text-foreground">{fn.name}</code>
                      <Badge variant="outline" className={type.color}>
                        <TypeIcon className="h-3 w-3 mr-1" />
                        {type.label}
                      </Badge>
                      {fn.schedule && (
                        <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                          {fn.schedule}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      <span>{fn.runtime}</span>
                      <span>{fn.region}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right hidden sm:block">
                    <p className="font-medium text-foreground">{fn.invocations.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">invocations</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="font-medium text-foreground">{fn.avgDuration}</p>
                    <p className="text-xs text-muted-foreground">avg duration</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className={cn('font-medium', fn.errors > 0 ? 'text-destructive' : 'text-success')}>
                      {fn.errors}
                    </p>
                    <p className="text-xs text-muted-foreground">errors</p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border">
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <Play className="h-4 w-4" /> Test
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <Eye className="h-4 w-4" /> View Logs
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <BarChart3 className="h-4 w-4" /> Analytics
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <Edit className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer text-destructive">
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
