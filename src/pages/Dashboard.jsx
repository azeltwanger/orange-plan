import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Pencil, Trash2, Bitcoin, Package, Building2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CsvImportDialog from '@/components/transactions/CsvImportDialog';
import useAssetPrices from '@/components/shared/useAssetPrices';
import { syncHoldingFromLots } from '@/components/shared/syncHoldings';
import { Button } from "@/components/ui/button";
import NetWorthCard from '@/components/dashboard/NetWorthCard';
import AssetCard from '@/components/dashboard/AssetCard';
import QuickStats from '@/components/dashboard/QuickStats';
import AddAssetWithTransaction from '@/components/forms/AddAssetWithTransaction';
import ManageLotsDialog from '@/components/dashboard/ManageLotsDialog';
import AccountGroup from '@/components/dashboard/AccountGroup';
import CreateAccountDialog from '@/components/accounts/CreateAccountDialog';
import EditAccountDialog from '@/components/accounts/EditAccountDialog';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceChange, setPriceChange] = useState(null);
  const [exchangeRates, setExchangeRates] = useState({ USD: 1 });

  // Check user access
  useEffect(() => {
    const checkUserAccess = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        setCheckingAccess(false);
      }
    };
    checkUserAccess();
  }, []);

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
  
      }
    };
    fetchRates();
  }, []);



  const currentPrice = btcPrice || 97000;
  const [formOpen, setFormOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [lotsDialogHolding, setLotsDialogHolding] = useState(null);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [showAllLiabilities, setShowAllLiabilities] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
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

  // Check if critical data is loading
  const isLoadingData = holdingsLoading || !accounts || !budgetItems || !liabilities;

  // Get lot counts per ticker AND account type (key = "ticker|account_type")
  // FILTER OUT soft-deleted transactions (check both root and data.is_deleted)
  const lotCountsByTickerAndAccount = transactions
    .filter(t => t.type === 'buy' && t.is_deleted !== true && t.data?.is_deleted !== true)
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
      // Set manual_entry based on whether transactions are included
      const hasTransactions = transactions && transactions.length > 0;
      const newHolding = await base44.entities.Holding.create({
        ...holding,
        manual_entry: !hasTransactions
      });
      
      if (hasTransactions) {
        for (const tx of transactions) {
          await base44.entities.Transaction.create({
            ...tx,
            holding_id: newHolding.id,
            account_id: newHolding.account_id,
          });
        }
        
        // Only sync from lots if transactions were created
        const ticker = transactions[0].asset_ticker;
        const accountId = newHolding.account_id;
        if (ticker && accountId) {
          await syncHoldingFromLots(ticker, accountId);
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
      // Delete ALL transactions for this ticker AND account_id, OR by holding_id
      const relatedTransactions = transactions.filter(t => 
        t.holding_id === holding.id ||
        (t.asset_ticker === holding.ticker && 
         (holding.account_id ? t.account_id === holding.account_id : !t.account_id))
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
      queryClient.invalidateQueries({ queryKey: ['portfolioIRR'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
    onError: (error) => {
      alert('Failed to delete holding. Please try again.');
    },
  });

  // Helper to convert prices to USD
  const convertToUSD = (price, currency) => {
    if (!currency || currency === 'USD') return price;
    const rate = exchangeRates[currency];
    if (rate) {
      return price * rate;
    }

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

  // Show loading skeleton while data is being fetched
  if (isLoadingData || checkingAccess) {
    return <LoadingSkeleton />;
  }

  // Check access
  const userHasAccess = user?.hasAccess === true || user?.subscriptionStatus === 'active';

  const handleSubscribe = async (priceId) => {
    try {
      const response = await base44.functions.invoke('createCheckoutSession', { priceId });
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    }
  };

  if (!userHasAccess) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Access required. Subscribe to continue.</h2>
        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            onClick={() => handleSubscribe('price_1Sn2PpC0uFkeocVNC4oyJcxw')}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            Monthly - $49/mo
          </button>
          <button 
            onClick={() => handleSubscribe('price_1Sn2Q7C0uFkeocVNSv9ctSeh')}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            Yearly - $399/yr
          </button>
          <button 
            onClick={() => handleSubscribe('price_1Sn2QpC0uFkeocVNM294BaeJ')}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            Lifetime - $499
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Net Worth Dashboard</h1>
          <p className="text-zinc-500 mt-1">Your complete financial overview</p>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
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
            onClick={() => setCsvImportOpen(true)}
            className="bg-transparent border-zinc-700 text-sm"
            size="sm"
          >
            <Upload className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Import CSV</span>
          </Button>
          <Button
            onClick={() => { setEditingHolding(null); setFormOpen(true); }}
            className="brand-gradient text-white font-semibold hover:opacity-90 shadow-lg shadow-orange-500/20 text-sm"
            size="sm"
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
          <LoadingSpinner text="Loading holdings..." />
        ) : holdings.length === 0 ? (
          <EmptyState
            icon={Bitcoin}
            title="Begin Your Journey"
            description="Add your first asset to start tracking your wealth"
            actionText="Add Your First Asset"
            onAction={() => setFormOpen(true)}
          />
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
                  onDeleteHolding={(h) => { setItemToDelete({ type: 'holding', item: h }); setDeleteConfirmOpen(true); }}
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
                onDeleteHolding={(h) => { setItemToDelete({ type: 'holding', item: h }); setDeleteConfirmOpen(true); }}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md animate-in fade-in-0 zoom-in-95 duration-200">
          <DialogHeader>
            <DialogTitle>Delete {itemToDelete?.type === 'holding' ? 'Holding' : 'Item'}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-zinc-400">
              {itemToDelete?.type === 'holding' && (
                <>Are you sure you want to delete <span className="font-semibold text-zinc-200">{itemToDelete.item?.asset_name || itemToDelete.item?.ticker}</span>?</>
              )}
            </p>
            <p className="text-sm text-rose-400">This action cannot be undone. All related transactions will also be deleted.</p>
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={() => { setDeleteConfirmOpen(false); setItemToDelete(null); }} 
                className="flex-1 bg-transparent border-zinc-700"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (itemToDelete?.type === 'holding') {
                    deleteHolding.mutate(itemToDelete.item);
                  }
                  setDeleteConfirmOpen(false);
                  setItemToDelete(null);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
      );
      }