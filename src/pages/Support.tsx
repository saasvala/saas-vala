import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

export default function Support() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Help Center</h1>
          <p className="text-sm text-muted-foreground">Support resources, FAQ, and tickets</p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>FAQ</CardTitle>
            <CardDescription>Common questions and quick answers</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>How do I activate a product?</AccordionTrigger>
                <AccordionContent>Go to Products, choose your product, then complete purchase and license activation.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Where can I see downloads?</AccordionTrigger>
                <AccordionContent>Open Dashboard Downloads to see logs and last download time.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>How can I contact support?</AccordionTrigger>
                <AccordionContent>Create a support ticket and our team will respond with status updates.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Need direct help?</CardTitle>
            <CardDescription>Open a support ticket</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/support/ticket')}>Create Support Ticket</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

