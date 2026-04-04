import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { apiClient } from '@/services/apiClient';
import { RefreshCw, Plus, FileText, AlertTriangle, Download, XCircle } from 'lucide-react';

type BuildItem = {
  id: string;
  repo_name: string;
  repo_url: string;
  slug: string;
  build_status: string;
  build_error: string | null;
  build_attempts: number;
  apk_file_path: string | null;
  product_id?: string | null;
  created_at: string;
};

type PipelineStatusPayload = {
  id: string;
  pipeline_id: string;
  status: string;
  raw_status?: string;
  current_step?: string;
};

function getApkDownloadUrl(data: unknown): string | null {
  const payload = data as {
    download_url?: string;
    url?: string;
    data?: { download_url?: string; url?: string };
  } | null;
  if (!payload || typeof payload !== 'object') return null;
  return payload.download_url || payload.url || payload.data?.download_url || payload.data?.url || null;
}

const PIPELINE_ID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveBuildHistoryRows(data: unknown): BuildItem[] {
  if (Array.isArray(data)) return data as BuildItem[];
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: BuildItem[] }).data;
  }
  return [];
}

export default function ApkPipeline() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [builds, setBuilds] = useState<BuildItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [repoName, setRepoName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [pollStatus, setPollStatus] = useState<PipelineStatusPayload | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const isNewRoute = location.pathname === '/admin/apk-pipeline/new';
  const isLogsRoute = location.pathname.endsWith('/logs');
  const isErrorsRoute = location.pathname.endsWith('/errors');
  const isOutputRoute = location.pathname.endsWith('/output');
  const isDetailRoute = !!id && !isLogsRoute && !isErrorsRoute && !isOutputRoute;
  const isIdRoute = !!id;

  const selected = useMemo(() => builds.find((b) => b.id === id) || null, [builds, id]);
  const pipelineLabel = (pollStatus?.status || selected?.build_status || 'unknown').toString();

  const fetchBuilds = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await apiClient.get<BuildItem[] | { data: BuildItem[] }>('apk/history');
      if (error) throw new Error(error);
      setBuilds(resolveBuildHistoryRows(data));
    } catch (e: any) {
      toast.error(e.message || 'Failed to load pipeline history');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async (pipelineId: string) => {
    const res = await apiClient.get<{ data: PipelineStatusPayload }>(`pipeline/status/${pipelineId}`);
    if (res.error) return;
    const payload = (res.data as any)?.data || (res.data as any);
    if (payload?.id) setPollStatus(payload);
  }, []);

  const loadLogs = useCallback(async (pipelineId: string) => {
    const res = await apiClient.get<{ data: { logs: string[] } }>(`pipeline/logs/${pipelineId}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const payload = (res.data as any)?.data || {};
    setLogs(Array.isArray(payload.logs) ? payload.logs : []);
  }, []);

  const loadErrors = useCallback(async (pipelineId: string) => {
    const res = await apiClient.get<{ data: { error: string | null } }>(`pipeline/errors/${pipelineId}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const payload = (res.data as any)?.data || {};
    setErrorDetail(payload.error || null);
  }, []);

  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  useEffect(() => {
    if (!isIdRoute) return;
    if (!id || !PIPELINE_ID_FORMAT.test(id)) {
      navigate('/admin/apk-pipeline', { replace: true });
      return;
    }
    loadStatus(id);
    if (isLogsRoute) loadLogs(id);
    if (isErrorsRoute) loadErrors(id);
  }, [id, isIdRoute, isLogsRoute, isErrorsRoute, navigate, loadStatus, loadLogs, loadErrors]);

  useEffect(() => {
    if (!id || !isIdRoute) return;
    const timer = setInterval(() => loadStatus(id), 4000);
    return () => clearInterval(timer);
  }, [id, isIdRoute, loadStatus]);

  const startPipeline = async () => {
    if (!repoName.trim() || !repoUrl.trim()) {
      toast.error('Repo name and URL are required');
      return;
    }
    setCreating(true);
    try {
      const res = await apiClient.post<{ data: { pipeline_id: string } }>('pipeline/start', {
        repo_name: repoName.trim(),
        repo_url: repoUrl.trim(),
      });
      if (res.error) throw new Error(res.error);
      const pipelineId = (res.data as any)?.data?.pipeline_id || (res.data as any)?.pipeline_id;
      if (!pipelineId) throw new Error('Pipeline id missing');
      toast.success('Pipeline started');
      await fetchBuilds();
      await loadStatus(pipelineId);
      navigate(`/admin/apk-pipeline/${pipelineId}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to start pipeline');
    } finally {
      setCreating(false);
    }
  };

  const retryBuild = async (pipelineId: string) => {
    const res = await apiClient.post(`pipeline/retry/${pipelineId}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Pipeline retry queued');
    await fetchBuilds();
    await loadStatus(pipelineId);
  };

  const cancelBuild = async (pipelineId: string) => {
    const res = await apiClient.post(`pipeline/cancel/${pipelineId}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Pipeline cancelled');
    await fetchBuilds();
    await loadStatus(pipelineId);
  };

  const downloadApk = async (pipelineId: string) => {
    const res = await apiClient.get(`apk/download/${pipelineId}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const directUrl = getApkDownloadUrl(res.data);
    if (!directUrl) {
      toast.error('Download URL not available');
      return;
    }
    window.open(directUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black">APK Pipeline</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/apk-pipeline/new')}>
              <Plus className="h-4 w-4 mr-1" /> New Build
            </Button>
            <Button variant="outline" onClick={fetchBuilds} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        {isNewRoute && (
          <Card>
            <CardHeader><CardTitle>Create / Upload Project</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Repo name" value={repoName} onChange={(e) => setRepoName(e.target.value)} />
              <Input placeholder="Repo URL" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
              <Button onClick={startPipeline} disabled={creating}>
                {creating ? 'Starting...' : 'Start Pipeline'}
              </Button>
            </CardContent>
          </Card>
        )}

        {isDetailRoute && id && (
          <Card>
            <CardHeader><CardTitle>Pipeline Detail</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant="outline">{pipelineLabel.toUpperCase()}</Badge>
                <span className="text-sm text-muted-foreground">{id}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => navigate(`/admin/apk-pipeline/${id}/logs`)}>
                  <FileText className="h-4 w-4 mr-1" /> View Logs
                </Button>
                <Button variant="outline" onClick={() => navigate(`/admin/apk-pipeline/${id}/errors`)}>
                  <AlertTriangle className="h-4 w-4 mr-1" /> View Errors
                </Button>
                <Button variant="outline" onClick={() => navigate(`/admin/apk-pipeline/${id}/output`)}>
                  <Download className="h-4 w-4 mr-1" /> View APK
                </Button>
                <Button variant="outline" onClick={() => retryBuild(id)}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Retry Build
                </Button>
                <Button variant="outline" onClick={() => cancelBuild(id)}>
                  <XCircle className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLogsRoute && (
          <Card>
            <CardHeader><CardTitle>Build Logs</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              {logs.length ? logs.map((line, idx) => <p key={idx}>{line}</p>) : <p>No logs.</p>}
            </CardContent>
          </Card>
        )}

        {isErrorsRoute && (
          <Card>
            <CardHeader><CardTitle>Error + Debug View</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">{errorDetail || 'No error.'}</p>
              {id && (
                <Button className="mt-3" variant="outline" onClick={() => retryBuild(id)}>
                  Auto Debug (Retry)
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {isOutputRoute && (
          <Card>
            <CardHeader><CardTitle>APK Result</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">Download signed APK output.</p>
              {id && (
                <Button onClick={() => downloadApk(id)}>
                  <Download className="h-4 w-4 mr-1" /> Download APK
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {!isNewRoute && !isIdRoute && (
          <Card>
            <CardHeader><CardTitle>Pipeline Dashboard</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-muted-foreground text-[11px]">
                      <th className="text-left p-3">REPO</th>
                      <th className="text-left p-3">STATUS</th>
                      <th className="text-left p-3">ATTEMPTS</th>
                      <th className="text-right p-3">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {builds.map((b) => (
                      <tr key={b.id} className="border-b border-border/20">
                        <td className="p-3">
                          <p className="font-bold">{b.repo_name}</p>
                          <p className="text-[10px] text-muted-foreground">{b.slug}</p>
                        </td>
                        <td className="p-3"><Badge variant="outline">{String(b.build_status || 'queued').toUpperCase()}</Badge></td>
                        <td className="p-3">{b.build_attempts}</td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/apk-pipeline/${b.id}`)}>Open</Button>
                        </td>
                      </tr>
                    ))}
                    {builds.length === 0 && (
                      <tr><td className="p-6 text-center text-muted-foreground" colSpan={4}>No pipeline builds found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
