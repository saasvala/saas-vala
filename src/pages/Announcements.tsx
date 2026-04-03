import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

const KEY = 'sv_admin_broadcast';

export default function Announcements() {
  const { isSuperAdmin } = useAuth();
  const [text, setText] = useState(localStorage.getItem(KEY) || 'Welcome! Check latest updates in dashboard.');

  const save = () => {
    localStorage.setItem(KEY, text);
  };

  return (
    <DashboardLayout>
      <Card className="glass-card max-w-3xl">
        <CardHeader>
          <CardTitle>Announcement System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Admin broadcast and update notification shown in top banner/dashboard.</p>
          <Input value={text} onChange={(e) => setText(e.target.value)} />
          {isSuperAdmin && <Button onClick={save}>Save Broadcast</Button>}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

