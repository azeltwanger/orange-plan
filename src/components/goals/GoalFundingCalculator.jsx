import React, { useMemo } from 'react';
import { Calculator, TrendingUp, Calendar, Coins, AlertTriangle } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function GoalFundingCalculator({ 
  targetAmount, 
  currentAmount, 
  targetDate, 
  fundingSources = [],
  userSettings = {},
  monthlySavingsAvailable = 0,
  btcPrice = 97000,
  linkedDcaPlan = null
}) {
  const calculation = useMemo(() => {
    if (!targetAmount || !targetDate) return null;
    
    const remaining = (targetAmount || 0) - (currentAmount || 0);
    if (remaining <= 0) return { needed: 0, monthsRemaining: 0, monthlySaving: 0, message: 'Goal achieved!' };
    
    const today = new Date();
    const target = new Date(targetDate);
    const monthsRemaining = Math.max(1, Math.ceil((target - today) / (1000 * 60 * 60 * 24 * 30)));
    const yearsRemaining = monthsRemaining / 12;
    
    // Calculate projected value from linked DCA plan
    let dcaProjectedValue = 0;
    let dcaAssetReturn = 0;
    let dcaAssetType = null;
    
    if (linkedDcaPlan && linkedDcaPlan.amount_per_period > 0) {
      // Get return rate for the DCA plan's asset
      dcaAssetReturn = getDefaultReturn(linkedDcaPlan.asset_type || 'crypto', linkedDcaPlan.asset_ticker, userSettings);
      dcaAssetType = linkedDcaPlan.asset_ticker || linkedDcaPlan.asset_type || 'Investment';
      
      // Convert DCA frequency to monthly amount
      const freqMultiplier = {
        daily: 30,
        weekly: 4.33,
        biweekly: 2.17,
        monthly: 1,
      };
      const monthlyDcaAmount = linkedDcaPlan.amount_per_period * (freqMultiplier[linkedDcaPlan.frequency] || 1);
      
      // Calculate future value of DCA contributions with compound growth
      // FV = PMT * (((1 + r)^n - 1) / r)
      const monthlyRate = (dcaAssetReturn / 100) / 12;
      if (monthlyRate > 0) {
        const factor = (Math.pow(1 + monthlyRate, monthsRemaining) - 1) / monthlyRate;
        dcaProjectedValue = monthlyDcaAmount * factor;
      } else {
        dcaProjectedValue = monthlyDcaAmount * monthsRemaining;
      }
    }
    
    // Adjust remaining amount needed after DCA contributions
    const adjustedRemaining = Math.max(0, remaining - dcaProjectedValue);
    
    // Calculate monthly saving needed (simple cash savings, no returns)
    const monthlySaving = adjustedRemaining / monthsRemaining;
    
    // Calculate shortfall if monthly savings aren't enough
    const shortfall = Math.max(0, monthlySaving - monthlySavingsAvailable);
    const totalShortfall = shortfall * monthsRemaining;
    
    // Calculate assets to sell based on funding sources
    const assetsToSell = [];
    if (totalShortfall > 0 && fundingSources && fundingSources.length > 0) {
      const totalPercent = fundingSources.reduce((sum, s) => sum + (s.percentage || 0), 0);
      fundingSources.forEach(source => {
        if (source.percentage > 0 && totalPercent > 0) {
          const amountFromSource = totalShortfall * (source.percentage / totalPercent);
          const assetType = source.asset_type || 'unknown';
          
          // Calculate quantity based on asset type
          let quantity = null;
          let priceUsed = null;
          if (assetType.toLowerCase() === 'btc' || assetType.toLowerCase() === 'bitcoin') {
            quantity = amountFromSource / btcPrice;
            priceUsed = btcPrice;
          }
          
          assetsToSell.push({
            asset_type: assetType,
            amount: amountFromSource,
            quantity,
            priceUsed
          });
        }
      });
    }

    return {
      needed: remaining,
      monthsRemaining,
      yearsRemaining: yearsRemaining.toFixed(1),
      monthlySaving: Math.max(0, monthlySaving),
      shortfall,
      totalShortfall,
      assetsToSell,
      canAfford: monthlySavingsAvailable >= monthlySaving,
      dcaProjectedValue,
      dcaAssetReturn,
      dcaAssetType,
      isShortTerm: yearsRemaining < 4,
      usingInvestmentReturns: dcaProjectedValue > 0
    };
  }, [targetAmount, currentAmount, targetDate, fundingSources, userSettings, monthlySavingsAvailable, btcPrice, linkedDcaPlan]);

  if (!calculation) {
    return (
      <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
        <p className="text-sm text-zinc-500 text-center">
          Add a target date to see monthly saving needed
        </p>
      </div>
    );
  }

  if (calculation.needed <= 0) {
    return (
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <div className="flex items-center gap-2 text-emerald-400">
          <TrendingUp className="w-5 h-5" />
          <span className="font-semibold">Goal Achieved! 🎉</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-medium text-orange-400">Saving Calculator</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-zinc-500">Remaining</p>
          <p className="text-lg font-bold text-zinc-200">
            ${calculation.needed.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Time Left</p>
          <p className="text-lg font-bold text-zinc-200">
            {calculation.yearsRemaining > 1 
              ? `${calculation.yearsRemaining} yrs` 
              : `${calculation.monthsRemaining} mo`}
          </p>
        </div>
      </div>
      
      <div className="mt-4 p-3 rounded-lg bg-orange-500/10">
        <p className="text-xs text-zinc-400 mb-1">Monthly saving needed</p>
        <p className="text-2xl font-bold text-orange-400">
          ${calculation.monthlySaving.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          <span className="text-sm font-normal text-zinc-500">/mo</span>
        </p>
        {calculation.usingInvestmentReturns ? (
          <p className="text-xs text-zinc-500 mt-1">
            Cash savings needed after {calculation.dcaAssetType} investment plan ({calculation.dcaAssetReturn.toFixed(1)}% expected return)
          </p>
        ) : (
          <p className="text-xs text-zinc-500 mt-1">
            Cash savings required to reach goal
          </p>
        )}
      </div>
      
      {calculation.dcaProjectedValue > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Linked Investment Plan</span>
          </div>
          <p className="text-xs text-zinc-400">
            Projected value from DCA: <span className="text-emerald-400 font-semibold">${calculation.dcaProjectedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            This reduces your additional monthly savings needed
          </p>
        </div>
      )}
      
      {calculation.isShortTerm && calculation.usingInvestmentReturns && (
        <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-amber-400">Short-Term Goal Warning</span>
          </div>
          <p className="text-xs text-zinc-400">
            This goal is less than 4 years away. Market volatility could significantly impact projected returns. Consider a more conservative approach or increase cash savings buffer.
          </p>
        </div>
      )}

      {/* Shortfall warning and asset sale estimate */}
      {monthlySavingsAvailable > 0 && calculation.shortfall > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-amber-400">Savings Shortfall</span>
          </div>
          <p className="text-xs text-zinc-400 mb-2">
            Your available savings (${monthlySavingsAvailable.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo) is ${calculation.shortfall.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo short.
          </p>
          
          {calculation.assetsToSell.length > 0 && (
            <div className="pt-2 border-t border-amber-500/20">
              <p className="text-xs text-zinc-500 mb-2">Estimated assets to sell by target date:</p>
              <div className="space-y-1.5">
                {calculation.assetsToSell.map((asset, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 flex items-center gap-1.5">
                      <Coins className="w-3 h-3 text-amber-400" />
                      {asset.asset_type}
                    </span>
                    <span className="text-amber-400 font-medium">
                      {asset.quantity !== null 
                        ? `${asset.quantity.toFixed(4)} ${asset.asset_type} (~$${asset.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })})`
                        : `$${asset.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                      }
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 mt-2">
                Based on current prices. Actual amount may vary.
              </p>
            </div>
          )}
        </div>
      )}

      {monthlySavingsAvailable > 0 && calculation.canAfford && (
        <div className="mt-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" />
            Your current savings can cover this goal!
          </p>
        </div>
      )}
    </div>
  );
}

function getDefaultReturn(assetType, ticker, userSettings) {
  const type = (assetType || '').toLowerCase();
  const tickerUpper = (ticker || '').toUpperCase();
  
  // Check ticker first for specific assets like BTC
  if (tickerUpper === 'BTC') {
    return userSettings.btc_cagr_assumption || 25;
  }
  
  // Then check asset type
  if (type === 'crypto') {
    return userSettings.btc_cagr_assumption || 25;
  }
  if (type === 'stocks') {
    return userSettings.stocks_cagr || 7;
  }
  if (type === 'bonds') {
    return userSettings.bonds_cagr || 3;
  }
  if (type === 'real_estate') {
    return userSettings.real_estate_cagr || 4;
  }
  if (type === 'cash') {
    return userSettings.cash_cagr || 0;
  }
  if (type === 'other') {
    return userSettings.other_cagr || 7;
  }
  
  // Default fallback
  return userSettings.stocks_cagr || 7;
}