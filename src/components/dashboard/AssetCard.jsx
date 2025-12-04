import React from 'react';
import { Zap, DollarSign, TrendingUp, Building, Coins, Package } from 'lucide-react';
import { cn } from "@/lib/utils";

const iconMap = {
  crypto: Zap,
  cash: DollarSign,
  stocks: TrendingUp,
  real_estate: Building,
  other: Coins,
  bonds: Coins,
};

const colorMap = {
  crypto: { icon: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  cash: { icon: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  stocks: { icon: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
  real_estate: { icon: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
  bonds: { icon: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
  other: { icon: 'text-zinc-400', bg: 'bg-zinc-400/10', border: 'border-zinc-400/20' },
};

export default function AssetCard({ holding, btcPrice, lotCount = 0, onManageLots, livePrice, priceChange24h }) {
  const Icon = iconMap[holding.asset_type] || Coins;
  const colors = colorMap[holding.asset_type] || colorMap.other;
  
  // Use live price if available, otherwise fall back to btcPrice for BTC or stored price
  const currentPrice = holding.ticker === 'BTC' 
    ? btcPrice 
    : (livePrice || holding.current_price || 1);
  
  const value = holding.quantity * currentPrice;

  const gainLoss = holding.cost_basis_total 
    ? value - holding.cost_basis_total 
    : 0;
  const gainLossPercent = holding.cost_basis_total 
    ? ((value - holding.cost_basis_total) / holding.cost_basis_total) * 100 
    : 0;

  return (
    <div className={cn(
      "card-premium rounded-xl p-5 border transition-all duration-300 hover:scale-[1.02] group",
      colors.border
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className={cn("p-2.5 rounded-xl", colors.bg)}>
          <Icon className={cn("w-5 h-5", colors.icon)} />
        </div>
        <div className="text-right">
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest block">
            {holding.ticker}
          </span>
          {priceChange24h !== undefined && (
            <span className={cn(
              "text-[10px]",
              priceChange24h >= 0 ? "text-emerald-400" : "text-rose-400"
            )}>
              {priceChange24h >= 0 ? '↑' : '↓'}{Math.abs(priceChange24h).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      <h3 className="font-semibold text-zinc-200 mb-1">{holding.asset_name}</h3>
      <p className="text-2xl font-bold text-zinc-100 mb-3">
        ${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>

      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500 font-mono text-xs">
          {holding.ticker === 'BTC' ? holding.quantity.toFixed(8) : holding.quantity.toLocaleString()} {holding.ticker}
        </span>
        {holding.cost_basis_total > 0 && (
          <span className={cn(
            "font-semibold text-xs px-2 py-0.5 rounded",
            gainLoss >= 0 ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10"
          )}>
            {gainLoss >= 0 ? '+' : ''}{gainLossPercent.toFixed(1)}%
          </span>
        )}
      </div>

      {lotCount > 0 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-1">
            <Package className="w-3 h-3 text-zinc-500" />
            <span className="text-xs text-zinc-500">{lotCount} tax lot{lotCount !== 1 ? 's' : ''}</span>
          </div>
          {onManageLots && (
            <button 
              onClick={(e) => { e.stopPropagation(); onManageLots(); }}
              className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
            >
              Manage
            </button>
          )}
        </div>
      )}
    </div>
  );
}