import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { feedbackApi } from '@/lib/api';
import { toast } from 'sonner';

export default function Feedback() {
  const [rating, setRating] = useState(4);
  const [message, setMessage] = useState('');

  const submit = async () => {
    try {
      await feedbackApi.post({ rating, message, source: 'dashboard-feedback' });
      toast.success('Feedback submitted.');
      setMessage('');
    } catch {
      toast.error('Feedback API failed.');
    }
  };

  return (
    <DashboardLayout>
      <Card className="glass-card max-w-3xl">
        <CardHeader>
          <CardTitle>Feedback System</CardTitle>
          <CardDescription>User feedback button + rating system (POST /feedback alias wired)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Product Rating: {rating}/5</Label>
            <Slider value={[rating]} min={1} max={5} step={1} onValueChange={(v) => setRating(v[0] || 1)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="msg">Feedback</Label>
            <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Share your feedback..." />
          </div>
          <Button onClick={submit}>Send Feedback</Button>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
