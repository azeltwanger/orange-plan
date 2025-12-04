import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, Bitcoin, DollarSign } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subMonths, subYears, differenceInDays, parseISO } from 'date-fns';
import { cn } from "@/lib/utils";

export default function Performance() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1Y');

  // Fetch live BTC price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const data = await response.json();
        setBtcPrice(data.bitcoin.usd);
        setPriceLoading(false);
      } catch (err) {
        setBtcPrice(97000);
        setPriceLoading(false);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const currentPrice = btcPrice || 97000;

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date'),
  });

  // Calculate cost basis from transactions (more accurate than holdings)
  const transactionStats = useMemo(() => {
    const buyTxs = transactions.filter(t => t.type === 'buy');
    const sellTxs = transactions.filter(t => t.type === 'sell');
    
    // Calculate actual cost basis from buys
    const totalInvested = buyTxs.reduce((sum, t) => sum + (t.cost_basis || t.quantity * t.price_per_unit), 0);
    
    // Calculate realized gains from sells
    const realizedGains = sellTxs.reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);
    
    // Get first transaction date
    const sortedTxs = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstTxDate = sortedTxs.length > 0 ? sortedTxs[0].date : null;
    
    return { totalInvested, realizedGains, firstTxDate };
  }, [transactions]);

  // Calculate current holdings value
  const currentValue = holdings.reduce((sum, h) => {
    if (h.ticker === 'BTC') return sum + (h.quantity * currentPrice);
    return sum + (h.quantity * (h.current_price || 0));
  }, 0);

  // Use transaction-based cost basis if available, otherwise holdings
  const totalCostBasis = transactionStats.totalInvested > 0 
    ? transactionStats.totalInvested 
    : holdings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
  
  const unrealizedGain = currentValue - totalCostBasis + transactionStats.realizedGains;
  const totalReturn = totalCostBasis > 0 ? (unrealizedGain / totalCostBasis) * 100 : 0;

  // Calculate holding period and annualized return
  const holdingDays = transactionStats.firstTxDate 
    ? differenceInDays(new Date(), parseISO(transactionStats.firstTxDate))
    : 0;
  const holdingYears = holdingDays / 365;
  const annualizedReturn = holdingYears > 0 && totalCostBasis > 0
    ? (Math.pow((currentValue + transactionStats.realizedGains) / totalCostBasis, 1 / holdingYears) - 1) * 100
    : 0;

  // Generate chart data from actual transactions
  const chartData = useMemo(() => {
    if (transactions.length === 0) return [];

    const now = new Date();
    let startDate;
    
    switch (timeframe) {
      case '1M': startDate = subMonths(now, 1); break;
      case '3M': startDate = subMonths(now, 3); break;
      case '6M': startDate = subMonths(now, 6); break;
      case '1Y': startDate = subYears(now, 1); break;
      case '3Y': startDate = subYears(now, 3); break;
      case '5Y': startDate = subYears(now, 5); break;
      case '10Y': startDate = subYears(now, 10); break;
      case 'ALL': 
        const sortedTxs = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        startDate = sortedTxs.length > 0 ? parseISO(sortedTxs[0].date) : subYears(now, 1);
        break;
      default: startDate = subYears(now, 1);
    }

    // Sort transactions chronologically
    const sortedTxs = [...transactions]
      .filter(t => new Date(t.date) >= startDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sortedTxs.length === 0) return [];

    // Build cumulative portfolio value over time
    let cumulativeQty = {};
    let cumulativeCost = {};
    const dataPoints = [];

    // Start with holdings before the timeframe
    const preTxs = transactions.filter(t => new Date(t.date) < startDate);
    for (const tx of preTxs) {
      const ticker = tx.asset_ticker;
      if (!cumulativeQty[ticker]) cumulativeQty[ticker] = 0;
      if (!cumulativeCost[ticker]) cumulativeCost[ticker] = 0;
      
      if (tx.type === 'buy') {
        cumulativeQty[ticker] += tx.quantity;
        cumulativeCost[ticker] += tx.cost_basis || (tx.quantity * tx.price_per_unit);
      } else {
        cumulativeQty[ticker] -= tx.quantity;
      }
    }

    // Process transactions in timeframe
    for (const tx of sortedTxs) {
      const ticker = tx.asset_ticker;
      if (!cumulativeQty[ticker]) cumulativeQty[ticker] = 0;
      if (!cumulativeCost[ticker]) cumulativeCost[ticker] = 0;

      if (tx.type === 'buy') {
        cumulativeQty[ticker] += tx.quantity;
        cumulativeCost[ticker] += tx.cost_basis || (tx.quantity * tx.price_per_unit);
      } else {
        cumulativeQty[ticker] -= tx.quantity;
      }

      // Calculate value at this point (use tx price as estimate)
      let portfolioValue = 0;
      for (const [t, qty] of Object.entries(cumulativeQty)) {
        if (t === ticker) {
          portfolioValue += qty * tx.price_per_unit;
        } else if (t === 'BTC') {
          portfolioValue += qty * tx.price_per_unit; // Approximate
        } else {
          // For other assets, use their stored price
          const holding = holdings.find(h => h.ticker === t);
          portfolioValue += qty * (holding?.current_price || tx.price_per_unit);
        }
      }

      dataPoints.push({
        date: tx.date,
        name: format(parseISO(tx.date), 'MMM d'),
        portfolio: Math.round(portfolioValue),
        costBasis: Math.round(Object.values(cumulativeCost).reduce((a, b) => a + b, 0)),
      });
    }

    // Add current point
    dataPoints.push({
      date: format(now, 'yyyy-MM-dd'),
      name: 'Now',
      portfolio: Math.round(currentValue),
      costBasis: Math.round(totalCostBasis),
    });

    return dataPoints;
  }, [transactions, holdings, timeframe, currentValue, totalCostBasis]);

  const stats = [
    {
      label: 'Portfolio Value',
      value: `$${currentValue.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-emerald-400',
    },
    {
      label: 'Total Invested',
      value: `$${totalCostBasis.toLocaleString()}`,
      subtext: holdingDays > 0 ? `${Math.round(holdingDays / 30)} months` : '',
      icon: DollarSign,
      color: 'text-zinc-400',
    },
    {
      label: 'Total Return',
      value: `$${Math.abs(unrealizedGain).toLocaleString()}`,
      prefix: unrealizedGain >= 0 ? '+' : '-',
      subtext: `${unrealizedGain >= 0 ? '+' : ''}${totalReturn.toFixed(1)}%`,
      icon: unrealizedGain >= 0 ? TrendingUp : TrendingDown,
      color: unrealizedGain >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: 'Annualized Return',
      value: `${Math.abs(annualizedReturn).toFixed(1)}%`,
      prefix: annualizedReturn >= 0 ? '+' : '-',
      subtext: holdingYears >= 1 ? `${holdingYears.toFixed(1)} years` : `${holdingDays} days`,
      icon: annualizedReturn >= 0 ? TrendingUp : TrendingDown,
      color: annualizedReturn >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Performance</h1>
          <p className="text-zinc-500 mt-1">Track your portfolio growth</p>
        </div>
        <Select value={timeframe} onValueChange={setTimeframe}>
          <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="1M">1 Month</SelectItem>
            <SelectItem value="3M">3 Months</SelectItem>
            <SelectItem value="6M">6 Months</SelectItem>
            <SelectItem value="1Y">1 Year</SelectItem>
            <SelectItem value="3Y">3 Years</SelectItem>
            <SelectItem value="5Y">5 Years</SelectItem>
            <SelectItem value="10Y">10 Years</SelectItem>
            <SelectItem value="ALL">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="card-glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</span>
              <div className={cn("p-1.5 rounded-lg", stat.color.replace('text-', 'bg-') + '/10')}>
                <stat.icon className={cn("w-4 h-4", stat.color)} />
              </div>
            </div>
            <p className={cn("text-xl lg:text-2xl font-bold", stat.color)}>
              {stat.prefix}{stat.value}
            </p>
            {stat.subtext && (
              <p className="text-xs text-zinc-500 mt-1">{stat.subtext}</p>
            )}
          </div>
        ))}
      </div>

      {/* Portfolio Chart */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-6">Portfolio Value Over Time</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F7931A" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#F7931A" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '12px',
                }}
                labelStyle={{ color: '#a1a1aa' }}
                itemStyle={{ color: '#F7931A' }}
                formatter={(value) => [`$${value.toLocaleString()}`, 'Value']}
              />
              <Area
                type="monotone"
                dataKey="portfolio"
                stroke="#F7931A"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Asset Breakdown */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-6">Asset Performance</h3>
        <div className="space-y-4">
          {holdings.map((holding) => {
            const value = holding.ticker === 'BTC' 
              ? holding.quantity * currentPrice 
              : holding.quantity * (holding.current_price || 0);
            
            // Get cost basis from transactions for this ticker
            const tickerTxs = transactions.filter(t => t.asset_ticker === holding.ticker);
            const tickerCostBasis = tickerTxs
              .filter(t => t.type === 'buy')
              .reduce((sum, t) => sum + (t.cost_basis || t.quantity * t.price_per_unit), 0);
            const tickerSellCostBasis = tickerTxs
              .filter(t => t.type === 'sell')
              .reduce((sum, t) => sum + (t.cost_basis || 0), 0);
            
            const adjustedCostBasis = tickerCostBasis > 0 
              ? tickerCostBasis - tickerSellCostBasis 
              : (holding.cost_basis_total || 0);
            
            const gain = value - adjustedCostBasis;
            const gainPercent = adjustedCostBasis > 0 ? (gain / adjustedCostBasis) * 100 : 0;

            // Get first purchase date for this ticker
            const firstBuy = tickerTxs
              .filter(t => t.type === 'buy')
              .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
            const daysHeld = firstBuy ? differenceInDays(new Date(), parseISO(firstBuy.date)) : 0;

            return (
              <div key={holding.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    holding.ticker === 'BTC' ? 'bg-amber-400/10' : 'bg-zinc-700'
                  )}>
                    {holding.ticker === 'BTC' ? (
                      <Bitcoin className="w-5 h-5 text-amber-400" />
                    ) : (
                      <span className="text-sm font-bold text-zinc-400">{holding.ticker?.[0]}</span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{holding.asset_name}</p>
                    <p className="text-sm text-zinc-500">
                      {holding.ticker === 'BTC' ? holding.quantity.toFixed(8) : holding.quantity.toLocaleString()} {holding.ticker}
                      {daysHeld > 0 && <span className="ml-2 text-zinc-600">• {daysHeld}d</span>}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${value.toLocaleString()}</p>
                  <div className="flex items-center gap-2 justify-end">
                    {adjustedCostBasis > 0 && (
                      <>
                        <span className="text-xs text-zinc-500">${adjustedCostBasis.toLocaleString()}</span>
                        <span className={cn(
                          "text-sm font-medium",
                          gain >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {gain >= 0 ? '+' : ''}{gainPercent.toFixed(1)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {holdings.length === 0 && (
            <p className="text-center text-zinc-500 py-8">No holdings to display</p>
          )}
        </div>
      </div>

      {/* Realized Gains Section */}
      {transactionStats.realizedGains !== 0 && (
        <div className="card-glass rounded-2xl p-6">
          <h3 className="font-semibold mb-4">Realized Gains/Losses</h3>
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30">
            <span className="text-zinc-400">Total Realized</span>
            <span className={cn(
              "text-xl font-bold",
              transactionStats.realizedGains >= 0 ? "text-emerald-400" : "text-rose-400"
            )}>
              {transactionStats.realizedGains >= 0 ? '+' : ''}${transactionStats.realizedGains.toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}