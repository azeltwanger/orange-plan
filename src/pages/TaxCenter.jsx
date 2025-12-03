import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInDays } from 'date-fns';
import { Plus, Pencil, Trash2, Receipt, TrendingUp, TrendingDown, Calendar, AlertTriangle, CheckCircle, Bitcoin } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function TaxCenter() {
  const [btcPrice] = useState(97000);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [activeTab, setActiveTab] = useState('transactions');
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    type: 'buy',
    asset_ticker: 'BTC',
    quantity: '',
    price_per_unit: '',
    date: '',
    exchange_or_wallet: '',
    notes: '',
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date'),
  });

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const createTx = useMutation({
    mutationFn: async (data) => {
      const total = data.quantity * data.price_per_unit;
      const lotId = `${data.asset_ticker}-${Date.now()}`;
      const holdingPeriod = 'short_term';
      
      const txData = {
        ...data,
        total_value: total,
        lot_id: data.type === 'buy' ? lotId : undefined,
        cost_basis: data.type === 'buy' ? total : undefined,
        holding_period: holdingPeriod,
      };

      // If it's a sell, calculate gain/loss
      if (data.type === 'sell') {
        // FIFO: find oldest lots with remaining quantity
        const buyTxs = transactions
          .filter(t => t.type === 'buy' && t.asset_ticker === data.asset_ticker)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        let remainingQty = data.quantity;
        let totalCostBasis = 0;
        
        for (const buyTx of buyTxs) {
          if (remainingQty <= 0) break;
          const qtyFromLot = Math.min(remainingQty, buyTx.quantity);
          const costPerUnit = buyTx.price_per_unit;
          totalCostBasis += qtyFromLot * costPerUnit;
          remainingQty -= qtyFromLot;
          
          const daysDiff = differenceInDays(new Date(data.date), new Date(buyTx.date));
          if (daysDiff > 365) {
            txData.holding_period = 'long_term';
          }
        }
        
        txData.cost_basis = totalCostBasis;
        txData.realized_gain_loss = total - totalCostBasis;
      }

      return base44.entities.Transaction.create(txData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setFormOpen(false);
      resetForm();
    },
  });

  const updateTx = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, {
      ...data,
      total_value: data.quantity * data.price_per_unit,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setFormOpen(false);
      setEditingTx(null);
      resetForm();
    },
  });

  const deleteTx = useMutation({
    mutationFn: (id) => base44.entities.Transaction.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const resetForm = () => {
    setFormData({
      type: 'buy',
      asset_ticker: 'BTC',
      quantity: '',
      price_per_unit: '',
      date: '',
      exchange_or_wallet: '',
      notes: '',
    });
  };

  useEffect(() => {
    if (editingTx) {
      setFormData({
        type: editingTx.type || 'buy',
        asset_ticker: editingTx.asset_ticker || 'BTC',
        quantity: editingTx.quantity || '',
        price_per_unit: editingTx.price_per_unit || '',
        date: editingTx.date || '',
        exchange_or_wallet: editingTx.exchange_or_wallet || '',
        notes: editingTx.notes || '',
      });
    }
  }, [editingTx]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      quantity: parseFloat(formData.quantity) || 0,
      price_per_unit: parseFloat(formData.price_per_unit) || 0,
    };
    if (editingTx) {
      updateTx.mutate({ id: editingTx.id, data });
    } else {
      createTx.mutate(data);
    }
  };

  // Calculate tax summary
  const sellTxs = transactions.filter(t => t.type === 'sell');
  const shortTermGains = sellTxs
    .filter(t => t.holding_period === 'short_term')
    .reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);
  const longTermGains = sellTxs
    .filter(t => t.holding_period === 'long_term')
    .reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);
  const totalGains = shortTermGains + longTermGains;

  // Tax rates (simplified)
  const shortTermRate = 0.37;
  const longTermRate = 0.20;
  const estimatedTax = (shortTermGains > 0 ? shortTermGains * shortTermRate : 0) + 
                       (longTermGains > 0 ? longTermGains * longTermRate : 0);

  // Wash sale detection (simplified - 30 day window)
  const potentialWashSales = sellTxs.filter(sellTx => {
    if ((sellTx.realized_gain_loss || 0) >= 0) return false;
    const sellDate = new Date(sellTx.date);
    return transactions.some(buyTx => {
      if (buyTx.type !== 'buy' || buyTx.asset_ticker !== sellTx.asset_ticker) return false;
      const buyDate = new Date(buyTx.date);
      const daysDiff = Math.abs(differenceInDays(buyDate, sellDate));
      return daysDiff <= 30;
    });
  });

  // Tax lots (unrealized)
  const buyTxs = transactions.filter(t => t.type === 'buy');
  const lotsWithGains = buyTxs.map(tx => {
    const currentValue = tx.quantity * btcPrice;
    const costBasis = tx.cost_basis || (tx.quantity * tx.price_per_unit);
    const unrealizedGain = currentValue - costBasis;
    const daysSincePurchase = differenceInDays(new Date(), new Date(tx.date));
    const isLongTerm = daysSincePurchase > 365;
    
    return {
      ...tx,
      currentValue,
      costBasis,
      unrealizedGain,
      unrealizedGainPercent: costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0,
      isLongTerm,
      daysSincePurchase,
    };
  });

  // Harvest opportunities (losses that could be realized)
  const harvestOpportunities = lotsWithGains.filter(lot => lot.unrealizedGain < 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Tax Center</h1>
          <p className="text-zinc-500 mt-1">Track lots, cost basis, and tax liability</p>
        </div>
        <Button
          onClick={() => { setEditingTx(null); resetForm(); setFormOpen(true); }}
          className="accent-gradient text-zinc-950 font-semibold hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Transaction
        </Button>
      </div>

      {/* Tax Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Short-Term Gains</span>
            <div className={cn("p-1.5 rounded-lg", shortTermGains >= 0 ? "bg-emerald-400/10" : "bg-rose-400/10")}>
              {shortTermGains >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
            </div>
          </div>
          <p className={cn("text-2xl font-bold", shortTermGains >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {shortTermGains >= 0 ? '+' : '-'}${Math.abs(shortTermGains).toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Taxed at {(shortTermRate * 100).toFixed(0)}%</p>
        </div>

        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Long-Term Gains</span>
            <div className={cn("p-1.5 rounded-lg", longTermGains >= 0 ? "bg-emerald-400/10" : "bg-rose-400/10")}>
              {longTermGains >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
            </div>
          </div>
          <p className={cn("text-2xl font-bold", longTermGains >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {longTermGains >= 0 ? '+' : '-'}${Math.abs(longTermGains).toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Taxed at {(longTermRate * 100).toFixed(0)}%</p>
        </div>

        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Estimated Tax</span>
            <div className="p-1.5 rounded-lg bg-amber-400/10">
              <Receipt className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-400">${estimatedTax.toLocaleString()}</p>
        </div>

        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Wash Sale Alerts</span>
            <div className={cn("p-1.5 rounded-lg", potentialWashSales.length > 0 ? "bg-rose-400/10" : "bg-emerald-400/10")}>
              {potentialWashSales.length > 0 ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
            </div>
          </div>
          <p className={cn("text-2xl font-bold", potentialWashSales.length > 0 ? "text-rose-400" : "text-emerald-400")}>
            {potentialWashSales.length}
          </p>
          <p className="text-xs text-zinc-500 mt-1">{potentialWashSales.length === 0 ? 'No issues' : 'Review needed'}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1">
          <TabsTrigger value="transactions" className="data-[state=active]:bg-zinc-700">Transactions</TabsTrigger>
          <TabsTrigger value="lots" className="data-[state=active]:bg-zinc-700">Tax Lots</TabsTrigger>
          <TabsTrigger value="harvest" className="data-[state=active]:bg-zinc-700">Harvest</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <div className="card-glass rounded-2xl p-6">
            <h3 className="font-semibold mb-6">Transaction History</h3>
            {transactions.length === 0 ? (
              <p className="text-center text-zinc-500 py-12">No transactions recorded yet</p>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        tx.type === 'buy' ? 'bg-emerald-400/10' : 'bg-rose-400/10'
                      )}>
                        {tx.type === 'buy' ? (
                          <TrendingUp className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-rose-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{tx.type === 'buy' ? 'Bought' : 'Sold'} {tx.quantity} {tx.asset_ticker}</p>
                          {tx.holding_period && tx.type === 'sell' && (
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              tx.holding_period === 'long_term' ? 'border-emerald-400/50 text-emerald-400' : 'border-amber-400/50 text-amber-400'
                            )}>
                              {tx.holding_period === 'long_term' ? 'Long-term' : 'Short-term'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-zinc-500">
                          @ ${tx.price_per_unit?.toLocaleString()} • {tx.date && format(new Date(tx.date), 'MMM d, yyyy')}
                          {tx.exchange_or_wallet && ` • ${tx.exchange_or_wallet}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">${tx.total_value?.toLocaleString()}</p>
                        {tx.type === 'sell' && tx.realized_gain_loss !== undefined && (
                          <p className={cn(
                            "text-sm font-medium",
                            tx.realized_gain_loss >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {tx.realized_gain_loss >= 0 ? '+' : ''}{tx.realized_gain_loss.toLocaleString()} gain
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditingTx(tx); setFormOpen(true); }}
                          className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button
                          onClick={() => deleteTx.mutate(tx.id)}
                          className="p-1.5 rounded-lg hover:bg-rose-600/50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="lots">
          <div className="card-glass rounded-2xl p-6">
            <h3 className="font-semibold mb-6">Tax Lots (Unrealized)</h3>
            {lotsWithGains.length === 0 ? (
              <p className="text-center text-zinc-500 py-12">No tax lots to display</p>
            ) : (
              <div className="space-y-3">
                {lotsWithGains.map((lot) => (
                  <div key={lot.id} className="p-4 rounded-xl bg-zinc-800/30">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{lot.quantity} {lot.asset_ticker}</p>
                          <Badge variant="outline" className={cn(
                            "text-xs",
                            lot.isLongTerm ? 'border-emerald-400/50 text-emerald-400' : 'border-amber-400/50 text-amber-400'
                          )}>
                            {lot.isLongTerm ? 'Long-term' : `${lot.daysSincePurchase}d`}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-500">
                          Bought {lot.date && format(new Date(lot.date), 'MMM d, yyyy')} @ ${lot.price_per_unit?.toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-lg font-bold",
                          lot.unrealizedGain >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {lot.unrealizedGain >= 0 ? '+' : ''}{lot.unrealizedGainPercent.toFixed(1)}%
                        </p>
                        <p className="text-sm text-zinc-500">
                          {lot.unrealizedGain >= 0 ? '+' : ''}${lot.unrealizedGain.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-zinc-500">Cost Basis</p>
                        <p className="font-medium">${lot.costBasis.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500">Current Value</p>
                        <p className="font-medium">${lot.currentValue.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="harvest">
          <div className="card-glass rounded-2xl p-6">
            <h3 className="font-semibold mb-2">Tax Loss Harvesting Opportunities</h3>
            <p className="text-sm text-zinc-500 mb-6">Lots with unrealized losses that could offset gains</p>
            {harvestOpportunities.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-emerald-400/50 mx-auto mb-4" />
                <p className="text-zinc-500">No losses to harvest - all lots are in profit!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {harvestOpportunities.map((lot) => (
                  <div key={lot.id} className="p-4 rounded-xl bg-zinc-800/30 border border-rose-400/20">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{lot.quantity} {lot.asset_ticker}</p>
                        <p className="text-sm text-zinc-500">
                          Bought @ ${lot.price_per_unit?.toLocaleString()} • Now ${btcPrice.toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-rose-400">
                          ${Math.abs(lot.unrealizedGain).toLocaleString()}
                        </p>
                        <p className="text-sm text-zinc-500">Harvestable loss</p>
                      </div>
                    </div>
                    <p className="text-xs text-amber-400 mt-2">
                      ⚠️ Selling and rebuying within 30 days creates a wash sale
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTx ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Asset</Label>
                <Input
                  value={formData.asset_ticker}
                  onChange={(e) => setFormData({ ...formData, asset_ticker: e.target.value.toUpperCase() })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Quantity</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Price per Unit</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.price_per_unit}
                  onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Exchange/Wallet</Label>
              <Input
                value={formData.exchange_or_wallet}
                onChange={(e) => setFormData({ ...formData, exchange_or_wallet: e.target.value })}
                placeholder="e.g., Coinbase, Ledger"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            {formData.quantity && formData.price_per_unit && (
              <div className="p-3 rounded-xl bg-zinc-800/50">
                <p className="text-sm text-zinc-400">Total Value</p>
                <p className="text-xl font-bold text-amber-400">
                  ${(parseFloat(formData.quantity) * parseFloat(formData.price_per_unit)).toLocaleString()}
                </p>
              </div>
            )}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1 bg-transparent border-zinc-700">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 accent-gradient text-zinc-950 font-semibold">
                {editingTx ? 'Update' : 'Add'} Transaction
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}