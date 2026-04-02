import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function Success() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const licenseKey = params.get('key') || '';
  const productId = params.get('product') || '';
  const tx = params.get('tx') || '';

  const hasData = useMemo(() => Boolean(licenseKey || tx), [licenseKey, tx]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-border/60 bg-card p-6 text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
        <h1 className="text-2xl font-black text-foreground">Payment Successful</h1>
        <p className="text-sm text-muted-foreground">
          Your purchase is complete. You can now access your app and keys.
        </p>

        {hasData && (
          <div className="space-y-2 text-left">
            {tx && <Badge variant="outline" className="w-full justify-center">Transaction: {tx}</Badge>}
            {productId && <Badge variant="outline" className="w-full justify-center">Product: {productId}</Badge>}
            {licenseKey && (
              <button
                className="w-full rounded-lg border border-border px-3 py-2 text-xs font-mono text-left"
                onClick={() => {
                  navigator.clipboard.writeText(licenseKey);
                  toast.success('License key copied');
                }}
              >
                <Copy className="h-3.5 w-3.5 inline mr-2" />
                {licenseKey}
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <Button variant="outline" onClick={() => navigate('/keys')}>View Keys</Button>
          <Button onClick={() => navigate(productId ? `/app/${productId}` : '/dashboard')}>Access App</Button>
        </div>
      </div>
    </div>
  );
}
