import React, { useMemo } from 'react';
import { TrendingUp, Zap } from 'lucide-react';
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO } from 'date-fns';

// Helper to parse various date formats (M/D/YYYY or YYYY-MM-DD)
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  // Try ISO format first
  let d = parseISO(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Try US format (M/D/YYYY)
  d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
};

export default function NetWorthCard({ totalAssets, totalLiabilities, btcHoldings, btcPrice, transactions = [] }) {
  const netWorth = totalAssets - totalLiabilities;
  const btcValue = btcHoldings * btcPrice;
  const btcPercentage = totalAssets > 0 ? (btcValue / totalAssets) * 100 : 0;

  // Calculate Money-Weighted Return using XIRR
  const returnData = useMemo(() => {
    const btcTxs = transactions.filter(t => t.asset_ticker === 'BTC');
    if (btcTxs.length === 0 || btcHoldings <= 0) return null;

    const now = new Date();
    const currentValue = btcHoldings * btcPrice;
    
    // Build cash flows and dates for XIRR
    const cashFlows = [];
    const dates = [];
    
    for (const tx of btcTxs) {
      const txDate = parseDate(tx.date);
      if (!txDate) continue;
      
      const amount = tx.type === 'buy' 
        ? -Math.abs(tx.cost_basis || tx.quantity * tx.price_per_unit)
        : Math.abs(tx.total_value || tx.quantity * tx.price_per_unit);
      
      cashFlows.push(amount);
      dates.push(txDate);
    }
    
    // Add current BTC value as final positive cash flow (today)
    cashFlows.push(currentValue);
    dates.push(now);
    
    if (cashFlows.length < 2) return null;

    // Get first transaction date for display
    const sortedDates = [...dates].sort((a, b) => a - b);
    const firstDate = sortedDates[0];
    const years = differenceInDays(now, firstDate) / 365;
    
    if (years < 0.01) return null; // Less than ~4 days
    
    // Calculate total invested
    const totalInvested = cashFlows
      .filter(cf => cf < 0)
      .reduce((sum, cf) => sum + Math.abs(cf), 0);
    
    const totalReturn = totalInvested > 0 ? (currentValue - totalInvested) / totalInvested : 0;
    
    // Calculate XIRR using Newton-Raphson
    const calculateXIRR = (cfs, dts, guess = 0.1) => {
      const daysBetween = (d1, d2) => (d2 - d1) / (1000 * 60 * 60 * 24);
      const firstDt = dts[0];
      const yrs = dts.map(d => daysBetween(firstDt, d) / 365);
      
      const npv = (rate) => cfs.reduce((sum, cf, i) => sum + cf / Math.pow(1 + rate, yrs[i]), 0);
      const npvDeriv = (rate) => cfs.reduce((sum, cf, i) => {
        if (yrs[i] === 0) return sum;
        return sum - (yrs[i] * cf) / Math.pow(1 + rate, yrs[i] + 1);
      }, 0);
      
      let rate = guess;
      for (let i = 0; i < 50; i++) {
        const npvVal = npv(rate);
        const deriv = npvDeriv(rate);
        if (Math.abs(deriv) < 0.0000001) break;
        const newRate = rate - npvVal / deriv;
        if (Math.abs(newRate - rate) < 0.0000001) return newRate;
        rate = Math.max(-0.99, Math.min(5, newRate));
      }
      return rate;
    };
    
    let annualizedReturn;
    try {
      const irr = calculateXIRR(cashFlows, dates);
      if (isFinite(irr) && !isNaN(irr)) {
        annualizedReturn = irr * 100;
      } else {
        // Fallback to CAGR
        annualizedReturn = years >= 1 
          ? (Math.pow(currentValue / totalInvested, 1 / years) - 1) * 100
          : totalReturn * 100;
      }
    } catch {
      annualizedReturn = years >= 1 
        ? (Math.pow(currentValue / totalInvested, 1 / years) - 1) * 100
        : totalReturn * 100;
    }
    
    return { annualizedReturn, years, totalReturn: totalReturn * 100, isIRR: true };
  }, [transactions, btcHoldings, btcPrice]);

  return (
    <div className="relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-orange-500/5 rounded-full blur-3xl" />
      
      <div className="relative card-premium rounded-2xl p-8 lg:p-10 glow-orange">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Total Net Worth</p>
            </div>
            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight brand-gradient-text">
              ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </h1>
            <div className="flex items-center gap-6 mt-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-zinc-400">Assets</span>
                <span className="text-sm font-semibold text-zinc-200">${totalAssets.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-sm text-zinc-400">Debt</span>
                <span className="text-sm font-semibold text-zinc-200">${totalLiabilities.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-4">
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <Zap className="w-5 h-5 text-orange-400" />
              <div>
                <p className="text-2xl font-bold text-orange-400">{btcHoldings.toFixed(8)}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Bitcoin Stack</p>
              </div>
            </div>
            {returnData && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                <TrendingUp className={cn("w-4 h-4", returnData.annualizedReturn >= 0 ? "text-emerald-400" : "text-rose-400")} />
                <div className="text-right">
                  <p className={cn("text-lg font-bold", returnData.annualizedReturn >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {returnData.annualizedReturn >= 0 ? '+' : ''}{returnData.annualizedReturn.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    {returnData.isIRR ? 'IRR' : returnData.years >= 1 ? 'Annualized' : 'Return'} ({returnData.years.toFixed(1)}y)
                  </p>
                </div>
              </div>
            )}
            <p className="text-sm text-zinc-500">
              <span className="text-orange-400 font-semibold">{btcPercentage.toFixed(1)}%</span> allocation to Bitcoin
            </p>
          </div>
        </div>

        {/* BTC Allocation Bar */}
        <div className="mt-8">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full brand-gradient rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${btcPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}