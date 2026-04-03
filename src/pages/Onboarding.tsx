import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { geoApi } from '@/lib/api';
import { toast } from 'sonner';

export default function Onboarding() {
  const navigate = useNavigate();
  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const userId = useMemo(() => localStorage.getItem('sv_user_id') || 'default', []);

  useEffect(() => {
    const run = async () => {
      try {
        const geo = await geoApi.detect();
        if (geo?.language) setLanguage(String(geo.language).toLowerCase());
        if (geo?.currency) setCurrency(String(geo.currency).toUpperCase());
      } catch {}
      setLoading(false);
    };
    void run();
  }, []);

  const handleContinue = () => {
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }
    localStorage.setItem('sv_language', language);
    localStorage.setItem('sv_currency', currency);
    localStorage.setItem(`sv_onboarding_done_${userId}`, '1');
    toast.success('Setup complete. Dashboard ready.');
    navigate('/dashboard', { replace: true });
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Welcome to SaaS VALA</h1>
        <p className="text-sm text-muted-foreground">First login → setup → dashboard ready</p>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>
              {step === 1 ? 'Welcome Screen' : step === 2 ? 'Guided Tour' : 'Auto Setup'}
            </CardTitle>
            <CardDescription>
              {step === 1
                ? 'Let’s configure your account in a minute.'
                : step === 2
                  ? 'Quick tour: Dashboard, Products, Wallet, and Support.'
                  : 'Language and currency have been auto-detected.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 3 && (
              <div className="flex gap-2">
                <Badge variant="outline">Language: {loading ? 'Detecting...' : language.toUpperCase()}</Badge>
                <Badge variant="outline">Currency: {loading ? 'Detecting...' : currency}</Badge>
              </div>
            )}
            <Button onClick={handleContinue}>{step < 3 ? 'Next' : 'Finish Setup'}</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

