import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutDashboard,
  Cpu,
  Layers,
  Server,
  Shield
} from 'lucide-react';
import { AiStatsCards } from '@/components/saas-ai/AiStatsCards';
import { AiQuickActions } from '@/components/saas-ai/AiQuickActions';
import { AiModelManager } from '@/components/saas-ai/AiModelManager';
import { AiCategoryManager } from '@/components/saas-ai/AiCategoryManager';
import { ServerAiIntegration } from '@/components/saas-ai/ServerAiIntegration';
import { SecurityPanel } from '@/components/saas-ai/SecurityPanel';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function SaasAiDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full grid grid-cols-2 md:grid-cols-5 h-auto gap-1 bg-muted/30 p-1.5 rounded-xl">
            <TabsTrigger 
              value="overview" 
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger 
              value="models" 
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Cpu className="h-4 w-4" />
              <span className="hidden sm:inline">AI Models</span>
            </TabsTrigger>
            <TabsTrigger 
              value="categories" 
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Categories</span>
            </TabsTrigger>
            <TabsTrigger 
              value="server" 
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Server className="h-4 w-4" />
              <span className="hidden sm:inline">Server + AI</span>
            </TabsTrigger>
            <TabsTrigger 
              value="security" 
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <AiStatsCards />
            <AiQuickActions />
            <div className="grid grid-cols-1 gap-6">
              <AiModelManager />
            </div>
          </TabsContent>

          {/* AI Models Tab */}
          <TabsContent value="models" className="space-y-6">
            <AiStatsCards />
            <AiModelManager />
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-6">
            <AiCategoryManager />
          </TabsContent>

          {/* Server + AI Tab */}
          <TabsContent value="server" className="space-y-6">
            <ServerAiIntegration />
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <SecurityPanel />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
