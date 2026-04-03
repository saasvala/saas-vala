import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const seed = [
  { id: 'p-1', name: 'CRM Pro' },
  { id: 'p-2', name: 'ERP Lite' },
  { id: 'p-3', name: 'Analytics Core' },
];

export default function BulkActions() {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [value, setValue] = useState('');

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <DashboardLayout>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Bulk Action System</CardTitle>
          <CardDescription>Bulk delete, bulk update, bulk export</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {seed.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={Boolean(selected[item.id])}
                onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [item.id]: Boolean(v) }))}
              />
              {item.name}
            </label>
          ))}
          <Input placeholder="Bulk update value" value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="destructive" disabled={!selectedCount} onClick={() => toast.success(`Bulk delete applied to ${selectedCount}`)}>Bulk Delete</Button>
            <Button disabled={!selectedCount} onClick={() => toast.success(`Bulk update applied to ${selectedCount} with "${value || 'default'}"`)}>Bulk Update</Button>
            <Button variant="outline" disabled={!selectedCount} onClick={() => toast.success(`Bulk export generated for ${selectedCount}`)}>Bulk Export</Button>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

