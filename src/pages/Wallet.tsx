import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Search,
  Loader2,
  Users,
  Settings,
  CreditCard,
  Smartphone,
  Globe,
  Download,
  Building2,
  Bitcoin,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { AddCreditsModal } from '@/components/wallet/AddCreditsModal';
import { AdminWalletManager } from '@/components/wallet/AdminWalletManager';
import { AutoPaySettingsModal } from '@/components/wallet/AutoPaySettingsModal';
import { WalletStatsCards } from '@/components/wallet/WalletStatsCards';
import { walletApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 25;

const transactionStatusStyles = {
  completed: 'bg-success/20 text-success border-success/30',
  pending: 'bg-warning/20 text-warning border-warning/30',
  failed: 'bg-destructive/20 text-destructive border-destructive/30',
  cancelled: 'bg-muted text-muted-foreground border-muted-foreground/30',
};

const paymentMethodIcons: Record<string, React.ReactNode> = {
  card: <CreditCard className="h-3 w-3" />,
  upi: <Smartphone className="h-3 w-3" />,
  bank: <Building2 className="h-3 w-3" />,
  crypto: <Bitcoin className="h-3 w-3" />,
  wallet: <WalletIcon className="h-3 w-3" />,
  admin: <Users className="h-3 w-3" />,
  international: <Globe className="h-3 w-3" />,
};

interface InvoiceLite {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  due_date: string | null;
  created_at: string;
}

interface WalletRequestLite {
  id: string;
  amount: number;
  method: string;
  txn_id: string;
  status: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export default function Wallet() {
  const { 
    wallet, 
    transactions, 
    loading, 
    total, 
    fetchTransactions, 
    fetchWallet,
    activeLicenses,
    expiringLicenses,
    getLastPaymentStatus 
  } = useWallet();
  const { isSuperAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('transactions');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddCredits, setShowAddCredits] = useState(false);
  const [showAutoPaySettings, setShowAutoPaySettings] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [invoices, setInvoices] = useState<InvoiceLite[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [paymentSources, setPaymentSources] = useState<WalletRequestLite[]>([]);
  const [paymentSourceLoading, setPaymentSourceLoading] = useState(false);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const getSourceDetails = (tx: typeof transactions[number]) => {
    const meta = (tx.meta as Record<string, unknown> | null) || {};
    const sourceRaw = (meta.source_type || meta.payment_method || tx.source || '').toString().toLowerCase();
    const providerRaw = (meta.provider || meta.payment_provider || '').toString().toLowerCase();
    const maskedRaw = (meta.details_masked || meta.payment_details_masked || '').toString();
    return {
      source: sourceRaw || null,
      provider: providerRaw || null,
      masked: maskedRaw || null,
    };
  };

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        const { source, provider, masked } = getSourceDetails(tx);
        const q = searchQuery.toLowerCase();
        const inSearch =
          (tx.description || '').toLowerCase().includes(q) ||
          tx.type.toLowerCase().includes(q) ||
          tx.id.toLowerCase().includes(q) ||
          (tx.reference_id || '').toLowerCase().includes(q) ||
          (source || '').includes(q) ||
          (provider || '').includes(q) ||
          (masked || '').toLowerCase().includes(q);

        const inType = typeFilter === 'all' || tx.type === typeFilter;
        const inSource = sourceFilter === 'all' || source === sourceFilter;
        const inStatus = statusFilter === 'all' || tx.status === statusFilter;
        const createdAt = new Date(tx.created_at).getTime();
        const inFrom = !fromDate || createdAt >= new Date(`${fromDate}T00:00:00`).getTime();
        const inTo = !toDate || createdAt <= new Date(`${toDate}T23:59:59`).getTime();

        return inSearch && inType && inSource && inStatus && inFrom && inTo;
      }),
    [transactions, searchQuery, typeFilter, sourceFilter, statusFilter, fromDate, toDate]
  );

  // Calculate stats
  const thisMonthCredits = transactions
    .filter(t => t.type === 'credit' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const thisMonthDebits = transactions
    .filter(t => t.type === 'debit' && t.status === 'completed')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const pendingAmount = transactions
    .filter(t => t.status === 'pending')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const lastPayment = getLastPaymentStatus();

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchTransactions(page, ITEMS_PER_PAGE);
  };

  const getPaymentMethod = (tx: typeof transactions[0]) => {
    const { source } = getSourceDetails(tx);
    return source;
  };

  const fetchInvoices = async () => {
    setInvoiceLoading(true);
    try {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, status, due_date, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      setInvoices((data || []) as InvoiceLite[]);
    } catch {
      setInvoices([]);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const fetchPaymentSources = async () => {
    setPaymentSourceLoading(true);
    try {
      const res = await walletApi.myRequests({ page: 1, limit: 50 });
      setPaymentSources((res.data || []) as WalletRequestLite[]);
    } catch {
      setPaymentSources([]);
    } finally {
      setPaymentSourceLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'invoices') void fetchInvoices();
    if (activeTab === 'payment-sources') void fetchPaymentSources();
  }, [activeTab]);

  const downloadBlob = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportLocal = (format: 'csv' | 'pdf') => {
    const header = ['txn_id', 'reference', 'type', 'amount', 'status', 'source', 'provider', 'details_masked', 'created_at'] as const;
    const rows = filteredTransactions.map((tx) => {
      const { source, provider, masked } = getSourceDetails(tx);
      return {
        txn_id: tx.id,
        reference: tx.reference_id || '',
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        source: source || '',
        provider: provider || '',
        details_masked: masked || '',
        created_at: tx.created_at,
      };
    });
    if (format === 'csv') {
      const escaped = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [header.join(','), ...rows.map((r) => header.map((k) => escaped(r[k as keyof typeof r])).join(','))].join('\n');
      downloadBlob(csv, `wallet-transactions-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
      return;
    }
    const content = rows
      .map((r) => `${r.created_at} | ${r.txn_id} | ${r.type} | ${r.amount} | ${r.status} | ${r.source} | ${r.provider} | ${r.details_masked} | ${r.reference}`)
      .join('\n');
    downloadBlob(content || 'No transactions', `wallet-transactions-${Date.now()}.txt`, 'text/plain;charset=utf-8;');
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      const res = await walletApi.export({
        format,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        search: searchQuery || undefined,
      });
      const payload = (res?.data ?? res) as { url?: string } | undefined;
      if (payload?.url) {
        window.open(payload.url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (format === 'pdf') {
        toast.error('PDF export is not supported in local fallback. Please use CSV export.');
        return;
      }
      exportLocal(format);
      toast.success('Exported CSV');
    } catch {
      if (format === 'pdf') {
        toast.error('PDF export failed and local PDF fallback is unavailable. Please export CSV.');
        return;
      }
      exportLocal('csv');
      toast.success('Exported CSV');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              Wallet & Billing
            </h2>
            <p className="text-muted-foreground">
              Manage your credits, invoices, and agreements
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => handleExport('csv')}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => handleExport('pdf')}>
              <FileText className="h-4 w-4" />
              Export PDF
            </Button>
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setShowAutoPaySettings(true)}
            >
              <Settings className="h-4 w-4" />
              Auto Pay
            </Button>
            <Button 
              className="bg-orange-gradient hover:opacity-90 text-white gap-2"
              onClick={() => setShowAddCredits(true)}
            >
              <Plus className="h-4 w-4" />
              Add Credits
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <WalletStatsCards
          balance={wallet?.balance || 0}
          loading={loading}
          thisMonthCredits={thisMonthCredits}
          thisMonthDebits={thisMonthDebits}
          pendingAmount={pendingAmount}
          lastPaymentStatus={lastPayment.status}
          lastPaymentAmount={lastPayment.amount}
          activeLicenses={activeLicenses}
          expiringLicenses={expiringLicenses}
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="glass-card rounded-xl p-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <TabsList className="bg-muted">
                <TabsTrigger value="transactions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Transactions
                </TabsTrigger>
                <TabsTrigger value="invoices" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Invoices
                </TabsTrigger>
                <TabsTrigger value="agreements" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Agreements
                </TabsTrigger>
                <TabsTrigger value="payment-sources" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1">
                  <Layers className="h-3 w-3" />
                  Sources
                </TabsTrigger>
                {isSuperAdmin && (
                  <TabsTrigger value="admin" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1">
                    <Users className="h-3 w-3" />
                    All Wallets
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="flex flex-wrap items-center gap-2 w-full md:justify-end">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Type</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="refund">Refund</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Source</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="wallet">Wallet</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Success</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[150px] bg-muted/50 border-border" />
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[150px] bg-muted/50 border-border" />
                <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search txn / reference / source..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-muted/50 border-border"
                />
                </div>
              </div>
            </div>
          </div>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="mt-6">
            <div className="glass-card rounded-xl overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <WalletIcon className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-foreground mb-2">No transactions found</h3>
                  <p className="text-muted-foreground">Your transaction history will appear here</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-muted/50">
                          <TableHead className="text-muted-foreground">Txn ID</TableHead>
                          <TableHead className="text-muted-foreground">Description</TableHead>
                          <TableHead className="text-muted-foreground">Type</TableHead>
                          <TableHead className="text-muted-foreground">Product</TableHead>
                        <TableHead className="text-muted-foreground">Method</TableHead>
                        <TableHead className="text-muted-foreground">Date</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-muted-foreground text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((tx) => {
                        const paymentMethod = getPaymentMethod(tx);
                        return (
                          <TableRow key={tx.id} className="border-border hover:bg-muted/30">
                            <TableCell className="font-mono text-xs text-muted-foreground">{tx.id.slice(0, 10)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    'h-8 w-8 rounded-lg flex items-center justify-center',
                                    tx.type === 'credit' || tx.type === 'refund' ? 'bg-success/20' : 'bg-muted'
                                  )}
                                >
                                  {tx.type === 'credit' || tx.type === 'refund' ? (
                                    <ArrowUpRight className="h-4 w-4 text-success" />
                                  ) : (
                                    <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <span className="text-foreground">{tx.description || 'Transaction'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {tx.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {tx.reference_type === 'license' && tx.reference_id ? (
                                <Badge variant="outline" className="text-xs">
                                  License #{tx.reference_id.slice(0, 8)}
                                </Badge>
                              ) : tx.reference_type === 'product' && tx.reference_id ? (
                                <Badge variant="outline" className="text-xs">
                                  Product
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {paymentMethod ? (
                                <div className="flex items-center gap-1.5">
                                  {paymentMethodIcons[paymentMethod] || <CreditCard className="h-3 w-3" />}
                                  <div className="text-xs">
                                    <p className="text-muted-foreground capitalize">{paymentMethod}</p>
                                    {(() => {
                                      const details = getSourceDetails(tx);
                                      if (!details.provider && !details.masked) return null;
                                      return (
                                        <p className="text-[11px] text-muted-foreground/90">
                                          {details.provider ? details.provider.toUpperCase() : 'Provider'}
                                          {details.masked ? ` ${details.masked}` : ''}
                                        </p>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(tx.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(transactionStatusStyles[tx.status])}
                              >
                                {tx.status}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-semibold',
                                tx.type === 'credit' || tx.type === 'refund' ? 'text-success' : 'text-foreground'
                              )}
                            >
                              {tx.type === 'credit' || tx.type === 'refund' ? '+' : '-'}₹{Math.abs(tx.amount).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="mt-6">
            <div className="glass-card rounded-xl overflow-hidden">
              {invoiceLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-display text-lg font-bold text-foreground mb-2">No invoices found</h3>
                  <p className="text-muted-foreground">Invoices auto-generated from billing appear here.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-muted/50">
                      <TableHead>Invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id} className="border-border hover:bg-muted/30">
                        <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{inv.status || 'draft'}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-right font-semibold">₹{Number(inv.total_amount || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Agreements Tab */}
          <TabsContent value="agreements" className="mt-6">
            <div className="glass-card rounded-xl p-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-display text-lg font-bold text-foreground mb-2">
                No Agreements Yet
              </h3>
              <p className="text-muted-foreground mb-4">
                Upload contracts and agreements with your clients
              </p>
              <Button className="bg-orange-gradient hover:opacity-90 text-white gap-2">
                <Plus className="h-4 w-4" />
                Upload Agreement
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="payment-sources" className="mt-6">
            <div className="glass-card rounded-xl overflow-hidden">
              {paymentSourceLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : paymentSources.length === 0 ? (
                <div className="p-12 text-center">
                  <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-display text-lg font-bold text-foreground mb-2">No payment sources yet</h3>
                  <p className="text-muted-foreground">UPI, Card, Bank and Crypto source history appears here.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-muted/50">
                      <TableHead>Source</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentSources.map((src) => {
                      const meta = src.metadata || {};
                      const provider = String((meta.provider as string) || '').toUpperCase();
                      const masked = String((meta.details_masked as string) || '');
                      return (
                        <TableRow key={src.id} className="border-border hover:bg-muted/30">
                          <TableCell>
                            <div className="text-xs">
                              <p className="capitalize text-foreground">{src.method.replace('_', ' ')}</p>
                              <p className="text-muted-foreground">{provider}{masked ? ` ${masked}` : ''}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{src.txn_id}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{src.status}</Badge></TableCell>
                          <TableCell className="text-muted-foreground">{new Date(src.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right font-semibold">₹{Number(src.amount || 0).toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Admin Wallets Tab */}
          {isSuperAdmin && (
            <TabsContent value="admin" className="mt-6">
              <AdminWalletManager />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Add Credits Modal */}
      <AddCreditsModal
        open={showAddCredits}
        onOpenChange={setShowAddCredits}
        onSuccess={fetchWallet}
      />

      {/* Auto Pay Settings Modal */}
      <AutoPaySettingsModal
        open={showAutoPaySettings}
        onOpenChange={setShowAutoPaySettings}
      />
    </DashboardLayout>
  );
}
