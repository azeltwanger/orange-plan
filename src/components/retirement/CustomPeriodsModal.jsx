import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import { cn } from "@/lib/utils";

// Helper to normalize ticker returns to new structure
// Converts legacy { TICKER: number } to { TICKER: { rate, dividendYield, dividendQualified } }
const normalizeTickerReturns = (tickerReturns) => {
  if (!tickerReturns) return {};
  const normalized = {};
  Object.entries(tickerReturns).forEach(([ticker, value]) => {
    if (typeof value === 'number') {
      // Legacy format: just the rate
      normalized[ticker] = { rate: value, dividendYield: 0, dividendQualified: true };
    } else if (typeof value === 'object' && value !== null) {
      // New format: full object
      normalized[ticker] = {
        rate: value.rate ?? 0,
        dividendYield: value.dividendYield ?? 0,
        dividendQualified: value.dividendQualified ?? true
      };
    }
  });
  return normalized;
};

const ASSET_CLASSES = [
  { key: 'btc', label: 'Bitcoin', color: 'text-orange-400' },
  { key: 'stocks', label: 'Stocks', color: 'text-blue-400' },
  { key: 'realEstate', label: 'Real Estate', color: 'text-emerald-400' },
  { key: 'bonds', label: 'Bonds', color: 'text-purple-400' },
  { key: 'cash', label: 'Cash', color: 'text-cyan-400' },
  { key: 'other', label: 'Other', color: 'text-zinc-400' },
];

export default function CustomPeriodsModal({ 
  open, 
  onOpenChange, 
  customReturnPeriods, 
  onSave,
  currentAge,
  lifeExpectancy,
  holdings = [],
  tickerReturns = {},
  onTickerReturnsSave
}) {
  const [selectedTab, setSelectedTab] = useState('btc');
  const [selectedAsset, setSelectedAsset] = useState('btc');
  const [localPeriods, setLocalPeriods] = useState(customReturnPeriods || {});
  const [localTickerReturns, setLocalTickerReturns] = useState(() => normalizeTickerReturns(tickerReturns));
  const [selectedTicker, setSelectedTicker] = useState('');
  const [tickerReturnInput, setTickerReturnInput] = useState('');
  const [tickerDividendYieldInput, setTickerDividendYieldInput] = useState('');
  const [tickerDividendQualifiedInput, setTickerDividendQualifiedInput] = useState(true);

  useEffect(() => {
    // Only sync from parent when modal opens, not when it closes
    if (open) {
      setLocalPeriods(customReturnPeriods || {});
      setLocalTickerReturns(normalizeTickerReturns(tickerReturns));
    }
  }, [customReturnPeriods, tickerReturns, open]);

  // Get available tickers for dropdown (includes holdings without tickers using asset_name)
  const availableTickers = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];
    
    const allHoldings = holdings
      .filter(h => (h.ticker || h.asset_name) && h.ticker?.toUpperCase() !== 'BTC')
      .map(h => ({
        // Use ticker if available, otherwise use asset_name as identifier
        ticker: h.ticker ? h.ticker.toUpperCase() : h.asset_name?.toUpperCase().replace(/\s+/g, '_'),
        assetType: h.asset_type || 'stocks',
        assetName: h.asset_name || h.ticker,
        originalTicker: h.ticker, // Keep track of whether it had a real ticker
      }));
    
    // Remove duplicates
    const unique = [...new Map(allHoldings.map(t => [t.ticker, t])).values()];
    
    // Filter out already-defined overrides
    return unique.filter(t => !localTickerReturns[t.ticker]);
  }, [holdings, localTickerReturns]);

  const selectedAssetType = useMemo(() => {
    if (!selectedTicker) return 'stocks';
    const found = availableTickers.find(t => t.ticker === selectedTicker);
    return found?.assetType || 'stocks';
  }, [selectedTicker, availableTickers]);

  const selectedIncomeLabel = useMemo(() => {
    if (selectedAssetType === 'real_estate') return 'Rental Income';
    if (selectedAssetType === 'bonds') return 'Interest';
    return 'Dividend';
  }, [selectedAssetType]);

  const periods = localPeriods[selectedAsset] || [];

  const addPeriod = () => {
    const lastPeriod = periods[periods.length - 1];
    const newStartYear = lastPeriod ? (lastPeriod.endYear || currentAge + 10) + 1 : 1;
    
    setLocalPeriods({
      ...localPeriods,
      [selectedAsset]: [
        ...periods,
        { startYear: newStartYear, endYear: newStartYear + 5, rate: 10 }
      ]
    });
  };

  const updatePeriod = (index, field, value) => {
    const updatedPeriods = [...periods];
    updatedPeriods[index] = {
      ...updatedPeriods[index],
      [field]: field === 'rate' ? parseFloat(value) : parseInt(value) || null
    };
    setLocalPeriods({
      ...localPeriods,
      [selectedAsset]: updatedPeriods
    });
  };

  const removePeriod = (index) => {
    setLocalPeriods({
      ...localPeriods,
      [selectedAsset]: periods.filter((_, i) => i !== index)
    });
  };

  const addTickerReturn = () => {
    if (!selectedTicker) return;
    
    setLocalTickerReturns({
      ...localTickerReturns,
      [selectedTicker]: {
        rate: parseFloat(tickerReturnInput) || 0,
        dividendYield: parseFloat(tickerDividendYieldInput) || 0,
        dividendQualified: tickerDividendQualifiedInput
      }
    });
    
    setSelectedTicker('');
    setTickerReturnInput('');
    setTickerDividendYieldInput('');
    setTickerDividendQualifiedInput(true);
  };

  const updateTickerReturn = (ticker, field, value) => {
    setLocalTickerReturns({
      ...localTickerReturns,
      [ticker]: {
        ...localTickerReturns[ticker],
        [field]: value
      }
    });
  };

  const removeTickerReturn = (ticker) => {
    const updated = { ...localTickerReturns };
    delete updated[ticker];
    setLocalTickerReturns(updated);
  };

  const handleSave = () => {
    onSave(localPeriods);
    if (onTickerReturnsSave) {
      onTickerReturnsSave(localTickerReturns);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-zinc-100">
            Custom Return Periods
          </DialogTitle>
          <p className="text-sm text-zinc-400">
            Set different return rates for different time periods or override specific holdings
          </p>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="bg-zinc-800/50 p-1 flex-wrap w-full justify-start">
            {ASSET_CLASSES.map(asset => (
              <TabsTrigger
                key={asset.key}
                value={asset.key}
                className="data-[state=active]:bg-zinc-700 text-xs px-3"
                onClick={() => setSelectedAsset(asset.key)}
              >
                <span className={asset.color}>{asset.label}</span>
                {localPeriods[asset.key]?.length > 0 && (
                  <span className="ml-1 text-zinc-500">({localPeriods[asset.key].length})</span>
                )}
              </TabsTrigger>
            ))}
            <TabsTrigger
              value="per_holding"
              className="data-[state=active]:bg-zinc-700 text-xs px-3"
            >
              Per Holding
              {Object.keys(localTickerReturns).length > 0 && (
                <span className="ml-1 text-zinc-500">({Object.keys(localTickerReturns).length})</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Asset Class Tabs */}
          {ASSET_CLASSES.map(asset => (
            <TabsContent key={asset.key} value={asset.key} className="mt-4">
              {(() => {
                const periods = localPeriods[asset.key] || [];
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-300">
                        {asset.label} Return Periods
                      </Label>
                      <Button
                        onClick={() => {
                          const lastPeriod = periods[periods.length - 1];
                          const newStartYear = lastPeriod ? (lastPeriod.endYear || currentAge + 10) + 1 : 1;
                          setLocalPeriods({
                            ...localPeriods,
                            [asset.key]: [
                              ...periods,
                              { startYear: newStartYear, endYear: newStartYear + 5, rate: 10 }
                            ]
                          });
                        }}
                        size="sm"
                        variant="outline"
                        className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Period
                      </Button>
                    </div>

                    {periods.length === 0 ? (
                      <div className="text-center py-8 text-zinc-500 text-sm">
                        No custom periods defined. Default model will be used.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {periods.map((period, index) => (
                          <div key={index} className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                            <div className="grid grid-cols-12 gap-3 items-end">
                              <div className="col-span-3">
                                <Label className="text-xs text-zinc-400">Start Year</Label>
                                <Input
                                  type="number"
                                  value={period.startYear || ''}
                                  onChange={(e) => {
                                    const updatedPeriods = [...periods];
                                    updatedPeriods[index] = {
                                      ...updatedPeriods[index],
                                      startYear: parseInt(e.target.value) || null
                                    };
                                    setLocalPeriods({
                                      ...localPeriods,
                                      [asset.key]: updatedPeriods
                                    });
                                  }}
                                  className="bg-zinc-900 border-zinc-700 text-sm"
                                  min={1}
                                  max={lifeExpectancy - currentAge}
                                />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs text-zinc-400">
                                  End Year <span className="text-zinc-600">(or leave blank)</span>
                                </Label>
                                <Input
                                  type="number"
                                  value={period.endYear || ''}
                                  onChange={(e) => {
                                    const updatedPeriods = [...periods];
                                    updatedPeriods[index] = {
                                      ...updatedPeriods[index],
                                      endYear: parseInt(e.target.value) || null
                                    };
                                    setLocalPeriods({
                                      ...localPeriods,
                                      [asset.key]: updatedPeriods
                                    });
                                  }}
                                  placeholder="Indefinite"
                                  className="bg-zinc-900 border-zinc-700 text-sm"
                                  min={period.startYear}
                                  max={lifeExpectancy - currentAge}
                                />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs text-zinc-400">Annual Return %</Label>
                                <Input
                                  type="number"
                                  value={period.rate || ''}
                                  onChange={(e) => {
                                    const updatedPeriods = [...periods];
                                    updatedPeriods[index] = {
                                      ...updatedPeriods[index],
                                      rate: parseFloat(e.target.value)
                                    };
                                    setLocalPeriods({
                                      ...localPeriods,
                                      [asset.key]: updatedPeriods
                                    });
                                  }}
                                  className="bg-zinc-900 border-zinc-700 text-sm"
                                  step="0.5"
                                  min={-50}
                                  max={200}
                                />
                              </div>
                              <div className="col-span-3 flex items-center gap-2">
                                <div className="text-xs text-zinc-500">
                                  {period.endYear 
                                    ? `${period.endYear - period.startYear + 1} years` 
                                    : 'Indefinite'}
                                </div>
                                <Button
                                  onClick={() => {
                                    setLocalPeriods({
                                      ...localPeriods,
                                      [asset.key]: periods.filter((_, i) => i !== index)
                                    });
                                  }}
                                  size="sm"
                                  variant="ghost"
                                  className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Validation warnings */}
                    {(() => {
                      const sorted = [...periods].sort((a, b) => a.startYear - b.startYear);
                      const warnings = [];
                      
                      for (let i = 0; i < sorted.length - 1; i++) {
                        const current = sorted[i];
                        const next = sorted[i + 1];
                        
                        if (current.endYear && next.startYear <= current.endYear) {
                          warnings.push(`Years ${current.startYear}-${current.endYear} overlaps with ${next.startYear}-${next.endYear || '∞'}`);
                        }
                        
                        if (current.endYear && next.startYear > current.endYear + 1) {
                          warnings.push(`Gap between year ${current.endYear} and ${next.startYear} (will use default model)`);
                        }
                      }
                      
                      if (warnings.length > 0) {
                        return (
                          <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <p className="text-xs font-medium text-amber-400 mb-1">⚠️ Configuration Warnings:</p>
                            {warnings.map((w, i) => (
                              <p key={i} className="text-xs text-zinc-400">• {w}</p>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                );
              })()}
            </TabsContent>
          ))}

          {/* Per Holding Tab */}
          <TabsContent value="per_holding" className="mt-4">
            <div className="space-y-4">
              <div>
                <Label className="text-zinc-300 text-base">Per Holding Returns</Label>
                <p className="text-sm text-zinc-400 mt-1">
                  Override returns for specific holdings. Holdings without overrides use their asset class rate.
                </p>
              </div>

              {/* Existing ticker overrides */}
              {Object.keys(localTickerReturns).length > 0 ? (
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="grid grid-cols-12 gap-2 px-3 text-xs text-zinc-500">
                    <div className="col-span-3">Holding</div>
                    <div className="col-span-2">Return %</div>
                    <div className="col-span-3">Income %</div>
                    <div className="col-span-2">Qualified</div>
                    <div className="col-span-2"></div>
                  </div>
                  {Object.entries(localTickerReturns).map(([ticker, data]) => {
                    const holding = holdings.find(h => 
                      h.ticker?.toUpperCase() === ticker || 
                      h.asset_name?.toUpperCase().replace(/\s+/g, '_') === ticker
                    );
                    const assetType = holding?.asset_type || 'stocks';
                    const incomeLabel = assetType === 'real_estate' ? 'Rental' : assetType === 'bonds' ? 'Interest' : 'Dividend';
                    const { rate = 0, dividendYield = 0, dividendQualified = true } = data;
                    return (
                      <div key={ticker} className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-3">
                            <p className="text-sm font-medium text-zinc-200">
                              {ticker}
                              <span className="text-zinc-500 text-xs ml-1">({assetType})</span>
                            </p>
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              value={rate}
                              onChange={(e) => updateTickerReturn(ticker, 'rate', parseFloat(e.target.value) || 0)}
                              className="bg-zinc-900 border-zinc-700 text-sm"
                              step="0.5"
                              min={-50}
                              max={200}
                              placeholder="0"
                            />
                          </div>
                          <div className="col-span-3">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={dividendYield}
                                onChange={(e) => updateTickerReturn(ticker, 'dividendYield', parseFloat(e.target.value) || 0)}
                                className="bg-zinc-900 border-zinc-700 text-sm"
                                step="0.1"
                                min={0}
                                max={50}
                                placeholder="0"
                              />
                              <span className="text-xs text-zinc-500 whitespace-nowrap">{incomeLabel}</span>
                            </div>
                          </div>
                          <div className="col-span-2 flex items-center justify-center">
                            <Checkbox
                              checked={dividendQualified}
                              onCheckedChange={(checked) => updateTickerReturn(ticker, 'dividendQualified', checked)}
                              className="border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                              disabled={assetType === 'real_estate'}
                              title={assetType === 'real_estate' ? 'Rental income is always non-qualified' : ''}
                            />
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <Button
                              onClick={() => removeTickerReturn(ticker)}
                              size="sm"
                              variant="ghost"
                              className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500 text-sm border border-zinc-700/50 rounded-lg bg-zinc-800/30">
                  No per-holding overrides defined. All holdings use their asset class defaults.
                </div>
              )}

              {/* Add new ticker override */}
              {availableTickers.length > 0 ? (
                <div className="p-4 rounded-lg bg-zinc-800/30 border border-zinc-700">
                  <Label className="text-zinc-300 text-sm mb-3 block">Add Holding Override</Label>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <Label className="text-xs text-zinc-500 mb-1 block">Ticker</Label>
                      <Select value={selectedTicker} onValueChange={(val) => {
                        setSelectedTicker(val);
                        const found = availableTickers.find(t => t.ticker === val);
                        if (found?.assetType === 'real_estate') {
                          setTickerDividendQualifiedInput(false);
                        }
                      }}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {availableTickers.map(t => (
                            <SelectItem key={t.ticker} value={t.ticker} className="text-zinc-100">
                              {t.ticker} ({t.assetType})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-zinc-500 mb-1 block">Return %</Label>
                      <Input
                        type="number"
                        value={tickerReturnInput}
                        onChange={(e) => setTickerReturnInput(e.target.value)}
                        placeholder="0"
                        className="bg-zinc-900 border-zinc-700"
                        step="0.5"
                        min={-50}
                        max={200}
                        disabled={!selectedTicker}
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs text-zinc-500 mb-1 block">{selectedIncomeLabel} %</Label>
                      <Input
                        type="number"
                        value={tickerDividendYieldInput}
                        onChange={(e) => setTickerDividendYieldInput(e.target.value)}
                        placeholder="0"
                        className="bg-zinc-900 border-zinc-700"
                        step="0.1"
                        min={0}
                        max={50}
                        disabled={!selectedTicker}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-zinc-500 mb-1 block">Qualified</Label>
                      <div className="h-10 flex items-center justify-center">
                        <Checkbox
                          checked={tickerDividendQualifiedInput}
                          onCheckedChange={setTickerDividendQualifiedInput}
                          disabled={!selectedTicker || selectedAssetType === 'real_estate'}
                          title={selectedAssetType === 'real_estate' ? 'Rental income is always non-qualified' : ''}
                          className="border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                        />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Button
                        onClick={addTickerReturn}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                        disabled={!selectedTicker}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-zinc-800/30 border border-zinc-700 text-center">
                  <p className="text-sm text-zinc-400">
                    All holdings have custom overrides defined.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Info */}
        {selectedTab !== 'per_holding' ? (
          <div className="mt-4 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700">
            <p className="text-xs text-zinc-400">
              💡 <strong>How it works:</strong> Define return rates for specific year ranges. Year 1 = first year of projection, Year 10 = 10 years from now. 
              Gaps or missing years will use the default model (Power Law for BTC, slider values for others).
            </p>
          </div>
        ) : (
          <div className="mt-4 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700">
            <p className="text-xs text-zinc-400">
              💡 Set custom returns and income for specific holdings. Examples: a dividend ETF with 8% growth + 3% dividends, rental property with 4% appreciation + 6% rental income, or bonds with 5% return + 3% interest. Check 'Qualified' for most stock dividends (lower tax rate). REITs, MLPs, and rental income are always non-qualified.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="bg-zinc-800 border-zinc-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="brand-gradient text-white"
          >
            Save & Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}