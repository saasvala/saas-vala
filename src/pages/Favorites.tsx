import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { marketplaceApi } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

type FavoriteRow = {
  id: string;
  product_id: string;
  product_name?: string;
  created_at?: string;
};

export default function Favorites() {
  const [items, setItems] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const response = await marketplaceApi.favoriteList() as { data?: FavoriteRow[] };
        setItems(Array.isArray(response?.data) ? response.data : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Favorites</h1>
          <p className="text-sm text-muted-foreground">Route: /favorites</p>
        </div>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Your Favorite Products</CardTitle>
            <CardDescription>Saved products for quick access</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Loading favorites...</p>}
            {!loading && items.length === 0 && (
              <p className="text-sm text-muted-foreground">No favorites yet.</p>
            )}
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                <div className="space-y-1">
                  <p className="font-medium">{item.product_name || 'Untitled Product'}</p>
                  <Badge variant="outline">
                    {item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown date'}
                  </Badge>
                </div>
                <Button onClick={() => navigate(`/product/${item.product_id}`)}>View</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
