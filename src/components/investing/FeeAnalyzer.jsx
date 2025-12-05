import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingDown, AlertTriangle, ArrowRight, Info } from 'lucide-react';
import { cn } from "@/lib/utils";

const COLORS = ['#F7931A', '#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24'];

// Total effective cost = explicit fee + estimated spread
// Spread estimates based on typical market conditions
const EXCHANGE_INFO = {
  coinbase: { name: 'Coinbase', explicitFee: 1.49, spread: 0.5, color: '#3B82F6', keywords: ['coinbase'] },
  coinbase_pro: { name: 'Coinbase Advanced', explicitFee: 0.6, spread: 0.1, color: '#1D4ED8', keywords: ['coinbase pro', 'coinbase advanced', 'cb pro', 'cbpro'] },
  kraken: { name: 'Kraken', explicitFee: 0.26, spread: 0.1, color: '#8B5CF6', keywords: ['kraken'] },
  gemini: { name: 'Gemini', explicitFee: 1.49, spread: 0.5, color: '#06B6D4', keywords: ['gemini'] },
  binance_us: { name: 'Binance US', explicitFee: 0.1, spread: 0.1, color: '#EAB308', keywords: ['binance'] },
  strike: { name: 'Strike', explicitFee: 0, spread: 0.3, color: '#A855F7', keywords: ['strike'] },
  cash_app: { name: 'Cash App', explicitFee: 0, spread: 2.2, color: '#22C55E', keywords: ['cash app', 'cashapp', 'cash_app'] },
  swan: { name: 'Swan Bitcoin', explicitFee: 0.99, spread: 0.2, color: '#F97316', keywords: ['swan'] },
  river: { name: 'River', explicitFee: 0, spread: 0.25, color: '#0EA5E9', keywords: ['river'] },
  robinhood: { name: 'Robinhood', explicitFee: 0, spread: 0.5, color: '#10B981', keywords: ['robinhood'] },
  other: { name: 'Other', explicitFee: 0.5, spread: 0.5, color: '#71717A', keywords: [] },
  unknown: { name: 'Unknown', explicitFee: 0.5, spread: 0.5, color: '#52525B', keywords: [] },
};

// Fuzzy match exchange name to EXCHANGE_INFO key
const matchExchange = (exchangeName) => {
  if (!exchangeName) return 'unknown';
  const normalized = exchangeName.toLowerCase().trim();
  
  // First check for exact key match
  if (EXCHANGE_INFO[normalized]) return normalized;
  
  // Check keywords for each exchange (more specific first)
  // Sort by keyword length descending to match more specific terms first
  const exchanges = Object.entries(EXCHANGE_INFO);
  for (const [key, info] of exchanges) {
    if (info.keywords && info.keywords.some(kw => normalized.includes(kw))) {
      // Special case: "coinbase" should not match "coinbase_pro" unless it has pro/advanced
      if (key === 'coinbase' && (normalized.includes('pro') || normalized.includes('advanced'))) {
        continue;
      }
      return key;
    }
  }
  
  return 'other';
};

// Best-in-class total cost (Kraken Pro: 0.26% fee + ~0.1% spread = ~0.36%)
const BEST_TOTAL_COST_PERCENT = 0.36;
const INDUSTRY_AVG_COST_PERCENT = 1.0;

export default function FeeAnalyzer({ transactions = [], btcPrice = 97000 }) {
  const analysis = useMemo(() => {
    const btcTransactions = transactions.filter(t => t.asset_ticker === 'BTC' && t.type === 'buy');
    
    if (btcTransactions.length === 0) {
      return null;
    }

    let totalTradingFees = 0;
    let totalWithdrawalFees = 0;
    let totalDepositFees = 0;
    let totalSpreadCost = 0;
    let totalVolume = 0;
    let totalBtcPurchased = 0;
    const byExchange = {};

    btcTransactions.forEach(tx => {
      const tradingFee = tx.trading_fee || 0;
      const withdrawalFee = tx.withdrawal_fee || 0;
      const depositFee = tx.deposit_fee || 0;
      const txVolume = tx.quantity * tx.price_per_unit;
      
      totalTradingFees += tradingFee;
      totalWithdrawalFees += withdrawalFee;
      totalDepositFees += depositFee;
      totalVolume += txVolume;
      totalBtcPurchased += tx.quantity;

      // Calculate spread if FMV available
      if (tx.global_fmv_at_purchase && tx.price_per_unit > tx.global_fmv_at_purchase) {
        totalSpreadCost += (tx.price_per_unit - tx.global_fmv_at_purchase) * tx.quantity;
      }

      // By exchange - use fuzzy matching
      const rawExchange = tx.exchange_or_wallet || 'unknown';
      const exchange = matchExchange(rawExchange);
      if (!byExchange[exchange]) {
        byExchange[exchange] = { 
          name: EXCHANGE_INFO[exchange]?.name || rawExchange,
          tradingFees: 0, 
          withdrawalFees: 0, 
          depositFees: 0,
          volume: 0,
          transactions: 0,
        };
      }
      byExchange[exchange].tradingFees += tradingFee;
      byExchange[exchange].withdrawalFees += withdrawalFee;
      byExchange[exchange].depositFees += depositFee;
      byExchange[exchange].volume += txVolume;
      byExchange[exchange].transactions += 1;
    });

    const totalExplicitFees = totalTradingFees + totalWithdrawalFees + totalDepositFees;
    const totalFriction = totalExplicitFees + totalSpreadCost;
    const effectiveFeeRate = totalVolume > 0 ? (totalFriction / totalVolume) * 100 : 0;

    // Convert byExchange to array for charts
    const exchangeData = Object.entries(byExchange).map(([key, data]) => {
      const explicitFeeRate = data.volume > 0 ? ((data.tradingFees + data.withdrawalFees + data.depositFees) / data.volume) * 100 : 0;
      const spreadRate = EXCHANGE_INFO[key]?.spread || 0.5;
      return {
        exchange: data.name,
        exchangeKey: key,
        total: data.tradingFees + data.withdrawalFees + data.depositFees,
        tradingFees: data.tradingFees,
        withdrawalFees: data.withdrawalFees,
        depositFees: data.depositFees,
        volume: data.volume,
        feeRate: explicitFeeRate,
        spreadRate: spreadRate,
        totalFeeRate: explicitFeeRate + spreadRate,
        transactions: data.transactions,
        color: EXCHANGE_INFO[key]?.color || '#71717a',
      };
    }).sort((a, b) => b.total - a.total);

    // Fee breakdown for pie chart
    const feeBreakdown = [
      { name: 'Trading Fees', value: totalTradingFees, color: '#F7931A' },
      { name: 'Withdrawal Fees', value: totalWithdrawalFees, color: '#60a5fa' },
      { name: 'Deposit Fees', value: totalDepositFees, color: '#a78bfa' },
    ].filter(f => f.value > 0);

    if (totalSpreadCost > 0) {
      feeBreakdown.push({ name: 'Spread Cost', value: totalSpreadCost, color: '#f472b6' });
    }

    // Calculate what user would have paid at best exchange vs what they paid
    const bestCaseCost = totalVolume * (BEST_TOTAL_COST_PERCENT / 100);
    const industryAvgCost = totalVolume * (INDUSTRY_AVG_COST_PERCENT / 100);
    const potentialSavings = Math.max(0, totalFriction - bestCaseCost);
    const vsIndustryAvg = industryAvgCost - totalFriction;

    return {
      totalTradingFees,
      totalWithdrawalFees,
      totalDepositFees,
      totalSpreadCost,
      totalExplicitFees,
      totalFriction,
      totalVolume,
      totalBtcPurchased,
      effectiveFeeRate,
      exchangeData,
      feeBreakdown,
      potentialSavings,
      bestCaseCost,
      industryAvgCost,
      vsIndustryAvg,
      transactionCount: btcTransactions.length,
    };
  }, [transactions]);

  if (!analysis) {
    return (
      <div className="card-premium rounded-2xl p-8 border border-zinc-800/50 text-center">
        <DollarSign className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">No Fee Data Yet</h3>
        <p className="text-zinc-500 text-sm max-w-md mx-auto mb-6">
          Fee data is tracked when you add assets with transaction details. You can add transactions in two ways:
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center max-w-md mx-auto">
          <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 flex-1 text-left">
            <p className="text-sm font-medium text-orange-400 mb-1">1. Add New Asset</p>
            <p className="text-xs text-zinc-500">Go to Summary → Add Asset. Include fee details in step 2.</p>
          </div>
          <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 flex-1 text-left">
            <p className="text-sm font-medium text-orange-400 mb-1">2. Tax Strategy</p>
            <p className="text-xs text-zinc-500">Record transactions with fees for existing holdings.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-premium rounded-xl p-5 border border-rose-500/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Total Friction</span>
            <div className="p-2 rounded-lg bg-rose-500/10">
              <TrendingDown className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-rose-400">
            ${analysis.totalFriction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {analysis.effectiveFeeRate.toFixed(2)}% of volume
          </p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-amber-500/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Explicit Fees</span>
            <div className="p-2 rounded-lg bg-amber-500/10">
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-400">
            ${analysis.totalExplicitFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Trading + Withdrawal + Deposit
          </p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-emerald-500/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">vs Industry Avg</span>
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <ArrowRight className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className={cn("text-2xl font-bold", analysis.vsIndustryAvg >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {analysis.vsIndustryAvg >= 0 ? '-' : '+'}${Math.abs(analysis.vsIndustryAvg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            vs {INDUSTRY_AVG_COST_PERCENT}% avg
          </p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-zinc-700/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Total Volume</span>
            <div className="p-2 rounded-lg bg-zinc-800">
              <Info className="w-4 h-4 text-zinc-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-zinc-300">
            ${analysis.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {analysis.transactionCount} transactions
          </p>
        </div>
      </div>

      {/* Savings Opportunity Alert */}
      {analysis.potentialSavings > 50 && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-4">
          <div className="p-2 rounded-lg bg-emerald-500/20">
            <AlertTriangle className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h4 className="font-semibold text-emerald-400 mb-1">Optimize Your Costs</h4>
            <p className="text-sm text-zinc-400">
              Using a low-cost exchange like Kraken Pro (~0.36% total) could save you 
              <span className="text-emerald-400 font-semibold"> ${analysis.potentialSavings.toFixed(2)}</span> on 
              similar future purchases. Note: "Zero fee" exchanges often recoup costs through wider spreads.
            </p>
          </div>
        </div>
      )}

      {/* Cost Benchmark */}
      <div className="card-premium rounded-xl p-4 border border-zinc-800/50">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-zinc-500">Your avg cost:</span>
              <span className={cn("ml-2 font-semibold", analysis.effectiveFeeRate <= BEST_TOTAL_COST_PERCENT ? "text-emerald-400" : analysis.effectiveFeeRate <= INDUSTRY_AVG_COST_PERCENT ? "text-amber-400" : "text-rose-400")}>
                {analysis.effectiveFeeRate.toFixed(2)}%
              </span>
            </div>
            <div className="text-zinc-600">|</div>
            <div>
              <span className="text-zinc-500">Industry avg:</span>
              <span className="ml-2 text-zinc-400">{INDUSTRY_AVG_COST_PERCENT}%</span>
            </div>
            <div className="text-zinc-600">|</div>
            <div>
              <span className="text-zinc-500">Best-in-class:</span>
              <span className="ml-2 text-emerald-400">{BEST_TOTAL_COST_PERCENT}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fee Breakdown Pie Chart */}
        <div className="card-premium rounded-xl p-6 border border-zinc-800/50">
          <h3 className="font-semibold mb-4">Fee Breakdown</h3>
          {analysis.feeBreakdown.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analysis.feeBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {analysis.feeBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    formatter={(value) => [`$${value.toFixed(2)}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-zinc-500 text-center py-12">No fee data available</p>
          )}
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {analysis.feeBreakdown.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-zinc-400">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Total Fee Rate by Exchange - Vertical Bar Chart */}
        <div className="card-premium rounded-xl p-6 border border-zinc-800/50">
          <h3 className="font-semibold mb-4">Total Fee Rate by Exchange</h3>
          {analysis.exchangeData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.exchangeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="exchange" stroke="#71717a" fontSize={11} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    formatter={(value, name) => [`${value.toFixed(2)}%`, name]}
                  />
                  <Bar dataKey="feeRate" name="Explicit Fee" stackId="a" radius={[0, 0, 0, 0]}>
                    {analysis.exchangeData.map((entry, index) => (
                      <Cell key={`cell-fee-${index}`} fill={entry.color} fillOpacity={0.8} />
                    ))}
                  </Bar>
                  <Bar dataKey="spreadRate" name="Est. Spread" stackId="a" radius={[4, 4, 0, 0]}>
                    {analysis.exchangeData.map((entry, index) => (
                      <Cell key={`cell-spread-${index}`} fill={entry.color} fillOpacity={0.4} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-zinc-500 text-center py-12">No exchange data available</p>
          )}
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {analysis.exchangeData.map((ex, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ex.color }} />
                <span className="text-xs text-zinc-400">{ex.exchange}</span>
              </div>
            ))}
          </div>
        </div>
        </div>

      {/* Exchange Comparison Table */}
      {analysis.exchangeData.length > 0 && (
        <div className="card-premium rounded-xl p-6 border border-zinc-800/50">
          <h3 className="font-semibold mb-2">Exchange Comparison</h3>
          <p className="text-xs text-zinc-500 mb-4 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Spread rates are estimates based on typical market conditions and may vary.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-3 px-4 text-zinc-500 font-medium">Exchange</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Volume</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Explicit Fees</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Fee Rate</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Spread Rate*</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Total Rate</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Txns</th>
                </tr>
              </thead>
              <tbody>
                {analysis.exchangeData.map((ex, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="py-3 px-4 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ex.color }} />
                        {ex.exchange}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-400">${ex.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={cn(ex.total > 0 ? "text-amber-400" : "text-emerald-400")}>
                        ${ex.total.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-400">
                      {ex.feeRate.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-400">
                      ~{ex.spreadRate.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        ex.totalFeeRate > 1.5 ? "bg-rose-500/20 text-rose-400" :
                        ex.totalFeeRate > 0.75 ? "bg-amber-500/20 text-amber-400" :
                        "bg-emerald-500/20 text-emerald-400"
                      )}>
                        {ex.totalFeeRate.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-400">{ex.transactions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}