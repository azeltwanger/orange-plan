import React from 'react';
import { Plus, Trash2, Percent, TrendingUp } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ASSET_OPTIONS = [
  { value: 'BTC', label: 'Bitcoin (BTC)', color: 'orange', defaultReturn: 25 },
  { value: 'stocks', label: 'Stocks/ETFs', color: 'blue', defaultReturn: 7 },
  { value: 'bonds', label: 'Bonds', color: 'purple', defaultReturn: 3 },
  { value: 'cash', label: 'Cash/Savings', color: 'emerald', defaultReturn: 2 },
  { value: 'real_estate', label: 'Real Estate', color: 'amber', defaultReturn: 4 },
];

export default function FundingSourcesEditor({ 
  fundingSources = [], 
  onChange, 
  holdings = [],
  userSettings = {}
}) {
  const totalPercentage = fundingSources.reduce((sum, s) => sum + (s.percentage || 0), 0);
  
  const addSource = () => {
    const usedTypes = fundingSources.map(s => s.asset_type);
    const nextOption = ASSET_OPTIONS.find(o => !usedTypes.includes(o.value)) || ASSET_OPTIONS[0];
    const remaining = Math.max(0, 100 - totalPercentage);
    
    onChange([
      ...fundingSources,
      { 
        asset_type: nextOption.value, 
        percentage: remaining,
        expected_return: nextOption.defaultReturn
      }
    ]);
  };

  const updateSource = (index, field, value) => {
    const updated = [...fundingSources];
    updated[index] = { ...updated[index], [field]: value };
    
    // Update default return when asset type changes
    if (field === 'asset_type') {
      const option = ASSET_OPTIONS.find(o => o.value === value);
      if (option && !updated[index].expected_return) {
        updated[index].expected_return = option.defaultReturn;
      }
    }
    
    onChange(updated);
  };

  const removeSource = (index) => {
    onChange(fundingSources.filter((_, i) => i !== index));
  };

  const getAssetColor = (assetType) => {
    const option = ASSET_OPTIONS.find(o => o.value === assetType);
    return option?.color || 'zinc';
  };

  // Get unique tickers from holdings
  const holdingTickers = [...new Set(holdings.map(h => h.ticker).filter(Boolean))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-zinc-300">Funding Sources</Label>
        <div className={cn(
          "text-xs px-2 py-1 rounded-full",
          totalPercentage === 100 
            ? "bg-emerald-500/20 text-emerald-400" 
            : totalPercentage > 100 
              ? "bg-rose-500/20 text-rose-400"
              : "bg-orange-500/20 text-orange-400"
        )}>
          {totalPercentage}% allocated
        </div>
      </div>

      {fundingSources.length === 0 ? (
        <div className="p-4 rounded-lg bg-zinc-800/30 border border-dashed border-zinc-700 text-center">
          <p className="text-sm text-zinc-500 mb-3">
            No funding sources defined. Add assets to specify how you'll fund this goal.
          </p>
          <Button 
            type="button" 
            size="sm" 
            variant="outline" 
            onClick={addSource}
            className="bg-transparent border-zinc-600 text-zinc-300 hover:bg-zinc-700"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Funding Source
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {fundingSources.map((source, index) => {
            const color = getAssetColor(source.asset_type);
            return (
              <div key={index} className={cn(
                "p-3 rounded-lg border",
                `bg-${color}-500/5 border-${color}-500/20`
              )}>
                <div className="flex items-start gap-3">
                  <div className={cn("w-3 h-3 rounded-full mt-2", `bg-${color}-400`)} />
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-2">
                      <Select 
                        value={source.asset_type} 
                        onValueChange={(v) => updateSource(index, 'asset_type', v)}
                      >
                        <SelectTrigger className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-100 h-9">
                          <SelectValue placeholder="Select asset" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {ASSET_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value} className="text-zinc-100">
                              {option.label}
                            </SelectItem>
                          ))}
                          {holdingTickers.filter(t => !ASSET_OPTIONS.find(o => o.value === t)).map(ticker => (
                            <SelectItem key={ticker} value={ticker} className="text-zinc-100">
                              {ticker}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <button
                        type="button"
                        onClick={() => removeSource(index)}
                        className="p-2 rounded-lg hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-zinc-500 flex items-center gap-1">
                          <Percent className="w-3 h-3" />
                          Percentage
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={source.percentage || ''}
                          onChange={(e) => updateSource(index, 'percentage', parseFloat(e.target.value) || 0)}
                          className="bg-zinc-900 border-zinc-700 text-zinc-100 h-8 mt-1"
                          placeholder="50"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-500 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          Expected Return %
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={source.expected_return || ''}
                          onChange={(e) => updateSource(index, 'expected_return', parseFloat(e.target.value) || 0)}
                          className="bg-zinc-900 border-zinc-700 text-zinc-100 h-8 mt-1"
                          placeholder="7"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          {totalPercentage < 100 && (
            <Button 
              type="button" 
              size="sm" 
              variant="outline" 
              onClick={addSource}
              className="w-full bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Another Source ({100 - totalPercentage}% remaining)
            </Button>
          )}
        </div>
      )}

      {/* Allocation visualization bar */}
      {fundingSources.length > 0 && (
        <div className="h-3 rounded-full overflow-hidden flex bg-zinc-800">
          {fundingSources.map((source, i) => {
            const color = getAssetColor(source.asset_type);
            const colorMap = {
              orange: 'bg-orange-500',
              blue: 'bg-blue-500',
              purple: 'bg-purple-500',
              emerald: 'bg-emerald-500',
              amber: 'bg-amber-500',
              zinc: 'bg-zinc-500'
            };
            return (
              <div 
                key={i}
                className={cn("h-full transition-all", colorMap[color])}
                style={{ width: `${Math.min(source.percentage || 0, 100 - fundingSources.slice(0, i).reduce((s, x) => s + (x.percentage || 0), 0))}%` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}