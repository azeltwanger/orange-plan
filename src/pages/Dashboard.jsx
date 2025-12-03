import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Pencil, Trash2, Bitcoin } from 'lucide-react';
import { Button } from "@/components/ui/button";
import NetWorthCard from '@/components/dashboard/NetWorthCard';
import AssetCard from '@/components/dashboard/AssetCard';
import QuickStats from '@/components/dashboard/QuickStats';
import HoldingForm from '@/components/forms/HoldingForm';

export default function Dashboard() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceChange, setPriceChange] = useState(null);

  // Fetch live BTC price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        const data = await response.json();
        setBtcPrice(data.bitcoin.usd);
        setPriceChange(data.bitcoin.usd_24h_change);
        setPriceLoading(false);
      } catch (err) {
        setBtcPrice(97000);
        setPriceChange(0);
        setPriceLoading(false);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const currentPrice = btcPrice || 97000;
  const [formOpen, setFormOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const queryClient = useQueryClient();

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
  });

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
  });

  const { data: estateItems = [] } = useQuery({
    queryKey: ['estateItems'],
    queryFn: () => base44.entities.EstateItem.list(),
  });

  const createHolding = useMutation({
    mutationFn: (data) => base44.entities.Holding.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setFormOpen(false);
    },
  });

  const updateHolding = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Holding.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setFormOpen(false);
      setEditingHolding(null);
    },
  });

  const deleteHolding = useMutation({
    mutationFn: (id) => base44.entities.Holding.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['holdings'] }),
  });

  // Calculate totals
  const totalAssets = holdings.reduce((sum, h) => {
    if (h.ticker === 'BTC') return sum + (h.quantity * currentPrice);
    return sum + (h.quantity * (h.current_price || 0));
  }, 0);

  const totalLiabilities = liabilities.reduce((sum, l) => sum + (l.current_balance || 0), 0);
  
  const btcHoldings = holdings
    .filter(h => h.ticker === 'BTC')
    .reduce((sum, h) => sum + h.quantity, 0);

  const monthlyIncome = budgetItems
    .filter(b => b.type === 'income' && b.is_active !== false)
    .reduce((sum, b) => {
      const freq = { monthly: 1, weekly: 4.33, biweekly: 2.17, quarterly: 0.33, annual: 0.083, one_time: 0 };
      return sum + (b.amount * (freq[b.frequency] || 1));
    }, 0);

  const monthlyExpenses = budgetItems
    .filter(b => b.type === 'expense' && b.is_active !== false)
    .reduce((sum, b) => {
      const freq = { monthly: 1, weekly: 4.33, biweekly: 2.17, quarterly: 0.33, annual: 0.083, one_time: 0 };
      return sum + (b.amount * (freq[b.frequency] || 1));
    }, 0);

  const securityScores = estateItems
    .filter(e => e.item_type === 'custody_location' && e.security_score)
    .map(e => e.security_score);
  const avgSecurityScore = securityScores.length > 0 
    ? securityScores.reduce((a, b) => a + b, 0) / securityScores.length 
    : 0;

  const handleSubmit = (data) => {
    if (editingHolding) {
      updateHolding.mutate({ id: editingHolding.id, data });
    } else {
      createHolding.mutate(data);
    }
  };

  const handleEdit = (holding) => {
    setEditingHolding(holding);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Command Center</h1>
          <p className="text-zinc-500 mt-2">Your sovereign wealth at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
            <Bitcoin className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-zinc-400">BTC:</span>
            {priceLoading ? (
              <RefreshCw className="w-4 h-4 text-zinc-500 animate-spin" />
            ) : (
              <>
                <span className="font-semibold text-amber-400">${currentPrice.toLocaleString()}</span>
                {priceChange !== null && (
                  <span className={`text-xs ${priceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {priceChange >= 0 ? '↑' : '↓'}{Math.abs(priceChange).toFixed(1)}%
                  </span>
                )}
              </>
            )}
          </div>
          <Button
            onClick={() => { setEditingHolding(null); setFormOpen(true); }}
            className="brand-gradient text-white font-semibold hover:opacity-90 shadow-lg shadow-orange-500/20"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Asset
          </Button>
        </div>
      </div>

      {/* Net Worth Card */}
      <NetWorthCard
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        btcHoldings={btcHoldings}
        btcPrice={currentPrice}
      />

      {/* Quick Stats */}
      <QuickStats
        monthlyIncome={monthlyIncome}
        monthlyExpenses={monthlyExpenses}
        dcaProgress={0}
        liabilityRatio={totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0}
        securityScore={Math.round(avgSecurityScore)}
      />

      {/* Holdings Grid */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Asset Allocation</h2>
          <span className="text-sm text-zinc-500">{holdings.length} position{holdings.length !== 1 ? 's' : ''}</span>
        </div>

        {holdingsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card-premium rounded-xl p-5 animate-pulse border border-zinc-800/50">
                <div className="w-10 h-10 bg-zinc-800/50 rounded-xl mb-4" />
                <div className="h-4 bg-zinc-800/50 rounded w-24 mb-2" />
                <div className="h-6 bg-zinc-800/50 rounded w-32" />
              </div>
            ))}
          </div>
        ) : holdings.length === 0 ? (
          <div className="card-premium rounded-2xl p-16 text-center border border-zinc-800/50">
            <div className="w-20 h-20 rounded-2xl bg-orange-500/10 mx-auto flex items-center justify-center mb-6">
              <Bitcoin className="w-10 h-10 text-orange-400" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-zinc-200">Begin Your Journey</h3>
            <p className="text-zinc-500 mb-6 max-w-sm mx-auto">Add your first asset to start tracking your sovereign wealth</p>
            <Button
              onClick={() => setFormOpen(true)}
              className="brand-gradient text-white font-semibold shadow-lg shadow-orange-500/20"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Asset
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {holdings.map((holding) => (
              <div key={holding.id} className="relative group">
                <AssetCard holding={holding} btcPrice={currentPrice} />
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => handleEdit(holding)}
                    className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                  </button>
                  <button
                    onClick={() => deleteHolding.mutate(holding.id)}
                    className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-rose-600/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <HoldingForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingHolding(null); }}
        onSubmit={handleSubmit}
        initialData={editingHolding}
      />
    </div>
  );
}