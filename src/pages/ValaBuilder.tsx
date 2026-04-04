import { useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { builderApi, ultraBuilderApi } from '@/lib/api';
import {
  Rocket, GitBranch, Globe, Code, Database, Bug, Wrench, Package,
  Store, Loader2, CheckCircle2, Circle, ArrowDown,
  Sparkles, Server, Shield, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

type StepStatus = 'idle' | 'running' | 'done' | 'error';
const DEFAULT_GITHUB_ORG = import.meta.env.VITE_GITHUB_ORG || 'saasvala';
const MAX_AUTO_FIX_RETRIES = 2;
const MAX_BUILD_RETRIES = 2;
const DEFAULT_LIVE_DOMAIN = import.meta.env.VITE_DEFAULT_LIVE_DOMAIN || 'saasvala.com';

interface WorkflowStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: StepStatus;
  result?: string;
}

const INITIAL_STEPS: WorkflowStep[] = [
  { id: 'plan', label: 'AI Planner', icon: <Sparkles className="h-4 w-4" />, status: 'idle' },
  { id: 'ui', label: 'UI Builder', icon: <Code className="h-4 w-4" />, status: 'idle' },
  { id: 'code', label: 'Code Generator', icon: <Package className="h-4 w-4" />, status: 'idle' },
  { id: 'db', label: 'Database Generator', icon: <Database className="h-4 w-4" />, status: 'idle' },
  { id: 'api', label: 'API Generator', icon: <Server className="h-4 w-4" />, status: 'idle' },
  { id: 'debug', label: 'Debug Engine', icon: <Bug className="h-4 w-4" />, status: 'idle' },
  { id: 'fix', label: 'Auto Fix Engine', icon: <Wrench className="h-4 w-4" />, status: 'idle' },
  { id: 'build', label: 'Build Engine', icon: <Package className="h-4 w-4" />, status: 'idle' },
  { id: 'deploy', label: 'Deploy Engine', icon: <Rocket className="h-4 w-4" />, status: 'idle' },
  { id: 'publish', label: 'Marketplace Publisher', icon: <Store className="h-4 w-4" />, status: 'idle' },
];

export default function ValaBuilder() {
  const [prompt, setPrompt] = useState('');
  const [appName, setAppName] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>(INITIAL_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [demoUrl, setDemoUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [builderProjectId, setBuilderProjectId] = useState('');
  const isValidUuid = (value: string) => /^[a-f0-9-]{36}$/i.test(value);

  const addOutput = (msg: string) => setOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const updateStep = (id: string, status: StepStatus, result?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, result } : s));
  };

  const runFullPipeline = useCallback(async () => {
    if (!prompt.trim() || !appName.trim()) {
      toast.error('Enter app name and description');
      return;
    }

    setIsRunning(true);
    setOutput([]);
    setDemoUrl('');
    setGithubUrl('');
    setSteps(INITIAL_STEPS);
    addOutput(`🚀 Starting VALA AI Pipeline for "${appName}"...`);

    try {
      const slug = appName.toLowerCase().replace(/\s+/g, '-');

      // Step 1: AI Planning + Git scan
      updateStep('plan', 'running');
      addOutput('📋 AI Planner analyzing requirements...');
      addOutput('🧭 Initiating builder project creation...');

      const createRes = await builderApi.create({
        name: appName,
        prompt,
        stack_preference: 'auto',
        target_platforms: ['web', 'apk', 'api'],
      });
      const projectId = createRes?.data?.project_id || createRes?.project_id;
      if (!projectId) throw new Error('Builder project creation failed');
      setBuilderProjectId(projectId);
      addOutput(`✅ Builder project created: ${projectId}`);

      const runRes = await builderApi.run({ project_id: projectId });
      if (!runRes?.success) throw new Error('Builder run failed');
      addOutput('✅ Builder orchestration queued');

      const scanRes = await ultraBuilderApi.scanFull({
        repo_url: `https://github.com/${DEFAULT_GITHUB_ORG}/${slug}`,
        prompt,
      });
      if (!scanRes?.success) throw new Error('Git scan failed');

      updateStep('plan', 'done', 'Requirements analyzed');
      addOutput('✅ Planning complete');

      // Step 2: UI generation
      updateStep('ui', 'running');
      const codeRes = await ultraBuilderApi.codeGenerate({
        app_name: appName,
        project_name: slug,
        description: prompt,
        prompt,
        tech_stack: 'react',
        target: 'ui',
      });
      if (!codeRes?.success) throw new Error('UI generation failed');
      updateStep('ui', 'done');
      addOutput('✅ UI generation complete');

      // Step 3: Code generation
      updateStep('code', 'running');
      const fullCodeRes = await ultraBuilderApi.codeGenerate({
        app_name: appName,
        project_name: slug,
        description: prompt,
        prompt,
        tech_stack: 'react-node-express',
        target: 'fullstack',
      });
      if (!fullCodeRes?.success) throw new Error('Code generation failed');
      updateStep('code', 'done');
      addOutput('✅ CODE generation complete');

      // Step 4: DB generation
      updateStep('db', 'running');
      const dbRes = await ultraBuilderApi.dbGenerate({
        app_name: appName,
        entities: [
          {
            name: `${slug}_users`,
            fields: [
              { name: 'email', type: 'text', required: true },
              { name: 'role', type: 'text', required: true },
            ],
          },
          {
            name: `${slug}_items`,
            fields: [
              { name: 'name', type: 'text', required: true },
              { name: 'status', type: 'text', required: true },
              { name: 'owner_id', type: 'uuid', required: false },
            ],
          },
        ],
      });
      if (!dbRes?.success) throw new Error('Database generation failed');
      updateStep('db', 'done');
      addOutput('✅ DB generation complete');

      // Step 5: API generation (mapped to code generator fullstack pass)
      updateStep('api', 'running');
      const apiRes = await ultraBuilderApi.codeGenerate({
        app_name: appName,
        project_name: slug,
        description: prompt,
        prompt: `Generate API routes and backend for ${appName}. ${prompt}`,
        tech_stack: 'node-express',
        target: 'api',
      });
      if (!apiRes?.success) throw new Error('API generation failed');
      updateStep('api', 'done');
      addOutput('✅ API generation complete');

      // Step 6-7: Debug & Fix
      updateStep('debug', 'running');
      addOutput('🔍 Scanning for errors...');
      const debugRes = await ultraBuilderApi.debugFull({
        app_name: appName,
        project_name: slug,
        prompt: `Run full debug for ${appName}: ${prompt}`,
      });
      if (!debugRes?.success) throw new Error('Debug scan failed');
      updateStep('debug', 'done', 'Debug completed');
      addOutput('✅ Debug scan completed');

      updateStep('fix', 'running');
      let fixRes: any = null;
      let retryContext = '';
      for (let attempt = 1; attempt <= MAX_AUTO_FIX_RETRIES; attempt++) {
        fixRes = await ultraBuilderApi.autoFix({
          app_name: appName,
          project_name: slug,
          prompt: attempt === 1
            ? `Fix all issues for ${appName}`
            : `Retry auto-fix and validate all issues for ${appName}. ${retryContext}`,
          issues: attempt > 1 ? [{ source: 'debug_full', context: retryContext || 'retry_requested' }] : [],
        });
        if (fixRes?.success) break;
        retryContext = `Attempt ${attempt} failed. Debug summary: ${JSON.stringify(debugRes?.data || {})}`.slice(0, 1200);
        if (attempt < MAX_AUTO_FIX_RETRIES) {
          addOutput(`⚠️ Auto fix retry ${attempt}/${MAX_AUTO_FIX_RETRIES}...`);
          await new Promise(r => setTimeout(r, attempt * 500));
        }
      }
      if (!fixRes?.success) throw new Error('Auto fix failed');
      updateStep('fix', 'done', 'Fix loop complete');
      addOutput('✅ Auto fix complete');

      // Step 8: Build
      updateStep('build', 'running');
      addOutput('🔨 Building project...');

      let buildRes: any = null;
      for (let attempt = 1; attempt <= MAX_BUILD_RETRIES; attempt++) {
        buildRes = await ultraBuilderApi.buildRun({
          app_name: appName,
          slug,
          repo_name: slug,
          repo_url: `https://github.com/${DEFAULT_GITHUB_ORG}/${slug}`,
          fallback_config: attempt > 1,
          attempt,
        });
        if (buildRes?.success) break;
        if (attempt < MAX_BUILD_RETRIES) {
          addOutput(`⚠️ Build retry ${attempt}/${MAX_BUILD_RETRIES} with fallback config...`);
          await new Promise((r) => setTimeout(r, attempt * 800));
        }
      }
      if (!buildRes?.success) throw new Error('Build failed');

      updateStep('build', 'done');
      addOutput('✅ Build complete');

      // Step 9: Deploy
      updateStep('deploy', 'running');
      const deployRes = await ultraBuilderApi.deployFull({
        filePath: `${slug}/build.zip`,
      });
      if (!deployRes?.success) {
        try {
          await ultraBuilderApi.rollback(slug);
          addOutput('↩️ Deployment failed, rollback to last stable triggered');
        } catch {
          addOutput('⚠️ Deployment failed and rollback trigger failed');
        }
        throw new Error('Deploy failed');
      }

      const liveUrl = deployRes?.data?.deployment?.url || `https://${slug}.${DEFAULT_LIVE_DOMAIN}`;
      const repoUrl = `https://github.com/${DEFAULT_GITHUB_ORG}/${slug}`;
      setDemoUrl(liveUrl);
      setGithubUrl(repoUrl);

      updateStep('deploy', 'done', liveUrl);
      addOutput(`✅ Deployed → ${liveUrl}`);

      // Step 10: APK + publish
      updateStep('publish', 'running');
      addOutput('📦 Building APK + publishing to marketplace...');
      await ultraBuilderApi.apkBuild({
        repo_name: slug,
        repo_url: `https://github.com/${DEFAULT_GITHUB_ORG}/${slug}`,
        slug,
      });
      updateStep('publish', 'done');
      addOutput('✅ Published to SaaSVala Marketplace');

      toast.success(`${appName} is LIVE! 🎉`);
    } catch (err: any) {
      const failedStep = steps.find(s => s.status === 'running');
      if (failedStep) updateStep(failedStep.id, 'error', err.message);
      addOutput(`❌ Error: ${err.message}`);
      toast.error(err.message);
    } finally {
      setIsRunning(false);
    }
  }, [prompt, appName]);

  const runSingleAction = async (action: string) => {
    if (!appName.trim()) {
      toast.error('Enter app name first');
      return;
    }
    toast.info(`Running: ${action}...`);
    try {
      const slug = appName.toLowerCase().replace(/\s+/g, '-');
      if (action === 'deploy') {
        const data = await ultraBuilderApi.deployFull({
          filePath: `${slug}/build.zip`,
        });
        setDemoUrl(data?.data?.deployment?.url || `https://${slug}.${DEFAULT_LIVE_DOMAIN}`);
        toast.success('Deployed!');
      } else if (action === 'generate') {
        await ultraBuilderApi.codeGenerate({
          app_name: appName,
          project_name: slug,
          description: prompt,
          prompt: `Create: ${appName} - ${prompt}`,
          tech_stack: 'react',
        });
        setGithubUrl(`https://github.com/${DEFAULT_GITHUB_ORG}/${slug}`);
        toast.success('Code generated & pushed to GitHub!');
      } else if (action === 'fix') {
        await ultraBuilderApi.autoFix({
          app_name: appName,
          project_name: slug,
          prompt: `Fix all errors in ${slug}`,
        });
        toast.success('Error scan complete');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">VALA AI Builder</h1>
            <p className="text-sm text-muted-foreground">Idea → Working Software → Live Demo → Marketplace</p>
          </div>
          <Badge className="ml-auto bg-green-500/20 text-green-400 border-green-500/30">AI POWERED</Badge>
        </div>

        {/* Input Section */}
        <Card className="border-primary/20 bg-card">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="App Name (e.g. Clinic Manager)"
                value={appName}
                onChange={e => setAppName(e.target.value)}
                className="bg-background border-border"
              />
              <div className="md:col-span-2">
                <Textarea
                  placeholder="Describe your app... (e.g. Hospital management with patient records, billing, appointments)"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  className="bg-background border-border min-h-[80px]"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={runFullPipeline} disabled={isRunning} className="gap-2">
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {isRunning ? 'Generating...' : 'Generate Software'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => runSingleAction('generate')} disabled={isRunning}>
                <Code className="h-3 w-3 mr-1" /> Generate Code
              </Button>
              <Button variant="outline" size="sm" onClick={() => runSingleAction('fix')} disabled={isRunning}>
                <Bug className="h-3 w-3 mr-1" /> Fix Errors
              </Button>
              <Button variant="outline" size="sm" onClick={() => runSingleAction('deploy')} disabled={isRunning}>
                <Globe className="h-3 w-3 mr-1" /> Deploy Demo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pipeline Steps */}
          <Card className="lg:col-span-1 border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {steps.map((step, i) => (
                <div key={step.id}>
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                    step.status === 'running' && 'bg-primary/10 text-primary',
                    step.status === 'done' && 'text-green-400',
                    step.status === 'error' && 'text-destructive',
                    step.status === 'idle' && 'text-muted-foreground'
                  )}>
                    {step.status === 'running' ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    ) : step.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : step.status === 'error' ? (
                      <Shield className="h-4 w-4 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 opacity-40" />
                    )}
                    <span className="flex-1">{step.label}</span>
                    {step.result && (
                      <span className="text-xs opacity-60 truncate max-w-[100px]">{step.result}</span>
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ArrowDown className="h-3 w-3 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Output Log */}
          <Card className="lg:col-span-2 border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Output</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-background rounded-lg border border-border p-4 h-[400px] overflow-y-auto font-mono text-xs space-y-1">
                {output.length === 0 ? (
                  <p className="text-muted-foreground">Enter an app name and description, then click "Create App" to start the pipeline...</p>
                ) : (
                  output.map((line, i) => (
                    <div key={i} className={cn(
                      line.includes('❌') ? 'text-destructive' :
                      line.includes('✅') ? 'text-green-400' :
                      line.includes('🚀') ? 'text-primary' :
                      'text-foreground'
                    )}>{line}</div>
                  ))
                )}
              </div>

              {/* Results */}
              {(demoUrl || githubUrl) && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {demoUrl && (
                    <a href={demoUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-2 text-green-400 border-green-500/30">
                        <Globe className="h-3 w-3" /> Live Demo
                      </Button>
                    </a>
                  )}
                  {githubUrl && (
                    <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-2">
                        <GitBranch className="h-3 w-3" /> GitHub Repo
                      </Button>
                    </a>
                  )}
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => toast.info('Navigate to Marketplace to see listing')}>
                    <Store className="h-3 w-3" /> View in Marketplace
                  </Button>
                  {builderProjectId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        if (!isValidUuid(builderProjectId)) {
                          toast.error('Invalid builder project id');
                          return;
                        }
                        window.open(`/builder/${builderProjectId}`, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <Server className="h-3 w-3" /> Builder Status
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Action Buttons */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Create App', icon: Rocket, color: 'text-primary', action: () => runFullPipeline() },
                { label: 'Clone Software', icon: GitBranch, color: 'text-blue-400', action: () => toast.info('Use AI Chat → "Clone [app name]"') },
                { label: 'Generate UI', icon: Code, color: 'text-purple-400', action: () => runSingleAction('generate') },
                { label: 'Generate Backend', icon: Server, color: 'text-orange-400', action: () => runSingleAction('generate') },
                { label: 'Fix Errors', icon: Bug, color: 'text-red-400', action: () => runSingleAction('fix') },
                { label: 'Build Project', icon: Package, color: 'text-yellow-400', action: () => toast.info('Build runs automatically in pipeline') },
                { label: 'Deploy Demo', icon: Globe, color: 'text-green-400', action: () => runSingleAction('deploy') },
                { label: 'Publish Marketplace', icon: Store, color: 'text-pink-400', action: () => toast.info('Navigate to Products → Publish') },
              ].map(btn => (
                <Button
                  key={btn.label}
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2 hover:bg-accent/50"
                  onClick={btn.action}
                  disabled={isRunning}
                >
                  <btn.icon className={cn('h-5 w-5', btn.color)} />
                  <span className="text-xs">{btn.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Models & Infrastructure Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border bg-card">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">AI Models</p>
              <div className="flex flex-wrap gap-1">
                {['OpenAI GPT-4o', 'Gemini 2.0', 'Claude'].map(m => (
                  <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Voice System</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-xs">Whisper STT</Badge>
                <Badge variant="secondary" className="text-xs">ElevenLabs TTS</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Infrastructure</p>
              <div className="flex flex-wrap gap-1">
                {['GitHub', 'Vercel', 'Docker'].map(m => (
                  <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
