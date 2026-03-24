import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Plus,
  Search,
  Server,
  GitBranch,
  ExternalLink,
  MoreVertical,
  Globe,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ServerOverviewProps {
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
}

// Mock projects data
const mockProjects = [
  {
    id: '1',
    name: 'saas-vala-api',
    framework: 'Node.js',
    repo: 'saas-vala/api',
    branch: 'main',
    domain: 'api.saas-vala.com',
    status: 'ready',
    lastDeployment: '2 hours ago',
    lastCommit: 'feat: add user authentication',
  },
  {
    id: '2',
    name: 'saas-vala-web',
    framework: 'Next.js',
    repo: 'saas-vala/web',
    branch: 'main',
    domain: 'saas-vala.com',
    status: 'building',
    lastDeployment: 'Just now',
    lastCommit: 'fix: resolve dashboard layout issue',
  },
  {
    id: '3',
    name: 'analytics-dashboard',
    framework: 'React',
    repo: 'saas-vala/analytics',
    branch: 'develop',
    domain: 'analytics.saas-vala.com',
    status: 'ready',
    lastDeployment: '1 day ago',
    lastCommit: 'chore: update dependencies',
  },
  {
    id: '4',
    name: 'mobile-backend',
    framework: 'Express',
    repo: 'saas-vala/mobile-api',
    branch: 'main',
    domain: null,
    status: 'error',
    lastDeployment: '3 days ago',
    lastCommit: 'fix: cors headers',
  },
];

const statusConfig: Record<string, {
  icon: typeof CheckCircle2;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  animate?: boolean;
}> = {
  ready: {
    icon: CheckCircle2,
    label: 'Ready',
    color: 'text-success',
    bgColor: 'bg-success/20',
    borderColor: 'border-success/30',
  },
  building: {
    icon: Loader2,
    label: 'Building',
    color: 'text-warning',
    bgColor: 'bg-warning/20',
    borderColor: 'border-warning/30',
    animate: true,
  },
  error: {
    icon: XCircle,
    label: 'Error',
    color: 'text-destructive',
    bgColor: 'bg-destructive/20',
    borderColor: 'border-destructive/30',
  },
};

const frameworkIcons: Record<string, string> = {
  'Next.js': '▲',
  'React': '⚛️',
  'Node.js': '🟢',
  'Express': '⚡',
  'Vue': '💚',
  'Nuxt': '💚',
};

export function ServerOverview({ onSelectProject, onNewProject }: ServerOverviewProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProjects = mockProjects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.repo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="status-dot status-online" />
              <p className="text-2xl font-bold text-success">3</p>
            </div>
            <p className="text-sm text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Loader2 className="h-4 w-4 text-warning animate-spin" />
              <p className="text-2xl font-bold text-warning">1</p>
            </div>
            <p className="text-sm text-muted-foreground">Building</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">247</p>
            <p className="text-sm text-muted-foreground">Deployments</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">99.9%</p>
            <p className="text-sm text-muted-foreground">Uptime</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/50 border-border"
            />
          </div>
          <Button onClick={onNewProject} className="bg-orange-gradient hover:opacity-90 text-white gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Import Project</span>
          </Button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProjects.map((project) => {
          const status = statusConfig[project.status as keyof typeof statusConfig];
          const StatusIcon = status.icon;

          return (
            <Card
              key={project.id}
              className="glass-card-hover cursor-pointer group"
              onClick={() => onSelectProject(project.id)}
            >
              <CardContent className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-lg">
                      {frameworkIcons[project.framework] || <Server className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="h-3 w-3" />
                        <span>{project.repo}</span>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border">
                      <DropdownMenuItem>View Deployments</DropdownMenuItem>
                      <DropdownMenuItem>Manage Domains</DropdownMenuItem>
                      <DropdownMenuItem>View Logs</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">Delete Project</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Status & Domain */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={cn(status.bgColor, status.color, status.borderColor)}>
                      <StatusIcon className={cn('h-3 w-3 mr-1', status.animate && 'animate-spin')} />
                      {status.label}
                    </Badge>
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      {project.branch}
                    </Badge>
                  </div>

                  {project.domain && (
                    <a
                      href={`https://${project.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-secondary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {project.domain}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {/* Last Deployment */}
                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {project.lastDeployment}
                      </div>
                      <span className="truncate ml-2 max-w-[150px]">{project.lastCommit}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Add Project Card */}
        <Card
          className="glass-card border-dashed border-2 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={onNewProject}
        >
          <CardContent className="p-5 flex flex-col items-center justify-center h-full min-h-[200px] text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Import Project</h3>
            <p className="text-sm text-muted-foreground">
              Connect your Git repository
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
