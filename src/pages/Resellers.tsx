import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Users,
  Edit,
  Ban,
  Play,
  Shield,
  Loader2,
  DollarSign,
  Percent,
  CheckCircle,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResellers, type Reseller } from '@/hooks/useResellers';
import { resellersApi } from '@/lib/api';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Switch } from '@/components/ui/switch';
 import { ResellerActivityPanel } from '@/components/reseller/ResellerActivityPanel';
 import { ResellerQuickActions } from '@/components/reseller/ResellerQuickActions';
import { useResellerApplications, type ResellerApplication } from '@/hooks/useResellerApplications';
import { Textarea } from '@/components/ui/textarea';

const ITEMS_PER_PAGE = 25;
const getResellerStatus = (reseller: Reseller) =>
  (reseller.status || (reseller.is_active ? 'active' : 'suspended')).toLowerCase();
const getResellerKycStatus = (reseller: Reseller) =>
  (reseller.kyc_status || (reseller.is_verified ? 'verified' : 'pending')).toLowerCase();

export default function Resellers() {
  const navigate = useNavigate();
   const { resellers, loading, total, fetchResellers, updateReseller } = useResellers();
   const { adminApplications, adminLoading, fetchAdminApplications, approveApplication, rejectApplication } = useResellerApplications();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editReseller, setEditReseller] = useState<Reseller | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<ResellerApplication | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [selectedReseller, setSelectedReseller] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    company_name: '',
    commission_percent: 10,
    credit_limit: 0,
    is_active: true,
    is_verified: false,
  });

  const filteredResellers = resellers.filter((reseller) => {
    const name = (reseller.company_name || '').toLowerCase();
    const profileName = (reseller.profile?.full_name || '').toLowerCase();
    const matchesSearch = !searchQuery || name.includes(searchQuery.toLowerCase()) || profileName.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    const normalizedStatus = getResellerStatus(reseller);
    if (activeTab === 'active') return normalizedStatus === 'active';
    if (activeTab === 'suspended') return normalizedStatus === 'suspended' || normalizedStatus === 'inactive';
    if (activeTab === 'verified') return getResellerKycStatus(reseller) === 'verified';
    return true;
  });

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const stats = {
    total: resellers.length,
    active: resellers.filter(r => getResellerStatus(r) === 'active').length,
    suspended: resellers.filter(r => {
      const status = getResellerStatus(r);
      return status === 'suspended' || status === 'inactive';
    }).length,
    verified: resellers.filter(r => getResellerKycStatus(r) === 'verified').length,
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchResellers(page, ITEMS_PER_PAGE, searchQuery);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    fetchResellers(1, ITEMS_PER_PAGE, query);
  };

  const openCreateDialog = () => {
    setEditReseller(null);
    setFormData({
      company_name: '',
      commission_percent: 10,
      credit_limit: 0,
      is_active: true,
      is_verified: false,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (reseller: Reseller) => {
    setEditReseller(reseller);
    setFormData({
      company_name: reseller.company_name || '',
      commission_percent: reseller.commission_percent,
      credit_limit: reseller.credit_limit,
      is_active: reseller.is_active,
      is_verified: reseller.is_verified,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editReseller) {
        await updateReseller(editReseller.id, formData);
      }
      // Note: Creating new reseller requires user_id from an existing user
      setDialogOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const openDetailDialog = async (reseller: Reseller) => {
    setDetailLoading(true);
    try {
      const res = await resellersApi.detail(reseller.id);
      setSelectedReseller(res.data || null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenApplication = (app: ResellerApplication) => {
    setSelectedApplication(app);
    setAdminNotes(app.notes || '');
  };

  const handleApproveApplication = async () => {
    if (!selectedApplication) return;
    setReviewLoading(true);
    try {
      await approveApplication(selectedApplication.id, { notes: adminNotes || undefined });
      await fetchResellers(currentPage, ITEMS_PER_PAGE, searchQuery);
      setSelectedApplication(null);
      setAdminNotes('');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleRejectApplication = async () => {
    if (!selectedApplication || !adminNotes.trim()) return;
    setReviewLoading(true);
    try {
      await rejectApplication(selectedApplication.id, adminNotes.trim());
      setSelectedApplication(null);
      setAdminNotes('');
    } finally {
      setReviewLoading(false);
    }
  };

  const pendingApplications = adminApplications.filter((app) => app.status === 'pending');

  useEffect(() => {
    fetchAdminApplications({ page: 1, limit: 100, status: 'pending' });
  }, [fetchAdminApplications]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              Reseller Manager
            </h2>
            <p className="text-muted-foreground">
              Manage reseller accounts, commissions, and limits
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="gap-2 border-border"
              onClick={() => window.location.assign('/reseller-dashboard')}
            >
              <Users className="h-4 w-4" />
              Reseller Dashboard
            </Button>
            <Button variant="outline" className="gap-2 border-border">
              <Download className="h-4 w-4" />
              Export
            </Button>
              <Button onClick={openCreateDialog} className="bg-orange-gradient hover:opacity-90 text-white gap-2">
                <Plus className="h-4 w-4" />
                Add Reseller
              </Button>
            </div>
          </div>

          {/* Pending reseller applications */}
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">Reseller Applications (Pending)</h3>
              <Badge variant="outline" className="border-border">
                {pendingApplications.length}
              </Badge>
            </div>
            {adminLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading applications...
              </div>
            ) : pendingApplications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending reseller applications.</p>
            ) : (
              <div className="space-y-2">
                {pendingApplications.slice(0, 8).map((app) => (
                  <div key={app.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 border border-border/60 rounded-lg p-3">
                    <div>
                      <p className="font-medium text-foreground">{app.business_name}</p>
                      <p className="text-sm text-muted-foreground">{app.contact}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleOpenApplication(app)}>
                      Review
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="h-10 w-10 mx-auto rounded-lg bg-primary/20 flex items-center justify-center mb-2">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-sm text-muted-foreground">Total</p>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="h-10 w-10 mx-auto rounded-lg bg-success/20 flex items-center justify-center mb-2">
              <Play className="h-5 w-5 text-success" />
            </div>
            <p className="text-2xl font-bold text-success">{stats.active}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="h-10 w-10 mx-auto rounded-lg bg-destructive/20 flex items-center justify-center mb-2">
              <Ban className="h-5 w-5 text-destructive" />
            </div>
            <p className="text-2xl font-bold text-destructive">{stats.suspended}</p>
            <p className="text-sm text-muted-foreground">Suspended</p>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="h-10 w-10 mx-auto rounded-lg bg-cyan/20 flex items-center justify-center mb-2">
              <Shield className="h-5 w-5 text-cyan" />
            </div>
            <p className="text-2xl font-bold text-cyan">{stats.verified}</p>
            <p className="text-sm text-muted-foreground">Verified</p>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card rounded-xl p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
              <TabsList className="bg-muted">
                <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  All ({stats.total})
                </TabsTrigger>
                <TabsTrigger value="active" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Active
                </TabsTrigger>
                <TabsTrigger value="suspended" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Suspended
                </TabsTrigger>
                <TabsTrigger value="verified" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Verified
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search resellers..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10 bg-muted/50 border-border"
                />
              </div>
              <Button variant="outline" size="icon" className="border-border">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

         {/* Main Grid: Table + Activity */}
         <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
           {/* Resellers Table */}
           <div className="xl:col-span-3 glass-card rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredResellers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-foreground mb-2">No resellers found</h3>
              <p className="text-muted-foreground mb-4">Get started by adding your first reseller</p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Reseller
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[1120px]">
                  <TableHeader>
                    <TableRow className="border-border hover:bg-muted/50">
                      <TableHead className="text-muted-foreground">Company</TableHead>
                      <TableHead className="text-muted-foreground">Commission</TableHead>
                      <TableHead className="text-muted-foreground">Credit Limit</TableHead>
                      <TableHead className="text-muted-foreground">Total Sales</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Verified</TableHead>
                      <TableHead className="text-muted-foreground">Created</TableHead>
                      <TableHead className="text-muted-foreground">Quick Actions</TableHead>
                      <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResellers.map((reseller) => (
                      <TableRow key={reseller.id} className="border-border hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <span className="font-medium text-foreground block">{reseller.company_name || reseller.profile?.full_name || 'Unnamed'}</span>
                              {reseller.profile?.full_name && reseller.company_name !== reseller.profile.full_name && (
                                <span className="text-xs text-muted-foreground">{reseller.profile.full_name}</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Percent className="h-3 w-3 text-primary" />
                            <span className="font-semibold text-primary">{reseller.commission_percent}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3 text-muted-foreground" />
                            <span className="text-foreground">₹{reseller.credit_limit.toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-success">₹{reseller.total_sales.toLocaleString()}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              (getResellerStatus(reseller) === 'active')
                                ? 'bg-success/20 text-success border-success/30'
                                : 'bg-destructive/20 text-destructive border-destructive/30'
                            )}
                          >
                            {getResellerStatus(reseller) === 'active' ? 'Active' : 'Suspended'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getResellerKycStatus(reseller) === 'verified' ? (
                            <Badge variant="outline" className="bg-cyan/20 text-cyan border-cyan/30">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Pending</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">{new Date(reseller.created_at).toLocaleDateString()}</span>
                        </TableCell>
                        <TableCell>
                          <ResellerQuickActions reseller={reseller} onAction={() => fetchResellers()} />
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover border-border">
                              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openEditDialog(reseller)}>
                                <Edit className="h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openDetailDialog(reseller)}>
                                <Eye className="h-4 w-4" /> View
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer"
                                onClick={() => {
                                  const currentStatus = getResellerStatus(reseller);
                                  const nextActive = currentStatus !== 'active';
                                  updateReseller(reseller.id, { status: nextActive ? 'active' : 'suspended', is_active: nextActive });
                                }}
                              >
                                {(getResellerStatus(reseller) === 'active') ? <Ban className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                {(getResellerStatus(reseller) === 'active') ? 'Suspend' : 'Activate'}
                              </DropdownMenuItem>
                              {getResellerKycStatus(reseller) !== 'verified' && (
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer"
                                  onClick={() => updateReseller(reseller.id, { kyc_status: 'verified', is_verified: true })}
                                >
                                  <Shield className="h-4 w-4" /> Verify
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer"
                                onClick={() => navigate(`/reseller-dashboard?reseller_id=${reseller.id}`)}
                              >
                                <Users className="h-4 w-4" /> Open Dashboard
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={total}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={handlePageChange}
              />
            </>
             )}
           </div>
 
           {/* Activity Panel */}
           <div className="xl:col-span-1">
             <ResellerActivityPanel />
           </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editReseller ? 'Edit Reseller' : 'Add Reseller'}</DialogTitle>
            <DialogDescription>
              {editReseller ? 'Update reseller details' : 'Note: Resellers are created when users sign up'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                placeholder="Acme Corp"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              />
            </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Commission (%)</Label>
                  <Input
                    type="number"
                  min="0"
                  max="100"
                  value={formData.commission_percent}
                  onChange={(e) => setFormData({ ...formData, commission_percent: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Credit Limit (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.credit_limit}
                  onChange={(e) => setFormData({ ...formData, credit_limit: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active Status</Label>
                <p className="text-sm text-muted-foreground">Allow reseller to access system</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Verified</Label>
                  <p className="text-sm text-muted-foreground">Mark as verified reseller</p>
                </div>
                <Switch
                  checked={formData.is_verified}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_verified: checked })}
                />
              </div>
              {editReseller && (
                <>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Input
                      value={(editReseller.status || (formData.is_active ? 'active' : 'suspended')).toLowerCase()}
                      readOnly
                      className="bg-muted/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>KYC Status</Label>
                    <Input
                      value={(editReseller.kyc_status || (formData.is_verified ? 'verified' : 'pending')).toLowerCase()}
                      readOnly
                      className="bg-muted/40"
                    />
                  </div>
                </>
              )}
            </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editReseller ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Detail */}
      <Dialog open={!!selectedReseller || detailLoading} onOpenChange={(open) => !open && setSelectedReseller(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Reseller Detail</DialogTitle>
            <DialogDescription>Full stats, logs and clients.</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : selectedReseller ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Sales</p><p className="font-semibold">₹{Number(selectedReseller.stats?.total_sales || 0).toLocaleString()}</p></div>
                <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Commission</p><p className="font-semibold">₹{Number(selectedReseller.stats?.total_commission || 0).toLocaleString()}</p></div>
                <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Clients</p><p className="font-semibold">{Number(selectedReseller.stats?.clients_total || 0)}</p></div>
                <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Keys</p><p className="font-semibold">{Number(selectedReseller.stats?.keys_generated || 0)}</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-md border border-border p-3">
                  <p className="font-medium mb-2">Clients</p>
                  <div className="max-h-44 overflow-y-auto space-y-2">
                    {(selectedReseller.clients || []).map((c: any) => (
                      <div key={c.id} className="text-sm border-b border-border/60 pb-1">
                        <p>{c.client_name || c.client_email}</p>
                        <p className="text-xs text-muted-foreground">{c.client_email} • ₹{Number(c.total_spent || 0).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="font-medium mb-2">Activity Logs</p>
                  <div className="max-h-44 overflow-y-auto space-y-2">
                    {(selectedReseller.logs || []).map((l: any) => (
                      <div key={l.id} className="text-sm border-b border-border/60 pb-1">
                        <p>{l.action}</p>
                        <p className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Application Review */}
      <Dialog open={!!selectedApplication} onOpenChange={(open) => !open && setSelectedApplication(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Reseller Application</DialogTitle>
            <DialogDescription>Approve or reject this reseller request.</DialogDescription>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <p className="font-medium text-foreground">{selectedApplication.business_name}</p>
                <p className="text-sm text-muted-foreground">{selectedApplication.contact}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Submitted: {new Date(selectedApplication.created_at).toLocaleString()}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Notes / Reject reason</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Optional on approve, required on reject"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedApplication(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectApplication}
              disabled={reviewLoading || !adminNotes.trim()}
            >
              {reviewLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject
            </Button>
            <Button onClick={handleApproveApplication} disabled={reviewLoading}>
              {reviewLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
