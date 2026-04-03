import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { marketplaceApi } from '@/lib/api';

type DownloadRow = {
  id?: string;
  product_name?: string;
  product_title?: string;
  created_at?: string;
  downloaded_at?: string;
};

export default function Downloads() {
  const [rows, setRows] = useState<DownloadRow[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await marketplaceApi.downloadHistory() as { data?: DownloadRow[] };
        setRows(Array.isArray(res?.data) ? res.data : []);
      } catch {
        setRows([]);
      }
    };
    void run();
  }, []);

  const lastDownload = useMemo(() => {
    const raw = rows
      .map((r) => r.downloaded_at || r.created_at)
      .filter(Boolean)
      .sort()
      .reverse()[0];
    return raw ? new Date(raw).toLocaleString() : 'No downloads yet';
  }, [rows]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Download History</h1>
          <p className="text-sm text-muted-foreground">Route: /dashboard/downloads</p>
        </div>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>User Download Logs</CardTitle>
            <CardDescription>Last download time and recent download entries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="outline">Last Download: {lastDownload}</Badge>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 20).map((row, idx) => (
                  <TableRow key={row.id || `${row.product_name}-${idx}`}>
                    <TableCell>{row.product_name || row.product_title || 'Unknown'}</TableCell>
                    <TableCell>{new Date(row.downloaded_at || row.created_at || Date.now()).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">No download logs found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

