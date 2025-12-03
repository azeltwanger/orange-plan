import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, AlertTriangle, CheckCircle, TrendingDown, Bitcoin, Lock, Unlock, Building } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export default function Liabilities() {
  const [btcPrice] = useState(97000);
  const [formOpen, setFormOpen] = useState(false);
  const [editingLiability, setEditingLiability] = useState(null);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    type: 'unsecured',
    principal_amount: '',
    current_balance: '',
    interest_rate: '',
    monthly_payment: '',
    collateral_btc_amount: '',
    liquidation_price: '',
    lender: '',
    due_date: '',
    notes: '',
  });

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
  });

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const createLiability = useMutation({
    mutationFn: (data) => base44.entities.Liability.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liabilities'] });
      setFormOpen(false);
      resetForm();
    },
  });

  const updateLiability = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Liability.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liabilities'] });
      setFormOpen(false);
      setEditingLiability(null);
      resetForm();
    },
  });

  const deleteLiability = useMutation({
    mutationFn: (id) => base44.entities.Liability.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['liabilities'] }),
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'unsecured',
      principal_amount: '',
      current_balance: '',
      interest_rate: '',
      monthly_payment: '',
      collateral_btc_amount: '',
      liquidation_price: '',
      lender: '',
      due_date: '',
      notes: '',
    });
  };

  useEffect(() => {
    if (editingLiability) {
      setFormData({
        name: editingLiability.name || '',
        type: editingLiability.type || 'unsecured',
        principal_amount: editingLiability.principal_amount || '',
        current_balance: editingLiability.current_balance || '',
        interest_rate: editingLiability.interest_rate || '',
        monthly_payment: editingLiability.monthly_payment || '',
        collateral_btc_amount: editingLiability.collateral_btc_amount || '',
        liquidation_price: editingLiability.liquidation_price || '',
        lender: editingLiability.lender || '',
        due_date: editingLiability.due_date || '',
        notes: editingLiability.notes || '',
      });
    }
  }, [editingLiability]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      principal_amount: parseFloat(formData.principal_amount) || 0,
      current_balance: parseFloat(formData.current_balance) || 0,
      interest_rate: parseFloat(formData.interest_rate) || 0,
      monthly_payment: parseFloat(formData.monthly_payment) || 0,
      collateral_btc_amount: parseFloat(formData.collateral_btc_amount) || 0,
      liquidation_price: parseFloat(formData.liquidation_price) || 0,
    };
    if (editingLiability) {
      updateLiability.mutate({ id: editingLiability.id, data });
    } else {
      createLiability.mutate(data);
    }
  };

  // Calculate totals
  const totalAssets = holdings.reduce((sum, h) => {
    if (h.ticker === 'BTC') return sum + (h.quantity * btcPrice);
    return sum + (h.quantity * (h.current_price || 0));
  }, 0);

  const totalLiabilities = liabilities.reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const debtToAssetRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  const securedDebt = liabilities.filter(l => l.type === 'secured').reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const unsecuredDebt = liabilities.filter(l => l.type === 'unsecured').reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const btcCollateralizedDebt = liabilities.filter(l => l.type === 'btc_collateralized').reduce((sum, l) => sum + (l.current_balance || 0), 0);

  // BTC collateral health
  const btcLoans = liabilities.filter(l => l.type === 'btc_collateralized');
  const totalCollateralBtc = btcLoans.reduce((sum, l) => sum + (l.collateral_btc_amount || 0), 0);
  const totalCollateralValue = totalCollateralBtc * btcPrice;
  const collateralRatio = btcCollateralizedDebt > 0 ? (totalCollateralValue / btcCollateralizedDebt) * 100 : 0;

  // Check for at-risk loans
  const atRiskLoans = btcLoans.filter(l => {
    if (!l.liquidation_price) return false;
    const marginToLiquidation = ((btcPrice - l.liquidation_price) / btcPrice) * 100;
    return marginToLiquidation < 30;
  });

  const typeIcons = {
    secured: Building,
    unsecured: Unlock,
    btc_collateralized: Bitcoin,
  };

  const typeColors = {
    secured: 'bg-blue-400/10 text-blue-400',
    unsecured: 'bg-purple-400/10 text-purple-400',
    btc_collateralized: 'bg-amber-400/10 text-amber-400',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Liabilities</h1>
          <p className="text-zinc-500 mt-1">Track debt and collateral health</p>
        </div>
        <Button
          onClick={() => { setEditingLiability(null); resetForm(); setFormOpen(true); }}
          className="accent-gradient text-zinc-950 font-semibold hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Liability
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Total Debt</span>
            <div className="p-1.5 rounded-lg bg-rose-400/10">
              <TrendingDown className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-rose-400">${totalLiabilities.toLocaleString()}</p>
        </div>

        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Debt/Asset Ratio</span>
            <div className={cn("p-1.5 rounded-lg", debtToAssetRatio > 50 ? "bg-rose-400/10" : "bg-emerald-400/10")}>
              {debtToAssetRatio > 50 ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
            </div>
          </div>
          <p className={cn("text-2xl font-bold", debtToAssetRatio > 50 ? "text-rose-400" : "text-emerald-400")}>
            {debtToAssetRatio.toFixed(1)}%
          </p>
          <Progress value={Math.min(debtToAssetRatio, 100)} className="h-2 mt-3 bg-zinc-700" />
        </div>

        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">BTC Collateral</span>
            <div className="p-1.5 rounded-lg bg-amber-400/10">
              <Bitcoin className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-400">{totalCollateralBtc.toFixed(4)} BTC</p>
          <p className="text-xs text-zinc-500 mt-1">${totalCollateralValue.toLocaleString()}</p>
        </div>

        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">At-Risk Loans</span>
            <div className={cn("p-1.5 rounded-lg", atRiskLoans.length > 0 ? "bg-rose-400/10" : "bg-emerald-400/10")}>
              {atRiskLoans.length > 0 ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
            </div>
          </div>
          <p className={cn("text-2xl font-bold", atRiskLoans.length > 0 ? "text-rose-400" : "text-emerald-400")}>
            {atRiskLoans.length}
          </p>
          <p className="text-xs text-zinc-500 mt-1">{atRiskLoans.length === 0 ? 'All loans healthy' : 'Needs attention'}</p>
        </div>
      </div>

      {/* Debt Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-400/10">
              <Building className="w-5 h-5 text-blue-400" />
            </div>
            <span className="font-medium">Secured Debt</span>
          </div>
          <p className="text-2xl font-bold">${securedDebt.toLocaleString()}</p>
        </div>
        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-400/10">
              <Unlock className="w-5 h-5 text-purple-400" />
            </div>
            <span className="font-medium">Unsecured Debt</span>
          </div>
          <p className="text-2xl font-bold">${unsecuredDebt.toLocaleString()}</p>
        </div>
        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-400/10">
              <Bitcoin className="w-5 h-5 text-amber-400" />
            </div>
            <span className="font-medium">BTC Collateralized</span>
          </div>
          <p className="text-2xl font-bold">${btcCollateralizedDebt.toLocaleString()}</p>
          {collateralRatio > 0 && (
            <p className="text-sm text-zinc-500 mt-1">{collateralRatio.toFixed(0)}% collateral ratio</p>
          )}
        </div>
      </div>

      {/* Liabilities List */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-6">All Liabilities</h3>
        {liabilities.length === 0 ? (
          <div className="text-center py-12">
            <Lock className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">No liabilities recorded. Add your first debt.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {liabilities.map((liability) => {
              const Icon = typeIcons[liability.type] || Lock;
              const colorClass = typeColors[liability.type] || 'bg-zinc-400/10 text-zinc-400';
              const paidOff = liability.principal_amount > 0 
                ? ((liability.principal_amount - liability.current_balance) / liability.principal_amount) * 100 
                : 0;

              let collateralHealth = null;
              if (liability.type === 'btc_collateralized' && liability.liquidation_price) {
                const marginToLiquidation = ((btcPrice - liability.liquidation_price) / btcPrice) * 100;
                collateralHealth = {
                  margin: marginToLiquidation,
                  isHealthy: marginToLiquidation >= 50,
                  isWarning: marginToLiquidation >= 30 && marginToLiquidation < 50,
                  isDanger: marginToLiquidation < 30,
                };
              }

              return (
                <div key={liability.id} className="p-5 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", colorClass)}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-lg">{liability.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-zinc-500">
                          <span className="capitalize">{liability.type?.replace('_', ' ')}</span>
                          {liability.lender && (
                            <>
                              <span>•</span>
                              <span>{liability.lender}</span>
                            </>
                          )}
                          {liability.interest_rate > 0 && (
                            <>
                              <span>•</span>
                              <span>{liability.interest_rate}% APR</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingLiability(liability); setFormOpen(true); }}
                        className="p-2 rounded-lg hover:bg-zinc-700 transition-colors"
                      >
                        <Pencil className="w-4 h-4 text-zinc-400" />
                      </button>
                      <button
                        onClick={() => deleteLiability.mutate(liability.id)}
                        className="p-2 rounded-lg hover:bg-rose-600/50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-zinc-500">Balance</p>
                      <p className="text-lg font-semibold text-rose-400">${liability.current_balance?.toLocaleString()}</p>
                    </div>
                    {liability.principal_amount > 0 && (
                      <div>
                        <p className="text-sm text-zinc-500">Original</p>
                        <p className="text-lg font-semibold">${liability.principal_amount?.toLocaleString()}</p>
                      </div>
                    )}
                    {liability.monthly_payment > 0 && (
                      <div>
                        <p className="text-sm text-zinc-500">Monthly</p>
                        <p className="text-lg font-semibold">${liability.monthly_payment?.toLocaleString()}</p>
                      </div>
                    )}
                    {liability.type === 'btc_collateralized' && liability.collateral_btc_amount > 0 && (
                      <div>
                        <p className="text-sm text-zinc-500">Collateral</p>
                        <p className="text-lg font-semibold text-amber-400">{liability.collateral_btc_amount} BTC</p>
                      </div>
                    )}
                  </div>

                  {liability.principal_amount > 0 && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-zinc-500">Paid Off</span>
                        <span className="font-medium text-emerald-400">{paidOff.toFixed(1)}%</span>
                      </div>
                      <Progress value={paidOff} className="h-2 bg-zinc-700" />
                    </div>
                  )}

                  {collateralHealth && (
                    <div className={cn(
                      "p-3 rounded-lg flex items-center gap-3",
                      collateralHealth.isHealthy && "bg-emerald-400/10",
                      collateralHealth.isWarning && "bg-amber-400/10",
                      collateralHealth.isDanger && "bg-rose-400/10"
                    )}>
                      {collateralHealth.isDanger ? (
                        <AlertTriangle className="w-5 h-5 text-rose-400" />
                      ) : collateralHealth.isWarning ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      )}
                      <div>
                        <p className={cn(
                          "font-medium",
                          collateralHealth.isHealthy && "text-emerald-400",
                          collateralHealth.isWarning && "text-amber-400",
                          collateralHealth.isDanger && "text-rose-400"
                        )}>
                          {collateralHealth.margin.toFixed(1)}% margin to liquidation
                        </p>
                        <p className="text-sm text-zinc-500">
                          Liquidation at ${liability.liquidation_price?.toLocaleString()} • Current ${btcPrice.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLiability ? 'Edit Liability' : 'Add Liability'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Mortgage, Credit Card"
                className="bg-zinc-800 border-zinc-700"
                required
              />
            </div>
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
                    <SelectItem value="secured">Secured</SelectItem>
                    <SelectItem value="unsecured">Unsecured</SelectItem>
                    <SelectItem value="btc_collateralized">BTC Collateralized</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Lender</Label>
                <Input
                  value={formData.lender}
                  onChange={(e) => setFormData({ ...formData, lender: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Principal Amount</Label>
                <Input
                  type="number"
                  value={formData.principal_amount}
                  onChange={(e) => setFormData({ ...formData, principal_amount: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Current Balance</Label>
                <Input
                  type="number"
                  value={formData.current_balance}
                  onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Interest Rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.interest_rate}
                  onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Monthly Payment</Label>
                <Input
                  type="number"
                  value={formData.monthly_payment}
                  onChange={(e) => setFormData({ ...formData, monthly_payment: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            {formData.type === 'btc_collateralized' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Collateral (BTC)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={formData.collateral_btc_amount}
                    onChange={(e) => setFormData({ ...formData, collateral_btc_amount: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Liquidation Price</Label>
                  <Input
                    type="number"
                    value={formData.liquidation_price}
                    onChange={(e) => setFormData({ ...formData, liquidation_price: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-zinc-400">Due Date</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700 resize-none"
                rows={2}
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1 bg-transparent border-zinc-700">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 accent-gradient text-zinc-950 font-semibold">
                {editingLiability ? 'Update' : 'Add'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}