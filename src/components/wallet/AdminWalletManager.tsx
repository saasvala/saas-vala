import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Search,
  Lock,
  Unlock,
  Plus,
  Minus,
  Loader2,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import { useWallet, Wallet as WalletType } from '@/hooks/useWallet';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function AdminWalletManager() {
  const { allWallets, fetchAllWallets, addCredit, deductBalance } = useWallet();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'credit' | 'debit'>('credit');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  const filteredWallets = allWallets.filter((wallet) =>
    wallet.user_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleLock = async (wallet: WalletType) => {
    setProcessing(true);
    const { error } = await supabase
      .from('wallets')
      .update({ is_locked: !wallet.is_locked })
      .eq('id', wallet.id);

    if (error) {
      toast.error('Failed to update wallet status');
    } else {
      toast.success(wallet.is_locked ? 'Wallet unlocked' : 'Wallet locked');
      await fetchAllWallets();
    }
    setProcessing(false);
  };

  const openAdjustModal = (wallet: WalletType, type: 'credit' | 'debit') => {
    setSelectedWallet(wallet);
    setAdjustmentType(type);
    setAdjustmentAmount('');
    setAdjustmentReason('');
    setShowAdjustModal(true);
  };

  const handleAdjustment = async () => {
    if (!selectedWallet || !adjustmentAmount || !adjustmentReason) {
      toast.error('Please fill all fields');
      return;
    }

    const amount = parseFloat(adjustmentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setProcessing(true);
    try {
      if (adjustmentType === 'credit') {
        await addCredit(selectedWallet.id, amount, `Admin adjustment: ${adjustmentReason}`);
      } else {
        await deductBalance(selectedWallet.id, amount, `Admin adjustment: ${adjustmentReason}`);
      }
      setShowAdjustModal(false);
    } catch (error) {
      // Error already handled in hook
    }
    setProcessing(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-muted/50 border-border"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4" />
          <span>{allWallets.length} total wallets</span>
        </div>
      </div>

      {/* Wallets Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-muted/50">
              <TableHead className="text-muted-foreground">User ID</TableHead>
              <TableHead className="text-muted-foreground">Balance</TableHead>
              <TableHead className="text-muted-foreground">Currency</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Created</TableHead>
              <TableHead className="text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWallets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No wallets found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredWallets.map((wallet) => (
                <TableRow key={wallet.id} className="border-border hover:bg-muted/30">
                  <TableCell className="font-mono text-xs text-foreground">
                    {wallet.user_id.slice(0, 8)}...
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      'font-semibold',
                      wallet.balance < 500 ? 'text-warning' : 'text-foreground'
                    )}>
                      ₹{wallet.balance.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{wallet.currency}</TableCell>
                  <TableCell>
                    {wallet.is_locked ? (
                      <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">
                        <Lock className="h-3 w-3 mr-1" />
                        Locked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(wallet.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-success hover:text-success"
                        onClick={() => openAdjustModal(wallet, 'credit')}
                        disabled={wallet.is_locked}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => openAdjustModal(wallet, 'debit')}
                        disabled={wallet.is_locked}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleToggleLock(wallet)}
                        disabled={processing}
                      >
                        {wallet.is_locked ? (
                          <Unlock className="h-4 w-4 text-success" />
                        ) : (
                          <Lock className="h-4 w-4 text-warning" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Adjustment Modal */}
      <Dialog open={showAdjustModal} onOpenChange={setShowAdjustModal}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {adjustmentType === 'credit' ? (
                <Plus className="h-5 w-5 text-success" />
              ) : (
                <Minus className="h-5 w-5 text-destructive" />
              )}
              {adjustmentType === 'credit' ? 'Add Credit' : 'Deduct Balance'}
            </DialogTitle>
            <DialogDescription>
              Adjusting wallet for user {selectedWallet?.user_id.slice(0, 8)}...
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {adjustmentType === 'debit' && selectedWallet && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>Current balance: ₹{selectedWallet.balance.toLocaleString()}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <Input
                  id="amount"
                  placeholder="Enter amount"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value.replace(/\D/g, ''))}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (for audit log)</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for this adjustment..."
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdjustment}
              disabled={processing || !adjustmentAmount || !adjustmentReason}
              className={cn(
                adjustmentType === 'credit' 
                  ? 'bg-success hover:bg-success/90' 
                  : 'bg-destructive hover:bg-destructive/90',
                'text-white'
              )}
            >
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {adjustmentType === 'credit' ? 'Add Credit' : 'Deduct Balance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
