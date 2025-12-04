import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Building2, Bitcoin, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from "@/lib/utils";

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

export default function AccountGroup({ account, holdings, getPrice, onEditHolding, onDeleteHolding, onManageLots }) {
  const [expanded, setExpanded] = useState(false);

  const totalValue = holdings.reduce((sum, h) => sum + (h.quantity * getPrice(h.ticker)), 0);
  const totalCostBasis = holdings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
  const totalGain = totalValue - totalCostBasis;
  const gainPercent = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : 0;

  const taxTreatment = account?.tax_treatment || 'taxable';

  return (
    <div className="card-premium rounded-xl border border-zinc-800/50 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-zinc-400" />
          </div>
          <div className="text-left">
            <p className="font-semibold">{account?.name || 'Unassigned'}</p>
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
            const value = holding.quantity * price;
            const gain = value - (holding.cost_basis_total || 0);
            const gainPct = holding.cost_basis_total > 0 ? (gain / holding.cost_basis_total) * 100 : 0;

            return (
              <div
                key={holding.id}
                className="flex items-center justify-between p-3 px-4 hover:bg-zinc-800/20 transition-colors border-b border-zinc-800/30 last:border-b-0"
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
                <div className="text-right">
                  <p className="font-semibold text-sm">${value.toLocaleString()}</p>
                  {holding.cost_basis_total > 0 && (
                    <p className={cn(
                      "text-xs",
                      gain >= 0 ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}