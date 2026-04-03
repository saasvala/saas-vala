import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const rows = [
  { id: '1', subject: 'Invoice #INV-1001', status: 'delivered', sentAt: new Date().toISOString() },
  { id: '2', subject: 'Welcome Email', status: 'delivered', sentAt: new Date(Date.now() - 3600_000).toISOString() },
  { id: '3', subject: 'Payment Reminder', status: 'queued', sentAt: new Date(Date.now() - 7200_000).toISOString() },
];

export default function EmailLogs() {
  return (
    <DashboardLayout>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Email Log System</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Sent Time</TableHead>
                <TableHead>Delivery Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.subject}</TableCell>
                  <TableCell>{new Date(row.sentAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

