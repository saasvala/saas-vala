import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { offerApi, geoApi } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';

type OfferDetailData = {
  id: string;
  festival: string;
  discount: number;
  country: string;
  expires_in: string;
};

export default function OfferDetail() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [offer, setOffer] = useState<OfferDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        const geo = await geoApi.detect().catch(() => ({ country_code: 'ALL' }));
        const country = String((geo as any)?.country_code || 'ALL').toUpperCase();
        const response = await offerApi.getById(id, country);
        if (!mounted) return;
        if ((response as any)?.id) {
          setOffer({
            id: String((response as any).id),
            festival: String((response as any).festival || 'Festival Offer'),
            discount: Number((response as any).discount || 0),
            country: String((response as any).country || 'ALL'),
            expires_in: String((response as any).expires_in || '0 days'),
          });
        } else {
          setOffer(null);
        }
      } catch {
        if (mounted) setOffer(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    if (id) run();
    else setLoading(false);
    return () => { mounted = false; };
  }, [id]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Button variant="outline" onClick={() => navigate('/offers')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to offers
        </Button>

        {loading ? (
          <div className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">Loading offer...</div>
        ) : !offer ? (
          <div className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">Offer not found.</div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
            <h1 className="text-2xl font-black text-foreground">🎉 {offer.festival} Offer</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Flat {offer.discount}% OFF</Badge>
              <Badge variant="secondary">Country: {offer.country}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">⏳ Ends in {offer.expires_in}</p>
            <Button className="w-full" onClick={() => navigate('/checkout')}>
              Buy Now
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

