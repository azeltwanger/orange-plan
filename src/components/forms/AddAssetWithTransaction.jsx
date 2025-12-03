import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, ChevronRight, ChevronLeft, Info, DollarSign } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const accountTaxMapping = {
  taxable: 'taxable',
  traditional_401k: 'tax_deferred',
  roth_401k: 'tax_free',
  traditional_ira: 'tax_deferred',
  roth_ira: 'tax_free',
  hsa: 'tax_free',
  '529': 'tax_free',
};

export default function AddAssetWithTransaction({ 
  open, 
  onClose, 
  onSubmit, 
  initialData = null,
  btcPrice = 97000 
}) {
  const [step, setStep] = useState(1);
  const [assetData, setAssetData] = useState({
    asset_name: '',
    asset_type: 'crypto',
    ticker: '',
    quantity: '',
    current_price: '',
    account_type: 'taxable',
    notes: '',
  });

  const [transactionData, setTransactionData] = useState({
    date: new Date().toISOString().split('T')[0],
    price_per_unit: '',
    exchange_or_wallet: '',
    trading_fee: '',
    withdrawal_fee: '',
    deposit_fee: '',
    global_fmv_at_purchase: '',
  });

  const [includeTransaction, setIncludeTransaction] = useState(true);

  useEffect(() => {
    if (initialData) {
      setAssetData({
        asset_name: initialData.asset_name || '',
        asset_type: initialData.asset_type || 'crypto',
        ticker: initialData.ticker || '',
        quantity: initialData.quantity || '',
        current_price: initialData.current_price || '',
        account_type: initialData.account_type || 'taxable',
        notes: initialData.notes || '',
      });
      setIncludeTransaction(false);
      setStep(1);
    } else {
      resetForm();
    }
  }, [initialData, open]);

  const resetForm = () => {
    setAssetData({
      asset_name: '',
      asset_type: 'crypto',
      ticker: '',
      quantity: '',
      current_price: '',
      account_type: 'taxable',
      notes: '',
    });
    setTransactionData({
      date: new Date().toISOString().split('T')[0],
      price_per_unit: '',
      exchange_or_wallet: '',
      trading_fee: '',
      withdrawal_fee: '',
      deposit_fee: '',
      global_fmv_at_purchase: '',
    });
    setIncludeTransaction(true);
    setStep(1);
  };

  // Auto-fill current price for BTC
  useEffect(() => {
    if (assetData.ticker === 'BTC' && btcPrice) {
      setAssetData(prev => ({ ...prev, current_price: btcPrice }));
      if (!transactionData.price_per_unit) {
        setTransactionData(prev => ({ ...prev, price_per_unit: btcPrice, global_fmv_at_purchase: btcPrice }));
      }
    }
  }, [assetData.ticker, btcPrice]);

  const handleSubmit = () => {
    const quantity = parseFloat(assetData.quantity) || 0;
    const pricePerUnit = parseFloat(transactionData.price_per_unit) || parseFloat(assetData.current_price) || 0;
    const tradingFee = parseFloat(transactionData.trading_fee) || 0;
    const withdrawalFee = parseFloat(transactionData.withdrawal_fee) || 0;
    const depositFee = parseFloat(transactionData.deposit_fee) || 0;
    
    const totalFees = tradingFee + withdrawalFee + depositFee;
    const costBasis = (quantity * pricePerUnit) + totalFees;

    const holdingData = {
      ...assetData,
      quantity,
      current_price: parseFloat(assetData.current_price) || 0,
      cost_basis_total: costBasis,
      tax_treatment: accountTaxMapping[assetData.account_type] || 'taxable',
    };

    let txData = null;
    if (includeTransaction && transactionData.date) {
      txData = {
        type: 'buy',
        asset_ticker: assetData.ticker,
        quantity,
        price_per_unit: pricePerUnit,
        total_value: quantity * pricePerUnit,
        date: transactionData.date,
        exchange_or_wallet: transactionData.exchange_or_wallet,
        trading_fee: tradingFee,
        withdrawal_fee: withdrawalFee,
        deposit_fee: depositFee,
        global_fmv_at_purchase: parseFloat(transactionData.global_fmv_at_purchase) || pricePerUnit,
        cost_basis: costBasis,
        lot_id: `${assetData.ticker}-${Date.now()}`,
      };
    }

    onSubmit({ holding: holdingData, transaction: txData });
    onClose();
    resetForm();
  };

  // Calculate friction cost
  const calculateFriction = () => {
    const qty = parseFloat(assetData.quantity) || 0;
    const pricePaid = parseFloat(transactionData.price_per_unit) || 0;
    const globalFmv = parseFloat(transactionData.global_fmv_at_purchase) || pricePaid;
    const tradingFee = parseFloat(transactionData.trading_fee) || 0;
    const withdrawalFee = parseFloat(transactionData.withdrawal_fee) || 0;
    const depositFee = parseFloat(transactionData.deposit_fee) || 0;
    
    const totalPaid = (qty * pricePaid) + tradingFee + withdrawalFee + depositFee;
    const fairValue = qty * globalFmv;
    const totalFriction = totalPaid - fairValue;
    const explicitFees = tradingFee + withdrawalFee + depositFee;
    const spreadCost = (qty * pricePaid) - fairValue;
    
    return { totalFriction, explicitFees, spreadCost, totalPaid, fairValue };
  };

  const friction = calculateFriction();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {initialData ? 'Edit Asset' : 'Add Asset'}
          </DialogTitle>
        </DialogHeader>

        {!initialData && (
          <div className="flex items-center gap-2 mb-4">
            <div className={cn(
              "flex-1 h-1 rounded-full transition-colors",
              step >= 1 ? "bg-orange-500" : "bg-zinc-800"
            )} />
            <div className={cn(
              "flex-1 h-1 rounded-full transition-colors",
              step >= 2 ? "bg-orange-500" : "bg-zinc-800"
            )} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Asset Name</Label>
              <Input
                value={assetData.asset_name}
                onChange={(e) => setAssetData({ ...assetData, asset_name: e.target.value })}
                placeholder="e.g., Bitcoin"
                className="bg-zinc-900 border-zinc-800"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Asset Type</Label>
                <Select
                  value={assetData.asset_type}
                  onValueChange={(value) => setAssetData({ ...assetData, asset_type: value })}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
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
                  value={assetData.ticker}
                  onChange={(e) => setAssetData({ ...assetData, ticker: e.target.value.toUpperCase() })}
                  placeholder="BTC"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Quantity</Label>
                <Input
                  type="number"
                  step="any"
                  value={assetData.quantity}
                  onChange={(e) => setAssetData({ ...assetData, quantity: e.target.value })}
                  placeholder="0.00"
                  className="bg-zinc-900 border-zinc-800"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-400">Current Price</Label>
                <Input
                  type="number"
                  step="any"
                  value={assetData.current_price}
                  onChange={(e) => setAssetData({ ...assetData, current_price: e.target.value })}
                  placeholder="0.00"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Account Type</Label>
              <Select
                value={assetData.account_type}
                onValueChange={(value) => setAssetData({ ...assetData, account_type: value })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="taxable">Taxable (Brokerage/Self-Custody)</SelectItem>
                  <SelectItem value="traditional_401k">Traditional 401(k)</SelectItem>
                  <SelectItem value="roth_401k">Roth 401(k)</SelectItem>
                  <SelectItem value="traditional_ira">Traditional IRA</SelectItem>
                  <SelectItem value="roth_ira">Roth IRA</SelectItem>
                  <SelectItem value="hsa">HSA</SelectItem>
                  <SelectItem value="529">529 Plan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1 bg-transparent border-zinc-700"
              >
                Cancel
              </Button>
              {initialData ? (
                <Button
                  onClick={handleSubmit}
                  className="flex-1 brand-gradient text-white font-semibold"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Update
                </Button>
              ) : (
                <Button
                  onClick={() => setStep(2)}
                  className="flex-1 brand-gradient text-white font-semibold"
                  disabled={!assetData.asset_name || !assetData.quantity}
                >
                  Next: Transaction
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="text-sm text-orange-400">
                Recording the purchase details helps track cost basis for taxes and analyze fees.
              </p>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
              <input
                type="checkbox"
                checked={includeTransaction}
                onChange={(e) => setIncludeTransaction(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600"
              />
              <Label className="text-zinc-300 cursor-pointer" onClick={() => setIncludeTransaction(!includeTransaction)}>
                Record purchase transaction
              </Label>
            </div>

            {includeTransaction && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Purchase Date</Label>
                    <Input
                      type="date"
                      value={transactionData.date}
                      onChange={(e) => setTransactionData({ ...transactionData, date: e.target.value })}
                      className="bg-zinc-900 border-zinc-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Price Paid (per unit)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={transactionData.price_per_unit}
                      onChange={(e) => setTransactionData({ ...transactionData, price_per_unit: e.target.value })}
                      placeholder={assetData.current_price || "0.00"}
                      className="bg-zinc-900 border-zinc-800"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-400">Exchange / Wallet</Label>
                  <Select
                    value={transactionData.exchange_or_wallet}
                    onValueChange={(value) => setTransactionData({ ...transactionData, exchange_or_wallet: value })}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue placeholder="Select exchange..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="coinbase">Coinbase</SelectItem>
                      <SelectItem value="coinbase_pro">Coinbase Pro / Advanced</SelectItem>
                      <SelectItem value="kraken">Kraken</SelectItem>
                      <SelectItem value="gemini">Gemini</SelectItem>
                      <SelectItem value="binance_us">Binance US</SelectItem>
                      <SelectItem value="strike">Strike</SelectItem>
                      <SelectItem value="cash_app">Cash App</SelectItem>
                      <SelectItem value="swan">Swan Bitcoin</SelectItem>
                      <SelectItem value="river">River</SelectItem>
                      <SelectItem value="robinhood">Robinhood</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-zinc-400">Fees Paid</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-4 h-4 text-zinc-500" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs bg-zinc-800 border-zinc-700">
                          <p>Track all fees to see your true cost of acquisition. These get added to your cost basis.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-500">Trading Fee</Label>
                      <Input
                        type="number"
                        step="any"
                        value={transactionData.trading_fee}
                        onChange={(e) => setTransactionData({ ...transactionData, trading_fee: e.target.value })}
                        placeholder="0.00"
                        className="bg-zinc-900 border-zinc-800 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-500">Withdrawal Fee</Label>
                      <Input
                        type="number"
                        step="any"
                        value={transactionData.withdrawal_fee}
                        onChange={(e) => setTransactionData({ ...transactionData, withdrawal_fee: e.target.value })}
                        placeholder="0.00"
                        className="bg-zinc-900 border-zinc-800 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-500">Deposit Fee</Label>
                      <Input
                        type="number"
                        step="any"
                        value={transactionData.deposit_fee}
                        onChange={(e) => setTransactionData({ ...transactionData, deposit_fee: e.target.value })}
                        placeholder="0.00"
                        className="bg-zinc-900 border-zinc-800 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-zinc-400">Global FMV at Purchase</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-4 h-4 text-zinc-500" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs bg-zinc-800 border-zinc-700">
                          <p>The market price at time of purchase (from CoinGecko, etc). Used to calculate spread/friction cost.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    type="number"
                    step="any"
                    value={transactionData.global_fmv_at_purchase}
                    onChange={(e) => setTransactionData({ ...transactionData, global_fmv_at_purchase: e.target.value })}
                    placeholder={transactionData.price_per_unit || "0.00"}
                    className="bg-zinc-900 border-zinc-800"
                  />
                </div>

                {/* Friction Summary */}
                {parseFloat(assetData.quantity) > 0 && parseFloat(transactionData.price_per_unit) > 0 && (
                  <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-medium text-zinc-300">Cost Analysis</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Total Paid</span>
                        <span className="text-zinc-300">${friction.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Fair Market Value</span>
                        <span className="text-zinc-300">${friction.fairValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Explicit Fees</span>
                        <span className="text-amber-400">${friction.explicitFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      {friction.spreadCost > 0 && (
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Spread Cost</span>
                          <span className="text-rose-400">${friction.spreadCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-zinc-700">
                        <span className="text-zinc-400 font-medium">Total Friction</span>
                        <span className={cn("font-semibold", friction.totalFriction > 0 ? "text-rose-400" : "text-emerald-400")}>
                          ${Math.abs(friction.totalFriction).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1 bg-transparent border-zinc-700"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1 brand-gradient text-white font-semibold"
              >
                <Save className="w-4 h-4 mr-2" />
                {includeTransaction ? 'Add Asset & Transaction' : 'Add Asset Only'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}