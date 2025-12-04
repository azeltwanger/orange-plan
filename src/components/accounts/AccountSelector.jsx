import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus } from 'lucide-react';

const ACCOUNT_TYPE_LABELS = {
  taxable_brokerage: 'Taxable Brokerage',
  taxable_crypto: 'Crypto (Taxable)',
  taxable_real_estate: 'Real Estate',
  '401k_traditional': 'Traditional 401(k)',
  '401k_roth': 'Roth 401(k)',
  ira_traditional: 'Traditional IRA',
  ira_roth: 'Roth IRA',
  hsa: 'HSA',
  '529': '529 Plan',
};

export default function AccountSelector({ value, onChange, onCreateNew, showCreateOption = true }) {
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  return (
    <Select value={value || '_none_'} onValueChange={onChange}>
      <SelectTrigger className="bg-zinc-900 border-zinc-700">
        <SelectValue placeholder="Select account...">
          {value && value !== '_none_' ? (
            accounts.find(a => a.id === value)?.name || 'Select account...'
          ) : (
            'No account (unassigned)'
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-zinc-900 border-zinc-700">
        <SelectItem value="_none_" className="text-zinc-400">
          No account (unassigned)
        </SelectItem>
        {accounts.map(account => (
          <SelectItem key={account.id} value={account.id}>
            <div className="flex items-center gap-2">
              <Building2 className="w-3 h-3 text-zinc-500" />
              <span>{account.name}</span>
              <span className="text-xs text-zinc-500">
                ({ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type})
              </span>
            </div>
          </SelectItem>
        ))}
        {showCreateOption && (
          <SelectItem value="_create_" className="text-orange-400">
            <div className="flex items-center gap-2">
              <Plus className="w-3 h-3" />
              <span>Create new account...</span>
            </div>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

export { ACCOUNT_TYPE_LABELS };