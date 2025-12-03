import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Save } from 'lucide-react';

export default function HoldingForm({ open, onClose, onSubmit, initialData }) {
  const [formData, setFormData] = useState({
    asset_name: '',
    asset_type: 'crypto',
    ticker: '',
    quantity: '',
    current_price: '',
    cost_basis_total: '',
    notes: '',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        asset_name: initialData.asset_name || '',
        asset_type: initialData.asset_type || 'crypto',
        ticker: initialData.ticker || '',
        quantity: initialData.quantity || '',
        current_price: initialData.current_price || '',
        cost_basis_total: initialData.cost_basis_total || '',
        notes: initialData.notes || '',
      });
    } else {
      setFormData({
        asset_name: '',
        asset_type: 'crypto',
        ticker: '',
        quantity: '',
        current_price: '',
        cost_basis_total: '',
        notes: '',
      });
    }
  }, [initialData, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      quantity: parseFloat(formData.quantity) || 0,
      current_price: parseFloat(formData.current_price) || 0,
      cost_basis_total: parseFloat(formData.cost_basis_total) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {initialData ? 'Edit Holding' : 'Add Holding'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-zinc-400">Asset Name</Label>
            <Input
              value={formData.asset_name}
              onChange={(e) => setFormData({ ...formData, asset_name: e.target.value })}
              placeholder="e.g., Bitcoin"
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Asset Type</Label>
              <Select
                value={formData.asset_type}
                onValueChange={(value) => setFormData({ ...formData, asset_type: value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="stocks">Stocks</SelectItem>
                  <SelectItem value="real_estate">Real Estate</SelectItem>
                  <SelectItem value="bonds">Bonds</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Ticker</Label>
              <Input
                value={formData.ticker}
                onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                placeholder="BTC"
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
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
                placeholder="0.00"
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Current Price</Label>
              <Input
                type="number"
                step="any"
                value={formData.current_price}
                onChange={(e) => setFormData({ ...formData, current_price: e.target.value })}
                placeholder="0.00"
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-400">Total Cost Basis</Label>
            <Input
              type="number"
              step="any"
              value={formData.cost_basis_total}
              onChange={(e) => setFormData({ ...formData, cost_basis_total: e.target.value })}
              placeholder="0.00"
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-400">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-none"
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 accent-gradient text-zinc-950 font-semibold hover:opacity-90"
            >
              <Save className="w-4 h-4 mr-2" />
              {initialData ? 'Update' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}