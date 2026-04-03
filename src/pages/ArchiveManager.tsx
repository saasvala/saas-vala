import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Row = { id: string; name: string; archived: boolean };

export default function ArchiveManager() {
  const [rows, setRows] = useState<Row[]>([
    { id: '1', name: 'Legacy Product A', archived: false },
    { id: '2', name: 'Lead Batch 2025-Q4', archived: false },
  ]);

  return (
    <DashboardLayout>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Archive System</CardTitle>
          <CardDescription>Archive old data and restore when needed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <span>{row.name}</span>
                <Badge variant="outline">{row.archived ? 'Archived' : 'Active'}</Badge>
              </div>
              <Button
                variant="outline"
                onClick={() => setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, archived: !item.archived } : item))}
              >
                {row.archived ? 'Restore' : 'Archive'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

