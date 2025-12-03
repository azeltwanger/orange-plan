import React from 'react';
import { Bitcoin, DollarSign, TrendingUp, Building, Coins } from 'lucide-react';
import { cn } from "@/lib/utils";

const iconMap = {
  crypto: Bitcoin,
  cash: DollarSign,
  stocks: TrendingUp,
  real_estate: Building,
  other: Coins,
  bonds: Coins,
};

const colorMap = {
  crypto: 'text-amber-400 bg-amber-400/10',
  cash: 'text-emerald-400 bg-emerald-400/10',
  stocks: 'text-blue-400 bg-blue-400/10',
  real_estate: 'text-purple-400 bg-purple-400/10',
  bonds: 'text-cyan-400 bg-cyan-400/10',
  other: 'text-zinc-400 bg-zinc-400/10',
};

export default function AssetCard({ holding, btcPrice }) {
  const Icon = iconMap[holding.asset_type] || Coins;
  const colorClass = colorMap[holding.asset_type] || colorMap.other;
  
  const value = holding.ticker === 'BTC' 
    ? holding.quantity * btcPrice 
    : holding.quantity * (holding.current_price || 1);

  const gainLoss = holding.cost_basis_total 
    ? value - holding.cost_basis_total 
    : 0;
  const gainLossPercent = holding.cost_basis_total 
    ? ((value - holding.cost_basis_total) / holding.cost_basis_total) * 100 
    : 0;

  return (
    <div className="card-glass rounded-xl p-5 hover:border-zinc-700/50 transition-all duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("p-2.5 rounded-xl", colorClass)}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          {holding.ticker}
        </span>
      </div>

      <h3 className="font-semibold text-zinc-100 mb-1">{holding.asset_name}</h3>
      <p className="text-2xl font-bold text-zinc-100 mb-2">
        ${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>

      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500">
          {holding.quantity.toLocaleString()} {holding.ticker}
        </span>
        {holding.cost_basis_total > 0 && (
          <span className={cn(
            "font-medium",
            gainLoss >= 0 ? "text-emerald-400" : "text-rose-400"
          )}>
            {gainLoss >= 0 ? '+' : ''}{gainLossPercent.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}