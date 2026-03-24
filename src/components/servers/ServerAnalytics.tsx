import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Globe,
  Clock,
  Zap,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock analytics data
const statsCards = [
  { title: 'Total Visitors', value: '12,847', change: 12.5, positive: true, icon: Users },
  { title: 'Page Views', value: '48,392', change: 8.3, positive: true, icon: Eye },
  { title: 'Avg. Response', value: '124ms', change: -15.2, positive: true, icon: Clock },
  { title: 'Edge Requests', value: '156K', change: 23.1, positive: true, icon: Zap },
];

const webVitals = [
  { name: 'LCP', value: '1.2s', score: 92, status: 'good' },
  { name: 'FID', value: '18ms', score: 98, status: 'good' },
  { name: 'CLS', value: '0.05', score: 95, status: 'good' },
  { name: 'TTFB', value: '89ms', score: 88, status: 'good' },
  { name: 'FCP', value: '0.9s', score: 94, status: 'good' },
  { name: 'INP', value: '45ms', score: 91, status: 'good' },
];

const topPages = [
  { path: '/', views: 12453, unique: 8234, bounceRate: 32 },
  { path: '/dashboard', views: 8234, unique: 5123, bounceRate: 18 },
  { path: '/products', views: 5678, unique: 3456, bounceRate: 45 },
  { path: '/pricing', views: 4321, unique: 2890, bounceRate: 28 },
  { path: '/about', views: 2345, unique: 1789, bounceRate: 52 },
];

const topCountries = [
  { country: 'United States', flag: '🇺🇸', visitors: 4523, percentage: 35.2 },
  { country: 'India', flag: '🇮🇳', visitors: 2341, percentage: 18.2 },
  { country: 'United Kingdom', flag: '🇬🇧', visitors: 1567, percentage: 12.2 },
  { country: 'Germany', flag: '🇩🇪', visitors: 1234, percentage: 9.6 },
  { country: 'Canada', flag: '🇨🇦', visitors: 987, percentage: 7.7 },
];

const scoreColors = {
  good: 'text-success',
  warning: 'text-warning',
  poor: 'text-destructive',
};

export function ServerAnalytics() {
  const [timeRange, setTimeRange] = useState('7d');
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Monitor performance and visitor insights
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[140px] bg-muted/50 border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="glass-card-hover">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      stat.positive
                        ? 'bg-success/20 text-success border-success/30'
                        : 'bg-destructive/20 text-destructive border-destructive/30'
                    )}
                  >
                    {stat.positive ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                    {Math.abs(stat.change)}%
                  </Badge>
                </div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Overview
          </TabsTrigger>
          <TabsTrigger value="vitals" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Web Vitals
          </TabsTrigger>
          <TabsTrigger value="audience" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Audience
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Chart Placeholder */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Traffic Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-muted/30 rounded-lg">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">Traffic chart visualization</p>
                  <p className="text-xs text-muted-foreground">Connect analytics to see real data</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Pages */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground">Top Pages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topPages.map((page, index) => (
                  <div key={page.path} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-muted-foreground w-6">#{index + 1}</span>
                      <code className="text-sm text-foreground">{page.path}</code>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <p className="font-medium text-foreground">{page.views.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">views</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-foreground">{page.unique.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">unique</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-foreground">{page.bounceRate}%</p>
                        <p className="text-xs text-muted-foreground">bounce</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vitals" className="mt-6">
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-foreground">Core Web Vitals</CardTitle>
                <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                  All Good
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {webVitals.map((vital) => (
                  <div key={vital.name} className="p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">{vital.name}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          vital.status === 'good' && 'bg-success/20 text-success border-success/30',
                          vital.status === 'warning' && 'bg-warning/20 text-warning border-warning/30',
                          vital.status === 'poor' && 'bg-destructive/20 text-destructive border-destructive/30'
                        )}
                      >
                        {vital.score}
                      </Badge>
                    </div>
                    <p className={cn('text-2xl font-bold', scoreColors[vital.status as keyof typeof scoreColors])}>
                      {vital.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audience" className="mt-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground">Top Countries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topCountries.map((country) => (
                  <div key={country.country} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{country.flag}</span>
                      <span className="font-medium text-foreground">{country.country}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${country.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-16 text-right">
                        {country.visitors.toLocaleString()}
                      </span>
                      <span className="text-sm font-medium text-foreground w-12 text-right">
                        {country.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
