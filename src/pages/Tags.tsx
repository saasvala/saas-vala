import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function Tags() {
  const [productTag, setProductTag] = useState('');
  const [leadTag, setLeadTag] = useState('');
  const [productTags, setProductTags] = useState<string[]>(['featured', 'new']);
  const [leadTags, setLeadTags] = useState<string[]>(['hot', 'enterprise']);

  return (
    <DashboardLayout>
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Product Tags</CardTitle>
            <CardDescription>Tag products for filtering and grouping</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={productTag} onChange={(e) => setProductTag(e.target.value)} placeholder="Add product tag" />
              <Button onClick={() => {
                if (!productTag.trim()) return;
                setProductTags((prev) => Array.from(new Set([...prev, productTag.trim()])));
                setProductTag('');
              }}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">{productTags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Lead Tags</CardTitle>
            <CardDescription>Tag leads for segmentation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={leadTag} onChange={(e) => setLeadTag(e.target.value)} placeholder="Add lead tag" />
              <Button onClick={() => {
                if (!leadTag.trim()) return;
                setLeadTags((prev) => Array.from(new Set([...prev, leadTag.trim()])));
                setLeadTag('');
              }}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">{leadTags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

