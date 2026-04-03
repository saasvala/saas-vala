import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { marketplaceApi, billingApi, apkApi } from '@/lib/api';
import { toast } from 'sonner';

export default function RetryActions() {
  const [paymentId, setPaymentId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [productId, setProductId] = useState('');

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-3xl">
        <Card className="glass-card">
          <CardHeader><CardTitle>Retry Payment</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="payment_id" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} />
            <Button onClick={async () => {
              if (!paymentId) return;
              try { await marketplaceApi.retryPayment(paymentId); toast.success('Payment retry triggered.'); } catch { toast.error('Payment retry failed.'); }
            }}>Retry</Button>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader><CardTitle>Resend Invoice</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="invoice-id">Invoice ID</Label>
            <div className="flex gap-2">
              <Input id="invoice-id" placeholder="invoice_id" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
              <Button onClick={async () => {
                if (!invoiceId) return;
                try { await billingApi.send({ invoice_id: invoiceId, client_id: 'manual' }); toast.success('Invoice resend triggered.'); } catch { toast.error('Invoice resend failed.'); }
              }}>Resend</Button>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader><CardTitle>Rebuild APK</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="product_id" value={productId} onChange={(e) => setProductId(e.target.value)} />
            <Button onClick={async () => {
              if (!productId) return;
              try { await apkApi.build({ product_id: productId, mode: 'rebuild' }); toast.success('APK rebuild queued.'); } catch { toast.error('APK rebuild failed.'); }
            }}>Rebuild</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

