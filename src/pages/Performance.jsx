import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, Bitcoin, DollarSign, BarChart3, Info, Loader2, ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, subMonths, subYears, differenceInDays, parseISO } from 'date-fns';

// Helper to parse various date formats (M/D/YYYY or YYYY-MM-DD)
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  let d = parseISO(dateStr);
  if (!isNaN(d.getTime())) return d;
  d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
};
import { cn } from "@/lib/utils";

// CoinGecko ID mapping for common tickers
const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  LTC: 'litecoin',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  ALGO: 'algorand',
};

// Account Performance Section Component
function AccountPerformanceSection({ holdings, transactions, accounts, getCurrentPrice, COINGECKO_IDS }) {
  const [expandedAccounts, setExpandedAccounts] = useState({});

  const toggleAccount = (accountId) => {
    setExpandedAccounts(prev => ({ ...prev, [accountId]: !prev[accountId] }));
  };

  // Group holdings by account
  const holdingsByAccount = useMemo(() => {
    const grouped = {};
    
    // Group by account_id
    holdings.forEach(h => {
      const accountId = h.account_id || 'unassigned';
      if (!grouped[accountId]) grouped[accountId] = [];
      grouped[accountId].push(h);
    });
    
    return grouped;
  }, [holdings]);

  // Calculate performance for a holding
  const getHoldingPerformance = (holding) => {
    const value = holding.quantity * getCurrentPrice(holding.ticker);
    
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

    // Get first purchase date
    const firstBuy = holdingTxs
      .filter(t => t.type === 'buy' && t.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    let daysHeld = 0;
    if (firstBuy?.date) {
      try {
        const parsed = parseISO(firstBuy.date);
        if (!isNaN(parsed.getTime())) {
          daysHeld = differenceInDays(new Date(), parsed);
        }
      } catch {
        daysHeld = 0;
      }
    }

    return { value, adjustedCostBasis, gain, gainPercent, daysHeld };
  };

  // Calculate account totals
  const getAccountTotals = (accountHoldings) => {
    let totalValue = 0;
    let totalCostBasis = 0;
    
    accountHoldings.forEach(h => {
      const perf = getHoldingPerformance(h);
      totalValue += perf.value;
      totalCostBasis += perf.adjustedCostBasis;
    });
    
    const totalGain = totalValue - totalCostBasis;
    const totalGainPercent = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : 0;
    
    return { totalValue, totalCostBasis, totalGain, totalGainPercent };
  };

  const accountIds = Object.keys(holdingsByAccount);

  if (holdings.length === 0) {
    return <p className="text-center text-zinc-500 py-8">No holdings to display</p>;
  }

  return (
    <div className="space-y-3">
      {accountIds.map(accountId => {
        const accountHoldings = holdingsByAccount[accountId];
        const account = accounts.find(a => a.id === accountId);
        const accountName = account?.name || (accountId === 'unassigned' ? 'Unassigned' : 'Unknown Account');
        const accountType = account?.account_type || '';
        const isExpanded = expandedAccounts[accountId] ?? true;
        const totals = getAccountTotals(accountHoldings);

        return (
          <Collapsible key={accountId} open={isExpanded} onOpenChange={() => toggleAccount(accountId)}>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800/70 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  )}
                  <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">{accountName}</p>
                    <p className="text-xs text-zinc-500">
                      {accountType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} • {accountHoldings.length} asset{accountHoldings.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${totals.totalValue.toLocaleString()}</p>
                  <div className="flex items-center gap-2 justify-end">
                    {totals.totalCostBasis > 0 && (
                      <>
                        <span className="text-xs text-zinc-500">${totals.totalCostBasis.toLocaleString()}</span>
                        <span className={cn(
                          "text-sm font-medium",
                          totals.totalGain >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {totals.totalGain >= 0 ? '+' : ''}{totals.totalGainPercent.toFixed(1)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-6 mt-2 space-y-2">
                {accountHoldings.map((holding) => {
                  const perf = getHoldingPerformance(holding);

                  return (
                    <div key={holding.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          holding.ticker === 'BTC' ? 'bg-amber-400/10' : 
                          COINGECKO_IDS[holding.ticker] ? 'bg-blue-500/10' : 'bg-zinc-700'
                        )}>
                          {holding.ticker === 'BTC' ? (
                            <Bitcoin className="w-4 h-4 text-amber-400" />
                          ) : (
                            <span className={cn("text-xs font-bold", COINGECKO_IDS[holding.ticker] ? "text-blue-400" : "text-zinc-400")}>{holding.ticker?.[0]}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{holding.asset_name}</p>
                          <p className="text-xs text-zinc-500">
                            {holding.ticker === 'BTC' ? holding.quantity.toFixed(8) : holding.quantity.toLocaleString()} {holding.ticker}
                            {perf.daysHeld > 0 && <span className="ml-2 text-zinc-600">• {perf.daysHeld}d</span>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">${perf.value.toLocaleString()}</p>
                        <div className="flex items-center gap-2 justify-end">
                          {perf.adjustedCostBasis > 0 && (
                            <>
                              <span className="text-xs text-zinc-500">${perf.adjustedCostBasis.toLocaleString()}</span>
                              <span className={cn(
                                "text-xs font-medium",
                                perf.gain >= 0 ? "text-emerald-400" : "text-rose-400"
                              )}>
                                {perf.gain >= 0 ? '+' : ''}{perf.gainPercent.toFixed(1)}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

export default function Performance() {
  const [currentPrices, setCurrentPrices] = useState({});
  const [priceLoading, setPriceLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1Y');
  const [historicalPrices, setHistoricalPrices] = useState({}); // { ticker: [{date, price}] }
  const [stockPrices, setStockPrices] = useState({}); // { ticker: { currentPrice, historical: [{date, price}] } }
  const [irrMetrics, setIrrMetrics] = useState(null);
  const [irrLoading, setIrrLoading] = useState(false);

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date'),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  // Get unique tickers from holdings and transactions, separated by type
  const { cryptoTickers, stockTickers } = useMemo(() => {
    const tickerSet = new Set();
    holdings.forEach(h => h.ticker && tickerSet.add(h.ticker));
    transactions.forEach(t => t.asset_ticker && tickerSet.add(t.asset_ticker));
    
    const allTickers = [...tickerSet];
    return {
      cryptoTickers: allTickers.filter(t => COINGECKO_IDS[t]),
      stockTickers: allTickers.filter(t => !COINGECKO_IDS[t] && t !== 'USD' && t !== 'CASH')
    };
  }, [holdings, transactions]);
  
  const allTickers = useMemo(() => [...cryptoTickers, ...stockTickers], [cryptoTickers, stockTickers]);

  // Fetch current prices for all crypto assets
  useEffect(() => {
    const fetchCurrentPrices = async () => {
      try {
        if (cryptoTickers.length === 0) {
          setPriceLoading(false);
          return;
        }
        
        const ids = cryptoTickers.map(t => COINGECKO_IDS[t]).join(',');
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        const data = await response.json();
        
        const prices = {};
        for (const ticker of cryptoTickers) {
          const id = COINGECKO_IDS[ticker];
          if (data[id]?.usd) {
            prices[ticker] = data[id].usd;
          }
        }
        setCurrentPrices(prev => ({ ...prev, ...prices }));
        setPriceLoading(false);
      } catch (err) {
        console.error('Failed to fetch current prices:', err);
        setPriceLoading(false);
      }
    };
    
    if (cryptoTickers.length > 0) {
      fetchCurrentPrices();
      // Refresh every 30 seconds for more up-to-date prices
      const interval = setInterval(fetchCurrentPrices, 30000);
      return () => clearInterval(interval);
    } else {
      setPriceLoading(false);
    }
  }, [cryptoTickers]);

  // Calculate cost basis from transactions (more accurate than holdings)
  const transactionStats = useMemo(() => {
    const buyTxs = transactions.filter(t => t.type === 'buy');
    const sellTxs = transactions.filter(t => t.type === 'sell');
    
    // Calculate actual cost basis from buys
    const totalInvested = buyTxs.reduce((sum, t) => sum + (t.cost_basis || t.quantity * t.price_per_unit), 0);
    
    // Calculate realized gains from sells
    const realizedGains = sellTxs.reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);
    
    // Get first transaction date - filter for valid dates
    const txsWithValidDates = transactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return !isNaN(d.getTime());
    });
    const sortedTxs = [...txsWithValidDates].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstTxDate = sortedTxs.length > 0 ? sortedTxs[0].date : null;
    
    return { totalInvested, realizedGains, firstTxDate };
  }, [transactions]);

  // Calculate days since first transaction for ALL timeframe
  const daysSinceFirstTx = useMemo(() => {
    if (!transactionStats.firstTxDate) return 365;
    const firstDate = parseDate(transactionStats.firstTxDate);
    if (!firstDate) return 365;
    return Math.max(differenceInDays(new Date(), firstDate), 30);
  }, [transactionStats.firstTxDate]);

  // Fetch historical prices for all crypto assets based on timeframe
  useEffect(() => {
    const fetchHistoricalPrices = async () => {
      try {
        const daysMap = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095, '5Y': 1825, '10Y': 3650 };
        const days = timeframe === 'ALL' ? daysSinceFirstTx : (daysMap[timeframe] || 365);
        
        const priceData = {};
        
        // Fetch historical data for each crypto (in parallel)
        // For shorter timeframes (<=90 days), omit interval to get hourly/granular data
        // For longer timeframes, use daily interval
        await Promise.all(cryptoTickers.map(async (ticker) => {
          try {
            const id = COINGECKO_IDS[ticker];
            const useDaily = days > 90;
            const url = useDaily 
              ? `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`
              : `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.prices) {
              priceData[ticker] = data.prices.map(([timestamp, price]) => ({
                date: new Date(timestamp),
                price
              }));
            }
          } catch (err) {
            console.error(`Failed to fetch historical prices for ${ticker}:`, err);
          }
        }));
        
        setHistoricalPrices(priceData);
      } catch (err) {
        console.error('Failed to fetch historical prices:', err);
      }
    };
    
    if (cryptoTickers.length > 0) {
      fetchHistoricalPrices();
    }
  }, [timeframe, cryptoTickers, daysSinceFirstTx]);

  // Fetch IRR metrics from backend
  useEffect(() => {
    const fetchIRRMetrics = async () => {
      if (Object.keys(currentPrices).length === 0 && priceLoading) return;
      
      setIrrLoading(true);
      try {
        const response = await base44.functions.invoke('calculatePortfolioIRR', {
          currentPrices
        });
        
        if (response.data?.success) {
          setIrrMetrics(response.data.metrics);
        } else {
          console.log('IRR calculation:', response.data?.error || 'No data');
        }
      } catch (err) {
        console.error('Failed to fetch IRR metrics:', err);
      } finally {
        setIrrLoading(false);
      }
    };
    
    fetchIRRMetrics();
  }, [currentPrices, priceLoading]);

  // Fetch stock prices via backend function
  useEffect(() => {
    const fetchStockPrices = async () => {
      if (stockTickers.length === 0) return;
      
      try {
        const daysMap = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095, '5Y': 1825, '10Y': 3650 };
        const days = timeframe === 'ALL' ? daysSinceFirstTx : (daysMap[timeframe] || 365);
        
        const response = await base44.functions.invoke('getStockPrices', {
          tickers: stockTickers,
          days
        });
        
        if (response.data) {
          // Transform to match crypto format
          const transformed = {};
          for (const [ticker, data] of Object.entries(response.data)) {
            if (data.historical) {
              transformed[ticker] = data.historical.map(p => ({
                date: new Date(p.date),
                price: p.price
              }));
            }
            // Update current prices
            if (data.currentPrice) {
              setCurrentPrices(prev => ({ ...prev, [ticker]: data.currentPrice }));
            }
          }
          setStockPrices(transformed);
        }
      } catch (err) {
        console.error('Failed to fetch stock prices:', err);
      }
    };
    
    fetchStockPrices();
  }, [timeframe, stockTickers]);

  // Helper to get current price for any ticker
  const getCurrentPrice = useCallback((ticker) => {
    if (currentPrices[ticker]) return currentPrices[ticker];
    const holding = holdings.find(h => h.ticker === ticker);
    return holding?.current_price || 0;
  }, [currentPrices, holdings]);



  // Calculate current holdings value using live prices
  const currentValue = holdings.reduce((sum, h) => {
    return sum + (h.quantity * getCurrentPrice(h.ticker));
  }, 0);

  // Use transaction-based cost basis if available, otherwise holdings
  const totalCostBasis = transactionStats.totalInvested > 0 
    ? transactionStats.totalInvested 
    : holdings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
  
  const unrealizedGain = currentValue - totalCostBasis + transactionStats.realizedGains;
  const totalReturn = totalCostBasis > 0 ? (unrealizedGain / totalCostBasis) * 100 : 0;

  // Calculate holding period and annualized return
  const holdingDays = useMemo(() => {
    if (!transactionStats.firstTxDate) return 0;
    const firstDate = parseDate(transactionStats.firstTxDate);
    if (!firstDate) return 0;
    return differenceInDays(new Date(), firstDate);
  }, [transactionStats.firstTxDate]);
  
  const holdingYears = holdingDays / 365;
  
  // Calculate annualized return using CAGR formula
  const annualizedReturn = useMemo(() => {
    if (totalCostBasis <= 0 || currentValue <= 0 || holdingDays < 1) return 0;
    
    const years = holdingDays / 365;
    const totalReturn = (currentValue - totalCostBasis) / totalCostBasis;
    
    // Use CAGR formula: (endValue/startValue)^(1/years) - 1
    if (years >= 1) {
      return (Math.pow(currentValue / totalCostBasis, 1 / years) - 1) * 100;
    } else {
      // For less than a year, show actual return
      return totalReturn * 100;
    }
  }, [totalCostBasis, currentValue, holdingDays]);

  // Helper to get price at a specific date from historical data for any ticker
  const getPriceAtDate = useCallback((ticker, date) => {
    // Check crypto prices first, then stock prices
    const tickerPrices = historicalPrices[ticker] || stockPrices[ticker];
    if (!tickerPrices || tickerPrices.length === 0) {
      // Fallback to current price if no historical data available
      return getCurrentPrice(ticker);
    }
    
    const targetTime = date.getTime();
    
    // Find closest price point - use any available price point
    let closest = tickerPrices[0];
    let minDiff = Math.abs(closest.date.getTime() - targetTime);
    
    for (const point of tickerPrices) {
      const diff = Math.abs(point.date.getTime() - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = point;
      }
    }
    
    return closest.price;
  }, [historicalPrices, stockPrices, getCurrentPrice]);

  // Generate chart data with historical prices
  const chartData = useMemo(() => {
    if (transactions.length === 0 && historicalPrices.length === 0) return [];

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
        const sortedTxsAll = [...transactions]
          .filter(t => t.date)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        if (sortedTxsAll.length > 0) {
          try {
            const parsed = parseISO(sortedTxsAll[0].date);
            startDate = isNaN(parsed.getTime()) ? subYears(now, 1) : parsed;
          } catch {
            startDate = subYears(now, 1);
          }
        } else {
          startDate = subYears(now, 1);
        }
        break;
      default: startDate = subYears(now, 1);
    }

    // Build cumulative holdings from ALL transactions before start date
    let cumulativeQty = {};
    let cumulativeCost = {};
    
    const preTxs = transactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return !isNaN(d.getTime()) && d < startDate;
    });
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

    // Sort transactions in timeframe
    const txsInRange = [...transactions]
      .filter(t => {
        if (!t.date) return false;
        const d = new Date(t.date);
        return !isNaN(d.getTime()) && d >= startDate;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Generate data points using historical prices (one point per day/week based on timeframe)
    const dataPoints = [];
    // Adjust interval based on timeframe for even spacing
    const intervalDays = 
      timeframe === '1M' ? 1 : 
      timeframe === '3M' ? 3 : 
      timeframe === '6M' ? 7 : 
      timeframe === '1Y' ? 14 :
      timeframe === '3Y' ? 30 :
      timeframe === '5Y' ? 60 :
      timeframe === '10Y' ? 90 :
      120; // ALL
    
    // Create a map of transaction dates for quick lookup
    const txByDate = {};
    for (const tx of txsInRange) {
      const dateKey = tx.date.split('T')[0];
      if (!txByDate[dateKey]) txByDate[dateKey] = [];
      txByDate[dateKey].push(tx);
    }

    // Iterate through the timeframe
    let currentDate = new Date(startDate);
    while (currentDate <= now) {
      const dateKey = format(currentDate, 'yyyy-MM-dd');
      
      // Apply any transactions up to this date
      if (txByDate[dateKey]) {
        for (const tx of txByDate[dateKey]) {
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
      }

      // Calculate portfolio value using historical prices for all assets
      let portfolioValue = 0;
      
      for (const [ticker, qty] of Object.entries(cumulativeQty)) {
        if (qty <= 0) continue;
        const priceAtDate = getPriceAtDate(ticker, currentDate);
        portfolioValue += qty * priceAtDate;
      }

      // Format label based on timeframe
      let label;
      if (['10Y', 'ALL'].includes(timeframe)) {
        label = format(currentDate, 'yyyy');
      } else if (['3Y', '5Y'].includes(timeframe)) {
        label = format(currentDate, "MMM ''yy");
      } else if (['6M', '1Y'].includes(timeframe)) {
        label = format(currentDate, 'MMM d');
      } else {
        label = format(currentDate, 'MMM d');
      }

      dataPoints.push({
        date: dateKey,
        name: label,
        portfolio: Math.round(portfolioValue),
        costBasis: Math.round(Object.values(cumulativeCost).reduce((a, b) => a + b, 0)),
      });

      // Move to next interval
      currentDate = new Date(currentDate.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    }

    // Ensure we have the current point
    if (dataPoints.length > 0 && dataPoints[dataPoints.length - 1].date !== format(now, 'yyyy-MM-dd')) {
      dataPoints.push({
        date: format(now, 'yyyy-MM-dd'),
        name: 'Now',
        portfolio: Math.round(currentValue),
        costBasis: Math.round(totalCostBasis),
      });
    }

    return dataPoints;
  }, [transactions, holdings, timeframe, currentValue, totalCostBasis, historicalPrices, stockPrices, currentPrices, getPriceAtDate, getCurrentPrice]);

  // Use IRR metrics if available, otherwise fall back to simple calculations
  const displayMetrics = useMemo(() => {
    if (irrMetrics) {
      return {
        totalInvested: irrMetrics.totalInvested,
        currentValue: irrMetrics.currentValue,
        totalGainLoss: irrMetrics.totalGainLoss,
        totalReturnPercent: irrMetrics.totalReturnPercent,
        annualizedReturn: irrMetrics.annualizedIRR ?? irrMetrics.simpleCAGR ?? annualizedReturn,
        holdingDays: irrMetrics.holdingPeriodDays,
        holdingYears: irrMetrics.holdingPeriodYears,
        isIRR: irrMetrics.annualizedIRR !== null
      };
    }
    return {
      totalInvested: totalCostBasis,
      currentValue,
      totalGainLoss: unrealizedGain,
      totalReturnPercent: totalReturn,
      annualizedReturn,
      holdingDays,
      holdingYears,
      isIRR: false
    };
  }, [irrMetrics, totalCostBasis, currentValue, unrealizedGain, totalReturn, annualizedReturn, holdingDays, holdingYears]);

  const stats = [
    {
      label: 'Portfolio Value',
      value: `$${displayMetrics.currentValue.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-emerald-400',
    },
    {
      label: 'Total Invested',
      value: `$${displayMetrics.totalInvested.toLocaleString()}`,
      subtext: displayMetrics.holdingDays > 0 ? `${Math.round(displayMetrics.holdingDays / 30)} months` : '',
      icon: DollarSign,
      color: 'text-zinc-400',
    },
    {
      label: 'Total Return',
      value: `$${Math.abs(displayMetrics.totalGainLoss).toLocaleString()}`,
      prefix: displayMetrics.totalGainLoss >= 0 ? '+' : '-',
      subtext: `${displayMetrics.totalGainLoss >= 0 ? '+' : ''}${displayMetrics.totalReturnPercent.toFixed(1)}%`,
      icon: displayMetrics.totalGainLoss >= 0 ? TrendingUp : TrendingDown,
      color: displayMetrics.totalGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: displayMetrics.isIRR ? 'IRR (Annualized)' : 'Annualized Return',
      value: `${Math.abs(displayMetrics.annualizedReturn).toFixed(1)}%`,
      prefix: displayMetrics.annualizedReturn >= 0 ? '+' : '-',
      subtext: displayMetrics.holdingYears >= 1 ? `${displayMetrics.holdingYears.toFixed(1)} years` : `${displayMetrics.holdingDays} days`,
      icon: displayMetrics.annualizedReturn >= 0 ? TrendingUp : TrendingDown,
      color: displayMetrics.annualizedReturn >= 0 ? 'text-emerald-400' : 'text-rose-400',
      hasTooltip: true,
    },
  ];

  return (
    <TooltipProvider>
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
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</span>
                {stat.hasTooltip && (
                  <UITooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-900 border-zinc-700 text-zinc-200">
                      <p className="text-xs">
                        {displayMetrics.isIRR 
                          ? "Money-Weighted Return (IRR) accounts for the timing of every deposit and investment, providing a more accurate representation of your real performance."
                          : "Simple annualized return based on total gain divided by holding period. Add more transactions for IRR calculation."}
                      </p>
                    </TooltipContent>
                  </UITooltip>
                )}
              </div>
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

      {/* IRR Calculation Panel */}
      {(irrMetrics || irrLoading) && (
        <div className="card-glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Performance Calculation Method</h3>
              <UITooltip>
                <TooltipTrigger>
                  <Info className="w-4 h-4 text-zinc-500 hover:text-zinc-300 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm bg-zinc-900 border-zinc-700 text-zinc-200">
                  <p className="text-xs">
                    This return uses a money-weighted IRR (XIRR) calculation that accounts for the timing 
                    of every deposit and investment, providing a more accurate representation of your real performance 
                    compared to simple percentage returns.
                  </p>
                </TooltipContent>
              </UITooltip>
            </div>
            {irrLoading && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
          </div>
          
          {irrMetrics ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="p-3 rounded-lg bg-zinc-800/30">
                <p className="text-xs text-zinc-500 mb-1">Total Invested</p>
                <p className="font-semibold">${irrMetrics.totalInvested.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-zinc-800/30">
                <p className="text-xs text-zinc-500 mb-1">Current Value</p>
                <p className="font-semibold text-emerald-400">${irrMetrics.currentValue.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-zinc-800/30">
                <p className="text-xs text-zinc-500 mb-1">Total Gain/Loss</p>
                <p className={cn("font-semibold", irrMetrics.totalGainLoss >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {irrMetrics.totalGainLoss >= 0 ? '+' : ''}${irrMetrics.totalGainLoss.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-zinc-800/30">
                <p className="text-xs text-zinc-500 mb-1">Total Return</p>
                <p className={cn("font-semibold", irrMetrics.totalReturnPercent >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {irrMetrics.totalReturnPercent >= 0 ? '+' : ''}{irrMetrics.totalReturnPercent.toFixed(1)}%
                </p>
              </div>
              <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <p className="text-xs text-orange-400 mb-1 flex items-center gap-1">
                  True Annualized Return
                  <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/20">IRR</span>
                </p>
                <p className={cn("font-bold text-lg", 
                  (irrMetrics.annualizedIRR ?? irrMetrics.simpleCAGR ?? 0) >= 0 ? "text-orange-400" : "text-rose-400"
                )}>
                  {(irrMetrics.annualizedIRR ?? irrMetrics.simpleCAGR ?? 0) >= 0 ? '+' : ''}
                  {(irrMetrics.annualizedIRR ?? irrMetrics.simpleCAGR ?? 0).toFixed(1)}%
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center text-zinc-500 py-4">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">Calculating IRR...</p>
            </div>
          )}
          
          {irrMetrics && (
            <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap gap-4 text-xs text-zinc-500">
              <span>First transaction: {irrMetrics.firstTransactionDate}</span>
              <span>•</span>
              <span>Holding period: {irrMetrics.holdingPeriodYears.toFixed(1)} years ({irrMetrics.holdingPeriodDays} days)</span>
              <span>•</span>
              <span>{irrMetrics.transactionCount} transactions analyzed</span>
            </div>
          )}
        </div>
      )}

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
              <XAxis 
                dataKey="name" 
                stroke="#71717a" 
                fontSize={11} 
                interval={'preserveStartEnd'}
                tickMargin={8}
                angle={['10Y', 'ALL'].includes(timeframe) ? 0 : 0}
              />
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

      {/* Asset Breakdown by Account */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-6">Asset Performance by Account</h3>
        <div className="space-y-4">
          <AccountPerformanceSection 
            holdings={holdings}
            transactions={transactions}
            accounts={accounts}
            getCurrentPrice={getCurrentPrice}
            COINGECKO_IDS={COINGECKO_IDS}
          />
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
    </TooltipProvider>
  );
}