import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, ChevronRight, ChevronLeft, Info, DollarSign, Plus, Trash2, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';
import AccountSelector from '@/components/accounts/AccountSelector';
import CreateAccountDialog from '@/components/accounts/CreateAccountDialog';

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
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [assetData, setAssetData] = useState({
    asset_name: '',
    asset_type: 'stocks',
    ticker: '',
    quantity: '',
    current_price: '',
    account_type: 'taxable',
    account_id: '',
  });

  const [lots, setLots] = useState([{
    id: Date.now(),
    quantity: '',
    date: new Date().toISOString().split('T')[0],
    price_per_unit: '',
    exchange_or_wallet: 'other',
    trading_fee: '',
  }]);

  const [includeTransaction, setIncludeTransaction] = useState(true);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // Fetch live price for stocks/crypto tickers
  const fetchTickerPrice = async (ticker, assetType) => {
    if (!ticker || ticker.length < 2) return;
    
    setFetchingPrice(true);
    try {
      if (assetType === 'btc' && ticker !== 'BTC') {
        // Use CoinGecko for crypto
        const idMap = { ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', DOT: 'polkadot', LINK: 'chainlink', AVAX: 'avalanche-2', MATIC: 'matic-network', LTC: 'litecoin' };
        const coinId = idMap[ticker.toUpperCase()] || ticker.toLowerCase();
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
        const data = await response.json();
        if (data[coinId]?.usd) {
          setAssetData(prev => ({ ...prev, current_price: data[coinId].usd }));
        }
      } else if (assetType === 'stocks') {
        // Use getStockPrices backend function (Yahoo Finance) for reliable stock/ETF prices
        const { base44 } = await import('@/api/base44Client');
        let fetchedPrice = null;

        try {
          // Primary: Use Yahoo Finance via backend function
          const response = await base44.functions.invoke('getStockPrices', {
            tickers: [ticker.toUpperCase()],
            days: 1
          });

          if (response?.data && response.data[ticker.toUpperCase()]?.currentPrice > 0) {
            fetchedPrice = response.data[ticker.toUpperCase()].currentPrice;
          }
        } catch (apiErr) {
          console.warn(`Yahoo Finance fetch for ${ticker} failed:`, apiErr);
          
          // Fallback: Use LLM with specific prompt for ETF share prices
          try {
            const result = await base44.integrations.Core.InvokeLLM({
              prompt: `What is the current SHARE PRICE for the stock or ETF with ticker symbol ${ticker}? This is an exchange-traded security. Return ONLY the numerical share price in USD (typically between $1-$1000 for most stocks/ETFs), nothing else. Do NOT return the price of any underlying asset.`,
              add_context_from_internet: true,
              response_json_schema: {
                type: "object",
                properties: {
                  price: { type: "number", description: "Current share price in USD" }
                }
              }
            });
            if (result?.price && result.price > 0 && result.price < 10000) {
              fetchedPrice = result.price;
            }
          } catch (llmErr) {
            console.warn(`LLM fallback for ${ticker} also failed:`, llmErr);
          }
        }

        if (fetchedPrice !== null) {
          setAssetData(prev => ({ ...prev, current_price: fetchedPrice }));
        }
      }
    } catch (err) {
      console.log('Price fetch failed:', err);
    } finally {
      setFetchingPrice(false);
    }
  };

  useEffect(() => {
    if (initialData) {
      setAssetData({
        asset_name: initialData.asset_name || '',
        asset_type: initialData.asset_type === 'crypto' ? 'btc' : (initialData.asset_type || 'stocks'),
        ticker: initialData.ticker || '',
        quantity: initialData.quantity || '',
        current_price: initialData.current_price || '',
        account_type: initialData.account_type || 'taxable',
        account_id: initialData.account_id || '',
      });
      setIncludeTransaction(false);
      setStep(1);
      // Fetch live price for existing asset
      if (initialData.ticker && (initialData.asset_type === 'stocks' || initialData.asset_type === 'crypto')) {
        fetchTickerPrice(initialData.ticker, initialData.asset_type);
      }
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
      account_id: '',
    });
    setLots([{
      id: Date.now(),
      quantity: '',
      date: new Date().toISOString().split('T')[0],
      price_per_unit: '',
      exchange_or_wallet: 'other',
      trading_fee: '',
    }]);
    setIncludeTransaction(true);
    setStep(1);
  };

  // Auto-fill current price for BTC or fetch for other tickers
  useEffect(() => {
    if (assetData.ticker === 'BTC' && btcPrice) {
      setAssetData(prev => ({ ...prev, current_price: btcPrice }));
    } else if (assetData.ticker && assetData.ticker.length >= 1 && (assetData.asset_type === 'stocks' || assetData.asset_type === 'crypto')) {
      const timeoutId = setTimeout(() => {
        fetchTickerPrice(assetData.ticker, assetData.asset_type);
      }, 500); // Debounce 500ms
      return () => clearTimeout(timeoutId);
    }
  }, [assetData.ticker, assetData.asset_type, btcPrice]);

  const addLot = () => {
    setLots([...lots, {
      id: Date.now(),
      quantity: '',
      date: new Date().toISOString().split('T')[0],
      price_per_unit: assetData.ticker === 'BTC' ? btcPrice : '',
      exchange_or_wallet: lots[lots.length - 1]?.exchange_or_wallet || 'other',
      trading_fee: '',
    }]);
  };

  const removeLot = (id) => {
    if (lots.length > 1) {
      setLots(lots.filter(l => l.id !== id));
    }
  };

  const updateLot = (id, field, value) => {
    setLots(lots.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // Calculate totals from lots
  const lotsTotal = lots.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0);
  const lotsCostBasis = lots.reduce((sum, l) => {
    const qty = parseFloat(l.quantity) || 0;
    const price = parseFloat(l.price_per_unit) || 0;
    const fee = parseFloat(l.trading_fee) || 0;
    return sum + (qty * price) + fee;
  }, 0);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    
    const quantity = parseFloat(assetData.quantity) || 0;

    const holdingData = {
      ...assetData,
      quantity,
      current_price: parseFloat(assetData.current_price) || 0,
      cost_basis_total: includeTransaction ? lotsCostBasis : 0,
      tax_treatment: accountTaxMapping[assetData.account_type] || 'taxable',
    };

    let transactions = [];
    if (includeTransaction && lots.length > 0) {
      transactions = lots
        .filter(l => parseFloat(l.quantity) > 0 && parseFloat(l.price_per_unit) > 0)
        .map(l => ({
          type: 'buy',
          asset_ticker: assetData.ticker,
          quantity: parseFloat(l.quantity),
          price_per_unit: parseFloat(l.price_per_unit),
          total_value: parseFloat(l.quantity) * parseFloat(l.price_per_unit),
          date: l.date,
          exchange_or_wallet: l.exchange_or_wallet,
          trading_fee: parseFloat(l.trading_fee) || 0,
          cost_basis: (parseFloat(l.quantity) * parseFloat(l.price_per_unit)) + (parseFloat(l.trading_fee) || 0),
          lot_id: `${assetData.ticker}-${l.id}`,
        }));
    }

    onSubmit({ holding: holdingData, transactions });
    onClose();
    resetForm();
  };

  // Calculate total fees from lots
  const totalFees = lots.reduce((sum, l) => sum + (parseFloat(l.trading_fee) || 0), 0);

  return (
    <>
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
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                    <SelectItem value="btc" className="text-zinc-100">BTC (Bitcoin)</SelectItem>
                    <SelectItem value="stocks" className="text-zinc-100">Stocks</SelectItem>
                    <SelectItem value="bonds" className="text-zinc-100">Bonds</SelectItem>
                    <SelectItem value="real_estate" className="text-zinc-100">Real Estate</SelectItem>
                    <SelectItem value="cash" className="text-zinc-100">Cash</SelectItem>
                    <SelectItem value="other" className="text-zinc-100">Other</SelectItem>
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
                <div className="relative">
                  <Input
                    type="number"
                    step="any"
                    value={assetData.current_price}
                    onChange={(e) => setAssetData({ ...assetData, current_price: e.target.value })}
                    placeholder="0.00"
                    className="bg-zinc-900 border-zinc-800"
                  />
                  {fetchingPrice && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Account</Label>
              <AccountSelector
                value={assetData.account_id}
                onChange={(value) => {
                  if (value === '_create_') {
                    setShowCreateAccount(true);
                  } else {
                    setAssetData({ ...assetData, account_id: value === '_none_' ? '' : value });
                  }
                }}
              />
              <p className="text-xs text-zinc-500">Group assets by account (e.g., Fidelity, Coinbase)</p>
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
                Add purchase lots to track cost basis for taxes. Each lot = a separate purchase.
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
                Record purchase lots (recommended for tax tracking)
              </Label>
            </div>

            {includeTransaction && (
              <>
                {/* Lots Summary */}
                <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/50">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Total from {lots.length} lot{lots.length !== 1 ? 's' : ''}</span>
                    <span className={cn("font-medium", Math.abs(lotsTotal - parseFloat(assetData.quantity || 0)) < 0.00000001 ? "text-emerald-400" : "text-amber-400")}>
                      {lotsTotal.toFixed(assetData.ticker === 'BTC' ? 8 : 4)} / {parseFloat(assetData.quantity || 0).toFixed(assetData.ticker === 'BTC' ? 8 : 4)} {assetData.ticker}
                    </span>
                  </div>
                  {Math.abs(lotsTotal - parseFloat(assetData.quantity || 0)) > 0.00000001 && (
                    <p className="text-xs text-amber-400 mt-1">
                      Lot quantities should sum to your total holding
                    </p>
                  )}
                </div>

                {/* Lots List */}
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {lots.map((lot, index) => (
                    <div key={lot.id} className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-400">Lot {index + 1}</span>
                        {lots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLot(lot.id)}
                            className="p-1 rounded hover:bg-rose-600/30 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-zinc-500 hover:text-rose-400" />
                          </button>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-zinc-500">Quantity</Label>
                          <Input
                            type="number"
                            step="any"
                            value={lot.quantity}
                            onChange={(e) => updateLot(lot.id, 'quantity', e.target.value)}
                            placeholder="0.1"
                            className="bg-zinc-900 border-zinc-800 text-sm h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-zinc-500">Price per unit</Label>
                          <Input
                            type="number"
                            step="any"
                            value={lot.price_per_unit}
                            onChange={(e) => updateLot(lot.id, 'price_per_unit', e.target.value)}
                            placeholder={btcPrice?.toString() || "0"}
                            className="bg-zinc-900 border-zinc-800 text-sm h-9"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-zinc-500">Date</Label>
                          <Input
                            type="date"
                            value={lot.date}
                            onChange={(e) => updateLot(lot.id, 'date', e.target.value)}
                            className="bg-zinc-900 border-zinc-800 text-sm h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-zinc-500">Fee (optional)</Label>
                          <Input
                            type="number"
                            step="any"
                            value={lot.trading_fee}
                            onChange={(e) => updateLot(lot.id, 'trading_fee', e.target.value)}
                            placeholder="0"
                            className="bg-zinc-900 border-zinc-800 text-sm h-9"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-zinc-500">
                          {assetData.asset_type === 'btc' ? 'Exchange' : 
                           assetData.asset_type === 'stocks' ? 'Brokerage' : 
                           assetData.asset_type === 'real_estate' ? 'Platform/Agent' :
                           assetData.asset_type === 'bonds' ? 'Brokerage' : 'Source'}
                        </Label>
                        <Select
                          value={lot.exchange_or_wallet}
                          onValueChange={(value) => updateLot(lot.id, 'exchange_or_wallet', value)}
                        >
                          <SelectTrigger className="bg-zinc-900 border-zinc-800 h-9 text-sm">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                            {assetData.asset_type === 'btc' ? (
                              <>
                                <SelectItem value="coinbase" className="text-zinc-100">Coinbase</SelectItem>
                                <SelectItem value="kraken" className="text-zinc-100">Kraken</SelectItem>
                                <SelectItem value="strike" className="text-zinc-100">Strike</SelectItem>
                                <SelectItem value="cash_app" className="text-zinc-100">Cash App</SelectItem>
                                <SelectItem value="swan" className="text-zinc-100">Swan Bitcoin</SelectItem>
                                <SelectItem value="river" className="text-zinc-100">River</SelectItem>
                                <SelectItem value="other" className="text-zinc-100">Other</SelectItem>
                              </>
                            ) : assetData.asset_type === 'stocks' || assetData.asset_type === 'bonds' ? (
                              <>
                                <SelectItem value="fidelity" className="text-zinc-100">Fidelity</SelectItem>
                                <SelectItem value="schwab" className="text-zinc-100">Charles Schwab</SelectItem>
                                <SelectItem value="vanguard" className="text-zinc-100">Vanguard</SelectItem>
                                <SelectItem value="etrade" className="text-zinc-100">E*TRADE</SelectItem>
                                <SelectItem value="robinhood" className="text-zinc-100">Robinhood</SelectItem>
                                <SelectItem value="td_ameritrade" className="text-zinc-100">TD Ameritrade</SelectItem>
                                <SelectItem value="interactive_brokers" className="text-zinc-100">Interactive Brokers</SelectItem>
                                <SelectItem value="other" className="text-zinc-100">Other</SelectItem>
                              </>
                            ) : assetData.asset_type === 'real_estate' ? (
                              <>
                                <SelectItem value="direct" className="text-zinc-100">Direct Purchase</SelectItem>
                                <SelectItem value="fundrise" className="text-zinc-100">Fundrise</SelectItem>
                                <SelectItem value="realty_mogul" className="text-zinc-100">RealtyMogul</SelectItem>
                                <SelectItem value="other" className="text-zinc-100">Other</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="bank" className="text-zinc-100">Bank</SelectItem>
                                <SelectItem value="brokerage" className="text-zinc-100">Brokerage</SelectItem>
                                <SelectItem value="other" className="text-zinc-100">Other</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {parseFloat(lot.quantity) > 0 && parseFloat(lot.price_per_unit) > 0 && (
                        <div className="text-xs text-zinc-500 pt-1 border-t border-zinc-700/50">
                          Cost basis: ${((parseFloat(lot.quantity) * parseFloat(lot.price_per_unit)) + (parseFloat(lot.trading_fee) || 0)).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={addLot}
                  className="w-full bg-transparent border-zinc-700 border-dashed hover:border-orange-500/50"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Another Lot
                </Button>

                {/* Cost Summary */}
                {lotsCostBasis > 0 && (
                  <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-medium text-zinc-300">Total Cost Basis</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Purchases</span>
                        <span className="text-zinc-300">${(lotsCostBasis - totalFees).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Fees</span>
                        <span className="text-amber-400">${totalFees.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-zinc-700">
                        <span className="text-zinc-400 font-medium">Total</span>
                        <span className="font-semibold text-orange-400">${lotsCostBasis.toLocaleString()}</span>
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
    
    <CreateAccountDialog
      open={showCreateAccount}
      onClose={() => setShowCreateAccount(false)}
      onCreated={(newAccount) => {
        setAssetData({ ...assetData, account_id: newAccount.id });
      }}
    />
    </>
  );
}