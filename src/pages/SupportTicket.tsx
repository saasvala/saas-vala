import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function SupportTicket() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const submit = () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Please fill subject and message.');
      return;
    }
    toast.success('Support ticket submitted.');
    setSubject('');
    setMessage('');
  };

  return (
    <DashboardLayout>
      <Card className="glass-card max-w-3xl">
        <CardHeader>
          <CardTitle>Support Ticket</CardTitle>
          <CardDescription>Route: /support/ticket</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <Button onClick={submit}>Submit Ticket</Button>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

