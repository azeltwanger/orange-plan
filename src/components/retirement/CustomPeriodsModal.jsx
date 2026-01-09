import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import { cn } from "@/lib/utils";

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
  lifeExpectancy 
}) {
  const [selectedAsset, setSelectedAsset] = useState('btc');
  const [localPeriods, setLocalPeriods] = useState(customReturnPeriods || {});

  useEffect(() => {
    setLocalPeriods(customReturnPeriods || {});
  }, [customReturnPeriods, open]);

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

  const handleSave = () => {
    onSave(localPeriods);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-zinc-100">
            Custom Return Periods
          </DialogTitle>
          <p className="text-sm text-zinc-400">
            Set different return rates for different time periods (e.g., 40% for years 1-5, then 25% for years 6-15)
          </p>
        </DialogHeader>

        {/* Asset Selector */}
        <div className="flex gap-2 flex-wrap">
          {ASSET_CLASSES.map(asset => (
            <button
              key={asset.key}
              onClick={() => setSelectedAsset(asset.key)}
              className={cn(
                "px-4 py-2 rounded-lg border text-sm transition-all",
                selectedAsset === asset.key
                  ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                  : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
              )}
            >
              <span className={asset.color}>{asset.label}</span>
              {localPeriods[asset.key]?.length > 0 && (
                <span className="ml-2 text-xs text-zinc-500">
                  ({localPeriods[asset.key].length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Periods List */}
        <div className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <Label className="text-zinc-300">
              {ASSET_CLASSES.find(a => a.key === selectedAsset)?.label} Return Periods
            </Label>
            <Button
              onClick={addPeriod}
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
                        onChange={(e) => updatePeriod(index, 'startYear', e.target.value)}
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
                        onChange={(e) => updatePeriod(index, 'endYear', e.target.value)}
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
                        onChange={(e) => updatePeriod(index, 'rate', e.target.value)}
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
                        onClick={() => removePeriod(index)}
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

        {/* Info */}
        <div className="mt-4 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700">
          <p className="text-xs text-zinc-400">
            💡 <strong>How it works:</strong> Define return rates for specific year ranges. Year 1 = first year of projection, Year 10 = 10 years from now. 
            Gaps or missing years will use the default model (Power Law for BTC, slider values for others).
          </p>
        </div>

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