import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Trash2, Package, Pencil, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { syncHoldingFromLots } from '@/components/shared/syncHoldings';

export default function ManageLotsDialog({ open, onClose, holding, btcPrice }) {
  const queryClient = useQueryClient();
  const [addingLot, setAddingLot] = useState(false);
  const [editingLot, setEditingLot] = useState(null);
  const [newLot, setNewLot] = useState({
    quantity: '',
    price_per_unit: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    exchange_or_wallet: '',
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date'),
  });

  // Get lots for this holding's ticker AND account_id
  const lots = transactions.filter(t => {
    if (t.type !== 'buy' || t.asset_ticker !== holding?.ticker) return false;
    return t.account_id === holding?.account_id;
  });

  const isBTC = holding?.ticker === 'BTC';
  const decimals = isBTC ? 8 : 2;

  // Simple calculations
  const currentHolding = holding?.quantity || 0;
  const trackedInLots = lots.reduce((sum, l) => sum + (l.quantity || 0), 0);
  const unallocated = currentHolding - trackedInLots;

  const createLot = useMutation({
    mutationFn: async (data) => {
      const total = data.quantity * data.price_per_unit;
      const lotId = `${holding.ticker}-${Date.now()}`;
      
      await base44.entities.Transaction.create({
        type: 'buy',
        asset_ticker: holding.ticker,
        quantity: data.quantity,
        price_per_unit: data.price_per_unit,
        total_value: total,
        date: data.date,
        lot_id: lotId,
        cost_basis: total,
        exchange_or_wallet: data.exchange_or_wallet,
        holding_id: holding.id,
        account_type: holding.account_type || 'taxable',
        account_id: holding.account_id || undefined,
      });

      await syncHoldingFromLots(holding.ticker, holding.account_id || null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setAddingLot(false);
      setNewLot({ quantity: '', price_per_unit: '', date: format(new Date(), 'yyyy-MM-dd'), exchange_or_wallet: '' });
    },
  });

  const updateLot = useMutation({
    mutationFn: async ({ lot, data }) => {
      const total = data.quantity * data.price_per_unit;
      
      await base44.entities.Transaction.update(lot.id, {
        quantity: data.quantity,
        price_per_unit: data.price_per_unit,
        total_value: total,
        date: data.date,
        cost_basis: total,
        exchange_or_wallet: data.exchange_or_wallet,
      });

      await syncHoldingFromLots(holding.ticker, holding.account_id || null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setEditingLot(null);
      setAddingLot(false);
      setNewLot({ quantity: '', price_per_unit: '', date: format(new Date(), 'yyyy-MM-dd'), exchange_or_wallet: '' });
    },
  });

  const deleteLot = useMutation({
    mutationFn: async (lot) => {
      await base44.entities.Transaction.delete(lot.id);
      await syncHoldingFromLots(holding.ticker, holding.account_id || null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...newLot,
      quantity: parseFloat(newLot.quantity),
      price_per_unit: parseFloat(newLot.price_per_unit),
    };
    
    if (editingLot) {
      updateLot.mutate({ lot: editingLot, data });
    } else {
      createLot.mutate(data);
    }
  };

  const handleEditLot = (lot) => {
    setEditingLot(lot);
    setNewLot({
      quantity: lot.quantity.toString(),
      price_per_unit: lot.price_per_unit.toString(),
      date: lot.date || format(new Date(), 'yyyy-MM-dd'),
      exchange_or_wallet: lot.exchange_or_wallet || '',
    });
    setAddingLot(true);
  };

  const handleCancel = () => {
    setEditingLot(null);
    setAddingLot(false);
    setNewLot({ quantity: '', price_per_unit: '', date: format(new Date(), 'yyyy-MM-dd'), exchange_or_wallet: '' });
  };

  if (!holding) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-400" />
            Purchase Lots - {holding.asset_name} ({holding.ticker})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Header Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-zinc-800/40">
              <p className="text-xs text-zinc-500">Current Holding</p>
              <p className="text-lg font-semibold">{currentHolding.toFixed(decimals)}</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-800/40">
              <p className="text-xs text-zinc-500">Tracked in Lots</p>
              <p className="text-lg font-semibold">{trackedInLots.toFixed(decimals)}</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-800/40">
              <p className="text-xs text-zinc-500">Unallocated</p>
              <p className="text-lg font-semibold">{unallocated.toFixed(decimals)}</p>
            </div>
          </div>

          {/* Status Banner */}
          {Math.abs(unallocated) < 0.00000001 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">All holdings have purchase lots ✓</span>
            </div>
          ) : unallocated > 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">You have {unallocated.toFixed(decimals)} {holding.ticker} without purchase history. Add lots to track cost basis accurately.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">Lots exceed holdings by {Math.abs(unallocated).toFixed(decimals)} - check for duplicate entries</span>
            </div>
          )}

          {/* Lot List */}
          <div>
            <h3 className="font-medium text-sm text-zinc-400 mb-3">Purchase Lots ({lots.length})</h3>
            
            {lots.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No purchase lots recorded</p>
                <p className="text-sm mt-1">Add lots to track cost basis</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {lots.map((lot) => (
                  <div key={lot.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 border border-zinc-800">
                    <div className="flex-1 grid grid-cols-4 gap-4 items-center text-sm">
                      <span className="text-zinc-400">{lot.date && format(new Date(lot.date), 'MMM d, yyyy')}</span>
                      <span>{lot.quantity?.toFixed(decimals)} {holding.ticker}</span>
                      <span className="text-zinc-400">@ ${lot.price_per_unit?.toLocaleString()}</span>
                      <span className="font-medium">${(lot.quantity * lot.price_per_unit).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1 ml-3">
                      <button
                        onClick={() => handleEditLot(lot)}
                        className="p-1.5 rounded hover:bg-zinc-700 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                      <button
                        onClick={() => deleteLot.mutate(lot)}
                        className="p-1.5 rounded hover:bg-rose-600/30 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add/Edit Form */}
          {addingLot ? (
            <form onSubmit={handleSubmit} className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-4">
              <h4 className="font-medium text-sm">
                {editingLot ? 'Edit Lot' : 'Add Purchase Lot'}
              </h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-400">Quantity</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newLot.quantity}
                    onChange={(e) => setNewLot({ ...newLot, quantity: e.target.value })}
                    placeholder="0.1"
                    className="bg-zinc-900 border-zinc-800"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-400">Price per {holding.ticker}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newLot.price_per_unit}
                    onChange={(e) => setNewLot({ ...newLot, price_per_unit: e.target.value })}
                    placeholder={btcPrice?.toString() || "50000"}
                    className="bg-zinc-900 border-zinc-800"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-400">Purchase Date</Label>
                  <Input
                    type="date"
                    value={newLot.date}
                    onChange={(e) => setNewLot({ ...newLot, date: e.target.value })}
                    className="bg-zinc-900 border-zinc-800"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-400">Exchange/Wallet</Label>
                  <Input
                    value={newLot.exchange_or_wallet}
                    onChange={(e) => setNewLot({ ...newLot, exchange_or_wallet: e.target.value })}
                    placeholder="Coinbase, Strike..."
                    className="bg-zinc-900 border-zinc-800"
                  />
                </div>
              </div>

              {newLot.quantity && newLot.price_per_unit && (
                <div className="text-sm text-zinc-400">
                  Cost Basis: <span className="font-medium text-zinc-100">${(parseFloat(newLot.quantity) * parseFloat(newLot.price_per_unit)).toLocaleString()}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} className="flex-1 bg-transparent border-zinc-700">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 brand-gradient text-white">
                  {editingLot ? 'Update' : 'Add Lot'}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              onClick={() => setAddingLot(true)}
              className="w-full brand-gradient text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Purchase Lot
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}