import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Trash2, Package, Calendar, DollarSign, Pencil } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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

  // Get lots for this holding's ticker AND account type
  const lots = transactions.filter(t => {
    if (t.type !== 'buy' || t.asset_ticker !== holding?.ticker) return false;
    
    // Match by account type - default to 'taxable' if not set
    const txAccountType = t.account_type || 'taxable';
    const holdingAccountType = holding?.account_type || 'taxable';
    
    return txAccountType === holdingAccountType;
  });

  const totalOriginalPurchases = lots.reduce((sum, l) => sum + (l.quantity || 0), 0);
  const remainingInLots = lots.reduce((sum, l) => sum + ((l.remaining_quantity ?? l.quantity) || 0), 0);
  
  // FIX: Use remainingQuantity consistently for current state
  // holdingQty = stored current holding (should match remainingInLots)
  // remainingInLots = sum of lot.remaining_quantity (after sales)
  // unallocated = holdings not yet tracked in lots
  const holdingQty = holding?.quantity || 0;
  const allocatedToLots = remainingInLots; // Current allocated (using remaining amounts)
  const unallocated = holdingQty - allocatedToLots; // Should be ~0 if synced

  // ENHANCED Debug logging
  console.log("=== HOLDINGS VS LOTS DEBUG ===");
  console.log("\nHolding entity:", {
    id: holding?.id,
    ticker: holding?.ticker,
    storedQuantity: holdingQty,
    costBasisTotal: holding?.cost_basis_total,
    currentPrice: holding?.current_price,
    accountType: holding?.account_type,
  });
  
  console.log("\nTax Lots for this holding:");
  lots.forEach((lot, i) => {
    console.log(`  Lot ${i + 1}:`, {
      id: lot.id,
      date: lot.date,
      quantity: lot.quantity,
      remainingQuantity: lot.remaining_quantity ?? lot.quantity,
      pricePerUnit: lot.price_per_unit,
      costBasis: lot.cost_basis,
      accountType: lot.account_type,
    });
  });
  
  const sumLotQuantity = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
  const sumLotRemaining = lots.reduce((sum, lot) => sum + ((lot.remaining_quantity ?? lot.quantity) || 0), 0);
  
  console.log("\n📊 Calculation breakdown:");
  console.log("  Total Holding (holding.quantity, STORED VALUE):", holdingQty.toFixed(8));
  console.log("  Sum of lot.quantity (ORIGINAL purchases):", sumLotQuantity.toFixed(8));
  console.log("  Sum of lot.remainingQuantity (AFTER sales):", sumLotRemaining.toFixed(8));
  console.log("  Allocated to Lots (using lot.remainingQuantity):", allocatedToLots.toFixed(8));
  console.log("  Unallocated (holding.quantity - allocated):", unallocated.toFixed(8));
  
  console.log("\n❓ KEY QUESTIONS:");
  console.log("  1. Is 'Total Holding' pulled from holding.quantity?", "YES →", holdingQty.toFixed(8));
  console.log("  2. Is 'Allocated to Lots' using lot.remainingQuantity?", "YES (FIXED) →", allocatedToLots.toFixed(8));
  console.log("  3. What SHOULD holding.quantity be?", "sum of remainingQuantity →", sumLotRemaining.toFixed(8));
  
  console.log("\n⚠️ ISSUE ANALYSIS:");
  if (unallocated < -0.00000001) {
    console.log("  ❌ NEGATIVE UNALLOCATED:", unallocated.toFixed(8));
    console.log("  This means: sum(lot.remainingQuantity) > holding.quantity");
    console.log("  Likely cause: Lots were added but holding.quantity wasn't updated");
  } else if (Math.abs(holdingQty - sumLotRemaining) > 0.00000001) {
    console.log("  ⚠️ MISMATCH: holding.quantity ≠ sum(lot.remainingQuantity)");
    console.log("  Difference:", (holdingQty - sumLotRemaining).toFixed(8));
    console.log("  Stored holding:", holdingQty.toFixed(8));
    console.log("  Should be:", sumLotRemaining.toFixed(8));
  } else {
    console.log("  ✅ SYNC OK: holding.quantity matches sum(lot.remainingQuantity)");
  }
  
  console.log("\n✅ CORRECT BEHAVIOR:");
  console.log("  After a sale is recorded:");
  console.log("    - lot.remainingQuantity should be reduced");
  console.log("    - holding.quantity should be reduced by same amount");
  console.log("    - Both should stay in sync!");
  console.log("==============================");

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
      });

      // Update holding cost basis
      const newCostBasis = (holding.cost_basis_total || 0) + total;
      await base44.entities.Holding.update(holding.id, {
        cost_basis_total: newCostBasis,
      });
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
      const oldTotal = lot.total_value || 0;
      
      await base44.entities.Transaction.update(lot.id, {
        quantity: data.quantity,
        price_per_unit: data.price_per_unit,
        total_value: total,
        date: data.date,
        cost_basis: total,
        exchange_or_wallet: data.exchange_or_wallet,
      });

      // Update holding cost basis
      const newCostBasis = (holding.cost_basis_total || 0) - oldTotal + total;
      await base44.entities.Holding.update(holding.id, {
        cost_basis_total: newCostBasis,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setEditingLot(null);
      setNewLot({ quantity: '', price_per_unit: '', date: format(new Date(), 'yyyy-MM-dd'), exchange_or_wallet: '' });
    },
  });

  const deleteLot = useMutation({
    mutationFn: async (lot) => {
      await base44.entities.Transaction.delete(lot.id);
      
      // Update holding cost basis
      const newCostBasis = Math.max(0, (holding.cost_basis_total || 0) - (lot.total_value || 0));
      await base44.entities.Holding.update(holding.id, {
        cost_basis_total: newCostBasis,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
    },
  });

  const handleAddLot = (e) => {
    e.preventDefault();
    if (editingLot) {
      updateLot.mutate({
        lot: editingLot,
        data: {
          ...newLot,
          quantity: parseFloat(newLot.quantity),
          price_per_unit: parseFloat(newLot.price_per_unit),
        },
      });
    } else {
      createLot.mutate({
        ...newLot,
        quantity: parseFloat(newLot.quantity),
        price_per_unit: parseFloat(newLot.price_per_unit),
      });
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

  const handleCancelEdit = () => {
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
            Manage Tax Lots - {holding.asset_name} ({holding.ticker})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-zinc-800/30">
              <p className="text-sm text-zinc-500">Current Holding</p>
              <p className="text-xl font-bold text-emerald-400">{holdingQty.toFixed(holding.ticker === 'BTC' ? 8 : 2)} {holding.ticker}</p>
              <p className="text-xs text-zinc-500 mt-1">Stored balance</p>
            </div>
            <div className="p-4 rounded-xl bg-zinc-800/30">
              <p className="text-sm text-zinc-500">Allocated to Lots</p>
              <p className="text-xl font-bold text-zinc-400">{allocatedToLots.toFixed(holding.ticker === 'BTC' ? 8 : 2)}</p>
              <p className="text-xs text-zinc-500 mt-1">Tracked in tax lots</p>
            </div>
            <div className="p-4 rounded-xl bg-zinc-800/30">
              <p className="text-sm text-zinc-500">Unallocated</p>
              <p className={cn("text-xl font-bold", unallocated > 0.00000001 ? "text-amber-400" : unallocated < -0.00000001 ? "text-rose-400" : "text-zinc-400")}>
                {unallocated.toFixed(holding.ticker === 'BTC' ? 8 : 2)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Need purchase lots</p>
            </div>
          </div>

          {unallocated > 0.00000001 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
              You have {unallocated.toFixed(holding.ticker === 'BTC' ? 8 : 2)} {holding.ticker} not yet assigned to purchase lots. 
              Add lots below to track cost basis for tax purposes.
            </div>
          )}

          {Math.abs(holdingQty - allocatedToLots) > 0.00000001 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
              ℹ️ Sync Notice: Stored holding ({holdingQty.toFixed(holding.ticker === 'BTC' ? 8 : 2)}) differs from tracked lots ({allocatedToLots.toFixed(holding.ticker === 'BTC' ? 8 : 2)}). 
              {unallocated > 0 ? ' Add lots below to track cost basis.' : ' Holdings and lots should match.'}
            </div>
          )}

          {/* Existing Lots */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Purchase Lots ({lots.length})</h3>
              <Button
                size="sm"
                onClick={() => setAddingLot(true)}
                className="brand-gradient text-white"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Lot
              </Button>
            </div>

            {lots.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No purchase lots recorded yet</p>
                <p className="text-sm mt-1">Add lots to track cost basis for taxes</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {lots.map((lot) => {
                  const remainingQty = lot.remaining_quantity !== undefined ? lot.remaining_quantity : lot.quantity;
                  const isPartiallyUsed = remainingQty < lot.quantity;
                  const isFullyUsed = remainingQty <= 0;
                  
                  return (
                  <div key={lot.id} className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-colors",
                    isFullyUsed ? "bg-rose-900/10 border-rose-500/20 opacity-50" :
                    "bg-zinc-800/30 border-zinc-800 hover:border-zinc-700"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          {isFullyUsed ? (
                            <p className="font-medium text-rose-400 line-through">
                              {lot.quantity?.toFixed(holding.ticker === 'BTC' ? 8 : 2)} {holding.ticker}
                            </p>
                          ) : isPartiallyUsed ? (
                            <div className="flex items-baseline gap-1.5">
                              <p className="font-medium text-zinc-100">
                                {remainingQty.toFixed(holding.ticker === 'BTC' ? 8 : 2)}
                              </p>
                              <span className="text-xs text-zinc-500">
                                / {lot.quantity?.toFixed(holding.ticker === 'BTC' ? 8 : 2)} {holding.ticker}
                              </span>
                            </div>
                          ) : (
                            <p className="font-medium">{lot.quantity?.toFixed(holding.ticker === 'BTC' ? 8 : 2)} {holding.ticker}</p>
                          )}
                          
                          {isFullyUsed && <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded">Used</span>}
                          {isPartiallyUsed && !isFullyUsed && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">Partial</span>}
                        </div>
                        <p className="text-sm text-zinc-500">
                          @ ${lot.price_per_unit?.toLocaleString()} • {lot.date && format(new Date(lot.date), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="font-semibold">${(lot.total_value || 0).toLocaleString()}</p>
                        {lot.exchange_or_wallet && (
                          <p className="text-xs text-zinc-500">{lot.exchange_or_wallet}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleEditLot(lot)}
                        className="p-1.5 rounded-lg hover:bg-orange-600/30 transition-colors"
                      >
                        <Pencil className="w-4 h-4 text-zinc-500 hover:text-orange-400" />
                      </button>
                      <button
                        onClick={() => deleteLot.mutate(lot)}
                        className="p-1.5 rounded-lg hover:bg-rose-600/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-zinc-500 hover:text-rose-400" />
                      </button>
                    </div>
                  </div>
                );})}
              </div>
            )}
          </div>

          {/* Add/Edit Lot Form */}
          {addingLot && (
            <form onSubmit={handleAddLot} className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                {editingLot ? <Pencil className="w-4 h-4 text-orange-400" /> : <Plus className="w-4 h-4 text-orange-400" />}
                {editingLot ? 'Edit Purchase Lot' : 'Add Purchase Lot'}
              </h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Quantity {unallocated > 0 && <span className="text-zinc-500">(max: {unallocated.toFixed(holding.ticker === 'BTC' ? 8 : 4)})</span>}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newLot.quantity}
                    onChange={(e) => setNewLot({ ...newLot, quantity: e.target.value })}
                    placeholder={unallocated > 0 ? unallocated.toFixed(8) : "0.1"}
                    max={unallocated > 0 ? unallocated : undefined}
                    className="bg-zinc-900 border-zinc-800"
                    required
                  />
                  {parseFloat(newLot.quantity) > unallocated && unallocated > 0 && (
                    <p className="text-xs text-rose-400">Exceeds unallocated amount</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Price per {holding.ticker}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newLot.price_per_unit}
                    onChange={(e) => setNewLot({ ...newLot, price_per_unit: e.target.value })}
                    placeholder={btcPrice?.toString() || "97000"}
                    className="bg-zinc-900 border-zinc-800"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Purchase Date</Label>
                  <Input
                    type="date"
                    value={newLot.date}
                    onChange={(e) => setNewLot({ ...newLot, date: e.target.value })}
                    className="bg-zinc-900 border-zinc-800"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Exchange/Wallet</Label>
                  <Input
                    value={newLot.exchange_or_wallet}
                    onChange={(e) => setNewLot({ ...newLot, exchange_or_wallet: e.target.value })}
                    placeholder="Coinbase, Strike..."
                    className="bg-zinc-900 border-zinc-800"
                  />
                </div>
              </div>

              {newLot.quantity && newLot.price_per_unit && (
                <div className="p-3 rounded-lg bg-zinc-800/50">
                  <p className="text-sm text-zinc-400">Total Cost Basis</p>
                  <p className="text-lg font-bold text-orange-400">
                    ${(parseFloat(newLot.quantity) * parseFloat(newLot.price_per_unit)).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={handleCancelEdit} className="flex-1 bg-transparent border-zinc-700">
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 brand-gradient text-white"
                  disabled={!editingLot && unallocated > 0 && parseFloat(newLot.quantity) > unallocated}
                >
                  {editingLot ? 'Update Lot' : 'Add Lot'}
                </Button>
              </div>
            </form>
          )}

          {/* Quick Fill Unallocated */}
          {unallocated > 0.00000001 && !addingLot && (
            <Button
              variant="outline"
              onClick={() => {
                setNewLot({ ...newLot, quantity: unallocated.toString() });
                setAddingLot(true);
              }}
              className="w-full bg-transparent border-zinc-700 hover:border-orange-500/50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Lot for Remaining {unallocated.toFixed(holding.ticker === 'BTC' ? 8 : 2)} {holding.ticker}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}