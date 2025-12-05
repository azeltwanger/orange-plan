import React, { useMemo } from 'react';
import { Plus, Trash2, Percent, ChevronDown, ChevronUp, Building2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ASSET_TYPE_CONFIG = {
  crypto: { label: 'Crypto', color: 'orange' },
  stocks: { label: 'Stocks', color: 'blue' },
  bonds: { label: 'Bonds', color: 'purple' },
  cash: { label: 'Cash', color: 'emerald' },
  real_estate: { label: 'Real Estate', color: 'amber' },
  other: { label: 'Other', color: 'zinc' },
};

const TICKER_COLORS = {
  BTC: 'orange',
};

export default function FundingSourcesEditor({ 
  fundingSources = [], 
  onChange, 
  holdings = [],
  userSettings = {}
}) {
  const [expandedAccounts, setExpandedAccounts] = React.useState({});

  // Fetch accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  // Calculate total percentage across all accounts
  const totalPercentage = fundingSources.reduce((sum, s) => sum + (s.percentage || 0), 0);

  // Group holdings by account and calculate available asset types
  const holdingsByAccount = useMemo(() => {
    const grouped = {};
    
    // Add "Unassigned" for holdings without an account
    grouped['_unassigned'] = {
      account: { id: '_unassigned', name: 'Unassigned Holdings' },
      holdings: [],
      assetTypes: new Map(), // Map of asset_type -> { tickers: [], totalValue: number }
    };

    accounts.forEach(acc => {
      grouped[acc.id] = {
        account: acc,
        holdings: [],
        assetTypes: new Map(),
      };
    });

    holdings.forEach(h => {
      const accountId = h.account_id || '_unassigned';
      if (!grouped[accountId]) {
        grouped[accountId] = {
          account: { id: accountId, name: 'Unknown Account' },
          holdings: [],
          assetTypes: new Map(),
        };
      }
      
      grouped[accountId].holdings.push(h);
      
      // Group by asset type within account
      const assetType = h.asset_type || 'other';
      if (!grouped[accountId].assetTypes.has(assetType)) {
        grouped[accountId].assetTypes.set(assetType, { tickers: new Set(), totalValue: 0 });
      }
      
      const assetData = grouped[accountId].assetTypes.get(assetType);
      if (h.ticker) assetData.tickers.add(h.ticker);
      assetData.totalValue += (h.quantity || 0) * (h.current_price || 0);
    });

    return grouped;
  }, [accounts, holdings]);

  // Get available accounts (those with holdings)
  const availableAccounts = useMemo(() => {
    return Object.entries(holdingsByAccount)
      .filter(([_, data]) => data.holdings.length > 0)
      .map(([id, data]) => ({
        id,
        name: data.account.name,
        holdingCount: data.holdings.length,
        assetTypes: Array.from(data.assetTypes.entries()).map(([type, info]) => ({
          type,
          tickers: Array.from(info.tickers),
          totalValue: info.totalValue,
        })),
      }));
  }, [holdingsByAccount]);

  const addAccountSource = () => {
    // Find first account not already used
    const usedAccountIds = fundingSources.map(s => s.account_id);
    const nextAccount = availableAccounts.find(a => !usedAccountIds.includes(a.id));
    
    if (!nextAccount) return;

    const remaining = Math.max(0, 100 - totalPercentage);
    
    onChange([
      ...fundingSources,
      { 
        account_id: nextAccount.id,
        account_name: nextAccount.name,
        percentage: remaining,
        asset_allocations: []
      }
    ]);
    
    // Auto-expand new account
    setExpandedAccounts(prev => ({ ...prev, [nextAccount.id]: true }));
  };

  const updateAccountSource = (index, field, value) => {
    const updated = [...fundingSources];
    updated[index] = { ...updated[index], [field]: value };
    
    // When account changes, update account_name and reset asset_allocations
    if (field === 'account_id') {
      const account = availableAccounts.find(a => a.id === value);
      updated[index].account_name = account?.name || '';
      updated[index].asset_allocations = [];
    }
    
    onChange(updated);
  };

  const removeAccountSource = (index) => {
    onChange(fundingSources.filter((_, i) => i !== index));
  };

  const addAssetAllocation = (sourceIndex) => {
    const source = fundingSources[sourceIndex];
    const accountData = availableAccounts.find(a => a.id === source.account_id);
    if (!accountData) return;

    const usedAssetTypes = (source.asset_allocations || []).map(a => a.asset_type);
    const nextAssetType = accountData.assetTypes.find(at => !usedAssetTypes.includes(at.type));
    
    if (!nextAssetType) return;

    const currentAllocTotal = (source.asset_allocations || []).reduce((sum, a) => sum + (a.percentage || 0), 0);
    const remaining = Math.max(0, 100 - currentAllocTotal);

    const updated = [...fundingSources];
    updated[sourceIndex] = {
      ...updated[sourceIndex],
      asset_allocations: [
        ...(updated[sourceIndex].asset_allocations || []),
        {
          asset_type: nextAssetType.type,
          ticker: nextAssetType.tickers[0] || null,
          percentage: remaining,
        }
      ]
    };
    onChange(updated);
  };

  const updateAssetAllocation = (sourceIndex, allocIndex, field, value) => {
    const updated = [...fundingSources];
    const allocations = [...(updated[sourceIndex].asset_allocations || [])];
    allocations[allocIndex] = { ...allocations[allocIndex], [field]: value };
    updated[sourceIndex] = { ...updated[sourceIndex], asset_allocations: allocations };
    onChange(updated);
  };

  const removeAssetAllocation = (sourceIndex, allocIndex) => {
    const updated = [...fundingSources];
    updated[sourceIndex] = {
      ...updated[sourceIndex],
      asset_allocations: (updated[sourceIndex].asset_allocations || []).filter((_, i) => i !== allocIndex)
    };
    onChange(updated);
  };

  const toggleExpanded = (accountId) => {
    setExpandedAccounts(prev => ({ ...prev, [accountId]: !prev[accountId] }));
  };

  const getAssetColor = (assetType, ticker) => {
    if (ticker && TICKER_COLORS[ticker]) return TICKER_COLORS[ticker];
    return ASSET_TYPE_CONFIG[assetType]?.color || 'zinc';
  };

  const getAssetLabel = (assetType, ticker) => {
    if (ticker === 'BTC') return 'Bitcoin (BTC)';
    if (ticker) return ticker;
    return ASSET_TYPE_CONFIG[assetType]?.label || assetType;
  };

  if (availableAccounts.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-zinc-800/30 border border-dashed border-zinc-700 text-center">
        <p className="text-sm text-zinc-500">
          No holdings found. Add holdings to your accounts to define funding sources.
        </p>
      </div>
    );
  }

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
            Select which accounts and assets to use for funding this goal.
          </p>
          <Button 
            type="button" 
            size="sm" 
            variant="outline" 
            onClick={addAccountSource}
            className="bg-transparent border-zinc-600 text-zinc-300 hover:bg-zinc-700"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Account
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {fundingSources.map((source, sourceIndex) => {
            const accountData = availableAccounts.find(a => a.id === source.account_id);
            const isExpanded = expandedAccounts[source.account_id];
            const allocTotal = (source.asset_allocations || []).reduce((sum, a) => sum + (a.percentage || 0), 0);
            
            return (
              <div key={sourceIndex} className="rounded-xl border border-zinc-700 bg-zinc-800/30 overflow-hidden">
                {/* Account Header */}
                <div className="p-3 flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-zinc-400" />
                  
                  <Select 
                    value={source.account_id} 
                    onValueChange={(v) => updateAccountSource(sourceIndex, 'account_id', v)}
                  >
                    <SelectTrigger className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-100 h-9">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {availableAccounts.map(account => (
                        <SelectItem 
                          key={account.id} 
                          value={account.id} 
                          className="text-zinc-100"
                          disabled={fundingSources.some((s, i) => i !== sourceIndex && s.account_id === account.id)}
                        >
                          {account.name} ({account.holdingCount} holdings)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={source.percentage || ''}
                      onChange={(e) => updateAccountSource(sourceIndex, 'percentage', parseFloat(e.target.value) || 0)}
                      className="w-16 bg-zinc-900 border-zinc-700 text-zinc-100 h-9 text-center"
                      placeholder="100"
                    />
                    <span className="text-xs text-zinc-500">%</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpanded(source.account_id)}
                    className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => removeAccountSource(sourceIndex)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Asset Allocations (expanded) */}
                {isExpanded && accountData && (
                  <div className="px-3 pb-3 pt-1 border-t border-zinc-700/50 space-y-2">
                    <p className="text-xs text-zinc-500">Asset breakdown within this account:</p>
                    
                    {(source.asset_allocations || []).map((alloc, allocIndex) => {
                      const color = getAssetColor(alloc.asset_type, alloc.ticker);
                      const colorClasses = {
                        orange: 'bg-orange-500/10 border-orange-500/30',
                        blue: 'bg-blue-500/10 border-blue-500/30',
                        purple: 'bg-purple-500/10 border-purple-500/30',
                        emerald: 'bg-emerald-500/10 border-emerald-500/30',
                        amber: 'bg-amber-500/10 border-amber-500/30',
                        zinc: 'bg-zinc-500/10 border-zinc-500/30',
                      };
                      const dotClasses = {
                        orange: 'bg-orange-400',
                        blue: 'bg-blue-400',
                        purple: 'bg-purple-400',
                        emerald: 'bg-emerald-400',
                        amber: 'bg-amber-400',
                        zinc: 'bg-zinc-400',
                      };

                      return (
                        <div key={allocIndex} className={cn("p-2 rounded-lg border flex items-center gap-2", colorClasses[color])}>
                          <div className={cn("w-2 h-2 rounded-full", dotClasses[color])} />
                          
                          <Select 
                            value={alloc.asset_type} 
                            onValueChange={(v) => {
                              const assetData = accountData.assetTypes.find(at => at.type === v);
                              updateAssetAllocation(sourceIndex, allocIndex, 'asset_type', v);
                              if (assetData?.tickers[0]) {
                                updateAssetAllocation(sourceIndex, allocIndex, 'ticker', assetData.tickers[0]);
                              }
                            }}
                          >
                            <SelectTrigger className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-100 h-8 text-xs">
                              <SelectValue placeholder="Asset type" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700">
                              {accountData.assetTypes.map(at => (
                                <SelectItem 
                                  key={at.type} 
                                  value={at.type} 
                                  className="text-zinc-100"
                                  disabled={(source.asset_allocations || []).some((a, i) => i !== allocIndex && a.asset_type === at.type)}
                                >
                                  {getAssetLabel(at.type, at.tickers[0])} (${at.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={alloc.percentage || ''}
                              onChange={(e) => updateAssetAllocation(sourceIndex, allocIndex, 'percentage', parseFloat(e.target.value) || 0)}
                              className="w-14 bg-zinc-900 border-zinc-700 text-zinc-100 h-8 text-xs text-center"
                            />
                            <span className="text-[10px] text-zinc-500">%</span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => removeAssetAllocation(sourceIndex, allocIndex)}
                            className="p-1 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}

                    {/* Add asset allocation button */}
                    {accountData.assetTypes.length > (source.asset_allocations || []).length && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => addAssetAllocation(sourceIndex)}
                        className="w-full h-7 text-xs bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Asset ({100 - allocTotal}% remaining)
                      </Button>
                    )}

                    {/* Allocation status */}
                    {(source.asset_allocations || []).length > 0 && (
                      <div className={cn(
                        "text-[10px] px-2 py-1 rounded text-center",
                        allocTotal === 100 
                          ? "bg-emerald-500/10 text-emerald-400" 
                          : allocTotal > 100 
                            ? "bg-rose-500/10 text-rose-400"
                            : "bg-amber-500/10 text-amber-400"
                      )}>
                        {allocTotal}% of this account's contribution allocated
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Add another account */}
          {availableAccounts.length > fundingSources.length && totalPercentage < 100 && (
            <Button 
              type="button" 
              size="sm" 
              variant="outline" 
              onClick={addAccountSource}
              className="w-full bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Another Account ({100 - totalPercentage}% remaining)
            </Button>
          )}
        </div>
      )}

      {/* Overall allocation bar */}
      {fundingSources.length > 0 && (
        <div className="h-2 rounded-full overflow-hidden flex bg-zinc-800">
          {fundingSources.map((source, i) => {
            // Use first asset color or default
            const firstAlloc = (source.asset_allocations || [])[0];
            const color = firstAlloc ? getAssetColor(firstAlloc.asset_type, firstAlloc.ticker) : 'zinc';
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
                style={{ width: `${Math.min(source.percentage || 0, 100)}%` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}