import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Building2, Bitcoin, TrendingUp, TrendingDown, Pencil, Trash2, Package, ArrowRightLeft } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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

const TAX_COLORS = {
  taxable: 'text-amber-400',
  tax_deferred: 'text-blue-400',
  tax_free: 'text-emerald-400',
};

export default function AccountGroup({ account, holdings, getPrice, onEditHolding, onDeleteHolding, onManageLots, onEditAccount }) {
  const [expanded, setExpanded] = useState(false);
  const [reassigningHoldingId, setReassigningHoldingId] = useState(null);
  const queryClient = useQueryClient();

  const { data: allAccounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list(),
  });

  const reassignHolding = useMutation({
    mutationFn: async ({ holdingId, newAccountId }) => {
      await base44.entities.Holding.update(holdingId, { 
        account_id: newAccountId === '_none_' ? null : newAccountId 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setReassigningHoldingId(null);
    },
  });

  // Calculate per-holding performance using transactions if available
  const getHoldingPerformance = (holding) => {
    const value = holding.quantity * getPrice(holding.ticker);
    
    // Get cost basis from transactions for this holding/account combo
    const holdingTxs = transactions.filter(t => 
      t.asset_ticker === holding.ticker && 
      (t.account_id === holding.account_id || (!t.account_id && !holding.account_id))
    );
    
    const tickerCostBasis = holdingTxs
      .filter(t => t.type === 'buy')
      .reduce((sum, t) => sum + (t.cost_basis || t.quantity * t.price_per_unit), 0);
    const tickerSellCostBasis = holdingTxs
      .filter(t => t.type === 'sell')
      .reduce((sum, t) => sum + (t.cost_basis || 0), 0);
    
    const adjustedCostBasis = tickerCostBasis > 0 
      ? tickerCostBasis - tickerSellCostBasis 
      : (holding.cost_basis_total || 0);
    
    const gain = value - adjustedCostBasis;
    const gainPercent = adjustedCostBasis > 0 ? (gain / adjustedCostBasis) * 100 : 0;
    
    return { value, adjustedCostBasis, gain, gainPercent };
  };

  const totalValue = holdings.reduce((sum, h) => sum + (h.quantity * getPrice(h.ticker)), 0);
  const totalCostBasis = holdings.reduce((sum, h) => {
    const perf = getHoldingPerformance(h);
    return sum + perf.adjustedCostBasis;
  }, 0);
  const totalGain = totalValue - totalCostBasis;
  const gainPercent = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : 0;

  const taxTreatment = account?.tax_treatment || 'taxable';

  return (
    <div className="card-premium rounded-xl border border-zinc-800/50 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-zinc-400" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <p className="font-semibold">{account?.name || 'Unassigned'}</p>
              {account?.id && onEditAccount && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEditAccount(account); }}
                  className="p-1 rounded hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                  title="Edit account"
                >
                  <Pencil className="w-3 h-3 text-zinc-500" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">
                {ACCOUNT_TYPE_LABELS[account?.account_type] || 'Mixed'}
              </span>
              {account?.institution && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-500">{account.institution}</span>
                </>
              )}
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", 
                taxTreatment === 'taxable' ? 'bg-amber-500/10 text-amber-400' :
                taxTreatment === 'tax_deferred' ? 'bg-blue-500/10 text-blue-400' :
                'bg-emerald-500/10 text-emerald-400'
              )}>
                {taxTreatment === 'taxable' ? 'Taxable' : taxTreatment === 'tax_deferred' ? 'Tax-Deferred' : 'Tax-Free'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-lg font-bold">${totalValue.toLocaleString()}</p>
            <div className="flex items-center gap-1 justify-end">
              {totalCostBasis > 0 && (
                <span className={cn(
                  "text-xs font-medium flex items-center gap-0.5",
                  totalGain >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {totalGain >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {totalGain >= 0 ? '+' : ''}{gainPercent.toFixed(1)}%
                </span>
              )}
              <span className="text-xs text-zinc-500">({holdings.length} assets)</span>
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-zinc-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Expanded Holdings List */}
      {expanded && (
        <div className="border-t border-zinc-800/50">
          {holdings.map((holding) => {
            const price = getPrice(holding.ticker);
            const perf = getHoldingPerformance(holding);

            return (
              <div
                key={holding.id}
                className="flex items-center justify-between p-3 px-4 hover:bg-zinc-800/20 transition-colors border-b border-zinc-800/30 last:border-b-0 group"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    holding.ticker === 'BTC' ? 'bg-amber-400/10' : 'bg-zinc-800'
                  )}>
                    {holding.ticker === 'BTC' ? (
                      <Bitcoin className="w-4 h-4 text-amber-400" />
                    ) : (
                      <span className="text-xs font-bold text-zinc-400">{holding.ticker?.[0]}</span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{holding.asset_name}</p>
                    <p className="text-xs text-zinc-500">
                      {holding.ticker === 'BTC' ? holding.quantity.toFixed(8) : holding.quantity.toLocaleString()} {holding.ticker}
                      <span className="text-zinc-600 ml-1">@ ${price.toLocaleString()}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                {/* Reassign dropdown */}
                {reassigningHoldingId === holding.id ? (
                  <Select
                    value={holding.account_id || '_none_'}
                    onValueChange={(newAccountId) => {
                      reassignHolding.mutate({ holdingId: holding.id, newAccountId });
                    }}
                  >
                    <SelectTrigger className="w-40 h-8 text-xs bg-zinc-900 border-zinc-700">
                      <SelectValue placeholder="Move to..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="_none_">Unassigned</SelectItem>
                      {allAccounts.filter(a => a.id !== account?.id).map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setReassigningHoldingId(holding.id); }}
                      className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                      aria-label={`Move ${holding.asset_name} to another account`}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onManageLots?.(holding); }}
                      className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-orange-600/50 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                      aria-label={`Manage tax lots for ${holding.asset_name}`}
                    >
                      <Package className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditHolding?.(holding); }}
                      className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                      aria-label={`Edit ${holding.asset_name}`}
                    >
                      <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteHolding?.(holding);
                      }}
                      className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-rose-600/50 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
                      aria-label={`Delete ${holding.asset_name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>
                )}
                <div className="text-right min-w-[80px]">
                  <p className="font-semibold text-sm">${perf.value.toLocaleString()}</p>
                  {perf.adjustedCostBasis > 0 && (
                    <p className={cn(
                      "text-xs",
                      perf.gain >= 0 ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {perf.gain >= 0 ? '+' : ''}{perf.gainPercent.toFixed(1)}%
                    </p>
                  )}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}