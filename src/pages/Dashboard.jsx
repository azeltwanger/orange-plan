import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Pencil, Trash2, Bitcoin, Package, Building2, Upload } from 'lucide-react';
import CsvImportDialog from '@/components/transactions/CsvImportDialog';
import useAssetPrices from '@/components/shared/useAssetPrices';
import { Button } from "@/components/ui/button";
import NetWorthCard from '@/components/dashboard/NetWorthCard';
import AssetCard from '@/components/dashboard/AssetCard';
import QuickStats from '@/components/dashboard/QuickStats';
import AddAssetWithTransaction from '@/components/forms/AddAssetWithTransaction';
import ManageLotsDialog from '@/components/dashboard/ManageLotsDialog';
import AccountGroup from '@/components/dashboard/AccountGroup';
import CreateAccountDialog from '@/components/accounts/CreateAccountDialog';
import EditAccountDialog from '@/components/accounts/EditAccountDialog';

export default function Dashboard() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceChange, setPriceChange] = useState(null);
  const [exchangeRates, setExchangeRates] = useState({ USD: 1 });

  // Fetch live BTC price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        const data = await response.json();
        setBtcPrice(data.bitcoin.usd);
        setPriceChange(data.bitcoin.usd_24h_change);
        setPriceLoading(false);
      } catch (err) {
        setBtcPrice(97000);
        setPriceChange(0);
        setPriceLoading(false);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await base44.functions.invoke('getExchangeRates');
        if (response.data?.rates) {
          setExchangeRates(response.data.rates);
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error);
      }
    };
    fetchRates();
  }, []);

  // DEBUG: Check account_id values
  useEffect(() => {
    const debugAccountIds = async () => {
      console.log("=== DEBUG ACCOUNT IDS ===");

      // Get all accounts
      const accounts = await base44.entities.Account.list();
      console.log("ACCOUNTS:");
      accounts.forEach(a => console.log(`  ${a.id}: "${a.name}" (${a.account_type})`));

      // Get all holdings
      const holdings = await base44.entities.Holding.list();
      console.log("\nHOLDINGS:");
      holdings.filter(h => h.ticker === 'BTC').forEach(h => 
        console.log(`  ${h.id}: ${h.ticker} qty=${h.quantity} account_id="${h.account_id}" account_type="${h.account_type}"`)
      );

      // Get BTC transactions and their account_ids
      const transactions = await base44.entities.Transaction.list();
      const btcBuys = transactions.filter(t => t.asset_ticker === 'BTC' && t.type === 'buy');

      // Group by account_id
      const byAccountId = {};
      btcBuys.forEach(tx => {
        const accId = tx.account_id || 'NULL/UNDEFINED';
        if (!byAccountId[accId]) byAccountId[accId] = { count: 0, total: 0 };
        byAccountId[accId].count++;
        byAccountId[accId].total += (tx.remaining_quantity ?? tx.quantity ?? 0);
      });

      console.log("\nBTC TRANSACTIONS BY account_id:");
      Object.entries(byAccountId).forEach(([accId, data]) => {
        const account = accounts.find(a => a.id === accId);
        console.log(`  account_id="${accId}" (${account?.name || 'NO MATCH'}): ${data.count} lots, ${data.total.toFixed(8)} BTC`);
      });

      console.log("=========================");
    };

    debugAccountIds();
  }, []);

  // DEBUG: CSV import validation
  useEffect(() => {
    const debugImport = async () => {
      console.log("=== DEBUG AFTER REIMPORT ===");

      // Check accounts
      const accounts = await base44.entities.Account.list();
      console.log("ACCOUNTS:", accounts.map(a => ({ 
        id: a.id, 
        name: a.name, 
        type: a.account_type 
      })));

      // Check holdings
      const holdings = await base44.entities.Holding.list();
      console.log("HOLDINGS:", holdings.map(h => ({
        id: h.id,
        ticker: h.ticker,
        quantity: h.quantity,
        account_id: h.account_id
      })));

      // Check BTC transactions
      const transactions = await base44.entities.Transaction.list();
      const btcTx = transactions.filter(t => t.asset_ticker === 'BTC');
      console.log("BTC TRANSACTIONS:", btcTx.length);

      // Group by account_id
      const byAccount = {};
      btcTx.forEach(tx => {
        const accId = tx.account_id || 'NULL';
        if (!byAccount[accId]) byAccount[accId] = { count: 0, total: 0 };
        byAccount[accId].count++;
        byAccount[accId].total += (tx.remaining_quantity ?? tx.quantity ?? 0);
      });
      console.log("BTC BY ACCOUNT:", byAccount);

      console.log("=== END DEBUG ===");
    };

    debugImport();
  }, []);

  // ONE-TIME FIX: Repair all holdings to match their account's lots
  const repairAllHoldings = async () => {
    console.log("=== REPAIRING ALL HOLDINGS ===");
    
    const allTx = await base44.entities.Transaction.list();
    const allHoldings = await base44.entities.Holding.list();
    
    for (const holding of allHoldings) {
      if (!holding.ticker || !holding.account_id) {
        console.log("⚠️ Skipping holding without ticker/account_id:", holding);
        continue;
      }
      
      // Get lots ONLY for this specific account
      const lotsForHolding = allTx.filter(tx => 
        tx.type === 'buy' &&
        tx.asset_ticker === holding.ticker &&
        tx.account_id === holding.account_id
      );
      
      const correctQty = lotsForHolding.reduce((sum, lot) => 
        sum + (lot.remaining_quantity ?? lot.quantity ?? 0), 0
      );
      
      console.log(`${holding.ticker} in account ${holding.account_id}: ${holding.quantity} -> ${correctQty} (${lotsForHoldings.length} lots)`);
      
      await base44.entities.Holding.update(holding.id, {
        quantity: correctQty
      });
    }
    
    console.log("=== REPAIR COMPLETE ===");
    alert("Holdings repaired! Refresh the page.");
    queryClient.invalidateQueries({ queryKey: ['holdings'] });
  };

  // ONE-TIME FIX: Assign orphaned BTC lots to Cold Storage BTC account
  const assignOrphanedLotsToAccount = async () => {
    setIsRepairing(true);
    console.log("=== ASSIGNING ORPHANED BTC LOTS ===");
    
    try {
      // Get all accounts
      const accounts = await base44.entities.Account.list();
      
      // Find Cold Storage BTC (taxable, not IRA/401k)
      const coldStorageAccount = accounts.find(a => 
        a.name.toLowerCase().includes('cold storage') && 
        !a.account_type?.includes('ira') &&
        !a.account_type?.includes('401k')
      );
      
      if (!coldStorageAccount) {
        alert("Could not find Cold Storage BTC account.");
        setIsRepairing(false);
        return;
      }
      
      console.log("Target account:", coldStorageAccount.id, coldStorageAccount.name);
      
      // Get all transactions
      const transactions = await base44.entities.Transaction.list();
      
      // Find orphaned BTC lots (no account_id)
      const orphanedLots = transactions.filter(tx => 
        tx.asset_ticker === 'BTC' && 
        tx.type === 'buy' &&
        !tx.account_id
      );
      
      if (orphanedLots.length === 0) {
        alert("No orphaned lots found.");
        setIsRepairing(false);
        return;
      }
      
      // Calculate actual total from orphaned lots
      const orphanedTotal = orphanedLots.reduce((sum, tx) => 
        sum + (tx.remaining_quantity ?? tx.quantity ?? 0), 0
      );
      
      console.log(`Found ${orphanedLots.length} orphaned lots totaling ${orphanedTotal} BTC`);
      
      // Confirm
      if (!window.confirm(
        `Assign ${orphanedLots.length} orphaned lots (${orphanedTotal.toFixed(8)} BTC) to "${coldStorageAccount.name}"?`
      )) {
        setIsRepairing(false);
        return;
      }
      
      // Update each orphaned lot with account_id
      for (const tx of orphanedLots) {
        await base44.entities.Transaction.update(tx.id, {
          account_id: coldStorageAccount.id,
          account_type: 'taxable'
        });
      }
      
      console.log(`✅ Assigned ${orphanedLots.length} lots to ${coldStorageAccount.name}`);
      
      // Update holding - calculate from ALL lots now in this account
      const allTx = await base44.entities.Transaction.list();
      const lotsInAccount = allTx.filter(tx =>
        tx.asset_ticker === 'BTC' &&
        tx.type === 'buy' &&
        tx.account_id === coldStorageAccount.id
      );
      
      // Sum from actual lots
      const holdingQty = lotsInAccount.reduce((sum, tx) => 
        sum + (tx.remaining_quantity ?? tx.quantity ?? 0), 0
      );
      
      // Find and update the holding
      const holdings = await base44.entities.Holding.list();
      const holding = holdings.find(h => 
        h.ticker === 'BTC' && h.account_id === coldStorageAccount.id
      );
      
      if (holding) {
        await base44.entities.Holding.update(holding.id, { quantity: holdingQty });
        console.log(`✅ Updated holding to ${holdingQty} BTC (from ${lotsInAccount.length} lots)`);
      }
      
      alert(`Done! Assigned ${orphanedLots.length} lots. Holding updated to ${holdingQty.toFixed(8)} BTC.\n\nRefresh the page.`);
      window.location.reload();
      
    } catch (error) {
      console.error("Error:", error);
      alert("Error: " + error.message);
    } finally {
      setIsRepairing(false);
    }
  };

  const currentPrice = btcPrice || 97000;
  const [formOpen, setFormOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [lotsDialogHolding, setLotsDialogHolding] = useState(null);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [showAllLiabilities, setShowAllLiabilities] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const queryClient = useQueryClient();

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  // Get unique tickers for price fetching (stocks and crypto except BTC which is handled separately)
  const priceTickers = useMemo(() => {
    return [...new Set(holdings.filter(h => h.ticker && h.ticker !== 'BTC' && (h.asset_type === 'stocks' || h.asset_type === 'crypto')).map(h => h.ticker))];
  }, [holdings]);

  const { prices: assetPrices, loading: pricesLoading } = useAssetPrices(priceTickers);

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
  });

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
  });

  const { data: estateItems = [] } = useQuery({
    queryKey: ['estateItems'],
    queryFn: () => base44.entities.EstateItem.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list(),
  });

  // Get lot counts per ticker AND account type (key = "ticker|account_type")
  const lotCountsByTickerAndAccount = transactions
    .filter(t => t.type === 'buy')
    .reduce((acc, t) => {
      const accountType = t.account_type || 'taxable';
      const key = `${t.asset_ticker}|${accountType}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  // Helper to get lot count for a holding
  const getLotCount = (holding) => {
    const accountType = holding.account_type || 'taxable';
    const key = `${holding.ticker}|${accountType}`;
    return lotCountsByTickerAndAccount[key] || 0;
  };

  const createHolding = useMutation({
    mutationFn: async ({ holding, transactions }) => {
      const newHolding = await base44.entities.Holding.create(holding);
      if (transactions && transactions.length > 0) {
        for (const tx of transactions) {
          await base44.entities.Transaction.create({
            ...tx,
            holding_id: newHolding.id,
          });
        }
      }
      return newHolding;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setFormOpen(false);
    },
  });

  const updateHolding = useMutation({
    mutationFn: async ({ id, data }) => {
      // If data has holding/transaction structure, handle it
      if (data.holding) {
        return base44.entities.Holding.update(id, data.holding);
      }
      return base44.entities.Holding.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setFormOpen(false);
      setEditingHolding(null);
    },
  });

  const deleteHolding = useMutation({
    mutationFn: async (holding) => {
      // Delete all transactions for this ticker and account_id
      const relatedTransactions = transactions.filter(t => 
        t.asset_ticker === holding.ticker && 
        (holding.account_id ? t.account_id === holding.account_id : !t.account_id)
      );
      
      // Delete all related transactions
      for (const tx of relatedTransactions) {
        await base44.entities.Transaction.delete(tx.id);
      }
      
      // Then delete the holding
      return base44.entities.Holding.delete(holding.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error) => {
      console.error('Delete failed:', error);
    },
  });

  // Helper to convert prices to USD
  const convertToUSD = (price, currency) => {
    if (!currency || currency === 'USD') return price;
    const rate = exchangeRates[currency];
    if (rate) {
      return price * rate;
    }
    console.warn(`No exchange rate for ${currency}, returning unconverted price`);
    return price;
  };

  // Get live price for a holding (BTC, stocks, or manual)
      const getHoldingPrice = (holding) => {
        if (holding.ticker === 'BTC') return currentPrice;
        if (assetPrices[holding.ticker]?.price) {
          const price = assetPrices[holding.ticker].price;
          const currency = assetPrices[holding.ticker].currency || 'USD';
          return convertToUSD(price, currency);
        }
        return holding.current_price || 0;
      };

      // Helper to get price by ticker
      const getPriceByTicker = (ticker) => {
        if (ticker === 'BTC') return currentPrice;
        if (assetPrices[ticker]?.price) return assetPrices[ticker].price;
        const holding = holdings.find(h => h.ticker === ticker);
        return holding?.current_price || 0;
      };

      // Group holdings by account
      const holdingsByAccount = useMemo(() => {
        const groups = {};
        
        // Group by account_id
        holdings.forEach(h => {
          const accountId = h.account_id || '_unassigned_';
          if (!groups[accountId]) groups[accountId] = [];
          groups[accountId].push(h);
        });
        
        return groups;
      }, [holdings]);

      // Calculate totals
      const totalAssets = holdings.reduce((sum, h) => {
        return sum + (h.quantity * getHoldingPrice(h));
      }, 0);

  const totalLiabilities = liabilities.reduce((sum, l) => sum + (l.current_balance || 0), 0);
  
  const btcHoldings = holdings
    .filter(h => h.ticker === 'BTC')
    .reduce((sum, h) => sum + h.quantity, 0);

  const monthlyIncome = budgetItems
    .filter(b => b.type === 'income' && b.is_active !== false)
    .reduce((sum, b) => {
      const freq = { monthly: 1, weekly: 4.33, biweekly: 2.17, quarterly: 0.33, annual: 0.083, one_time: 0 };
      return sum + (b.amount * (freq[b.frequency] || 1));
    }, 0);

  const monthlyExpenses = budgetItems
    .filter(b => b.type === 'expense' && b.is_active !== false)
    .reduce((sum, b) => {
      const freq = { monthly: 1, weekly: 4.33, biweekly: 2.17, quarterly: 0.33, annual: 0.083, one_time: 0 };
      return sum + (b.amount * (freq[b.frequency] || 1));
    }, 0);

  const monthlyDebtPayments = liabilities.reduce((sum, l) => sum + (l.monthly_payment || 0), 0);
  const totalMonthlyOutflow = monthlyExpenses + monthlyDebtPayments;

  const securityScores = estateItems
    .filter(e => e.item_type === 'custody_location' && e.security_score)
    .map(e => e.security_score);
  const avgSecurityScore = securityScores.length > 0 
    ? securityScores.reduce((a, b) => a + b, 0) / securityScores.length 
    : 0;

  const handleSubmit = (data) => {
    if (editingHolding) {
      updateHolding.mutate({ id: editingHolding.id, data: data.holding || data });
    } else {
      createHolding.mutate(data);
    }
  };

  const handleEdit = (holding) => {
    setEditingHolding(holding);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Net Worth Dashboard</h1>
          <p className="text-zinc-500 mt-2">Your complete financial overview</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
            <Bitcoin className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-zinc-400">BTC:</span>
            {priceLoading ? (
              <RefreshCw className="w-4 h-4 text-zinc-500 animate-spin" />
            ) : (
              <>
                <span className="font-semibold text-amber-400">${currentPrice.toLocaleString()}</span>
                {priceChange !== null && (
                  <span className={`text-xs ${priceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {priceChange >= 0 ? '↑' : '↓'}{Math.abs(priceChange).toFixed(1)}%
                  </span>
                )}
              </>
            )}
          </div>
          <Button
            variant="outline"
            onClick={repairAllHoldings}
            className="bg-rose-600 border-rose-600 text-white hover:bg-rose-700"
          >
            🔧 Repair Holdings
          </Button>
          <Button
            variant="outline"
            onClick={assignOrphanedLotsToAccount}
            disabled={isRepairing}
            className="bg-orange-600 border-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {isRepairing ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Assigning...
              </>
            ) : (
              <>🔗 Assign Orphaned Lots</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => setCsvImportOpen(true)}
            className="bg-transparent border-zinc-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Button
            onClick={() => { setEditingHolding(null); setFormOpen(true); }}
            className="brand-gradient text-white font-semibold hover:opacity-90 shadow-lg shadow-orange-500/20"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Asset
          </Button>
        </div>
      </div>

      {/* Net Worth Card */}
      <NetWorthCard
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        btcHoldings={btcHoldings}
        btcPrice={currentPrice}
        transactions={transactions}
      />

      {/* Quick Stats */}
      <QuickStats
        monthlyIncome={monthlyIncome}
        monthlyExpenses={totalMonthlyOutflow}
        dcaProgress={0}
        liabilityRatio={totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0}
        securityScore={Math.round(avgSecurityScore)}
      />

      {/* Holdings by Account */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Asset Allocation</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''} • {holdings.length} position{holdings.length !== 1 ? 's' : ''}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateAccount(true)}
              className="bg-transparent border-zinc-700 text-xs"
            >
              <Building2 className="w-3 h-3 mr-1" />
              New Account
            </Button>
          </div>
        </div>

        {holdingsLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="card-premium rounded-xl p-5 animate-pulse border border-zinc-800/50">
                <div className="h-6 bg-zinc-800/50 rounded w-48 mb-2" />
                <div className="h-4 bg-zinc-800/50 rounded w-32" />
              </div>
            ))}
          </div>
        ) : holdings.length === 0 ? (
          <div className="card-premium rounded-2xl p-16 text-center border border-zinc-800/50">
            <div className="w-20 h-20 rounded-2xl bg-orange-500/10 mx-auto flex items-center justify-center mb-6">
              <Bitcoin className="w-10 h-10 text-orange-400" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-zinc-200">Begin Your Journey</h3>
            <p className="text-zinc-500 mb-6 max-w-sm mx-auto">Add your first asset to start tracking your wealth</p>
            <Button
              onClick={() => setFormOpen(true)}
              className="brand-gradient text-white font-semibold shadow-lg shadow-orange-500/20"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Asset
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* All accounts (including empty ones) */}
            {accounts.map(account => {
              const accountHoldings = holdingsByAccount[account.id] || [];
              return (
                <AccountGroup
                  key={account.id}
                  account={account}
                  holdings={accountHoldings}
                  getPrice={getPriceByTicker}
                  onEditHolding={handleEdit}
                  onDeleteHolding={(h) => deleteHolding.mutate(h)}
                  onManageLots={setLotsDialogHolding}
                  onEditAccount={setEditingAccount}
                />
              );
            })}

            {/* Unassigned holdings */}
            {holdingsByAccount['_unassigned_']?.length > 0 && (
              <AccountGroup
                account={{ name: 'Unassigned Assets', account_type: 'mixed', tax_treatment: 'taxable' }}
                holdings={holdingsByAccount['_unassigned_']}
                getPrice={getPriceByTicker}
                onEditHolding={handleEdit}
                onDeleteHolding={(h) => deleteHolding.mutate(h)}
                onManageLots={setLotsDialogHolding}
              />
            )}

            {/* Total Assets Summary */}
            {holdings.length > 0 && (
              <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Total Assets</span>
                  <span className="text-lg font-bold text-emerald-400">
                    ${totalAssets.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Liabilities Summary */}
      {liabilities.length > 0 && (
        <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Liabilities</h3>
            <span className="text-sm text-zinc-500">{liabilities.length} position{liabilities.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-3">
            {liabilities.slice(0, showAllLiabilities ? liabilities.length : 5).map((liability) => (
              <div key={liability.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/30">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    liability.type === 'btc_collateralized' ? 'bg-orange-400' : 
                    liability.type === 'secured' ? 'bg-blue-400' : 'bg-zinc-400'
                  }`} />
                  <div>
                    <p className="font-medium text-sm">{liability.name}</p>
                    <p className="text-xs text-zinc-500">
                      {liability.interest_rate ? `${liability.interest_rate}% APR` : 'No interest'}
                      {liability.type === 'btc_collateralized' && ' • BTC Collateral'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-rose-400">${(liability.current_balance || 0).toLocaleString()}</p>
                  {liability.monthly_payment > 0 && (
                    <p className="text-xs text-zinc-500">${liability.monthly_payment}/mo</p>
                  )}
                </div>
              </div>
            ))}
            {liabilities.length > 5 && (
              <button
                onClick={() => setShowAllLiabilities(!showAllLiabilities)}
                className="text-sm text-orange-400 hover:text-orange-300 transition-colors pt-2 block w-full text-center font-medium"
              >
                {showAllLiabilities ? 'Show Less' : `+${liabilities.length - 5} more`}
              </button>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center">
            <span className="text-sm text-zinc-400">Total Debt</span>
            <span className="text-lg font-bold text-rose-400">${totalLiabilities.toLocaleString()}</span>
          </div>
        </div>
      )}

      <AddAssetWithTransaction
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingHolding(null); }}
        onSubmit={handleSubmit}
        initialData={editingHolding}
        btcPrice={currentPrice}
      />

      <ManageLotsDialog
        open={!!lotsDialogHolding}
        onClose={() => setLotsDialogHolding(null)}
        holding={lotsDialogHolding}
        btcPrice={currentPrice}
      />

      <CreateAccountDialog
        open={showCreateAccount}
        onClose={() => setShowCreateAccount(false)}
        onCreated={() => {}}
      />

      <EditAccountDialog
        open={!!editingAccount}
        onClose={() => setEditingAccount(null)}
        account={editingAccount}
      />

      <CsvImportDialog 
        open={csvImportOpen} 
        onClose={() => setCsvImportOpen(false)} 
      />
      </div>
      );
      }