import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAutomation } from '@/hooks/useAutoMation';
import { GitHubMultiAccountPanel } from './GitHubMultiAccountPanel';
import { SourceCodeCatalogPanel } from './SourceCodeCatalogPanel';
import { BulkVercelDeployPanel } from './BulkVercelDeployPanel';
import { 
  Bot, 
  Zap, 
  Calendar, 
  Bell, 
  CreditCard, 
  Link2, 
  Rocket,
  AlertTriangle,
  Users,
  Package,
  Loader2,
  Plus,
  GitBranch,
  FolderCode
} from 'lucide-react';
import { toast } from 'sonner';

export function AutoPilotDashboard() {
  const {
    clientRequests,
    softwareQueue,
    loading,
    processing,
    submitClientRequest,
    generateDailySoftware,
    checkBillingAlerts,
    addBillingItem,
    getUpcomingBills,
    getPendingRequests,
    getTodaysQueue
  } = useAutomation();

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [newRequest, setNewRequest] = useState({
    name: '',
    business_type: '',
    country: '',
    language: '',
    budget: 0,
    features_required: '',
  });
  const [newBilling, setNewBilling] = useState({
    user_id: '',
    service_name: '',
    amount: 0,
    billing_cycle: 'monthly',
  });

  const upcomingBills = getUpcomingBills();
  const pendingRequests = getPendingRequests();
  const todaysQueue = getTodaysQueue();

  const handleSubmitRequest = async () => {
    if (!newRequest.name || !newRequest.business_type || !newRequest.country || !newRequest.language || !newRequest.features_required) {
      toast.error('Please fill all required client request fields');
      return;
    }
    await submitClientRequest(newRequest);
    setNewRequest({
      name: '',
      business_type: '',
      country: '',
      language: '',
      budget: 0,
      features_required: '',
    });
    setShowRequestForm(false);
  };

  const handleAddBilling = async () => {
    if (!newBilling.user_id || !newBilling.service_name || newBilling.amount <= 0 || !newBilling.billing_cycle) {
      toast.error('Please fill in all required billing fields');
      return;
    }
    await addBillingItem(newBilling);
    setNewBilling({
      user_id: '',
      service_name: '',
      amount: 0,
      billing_cycle: 'monthly',
    });
    setShowBillingForm(false);
  };

  // Check billing alerts on mount
  useEffect(() => {
    checkBillingAlerts();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500/20 text-blue-400">In Progress</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return 'text-red-400';
      case 2:
        return 'text-orange-400';
      case 3:
        return 'text-yellow-400';
      default:
        return 'text-green-400';
    }
  };

  return (
    <Tabs defaultValue="autopilot" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
        <TabsTrigger value="autopilot" className="gap-2">
          <Bot className="h-4 w-4" />
          Auto-Pilot
        </TabsTrigger>
        <TabsTrigger value="vercel" className="gap-2">
          <Rocket className="h-4 w-4" />
          Vercel Deploy
        </TabsTrigger>
        <TabsTrigger value="github" className="gap-2">
          <GitBranch className="h-4 w-4" />
          GitHub Accounts
        </TabsTrigger>
        <TabsTrigger value="catalog" className="gap-2">
          <FolderCode className="h-4 w-4" />
          Source Catalog
        </TabsTrigger>
      </TabsList>

      <TabsContent value="vercel">
        <BulkVercelDeployPanel />
      </TabsContent>

      <TabsContent value="github">
        <GitHubMultiAccountPanel />
      </TabsContent>

      <TabsContent value="catalog">
        <SourceCodeCatalogPanel />
      </TabsContent>

      <TabsContent value="autopilot" className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Requests</p>
                  <p className="text-3xl font-bold text-blue-400">{pendingRequests.length}</p>
                </div>
                <Users className="h-10 w-10 text-blue-400/50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today's Software</p>
                  <p className="text-3xl font-bold text-green-400">{todaysQueue.length}/2</p>
                </div>
                <Package className="h-10 w-10 text-green-400/50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Upcoming Bills</p>
                  <p className="text-3xl font-bold text-orange-400">{upcomingBills.length}</p>
                </div>
                <CreditCard className="h-10 w-10 text-orange-400/50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Backlinks</p>
                  <p className="text-3xl font-bold text-purple-400">Auto</p>
                </div>
                <Link2 className="h-10 w-10 text-purple-400/50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            AI Auto-Pilot Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={() => setShowRequestForm(!showRequestForm)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Client Request
            </Button>
            <Button 
              onClick={generateDailySoftware}
              disabled={processing}
              variant="secondary"
              className="gap-2"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Generate 2 Daily Software
            </Button>
            <Button 
              onClick={() => checkBillingAlerts()}
              variant="outline"
              className="gap-2"
            >
              <Bell className="h-4 w-4" />
              Check Billing Alerts
            </Button>
            <Button 
              onClick={() => setShowBillingForm(!showBillingForm)}
              variant="outline"
              className="gap-2"
            >
              <Calendar className="h-4 w-4" />
              Add Billing Item
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* New Client Request Form */}
      {showRequestForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          <Card className="border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                New Client Request (AI Auto-Handle)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input placeholder="Name *" value={newRequest.name} onChange={(e) => setNewRequest({ ...newRequest, name: e.target.value })} />
                <Input placeholder="Business Type *" value={newRequest.business_type} onChange={(e) => setNewRequest({ ...newRequest, business_type: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select value={newRequest.country} onValueChange={(val) => setNewRequest({ ...newRequest, country: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Country *" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="india">India</SelectItem>
                    <SelectItem value="nigeria">Nigeria</SelectItem>
                    <SelectItem value="kenya">Kenya</SelectItem>
                    <SelectItem value="south-africa">South Africa</SelectItem>
                    <SelectItem value="global">Global</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={newRequest.language} onValueChange={(val) => setNewRequest({ ...newRequest, language: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Language *" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="english">English</SelectItem>
                    <SelectItem value="hindi">Hindi</SelectItem>
                    <SelectItem value="french">French</SelectItem>
                    <SelectItem value="arabic">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Budget"
                type="number"
                value={newRequest.budget || ''}
                onChange={(e) => setNewRequest({ ...newRequest, budget: parseFloat(e.target.value) || 0 })}
              />
              <Textarea 
                placeholder="Features Required *"
                value={newRequest.features_required}
                onChange={(e) => setNewRequest({ ...newRequest, features_required: e.target.value })}
                rows={4}
              />
              <div className="flex gap-2">
                <Button onClick={handleSubmitRequest} disabled={processing} className="gap-2">
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  Submit to AI Auto-Pilot
                </Button>
                <Button variant="outline" onClick={() => setShowRequestForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* New Billing Form */}
      {showBillingForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          <Card className="border-orange-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-orange-400" />
                Add Billing Item (4-Day Alert)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  placeholder="User ID *"
                  value={newBilling.user_id}
                  onChange={(e) => setNewBilling({ ...newBilling, user_id: e.target.value })}
                />
                <Input 
                  placeholder="Service Name *"
                  value={newBilling.service_name}
                  onChange={(e) => setNewBilling({ ...newBilling, service_name: e.target.value })}
                />
                <Select value={newBilling.billing_cycle} onValueChange={(val) => setNewBilling({ ...newBilling, billing_cycle: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Billing Cycle *" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                <Input 
                  placeholder="Amount ($) *"
                  type="number"
                  value={newBilling.amount || ''}
                  onChange={(e) => setNewBilling({ ...newBilling, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddBilling} className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Add & Enable 4-Day Alert
                </Button>
                <Button variant="outline" onClick={() => setShowBillingForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Upcoming Bills Alert */}
      {upcomingBills.length > 0 && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-400">
              <AlertTriangle className="h-5 w-5" />
              ⚠️ Upcoming Bills (Next 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                    <div>
                      <p className="font-medium">{bill.service_name}</p>
                      <p className="text-sm text-muted-foreground">User: {bill.user_id || 'N/A'} • {bill.billing_cycle}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-orange-400">${bill.amount}</p>
                      <p className="text-sm text-muted-foreground">Status: {bill.status}</p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Client Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Recent Client Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : clientRequests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No client requests yet</p>
          ) : (
            <div className="space-y-3">
              {clientRequests.slice(0, 5).map((request) => (
                <div key={request.id} className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{request.name}</p>
                        <Badge variant="outline">{request.business_type}</Badge>
                        <span className={`text-xs font-medium ${getPriorityColor(request.ai_score || 4)}`}>
                          P{request.ai_score || 4}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{request.features_required}</p>
                      {request.assigned_to && (
                        <div className="mt-2 p-2 bg-primary/10 rounded text-sm">
                          <span className="font-medium text-primary">Assigned To: </span>
                          {request.assigned_to}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(request.status)}
                      {request.budget && (
                        <span className="text-sm font-medium">${request.budget}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Software Build Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Auto Software Builder Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {softwareQueue.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No software in queue</p>
              <Button 
                onClick={generateDailySoftware} 
                disabled={processing}
                className="mt-4 gap-2"
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Generate Today's 2 Software
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {softwareQueue.slice(0, 6).map((software) => (
                <div key={software.id} className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{software.type.toUpperCase()} Build</p>
                      <p className="text-sm text-muted-foreground">
                        Priority: {software.priority} • Retries: {software.retry_count}
                      </p>
                      {software.logs && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {software.logs}
                        </p>
                      )}
                    </div>
                    {getStatusBadge(software.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
  );
}
