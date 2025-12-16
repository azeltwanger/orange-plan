import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Trash2 } from 'lucide-react';

const ACCOUNT_TYPES = [
  { value: 'taxable_brokerage', label: 'Taxable Brokerage', tax: 'taxable' },
  { value: 'taxable_crypto', label: 'Crypto Exchange/Wallet', tax: 'taxable' },
  { value: 'taxable_real_estate', label: 'Real Estate', tax: 'taxable' },
  { value: '401k_traditional', label: 'Traditional 401(k)', tax: 'tax_deferred' },
  { value: '401k_roth', label: 'Roth 401(k)', tax: 'tax_free' },
  { value: 'ira_traditional', label: 'Traditional IRA', tax: 'tax_deferred' },
  { value: 'ira_roth', label: 'Roth IRA', tax: 'tax_free' },
  { value: 'hsa', label: 'HSA', tax: 'tax_free' },
  { value: '529', label: '529 Plan', tax: 'tax_free' },
];

export default function EditAccountDialog({ open, onClose, account }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    account_type: 'taxable_brokerage',
    institution: '',
    notes: '',
    roth_contributions: '',
  });

  useEffect(() => {
    if (account) {
      setForm({
        name: account.name || '',
        account_type: account.account_type || 'taxable_brokerage',
        institution: account.institution || '',
        notes: account.notes || '',
        roth_contributions: account.roth_contributions || '',
      });
    }
  }, [account]);

  const updateAccount = useMutation({
    mutationFn: async (data) => {
      const accountType = ACCOUNT_TYPES.find(t => t.value === data.account_type);
      return base44.entities.Account.update(account.id, {
        ...data,
        tax_treatment: accountType?.tax || 'taxable',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      console.log("=== DELETING ACCOUNT AND ALL DATA ===", account.id, account.name);
      
      // Get associated holdings
      const allHoldings = await base44.entities.Holding.list();
      const accountHoldings = allHoldings.filter(h => h.account_id === account.id);
      console.log(`Found ${accountHoldings.length} holdings to delete`);
      
      // Get associated transactions (both buys and sells)
      const allTransactions = await base44.entities.Transaction.list();
      const accountTransactions = allTransactions.filter(t => t.account_id === account.id);
      console.log(`Found ${accountTransactions.length} transactions to delete`);
      
      // Delete holdings first
      for (const h of accountHoldings) {
        await base44.entities.Holding.delete(h.id);
      }
      console.log(`✅ Deleted ${accountHoldings.length} holdings`);
      
      // Delete transactions in batches to avoid rate limits
      const batchSize = 20;
      for (let i = 0; i < accountTransactions.length; i += batchSize) {
        const batch = accountTransactions.slice(i, i + batchSize);
        
        await Promise.all(batch.map(t => 
          base44.entities.Transaction.delete(t.id)
        ));
        
        console.log(`Deleted transactions ${i + 1} to ${Math.min(i + batchSize, accountTransactions.length)} of ${accountTransactions.length}`);
        
        // Delay between batches to avoid rate limits
        if (i + batchSize < accountTransactions.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      console.log(`✅ Deleted ${accountTransactions.length} transactions`);
      
      // Now delete the account
      await base44.entities.Account.delete(account.id);
      console.log("✅ Account deleted");
      
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
    },
    onError: (error) => {
      console.error("Delete failed:", error);
      alert("Delete failed: " + error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    updateAccount.mutate({
      ...form,
      roth_contributions: parseFloat(form.roth_contributions) || 0,
    });
  };

  const handleDelete = () => {
    if (window.confirm(
      `Delete "${account?.name}"?\n\n` +
      `⚠️ This will permanently delete:\n` +
      `• All holdings in this account\n` +
      `• All transactions (tax lots) in this account\n\n` +
      `This cannot be undone.`
    )) {
      deleteAccount.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-orange-400" />
            Edit Account
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-zinc-400">Account Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Fidelity Brokerage"
              className="bg-zinc-900 border-zinc-700"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-400">Account Type (Tax Treatment)</Label>
            <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {ACCOUNT_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                    <span className="text-xs text-zinc-500 ml-2">
                      ({type.tax === 'taxable' ? 'Taxable' : type.tax === 'tax_deferred' ? 'Tax-Deferred' : 'Tax-Free'})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-400">Institution (Optional)</Label>
            <Input
              value={form.institution}
              onChange={(e) => setForm({ ...form, institution: e.target.value })}
              placeholder="e.g., Fidelity, Vanguard, Coinbase"
              className="bg-zinc-900 border-zinc-700"
            />
          </div>

          {/* Show Roth Contributions field only for Roth accounts */}
          {(form.account_type === '401k_roth' || form.account_type === 'ira_roth' || form.account_type === 'hsa') && (
            <div className="space-y-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Label className="text-purple-300">Total Contributions Made ($)</Label>
              <Input
                type="number"
                value={form.roth_contributions}
                onChange={(e) => setForm({ ...form, roth_contributions: e.target.value })}
                placeholder="e.g., 50000"
                className="bg-zinc-900 border-zinc-700"
              />
              <p className="text-xs text-zinc-500">
                Your contributions (not gains) are accessible penalty-free before age 59½
              </p>
            </div>
          )}

          <DialogFooter className="pt-4 flex justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleDelete} 
              className="bg-transparent border-rose-700 text-rose-400 hover:bg-rose-900/30"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="bg-transparent border-zinc-700">
                Cancel
              </Button>
              <Button type="submit" className="brand-gradient text-white" disabled={updateAccount.isPending}>
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}