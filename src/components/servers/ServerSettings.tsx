import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  GitBranch,
  Settings,
  Trash2,
  AlertTriangle,
  Save,
  RefreshCw,
  Shield,
  Zap,
  Globe,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ServerSettings() {
  const [activeTab, setActiveTab] = useState('general');
  const { toast } = useToast();

  // Settings state
  const [projectName, setProjectName] = useState('saas-vala-web');
  const [framework, setFramework] = useState('nextjs');
  const [rootDirectory, setRootDirectory] = useState('./');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [outputDirectory, setOutputDirectory] = useState('.next');
  const [installCommand, setInstallCommand] = useState('npm install');
  const [nodeVersion, setNodeVersion] = useState('18.x');
  const [autoDeployEnabled, setAutoDeployEnabled] = useState(true);
  const [previewDeploymentsEnabled, setPreviewDeploymentsEnabled] = useState(true);
  const [productionBranch, setProductionBranch] = useState('main');

  const handleSave = () => {
    toast({
      title: 'Settings saved',
      description: 'Your project settings have been updated.',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-display text-lg font-bold text-foreground">Project Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure your project's build, deployment, and security settings
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="general" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="git" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <GitBranch className="h-4 w-4" />
            Git
          </TabsTrigger>
          <TabsTrigger value="build" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Zap className="h-4 w-4" />
            Build & Dev
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="mt-6 space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-foreground">Project Information</CardTitle>
              <CardDescription>Basic project configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="project-name" className="text-foreground">Project Name</Label>
                  <Input
                    id="project-name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="bg-muted/50 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Framework Preset</Label>
                  <Select value={framework} onValueChange={setFramework}>
                    <SelectTrigger className="bg-muted/50 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="nextjs">Next.js</SelectItem>
                      <SelectItem value="react">Create React App</SelectItem>
                      <SelectItem value="vite">Vite</SelectItem>
                      <SelectItem value="nuxt">Nuxt.js</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="root-dir" className="text-foreground">Root Directory</Label>
                <Input
                  id="root-dir"
                  value={rootDirectory}
                  onChange={(e) => setRootDirectory(e.target.value)}
                  className="bg-muted/50 border-border font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  The directory where your code is located (relative to the repository root)
                </p>
              </div>
              <Button onClick={handleSave} className="bg-orange-gradient hover:opacity-90 text-white gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </CardContent>
          </Card>

          {/* Transfer/Delete */}
          <Card className="glass-card border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>Irreversible actions for your project</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">Transfer Project</p>
                  <p className="text-sm text-muted-foreground">Transfer this project to another team</p>
                </div>
                <Button variant="outline" className="border-border">Transfer</Button>
              </div>
              <div className="flex items-center justify-between p-4 bg-destructive/10 rounded-lg border border-destructive/30">
                <div>
                  <p className="font-medium text-destructive">Delete Project</p>
                  <p className="text-sm text-muted-foreground">Permanently delete this project and all deployments</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="gap-2">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="glass-card border-border">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-foreground">Delete Project?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {projectName} and all its deployments. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground">
                        Delete Project
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Git Settings */}
        <TabsContent value="git" className="mt-6 space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-foreground">Git Repository</CardTitle>
              <CardDescription>Configure your connected repository</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <GitBranch className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">saas-vala/web</p>
                    <p className="text-sm text-muted-foreground">Connected via GitHub</p>
                  </div>
                </div>
                <Button variant="outline" className="border-border gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Reconnect
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Production Branch</Label>
                <Select value={productionBranch} onValueChange={setProductionBranch}>
                  <SelectTrigger className="bg-muted/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="main">main</SelectItem>
                    <SelectItem value="master">master</SelectItem>
                    <SelectItem value="production">production</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pushes to this branch will trigger Production deployments
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Auto Deploy</p>
                    <p className="text-sm text-muted-foreground">Automatically deploy on git push</p>
                  </div>
                  <Switch checked={autoDeployEnabled} onCheckedChange={setAutoDeployEnabled} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Preview Deployments</p>
                    <p className="text-sm text-muted-foreground">Create preview deployments for pull requests</p>
                  </div>
                  <Switch checked={previewDeploymentsEnabled} onCheckedChange={setPreviewDeploymentsEnabled} />
                </div>
              </div>

              <Button onClick={handleSave} className="bg-orange-gradient hover:opacity-90 text-white gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Build Settings */}
        <TabsContent value="build" className="mt-6 space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-foreground">Build & Development Settings</CardTitle>
              <CardDescription>Configure how your project is built and developed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="build-cmd" className="text-foreground">Build Command</Label>
                <Input
                  id="build-cmd"
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  className="bg-muted/50 border-border font-mono"
                  placeholder="npm run build"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="output-dir" className="text-foreground">Output Directory</Label>
                <Input
                  id="output-dir"
                  value={outputDirectory}
                  onChange={(e) => setOutputDirectory(e.target.value)}
                  className="bg-muted/50 border-border font-mono"
                  placeholder=".next"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="install-cmd" className="text-foreground">Install Command</Label>
                <Input
                  id="install-cmd"
                  value={installCommand}
                  onChange={(e) => setInstallCommand(e.target.value)}
                  className="bg-muted/50 border-border font-mono"
                  placeholder="npm install"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Node.js Version</Label>
                <Select value={nodeVersion} onValueChange={setNodeVersion}>
                  <SelectTrigger className="bg-muted/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="20.x">20.x (Latest)</SelectItem>
                    <SelectItem value="18.x">18.x (LTS)</SelectItem>
                    <SelectItem value="16.x">16.x</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave} className="bg-orange-gradient hover:opacity-90 text-white gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="mt-6 space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-foreground">Security Settings</CardTitle>
              <CardDescription>Configure security and access controls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-success" />
                  <div>
                    <p className="font-medium text-foreground">SSL/TLS Encryption</p>
                    <p className="text-sm text-muted-foreground">Automatic HTTPS for all deployments</p>
                  </div>
                </div>
                <Switch checked disabled />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Password Protection</p>
                    <p className="text-sm text-muted-foreground">Require password to access preview deployments</p>
                  </div>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">DDoS Protection</p>
                    <p className="text-sm text-muted-foreground">Automatic protection against DDoS attacks</p>
                  </div>
                </div>
                <Switch checked disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
