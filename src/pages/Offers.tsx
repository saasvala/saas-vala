import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { offerApi, geoApi } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';

type ActiveOffer = {
  id: string;
  festival: string;
  discount: number;
  country: string;
  start_date: string;
  end_date: string;
  expires_in: string;
};

export default function Offers() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<ActiveOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState('ALL');

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        const geo = await geoApi.detect().catch(() => ({ country_code: 'ALL' }));
        const detected = String((geo as any)?.country_code || 'ALL').toUpperCase();
        if (!mounted) return;
        setCountry(detected);
        const response = await offerApi.active(detected);
        const list = Array.isArray((response as any)?.data)
          ? (response as any).data
          : (response as any)?.id
            ? [response as any]
            : [];
        if (mounted) {
          setOffers(list.map((row: any) => ({
            id: String(row.id),
            festival: String(row.festival || 'Festival Offer'),
            discount: Number(row.discount || 0),
            country: String(row.country || 'ALL'),
            start_date: String(row.start_date || ''),
            end_date: String(row.end_date || ''),
            expires_in: String(row.expires_in || '0 days'),
          })));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => { mounted = false; };
  }, []);

  const hasOffers = useMemo(() => offers.length > 0, [offers]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-foreground">Active Offers</h1>
          <p className="text-sm text-muted-foreground">Showing offers for: {country}</p>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">Loading offers...</div>
        ) : !hasOffers ? (
          <div className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">No active offers right now.</div>
        ) : (
          <div className="grid gap-3">
            {offers.map((offer) => (
              <div key={offer.id} className="rounded-xl border border-border/60 bg-card p-4 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">🎉 {offer.festival} Offer</p>
                  <p className="text-xs text-muted-foreground">⏳ Ends in {offer.expires_in}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Flat {offer.discount}% OFF</Badge>
                  <Button size="sm" onClick={() => navigate(`/offer/${offer.id}`)}>View</Button>
                  <Button size="sm" onClick={() => navigate('/checkout')}>Buy Now</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

