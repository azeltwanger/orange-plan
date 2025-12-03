import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingDown, AlertTriangle, ArrowRight, Info } from 'lucide-react';
import { cn } from "@/lib/utils";

const COLORS = ['#F7931A', '#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24'];

const EXCHANGE_INFO = {
  coinbase: { name: 'Coinbase', avgFee: 1.49 },
  coinbase_pro: { name: 'Coinbase Pro', avgFee: 0.5 },
  kraken: { name: 'Kraken', avgFee: 0.26 },
  gemini: { name: 'Gemini', avgFee: 1.49 },
  binance_us: { name: 'Binance US', avgFee: 0.1 },
  strike: { name: 'Strike', avgFee: 0 },
  cash_app: { name: 'Cash App', avgFee: 2.2 },
  swan: { name: 'Swan Bitcoin', avgFee: 0.99 },
  river: { name: 'River', avgFee: 0 },
  robinhood: { name: 'Robinhood', avgFee: 0 },
};

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

      // By exchange
      const exchange = tx.exchange_or_wallet || 'unknown';
      if (!byExchange[exchange]) {
        byExchange[exchange] = { 
          name: EXCHANGE_INFO[exchange]?.name || exchange,
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
    const exchangeData = Object.entries(byExchange).map(([key, data]) => ({
      exchange: data.name,
      total: data.tradingFees + data.withdrawalFees + data.depositFees,
      tradingFees: data.tradingFees,
      withdrawalFees: data.withdrawalFees,
      depositFees: data.depositFees,
      volume: data.volume,
      feeRate: data.volume > 0 ? ((data.tradingFees + data.withdrawalFees + data.depositFees) / data.volume) * 100 : 0,
      transactions: data.transactions,
    })).sort((a, b) => b.total - a.total);

    // Fee breakdown for pie chart
    const feeBreakdown = [
      { name: 'Trading Fees', value: totalTradingFees, color: '#F7931A' },
      { name: 'Withdrawal Fees', value: totalWithdrawalFees, color: '#60a5fa' },
      { name: 'Deposit Fees', value: totalDepositFees, color: '#a78bfa' },
    ].filter(f => f.value > 0);

    if (totalSpreadCost > 0) {
      feeBreakdown.push({ name: 'Spread Cost', value: totalSpreadCost, color: '#f472b6' });
    }

    // Potential savings calculation
    const lowestFeeExchange = 'strike'; // Strike has 0% fees
    const potentialSavings = totalTradingFees; // Could save all trading fees with Strike

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
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Potential Savings</span>
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <ArrowRight className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            ${analysis.potentialSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            With zero-fee exchange
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
            <h4 className="font-semibold text-emerald-400 mb-1">Save on Future Purchases</h4>
            <p className="text-sm text-zinc-400">
              Consider using Strike or River for zero trading fees. Based on your purchase history, 
              you could save <span className="text-emerald-400 font-semibold">${analysis.potentialSavings.toFixed(2)}</span> on 
              similar future purchases.
            </p>
          </div>
        </div>
      )}

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

        {/* By Exchange Chart */}
        <div className="card-premium rounded-xl p-6 border border-zinc-800/50">
          <h3 className="font-semibold mb-4">Fees by Exchange</h3>
          {analysis.exchangeData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.exchangeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis type="number" stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="exchange" stroke="#71717a" fontSize={12} width={100} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    formatter={(value, name) => [`$${value.toFixed(2)}`, name]}
                  />
                  <Bar dataKey="tradingFees" stackId="a" fill="#F7931A" name="Trading" />
                  <Bar dataKey="withdrawalFees" stackId="a" fill="#60a5fa" name="Withdrawal" />
                  <Bar dataKey="depositFees" stackId="a" fill="#a78bfa" name="Deposit" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-zinc-500 text-center py-12">No exchange data available</p>
          )}
        </div>
      </div>

      {/* Exchange Comparison Table */}
      {analysis.exchangeData.length > 0 && (
        <div className="card-premium rounded-xl p-6 border border-zinc-800/50">
          <h3 className="font-semibold mb-4">Exchange Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-3 px-4 text-zinc-500 font-medium">Exchange</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Volume</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Total Fees</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Fee Rate</th>
                  <th className="text-right py-3 px-4 text-zinc-500 font-medium">Txns</th>
                </tr>
              </thead>
              <tbody>
                {analysis.exchangeData.map((ex, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="py-3 px-4 font-medium">{ex.exchange}</td>
                    <td className="py-3 px-4 text-right text-zinc-400">${ex.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={cn(ex.total > 0 ? "text-amber-400" : "text-emerald-400")}>
                        ${ex.total.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        ex.feeRate > 1 ? "bg-rose-500/20 text-rose-400" :
                        ex.feeRate > 0.5 ? "bg-amber-500/20 text-amber-400" :
                        "bg-emerald-500/20 text-emerald-400"
                      )}>
                        {ex.feeRate.toFixed(2)}%
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