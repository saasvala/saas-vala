import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  Info,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Pause,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock logs data
const generateLogs = () => {
  const levels = ['info', 'warn', 'error', 'success'];
  const messages = [
    { level: 'info', message: 'GET /api/user - 200 OK', duration: '45ms', source: 'api/user' },
    { level: 'info', message: 'POST /api/products - 201 Created', duration: '89ms', source: 'api/products' },
    { level: 'warn', message: 'Rate limit approaching for IP 192.168.1.1', duration: '-', source: 'middleware' },
    { level: 'error', message: 'Database connection timeout after 5000ms', duration: '5000ms', source: 'api/analytics' },
    { level: 'info', message: 'Cache hit for key: product_list_page_1', duration: '2ms', source: 'cache' },
    { level: 'success', message: 'Deployment completed successfully', duration: '45s', source: 'build' },
    { level: 'info', message: 'Edge function invoked from region: iad1', duration: '12ms', source: 'api/webhook' },
    { level: 'warn', message: 'Memory usage above 80% threshold', duration: '-', source: 'runtime' },
    { level: 'info', message: 'GET /api/auth/session - 200 OK', duration: '23ms', source: 'api/auth' },
    { level: 'error', message: 'Invalid JWT token signature', duration: '-', source: 'api/auth' },
  ];

  return messages.map((log, index) => ({
    id: `log-${index}`,
    timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    ...log,
  }));
};

const mockLogs = generateLogs();

const buildLogs = [
  { id: 'b1', timestamp: '00:00', message: 'Cloning repository...', status: 'done' },
  { id: 'b2', timestamp: '00:02', message: 'Installing dependencies...', status: 'done' },
  { id: 'b3', timestamp: '00:15', message: 'npm install completed (213 packages)', status: 'done' },
  { id: 'b4', timestamp: '00:16', message: 'Running build command: npm run build', status: 'done' },
  { id: 'b5', timestamp: '00:28', message: 'Build completed successfully', status: 'done' },
  { id: 'b6', timestamp: '00:29', message: 'Generating static pages...', status: 'done' },
  { id: 'b7', timestamp: '00:35', message: 'Generated 12 static pages', status: 'done' },
  { id: 'b8', timestamp: '00:36', message: 'Collecting build output...', status: 'done' },
  { id: 'b9', timestamp: '00:38', message: 'Uploading build outputs (2.3 MB)', status: 'done' },
  { id: 'b10', timestamp: '00:45', message: 'Deployment ready', status: 'success' },
];

const levelConfig = {
  info: { icon: Info, color: 'text-cyan', bgColor: 'bg-cyan/20' },
  warn: { icon: AlertTriangle, color: 'text-warning', bgColor: 'bg-warning/20' },
  error: { icon: AlertCircle, color: 'text-destructive', bgColor: 'bg-destructive/20' },
  success: { icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/20' },
};

export function ServerLogs() {
  const [activeTab, setActiveTab] = useState('runtime');
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [isLive, setIsLive] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLogs = mockLogs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  useEffect(() => {
    if (isLive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, isLive]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">Logs</h3>
          <p className="text-sm text-muted-foreground">
            Real-time runtime and build logs
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isLive ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsLive(!isLive)}
            className={cn(
              'gap-2',
              isLive ? 'bg-success hover:bg-success/90 text-white' : 'border-border'
            )}
          >
            {isLive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isLive ? 'Live' : 'Paused'}
          </Button>
          <Button variant="outline" size="sm" className="border-border gap-2">
            <Download className="h-3 w-3" />
            Export
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="runtime" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Runtime Logs
          </TabsTrigger>
          <TabsTrigger value="build" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Build Logs
          </TabsTrigger>
          <TabsTrigger value="edge" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Edge Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runtime" className="mt-6 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50 border-border"
              />
            </div>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[140px] bg-muted/50 border-border">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="success">Success</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Logs */}
          <Card className="glass-card">
            <ScrollArea className="h-[500px]" ref={scrollRef}>
              <div className="font-mono text-sm">
                {filteredLogs.map((log) => {
                  const config = levelConfig[log.level as keyof typeof levelConfig];
                  const Icon = config.icon;

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 px-4 py-2 hover:bg-muted/30 border-b border-border/50"
                    >
                      <div className={cn('h-5 w-5 rounded flex items-center justify-center shrink-0', config.bgColor)}>
                        <Icon className={cn('h-3 w-3', config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                            {log.source}
                          </Badge>
                          {log.duration !== '-' && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {log.duration}
                            </span>
                          )}
                        </div>
                        <p className={cn('mt-1', config.color)}>{log.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="build" className="mt-6">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-foreground">
                  Latest Build - Production
                </CardTitle>
                <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                  Completed in 45s
                </Badge>
              </div>
            </CardHeader>
            <ScrollArea className="h-[400px]">
              <div className="font-mono text-sm px-4 pb-4">
                {buildLogs.map((log) => (
                  <div key={log.id} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs text-muted-foreground w-12">{log.timestamp}</span>
                    {log.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-success" />
                    )}
                    <span className={cn(
                      log.status === 'success' ? 'text-success' : 'text-foreground'
                    )}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="edge" className="mt-6">
          <Card className="glass-card">
            <CardContent className="p-6 text-center">
              <RefreshCw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h4 className="font-medium text-foreground mb-2">Edge Function Logs</h4>
              <p className="text-sm text-muted-foreground mb-4">
                View real-time logs from your edge functions across all regions
              </p>
              <Button variant="outline" className="border-border">
                View Edge Logs
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
