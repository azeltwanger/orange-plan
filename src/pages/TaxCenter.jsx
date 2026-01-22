import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInDays } from 'date-fns';
import { Plus, Pencil, Trash2, Receipt, TrendingUp, TrendingDown, Calendar, AlertTriangle, CheckCircle, Sparkles, RefreshCw, Info, Download, Calculator, DollarSign, Scale, ChevronRight, Upload, Loader2 } from 'lucide-react';
import { getTaxDataForYear } from '@/components/tax/taxCalculations';
import { syncHoldingFromLots } from '@/components/shared/syncHoldings';
import { getStateOptions, getStateTaxSummary, STATE_TAX_CONFIG, calculateStateTaxOnRetirement, calculateStateCapitalGainsTax } from '@/components/shared/stateTaxConfig';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import CsvImportDialog from '@/components/transactions/CsvImportDialog';
import AccountSelector from '@/components/accounts/AccountSelector';
import CreateAccountDialog from '@/components/accounts/CreateAccountDialog';
import { cn } from "@/lib/utils";
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

// 2025 Tax Brackets and Standard Deductions
// LTCG brackets are based on TAXABLE income (after standard deduction)
// So with $0 income, you can realize up to the bracket max + standard deduction in gains at 0%
const STANDARD_DEDUCTION_2025 = {
  single: 15000,
  married: 30000,
};

const TAX_BRACKETS_2025 = {
  single: {
    income: [
      { min: 0, max: 11925, rate: 0.10, label: '10%' },
      { min: 11925, max: 48475, rate: 0.12, label: '12%' },
      { min: 48475, max: 103350, rate: 0.22, label: '22%' },
      { min: 103350, max: 197300, rate: 0.24, label: '24%' },
      { min: 197300, max: 250525, rate: 0.32, label: '32%' },
      { min: 250525, max: 626350, rate: 0.35, label: '35%' },
      { min: 626350, max: Infinity, rate: 0.37, label: '37%' },
    ],
    ltcg: [
      { min: 0, max: 48350, rate: 0, label: '0%' },
      { min: 48350, max: 533400, rate: 0.15, label: '15%' },
      { min: 533400, max: Infinity, rate: 0.20, label: '20%' },
    ],
  },
  married: {
    income: [
      { min: 0, max: 23850, rate: 0.10, label: '10%' },
      { min: 23850, max: 96950, rate: 0.12, label: '12%' },
      { min: 96950, max: 206700, rate: 0.22, label: '22%' },
      { min: 206700, max: 394600, rate: 0.24, label: '24%' },
      { min: 394600, max: 501050, rate: 0.32, label: '32%' },
      { min: 501050, max: 751600, rate: 0.35, label: '35%' },
      { min: 751600, max: Infinity, rate: 0.37, label: '37%' },
    ],
    ltcg: [
      { min: 0, max: 96700, rate: 0, label: '0%' },
      { min: 96700, max: 600050, rate: 0.15, label: '15%' },
      { min: 600050, max: Infinity, rate: 0.20, label: '20%' },
    ],
  },
};

// Default trading fee estimate (round trip: buy + sell) - industry standard, used when no user data available
const DEFAULT_ROUND_TRIP_FEE_PERCENT = 0.5; // 0.25% per side = 0.5% round trip (industry standard for major exchanges)

// Tax lot selection methods
const LOT_METHODS = {
  FIFO: { name: 'FIFO', description: 'First In, First Out - Sell oldest lots first' },
  LIFO: { name: 'LIFO', description: 'Last In, First Out - Sell newest lots first' },
  HIFO: { name: 'HIFO', description: 'Highest In, First Out - Minimize gains by selling highest cost basis first' },
  LOFO: { name: 'LOFO', description: 'Lowest In, First Out - Maximize gains (useful for loss harvesting)' },
  AVG: { name: 'Average Cost', description: 'Use average cost basis across all lots' },
  SPECIFIC: { name: 'Specific ID', description: 'Manually select which lots to sell' },
};

export default function TaxCenter() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saleFormOpen, setSaleFormOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [txSortOrder, setTxSortOrder] = useState('desc'); // 'desc' (newest first), 'asc' (oldest first)
  const [lotSortOrder, setLotSortOrder] = useState('asc'); // 'asc' (oldest first), 'desc' (newest first)
  const [lotStatusFilter, setLotStatusFilter] = useState('all'); // 'all', 'available', 'sold'
  const [selectedTxIds, setSelectedTxIds] = useState([]);
  const [bulkAccountType, setBulkAccountType] = useState('taxable');
  const [assetTypeFilter, setAssetTypeFilter] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [exportingYear, setExportingYear] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isReconstructing, setIsReconstructing] = useState(false);
  const queryClient = useQueryClient();

  // Tax planning settings
  const [annualIncome, setAnnualIncome] = useState(0);
  const [targetTaxableIncome, setTargetTaxableIncome] = useState(48350);
  const [filingStatus, setFilingStatus] = useState('single');
  const [stateOfResidence, setStateOfResidence] = useState('TX');
  const [expectedFutureIncome, setExpectedFutureIncome] = useState(null); // Will be set from userSettings
  const [costBasisMethod, setCostBasisMethod] = useState('HIFO');

  // Sale form state
  const [saleForm, setSaleForm] = useState({
    account_id: '',
    asset_ticker: '',
    quantity: '',
    price_per_unit: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    fee: '',
    lot_method: 'HIFO',
    selected_lots: [],
    exchange: '',
  });

  const [formData, setFormData] = useState({
    type: 'buy',
    asset_ticker: 'BTC',
    quantity: '',
    price_per_unit: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    exchange: '',
    account_id: '',
    trading_fee: '',
    notes: '',
  });
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // CoinGecko ID mapping for crypto
  const COINGECKO_IDS = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
    DOGE: 'dogecoin', DOT: 'polkadot', AVAX: 'avalanche-2', MATIC: 'matic-network',
    LINK: 'chainlink', LTC: 'litecoin', UNI: 'uniswap', ATOM: 'cosmos',
  };

  // Fetch price for ticker (crypto from CoinGecko, stocks from backend)
  const fetchTickerPrice = async (ticker) => {
    if (!ticker || ticker.length < 1) return;
    setFetchingPrice(true);
    try {
      const coinId = COINGECKO_IDS[ticker.toUpperCase()];
      if (coinId) {
        // Crypto - use CoinGecko
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
        const data = await response.json();
        if (data[coinId]?.usd) {
          setFormData(prev => ({ ...prev, price_per_unit: data[coinId].usd }));
        }
      } else if (ticker !== 'USD' && ticker !== 'CASH') {
        // Stock - use backend function
        const response = await base44.functions.invoke('getStockPrices', {
          tickers: [ticker],
          days: 1
        });
        if (response.data?.[ticker]?.currentPrice) {
          setFormData(prev => ({ ...prev, price_per_unit: response.data[ticker].currentPrice }));
        }
      }
    } catch (err) {

    } finally {
      setFetchingPrice(false);
    }
  };

  // Auto-fetch price when ticker changes
  useEffect(() => {
    if (formData.asset_ticker && formOpen && !editingTx) {
      const timeoutId = setTimeout(() => {
        fetchTickerPrice(formData.asset_ticker);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [formData.asset_ticker, formOpen]);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const data = await response.json();
        setBtcPrice(data.bitcoin.usd);
        setPriceLoading(false);
      } catch (err) {
        setBtcPrice(97000);
        setPriceLoading(false);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const { data: allTransactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date'),
  });



  // Filter transactions by selected year (for tax calculations only, not display)
  const transactionsForTaxCalc = allTransactions.filter(t => {
    const txDate = new Date(t.date);
    return txDate.getFullYear() === selectedYear;
  });

  // Get available years from all transactions
  const availableYears = [...new Set(allTransactions.map(t => new Date(t.date).getFullYear()))].sort((a, b) => b - a);

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: userSettings = [] } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => base44.entities.UserSettings.list(),
  });

  // Settings loaded flag
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load settings from UserSettings entity
  useEffect(() => {
    if (userSettings.length > 0 && !settingsLoaded) {
      const settings = userSettings[0];
      if (settings.filing_status !== undefined) setFilingStatus(settings.filing_status);
      if (settings.state_of_residence !== undefined) setStateOfResidence(settings.state_of_residence);
      if (settings.cost_basis_method !== undefined) setCostBasisMethod(settings.cost_basis_method);
      // Default expected future income to retirement spending (when user will likely sell)
      if (expectedFutureIncome === null) {
        setExpectedFutureIncome(settings.annual_retirement_spending || 80000);
      }
      setSettingsLoaded(true);
    }
  }, [userSettings, settingsLoaded, expectedFutureIncome]);

  // Save settings mutation
  const saveSettings = useMutation({
    mutationFn: async (data) => {
      if (userSettings.length > 0) {
        return base44.entities.UserSettings.update(userSettings[0].id, data);
      } else {
        return base44.entities.UserSettings.create(data);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userSettings'] }),
  });

  // Auto-save settings when they change
  useEffect(() => {
    if (!settingsLoaded) return;
    const timeoutId = setTimeout(() => {
      saveSettings.mutate({
        filing_status: filingStatus || 'single',
        state_of_residence: stateOfResidence || '',
        cost_basis_method: costBasisMethod || 'HIFO',
      });
    }, 1000); // Debounce 1 second
    return () => clearTimeout(timeoutId);
  }, [settingsLoaded, filingStatus, stateOfResidence, costBasisMethod]);

  // Map account_type to tax_treatment
  const getTaxTreatment = (accountType) => {
    const taxTreatmentMap = {
      taxable: 'taxable',
      traditional_401k: 'tax_deferred',
      roth_401k: 'tax_free',
      traditional_ira: 'tax_deferred',
      roth_ira: 'tax_free',
      hsa: 'tax_free',
      '529': 'tax_free',
    };
    return taxTreatmentMap[accountType] || 'taxable';
  };

  const createTx = useMutation({
    mutationFn: async (data) => {
      const total = data.quantity * data.price_per_unit;
      const lotId = `${data.asset_ticker}-${Date.now()}`;
      
      // Check for duplicate transaction
      const existingDuplicate = allTransactions.find(t => 
        t.type === data.type &&
        t.asset_ticker === data.asset_ticker &&
        t.quantity === data.quantity &&
        t.price_per_unit === data.price_per_unit &&
        t.date === data.date
      );
      
      if (existingDuplicate) {
        throw new Error('Duplicate transaction already exists');
      }

      // Get proper account type from selected account if account_id is set
      let finalAccountType = 'taxable';
      if (data.account_id) {
        const selectedAccount = await base44.entities.Account.list();
        const account = selectedAccount.find(a => a.id === data.account_id);
        if (account?.account_type) {
          // Map Account entity account_type to Transaction entity account_type
          const accountTypeMap = {
            'taxable_brokerage': 'taxable',
            'taxable_crypto': 'taxable',
            'taxable_real_estate': 'taxable',
            '401k_traditional': 'traditional_401k',
            '401k_roth': 'roth_401k',
            'ira_traditional': 'traditional_ira',
            'ira_roth': 'roth_ira',
            'hsa': 'hsa',
            '529': '529',
          };
          finalAccountType = accountTypeMap[account.account_type] || account.account_type || 'taxable';
        }
      }
      
      const txData = {
        ...data,
        account_type: finalAccountType,
        total_value: total,
        lot_id: data.type === 'buy' ? lotId : undefined,
        cost_basis: data.type === 'buy' ? total : data.cost_basis,
        holding_period: data.holding_period || 'short_term',
        realized_gain_loss: data.realized_gain_loss,
        // Initialize new buy lots with full remaining quantity
        remaining_quantity: data.type === 'buy' ? data.quantity : undefined,
      };

      const tx = await base44.entities.Transaction.create(txData);

      // If this is a SELL transaction, update the buy lots' remaining_quantity
      if (data.type === 'sell' && data.lots_used && data.lots_used.length > 0) {

        
        const allTransactions = await base44.entities.Transaction.list();
        
        for (const lotUsage of data.lots_used) {
          const buyLot = allTransactions.find(t => t.id === lotUsage.lot_id);
          
          if (buyLot) {
            const currentRemaining = buyLot.remaining_quantity ?? buyLot.quantity;
            const newRemaining = currentRemaining - lotUsage.quantity_sold;
            

            
            await base44.entities.Transaction.update(lotUsage.lot_id, {
              remaining_quantity: Math.max(0, newRemaining)
            });
          }
        }
        

      }

      // Sync holdings from lots (source of truth)
      await syncHoldingFromLots(data.asset_ticker, data.account_id || null);

      return tx;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setFormOpen(false);
      setSaleFormOpen(false);
      resetForm();
    },
    onError: (error) => {
      alert(error.message || 'Could not save transaction. Please check your data and try again.');
    },
  });

  const updateTx = useMutation({
    mutationFn: async ({ id, data }) => {
      const tx = allTransactions.find(t => t.id === id);
      await base44.entities.Transaction.update(id, {
        ...data,
        total_value: data.quantity * data.price_per_unit,
      });
      
      // Sync holdings after update
      if (tx) {
        await syncHoldingFromLots(tx.asset_ticker, tx.account_id || null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setFormOpen(false);
      setEditingTx(null);
      resetForm();
    },
  });

  const deleteTx = useMutation({
    mutationFn: async (id) => {
      // Fetch the actual transaction from database (not cache)
      const tx = await base44.entities.Transaction.get(id);
      
      if (tx && tx.type === 'sell') {
        // REVERSE THE SALE - restore tax lots
        if (tx.lots_used && tx.lots_used.length > 0) {

          
          for (const lotUsage of tx.lots_used) {
            // Fetch the buy transaction directly from database
            const buyTx = await base44.entities.Transaction.get(lotUsage.lot_id);
            
            if (buyTx) {
              const currentRemaining = buyTx.remaining_quantity ?? buyTx.quantity;
              const newRemaining = currentRemaining + lotUsage.quantity_sold;
              

              
              await base44.entities.Transaction.update(buyTx.id, {
                remaining_quantity: newRemaining
              });
            } else {

            }
          }
        }
      }
      
      // Delete the transaction (buy or sell)
      await base44.entities.Transaction.delete(id);
      
      // Sync holdings from lots (source of truth)
      if (tx) {

        await syncHoldingFromLots(tx.asset_ticker, tx.account_id || null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
    },
  });

  const bulkDeleteTx = useMutation({
    mutationFn: async (ids) => {

      
      // Track affected assets for sync
      const affectedAssets = new Set();
      ids.forEach(id => {
        const tx = allTransactions.find(t => t.id === id);
        if (tx) {
          affectedAssets.add(`${tx.asset_ticker}|${tx.account_id || ''}`);
        }
      });
      
      // Delete in small batches with delays to avoid rate limits
      const batchSize = 10;
      const delayMs = 1000; // 1 second between batches
      
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        
        // Delete batch sequentially
        for (const id of batch) {
          await base44.entities.Transaction.delete(id);
        }
        
        const progress = Math.min(i + batchSize, ids.length);

        
        // Wait between batches
        if (i + batchSize < ids.length) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      
      // Sync holdings for all affected tickers/accounts

      for (const key of affectedAssets) {
        const [ticker, accountId] = key.split('|');
        if (ticker && accountId) {
          await syncHoldingFromLots(ticker, accountId);
        }
      }
      
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setSelectedTxIds([]);
    },
  });

  const bulkUpdateAccountType = useMutation({
    mutationFn: async ({ ids, accountType }) => {
      // Track affected assets for sync
      const affectedAssets = new Set();
      ids.forEach(id => {
        const tx = allTransactions.find(t => t.id === id);
        if (tx) {
          affectedAssets.add(`${tx.asset_ticker}|${tx.account_id || ''}`);
        }
      });
      
      for (const id of ids) {
        await base44.entities.Transaction.update(id, { account_type: accountType });
      }
      
      // Sync holdings for all affected tickers/accounts
      for (const key of affectedAssets) {
        const [ticker, accountId] = key.split('|');
        if (ticker && accountId) {
          await syncHoldingFromLots(ticker, accountId);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setSelectedTxIds([]);
    },
  });

  const toggleSelectTx = (id) => {
    setSelectedTxIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedTxIds.length === allTransactions.length) {
      setSelectedTxIds([]);
    } else {
      setSelectedTxIds(allTransactions.map(tx => tx.id));
    }
  };

  const resetForm = () => {
    setFormData({ type: 'buy', asset_ticker: 'BTC', quantity: '', price_per_unit: '', date: format(new Date(), 'yyyy-MM-dd'), exchange: '', account_id: '', trading_fee: '', notes: '' });
    setSaleForm({ account_id: '', asset_ticker: '', quantity: '', price_per_unit: '', date: format(new Date(), 'yyyy-MM-dd'), fee: '', lot_method: 'HIFO', selected_lots: [], exchange: '' });
    setSpecificLotQuantities({});
  };

  const reconstructBuyTransactions = async () => {
    setIsReconstructing(true);
    try {
      const allTransactions = await base44.entities.Transaction.list();
      const sellTransactions = allTransactions.filter(t => t.type === 'sell' && t.lots_used?.length > 0);
      
      // Collect all unique lots from lots_used
      const lotsMap = new Map();
      
      for (const sell of sellTransactions) {
        for (const lotUsed of sell.lots_used) {
          const lotId = lotUsed.lot_id;
          
          if (!lotsMap.has(lotId)) {
            // Create new lot entry
            lotsMap.set(lotId, {
              lot_id: lotId,
              asset_ticker: sell.asset_ticker,
              price_per_unit: lotUsed.price_per_unit,
              cost_basis_per_unit: lotUsed.price_per_unit,
              purchase_date: lotUsed.purchase_date,
              total_quantity_sold: lotUsed.quantity_sold,
              account_type: sell.account_type || 'taxable',
              account_id: sell.account_id,
              exchange_or_wallet: sell.exchange_or_wallet,
            });
          } else {
            // Add to existing lot's sold quantity
            const existing = lotsMap.get(lotId);
            existing.total_quantity_sold += lotUsed.quantity_sold;
          }
        }
      }
      
      // Check which lots already exist as buy transactions
      const existingBuys = allTransactions.filter(t => t.type === 'buy');
      const existingLotIds = new Set(existingBuys.map(b => b.lot_id));
      
      // Create missing buy transactions
      let created = 0;
      for (const [lotId, lotData] of lotsMap) {
        if (!existingLotIds.has(lotId)) {
          // We know at least this much was sold (lots are now fully used)
          const buyTx = {
            type: 'buy',
            asset_ticker: lotData.asset_ticker,
            quantity: lotData.total_quantity_sold,
            remaining_quantity: 0, // Already sold
            price_per_unit: lotData.price_per_unit,
            total_value: lotData.total_quantity_sold * lotData.price_per_unit,
            date: lotData.purchase_date,
            lot_id: lotId,
            cost_basis: lotData.total_quantity_sold * lotData.price_per_unit,
            account_type: lotData.account_type,
            account_id: lotData.account_id,
            exchange_or_wallet: lotData.exchange_or_wallet,
            notes: '[Reconstructed from sell transaction lots_used]',
          };
          
          await base44.entities.Transaction.create(buyTx);
          created++;
        }
      }
      
      console.log(`Created ${created} buy transactions from lots_used data`);
      alert(`Successfully reconstructed ${created} buy transactions from sell history`);
      
      // Refresh transactions
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
    } catch (error) {
      console.error('Error reconstructing buy transactions:', error);
      alert('Error: ' + error.message);
    } finally {
      setIsReconstructing(false);
    }
  };

  useEffect(() => {
    if (editingTx) {
      // Get account type from transaction or fallback to holding
      const holding = holdings.find(h => h.ticker === editingTx.asset_ticker);
      const accountType = editingTx.account_type || holding?.account_type || 'taxable';
      
      // Format date to YYYY-MM-DD for the input field
      let formattedDate = '';
      if (editingTx.date) {
        try {
          const d = new Date(editingTx.date);
          if (!isNaN(d.getTime())) {
            formattedDate = format(d, 'yyyy-MM-dd');
          }
        } catch {
          formattedDate = editingTx.date;
        }
      }
      
      setFormData({
        type: editingTx.type || 'buy',
        asset_ticker: editingTx.asset_ticker || 'BTC',
        quantity: editingTx.quantity || '',
        price_per_unit: editingTx.price_per_unit || '',
        date: formattedDate,
        exchange: editingTx.exchange_or_wallet || editingTx.exchange || '',
        account_id: editingTx.account_id || '',
        trading_fee: editingTx.trading_fee || '',
        notes: editingTx.notes || '',
      });
    }
  }, [editingTx, holdings]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { 
      ...formData, 
      quantity: parseFloat(formData.quantity) || 0, 
      price_per_unit: parseFloat(formData.price_per_unit) || 0,
      trading_fee: parseFloat(formData.trading_fee) || 0,
      exchange_or_wallet: formData.exchange,
      account_id: formData.account_id || null,
    };
    if (editingTx) {
      updateTx.mutate({ id: editingTx.id, data });
    } else {
      createTx.mutate(data);
    }
  };

  const currentPrice = btcPrice || 97000;
  
  // Get current prices for all tickers - BTC always uses live price
  const pricesByTicker = useMemo(() => {
    const prices = {};
    
    // Add prices from holdings first
    holdings.forEach(h => {
      if (h.ticker && h.current_price) {
        prices[h.ticker] = h.current_price;
      }
    });
    
    // Always override BTC with live fetched price (updated every 60s)
    prices['BTC'] = currentPrice;
    
    // For any tickers in transactions but not in holdings, use the transaction price as fallback
    allTransactions.forEach(tx => {
      if (tx.asset_ticker && !prices[tx.asset_ticker]) {
        prices[tx.asset_ticker] = tx.price_per_unit || 0;
      }
    });
    
    return prices;
  }, [holdings, currentPrice, allTransactions]);

  // Get taxable holdings only (exclude retirement accounts for harvest analysis)
  const taxableHoldings = holdings.filter(h => 
    h.tax_treatment === 'taxable' || 
    h.account_type === 'taxable' || 
    (!h.tax_treatment && !h.account_type)
  );
  const taxableHoldingTickers = new Set(taxableHoldings.map(h => h.ticker));

  // Helper to check if a transaction is in a taxable account
  const isTaxableTransaction = (tx) => {
    const accountType = tx.account_type || 'taxable';
    const taxAdvantaged = ['traditional_401k', 'roth_401k', 'traditional_ira', 'roth_ira', 'hsa', '529'];
    return !taxAdvantaged.includes(accountType);
  };

  // Build tax lots from buy transactions, accounting for sales
  // Only include transactions from TAXABLE accounts (exclude 401k, IRA, etc.)
  const taxLots = useMemo(() => {

    
    // Group by asset ticker to process each separately
    const allTickers = [...new Set(allTransactions.map(t => t.asset_ticker))];
    const allLots = [];
    
    for (const ticker of allTickers) {
      const buyTxs = allTransactions.filter(t => t.type === 'buy' && t.asset_ticker === ticker && isTaxableTransaction(t));
      
      // Sort buys by date
      const sortedBuys = [...buyTxs].sort((a, b) => new Date(a.date) - new Date(b.date));
      
      const tickerLots = sortedBuys.map(tx => {
      // Use remaining_quantity directly from DB - it's already updated by sell transactions
      const remainingQuantity = tx.remaining_quantity ?? tx.quantity ?? 0;
      const originalQuantity = tx.quantity || 0;
      

      
      // Get current price for this ticker
      const tickerPrice = pricesByTicker[ticker] || (tx.price_per_unit || 0);
      const currentValue = remainingQuantity * tickerPrice;
      const perUnitCost = tx.price_per_unit || 0;
      const costBasis = remainingQuantity * perUnitCost;
      const unrealizedGain = currentValue - costBasis;
      const txDate = tx.date ? new Date(tx.date) : new Date();
      const daysSincePurchase = isNaN(txDate.getTime()) ? 0 : differenceInDays(new Date(), txDate);
      const isLongTerm = daysSincePurchase > 365;

      // Get account type and tax treatment from the transaction itself first, then fall back to holding
      const holding = holdings.find(h => h.ticker === tx.asset_ticker && 
        (tx.account_id ? h.account_id === tx.account_id : true));
      const accountType = tx.account_type || holding?.account_type || 'taxable';
      const taxTreatment = getTaxTreatment(accountType);

      // Determine lot status
      const status = remainingQuantity <= 0 ? 'fully_sold' 
        : remainingQuantity < originalQuantity ? 'partially_sold' 
        : 'available';

        return {
          ...tx,
          originalQuantity,
          remainingQuantity,
          currentValue,
          costBasis,
          unrealizedGain,
          unrealizedGainPercent: costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0,
          isLongTerm,
          daysSincePurchase,
          accountType,
          taxTreatment,
          status,
        };
      }).filter(lot => lot.remainingQuantity > 0);
      
      allLots.push(...tickerLots);
    }
    

    
    return allLots;
  }, [allTransactions, pricesByTicker, holdings]);

  // Sort lots by different methods
  const sortLotsByMethod = (lots, method) => {
    switch (method) {
      case 'FIFO': return [...lots].sort((a, b) => new Date(a.date) - new Date(b.date));
      case 'LIFO': return [...lots].sort((a, b) => new Date(b.date) - new Date(a.date));
      case 'HIFO': return [...lots].sort((a, b) => (b.price_per_unit || 0) - (a.price_per_unit || 0));
      case 'LOFO': return [...lots].sort((a, b) => (a.price_per_unit || 0) - (b.price_per_unit || 0));
      default: return lots;
    }
  };

  // Calculate average cost basis across all lots
  const calculateAverageCostBasis = (lots) => {
    const totalQuantity = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
    const totalCost = lots.reduce((sum, lot) => sum + (lot.remainingQuantity * (lot.price_per_unit || 0)), 0);
    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  };

  // Calculate sale outcome for different methods
  const calculateSaleOutcome = (saleQty, salePricePerUnit, fee, method, selectedLots = [], specificLotQuantities = {}, assetTicker = 'BTC', accountId = null) => {
    const saleProceeds = (saleQty * salePricePerUnit) - (parseFloat(fee) || 0);
    let remainingQty = saleQty;
    let totalCostBasis = 0;
    let hasLongTerm = false;
    let hasShortTerm = false;
    const lotsUsed = [];

    // Filter lots by asset AND account (for sale form with account selector)
    // For sales, we need to get lots from ALL transactions, not just taxable
    const lotsForAsset = allTransactions
      .filter(tx => 
        tx.type === 'buy' &&
        tx.asset_ticker === assetTicker &&
        (!accountId || tx.account_id === accountId) &&
        (tx.remaining_quantity ?? tx.quantity) > 0
      )
      .map(tx => {
        const remainingQuantity = tx.remaining_quantity ?? tx.quantity ?? 0;
        const tickerPrice = pricesByTicker[assetTicker] || tx.price_per_unit || 0;
        const currentValue = remainingQuantity * tickerPrice;
        const costBasis = remainingQuantity * (tx.price_per_unit || 0);
        const unrealizedGain = currentValue - costBasis;
        const txDate = tx.date ? new Date(tx.date) : new Date();
        const daysSincePurchase = differenceInDays(new Date(), txDate);
        const isLongTerm = daysSincePurchase > 365;
        
        return {
          ...tx,
          remainingQuantity,
          currentValue,
          costBasis,
          unrealizedGain,
          isLongTerm,
          daysSincePurchase,
        };
      });

    // Handle Average Cost method
    if (method === 'AVG') {
      const avgCost = calculateAverageCostBasis(lotsForAsset);
      const totalAvailable = lotsForAsset.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
      
      if (saleQty <= totalAvailable) {
        totalCostBasis = saleQty * avgCost;
        // For avg cost, determine holding period based on weighted average of lots
        let longTermQty = 0;
        let shortTermQty = 0;
        lotsForAsset.forEach(lot => {
          if (lot.isLongTerm) longTermQty += lot.remainingQuantity;
          else shortTermQty += lot.remainingQuantity;
        });
        // Proportionally allocate the sale
        const longTermRatio = longTermQty / totalAvailable;
        hasLongTerm = longTermRatio > 0.5;
        hasShortTerm = longTermRatio <= 0.5;
        remainingQty = 0;
        
        // For avg cost, we don't track specific lots used, just the total
        lotsUsed.push({
          id: 'avg-cost',
          date: 'Various',
          price_per_unit: avgCost,
          remainingQuantity: saleQty,
          qtyUsed: saleQty,
          isLongTerm: hasLongTerm,
          isAvgCost: true,
        });
      }
    }
    // Handle Specific ID method with custom quantities per lot
    else if (method === 'SPECIFIC' && selectedLots.length > 0) {
      const lotsToUse = lotsForAsset.filter(l => selectedLots.includes(l.id));
      
      for (const lot of lotsToUse) {
        if (remainingQty <= 0) break;
        
        // Use specific quantity if provided, otherwise use as much as needed/available
        const specifiedQty = specificLotQuantities[lot.id];
        const qtyFromLot = specifiedQty !== undefined 
          ? Math.min(specifiedQty, lot.remainingQuantity, remainingQty)
          : Math.min(remainingQty, lot.remainingQuantity);
        
        if (qtyFromLot > 0) {
          totalCostBasis += qtyFromLot * (lot.price_per_unit || 0);
          if (lot.isLongTerm) hasLongTerm = true;
          else hasShortTerm = true;
          lotsUsed.push({ ...lot, qtyUsed: qtyFromLot });
          remainingQty -= qtyFromLot;
        }
      }
    }
    // Handle FIFO, LIFO, HIFO, LOFO
    else {
      const lotsToUse = sortLotsByMethod(lotsForAsset, method);

      for (const lot of lotsToUse) {
        if (remainingQty <= 0) break;
        const qtyFromLot = Math.min(remainingQty, lot.remainingQuantity);
        totalCostBasis += qtyFromLot * (lot.price_per_unit || 0);
        if (lot.isLongTerm) hasLongTerm = true;
        else hasShortTerm = true;
        lotsUsed.push({ ...lot, qtyUsed: qtyFromLot });
        remainingQty -= qtyFromLot;
      }
    }

    const realizedGain = saleProceeds - totalCostBasis;
    // If mixed, use short-term (more conservative)
    const holdingPeriod = hasShortTerm ? 'short_term' : (hasLongTerm ? 'long_term' : 'short_term');
    
    return {
      saleProceeds,
      totalCostBasis,
      realizedGain,
      holdingPeriod,
      lotsUsed,
      isComplete: remainingQty <= 0,
      avgCostBasis: method === 'AVG' ? calculateAverageCostBasis(taxLots) : null,
    };
  };

  // State for specific lot quantities
  const [specificLotQuantities, setSpecificLotQuantities] = useState({});

  // Get available assets from tax lots (for taxable accounts - still used for tax analysis)
  const availableAssets = useMemo(() => {
    const assetMap = new Map();
    
    taxLots
      .filter(lot => (lot.remainingQuantity || 0) > 0)
      .forEach(lot => {
        if (!assetMap.has(lot.asset_ticker)) {
          const holding = holdings.find(h => h.ticker === lot.asset_ticker);
          assetMap.set(lot.asset_ticker, {
            ticker: lot.asset_ticker,
            name: holding?.asset_name || lot.asset_ticker,
            totalQuantity: 0
          });
        }
        assetMap.get(lot.asset_ticker).totalQuantity += lot.remainingQuantity;
      });
    
    return Array.from(assetMap.values());
  }, [taxLots, holdings]);

  // Assets available for sale (ALL accounts, not just taxable)
  const saleEligibleAssets = useMemo(() => {
    const assetMap = new Map();
    
    allTransactions
      .filter(tx => tx.type === 'buy' && (tx.remaining_quantity ?? tx.quantity) > 0)
      .forEach(tx => {
        const key = `${tx.asset_ticker}|${tx.account_id || 'unassigned'}`;
        if (!assetMap.has(key)) {
          const holding = holdings.find(h => h.ticker === tx.asset_ticker && h.account_id === tx.account_id);
          assetMap.set(key, {
            ticker: tx.asset_ticker,
            name: holding?.asset_name || tx.asset_ticker,
            account_id: tx.account_id,
            totalRemaining: 0,
            lotCount: 0
          });
        }
        const asset = assetMap.get(key);
        asset.totalRemaining += (tx.remaining_quantity ?? tx.quantity);
        asset.lotCount++;
      });
    
    return Array.from(assetMap.values());
  }, [allTransactions, holdings]);

  // Fetch accounts for sale form
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  // Check if critical data is loading (after all queries defined)
  const isLoadingData = !allTransactions || !holdings || !userSettings || !accounts;

  // Calculate outcomes for all methods
  const saleOutcomes = useMemo(() => {
    if (!saleForm.quantity || !saleForm.price_per_unit || !saleForm.account_id) return null;
    const qty = Math.abs(parseFloat(saleForm.quantity)); // Always use positive quantity
    const price = parseFloat(saleForm.price_per_unit);
    const fee = parseFloat(saleForm.fee) || 0;
    const assetTicker = saleForm.asset_ticker;
    const accountId = saleForm.account_id;

    return {
      FIFO: calculateSaleOutcome(qty, price, fee, 'FIFO', [], {}, assetTicker, accountId),
      LIFO: calculateSaleOutcome(qty, price, fee, 'LIFO', [], {}, assetTicker, accountId),
      HIFO: calculateSaleOutcome(qty, price, fee, 'HIFO', [], {}, assetTicker, accountId),
      LOFO: calculateSaleOutcome(qty, price, fee, 'LOFO', [], {}, assetTicker, accountId),
      AVG: calculateSaleOutcome(qty, price, fee, 'AVG', [], {}, assetTicker, accountId),
      SPECIFIC: calculateSaleOutcome(qty, price, fee, 'SPECIFIC', saleForm.selected_lots, specificLotQuantities, assetTicker, accountId),
    };
  }, [saleForm.quantity, saleForm.price_per_unit, saleForm.fee, saleForm.asset_ticker, saleForm.account_id, saleForm.selected_lots, specificLotQuantities, allTransactions, pricesByTicker]);

  const handleSaleSubmit = (e) => {
    e.preventDefault();
    const outcome = saleOutcomes[saleForm.lot_method];
    
    if (!outcome || !outcome.isComplete) {
      return;
    }

    // Extract account_id from lots used
    const accountId = outcome.lotsUsed[0]?.account_id || null;
    
    // Prepare lots_used array for storage (critical for reversal)
    const lotsUsed = outcome.lotsUsed.map(lot => ({
      lot_id: lot.id,
      quantity_sold: lot.qtyUsed,
      cost_basis: lot.qtyUsed * (lot.price_per_unit || 0),
      price_per_unit: lot.price_per_unit,
      purchase_date: lot.date
    }));

    const transactionData = {
      type: 'sell',
      asset_ticker: saleForm.asset_ticker,
      quantity: Math.abs(parseFloat(saleForm.quantity)), // Always use positive quantity
      price_per_unit: parseFloat(saleForm.price_per_unit),
      date: saleForm.date,
      exchange_or_wallet: saleForm.exchange,
      account_id: saleForm.account_id,
      cost_basis: outcome.totalCostBasis,
      realized_gain_loss: outcome.realizedGain,
      holding_period: outcome.holdingPeriod,
      lots_used: lotsUsed,
      notes: `Method: ${saleForm.lot_method}. Fee: $${saleForm.fee || 0}`,
    };

    createTx.mutate(transactionData);
  };

  // Tax calculations - filtered by selected year
  const sellTxs = transactionsForTaxCalc.filter(t => t.type === 'sell');
  
  // Separate gains from losses for proper IRS netting
  const shortTermSales = sellTxs.filter(t => t.holding_period === 'short_term');
  const longTermSales = sellTxs.filter(t => t.holding_period === 'long_term');
  
  const shortTermGains = shortTermSales.filter(t => (t.realized_gain_loss || 0) >= 0).reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);
  const shortTermLosses = shortTermSales.filter(t => (t.realized_gain_loss || 0) < 0).reduce((sum, t) => sum + Math.abs(t.realized_gain_loss || 0), 0);
  const longTermGains = longTermSales.filter(t => (t.realized_gain_loss || 0) >= 0).reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);
  const longTermLosses = longTermSales.filter(t => (t.realized_gain_loss || 0) < 0).reduce((sum, t) => sum + Math.abs(t.realized_gain_loss || 0), 0);
  
  const netShortTerm = shortTermGains - shortTermLosses;
  const netLongTerm = longTermGains - longTermLosses;
  const totalRealized = netShortTerm + netLongTerm;
  
  // Total assets from taxable holdings (grouped by ticker)
  const totalAssetsByTicker = taxLots.reduce((acc, lot) => {
    if (!acc[lot.asset_ticker]) acc[lot.asset_ticker] = 0;
    acc[lot.asset_ticker] += lot.remainingQuantity;
    return acc;
  }, {});
  const totalBtcHeld = totalAssetsByTicker.BTC || 0;

  // Get brackets based on filing status and selected year
  const { brackets: currentBrackets, standardDeductions } = getTaxDataForYear(selectedYear);
  const yearBrackets = currentBrackets[filingStatus] || currentBrackets.single;

  const getLTCGRateForYear = (income) => {
    if (!yearBrackets?.ltcg) return 0.15;
    for (const bracket of yearBrackets.ltcg) {
      if (income <= bracket.max) return bracket.rate;
    }
    return 0.20;
  };

  const getSTCGRateForYear = (income) => {
    if (!yearBrackets?.income) return 0.24;
    for (const bracket of yearBrackets.income) {
      if (income <= bracket.max) return bracket.rate;
    }
    return 0.37;
  };

  const effectiveLTCGRate = getLTCGRateForYear(annualIncome);
  const effectiveSTCGRate = getSTCGRateForYear(annualIncome);
  
  // Calculate accurate state tax rates using full calculation functions
  const stateConfig = STATE_TAX_CONFIG[stateOfResidence];

  // Calculate effective state rates based on actual income using the proper functions
  const stateCapGainsResult = calculateStateCapitalGainsTax({
    longTermGains: 10000, // Use test amount to get effective rate
    shortTermGains: 0,
    otherIncome: annualIncome,
    filingStatus: filingStatus === 'married' ? 'married_filing_jointly' : filingStatus,
    state: stateOfResidence,
    year: selectedYear
  });

  const stateSTCGResult = calculateStateCapitalGainsTax({
    longTermGains: 0,
    shortTermGains: 10000, // Use test amount for STCG rate
    otherIncome: annualIncome,
    filingStatus: filingStatus === 'married' ? 'married_filing_jointly' : filingStatus,
    state: stateOfResidence,
    year: selectedYear
  });

  // Extract effective rates (tax on gains / gains amount)
  const effectiveStateLTCGRate = stateCapGainsResult.effectiveRate || 0;
  const effectiveStateSTCGRate = stateSTCGResult.effectiveRate || 0;

  const combinedSTCGRate = effectiveSTCGRate + effectiveStateSTCGRate;
  const combinedLTCGRate = effectiveLTCGRate + effectiveStateLTCGRate;

  // Keep stateRate for backward compatibility (use income rate)
  const stateRate = effectiveStateSTCGRate;
  
  // Standard deduction effectively increases the 0% LTCG bracket
  // Taxable income = Gross income - Standard deduction
  // So if gross income is $0, you can realize gains up to (standard deduction + 0% bracket max) at 0%
  const standardDeduction = standardDeductions[filingStatus];
  const taxableIncome = Math.max(0, annualIncome - standardDeduction);
  
  // 0% LTCG bracket room is based on taxable income, not gross income
  // If taxable income is below the 0% threshold, you have room
  const ltcgBracketRoom = yearBrackets?.ltcg?.[0]?.max ? Math.max(0, yearBrackets.ltcg[0].max - taxableIncome) : 0;
  const canHarvestGainsTaxFree = yearBrackets?.ltcg?.[0]?.max ? taxableIncome < yearBrackets.ltcg[0].max : false;

  const estimatedTax = (shortTermGains > 0 ? shortTermGains * combinedSTCGRate : 0) + (longTermGains > 0 ? longTermGains * combinedLTCGRate : 0);

  // Calculate ACTUAL tax savings from realized transactions (IRS rules)
  const calculateActualTaxSavings = () => {
    // Count gains harvested at 0% LTCG rate (those in 0% bracket)
    const gainsHarvestedAtZero = effectiveLTCGRate === 0 && netLongTerm > 0 
      ? Math.min(netLongTerm, ltcgBracketRoom) 
      : 0;
    
    let taxSavings = 0;
    let carryforwardLoss = 0;
    let taxOwed = 0;
    
    if (totalRealized < 0) {
      // NET LOSS SITUATION
      const netLoss = Math.abs(totalRealized);
      
      // Losses offset ordinary income (MAX $3,000/year)
      const lossesOffsettingIncome = Math.min(3000, netLoss);
      const savingsFromIncomeOffset = lossesOffsettingIncome * combinedSTCGRate;
      
      // Remaining losses carry forward
      carryforwardLoss = netLoss - lossesOffsettingIncome;
      
      taxSavings = savingsFromIncomeOffset;
      
    } else if (totalRealized > 0) {
      // NET GAIN SITUATION - calculate tax owed
      
      // If gains were harvested at 0% rate, that's a future savings
      const futureSavings = gainsHarvestedAtZero * (0.15 + stateRate); // Assume 15% future LTCG + state
      taxSavings = futureSavings;
      
      // Calculate tax owed on net gains
      if (netShortTerm > 0) {
        taxOwed += netShortTerm * combinedSTCGRate;
      }
      if (netLongTerm > 0) {
        taxOwed += netLongTerm * combinedLTCGRate;
      }
    }
    
    return {
      taxSavings,
      carryforwardLoss,
      taxOwed,
      isNetLoss: totalRealized < 0,
      isNetGain: totalRealized > 0,
    };
  };

  const actualTaxSavings = calculateActualTaxSavings();

  // Loss/Gain harvesting opportunities - only for taxable accounts
  // Filter to only include lots from taxable holdings (exclude tax-deferred and tax-free)
  const taxableLotsForHarvest = taxLots.filter(lot => {
    // Use the lot's tax treatment (already calculated in taxLots)
    return lot.taxTreatment === 'taxable';
  });
  
  const harvestLossOpportunities = taxableLotsForHarvest.filter(lot => lot.unrealizedGain < 0);
  const totalHarvestableLoss = harvestLossOpportunities.reduce((sum, lot) => sum + Math.abs(lot.unrealizedGain), 0);
  const gainHarvestOpportunities = taxableLotsForHarvest.filter(lot => lot.unrealizedGain > 0 && lot.isLongTerm);
  const totalHarvestableGain = gainHarvestOpportunities.reduce((sum, lot) => sum + lot.unrealizedGain, 0);
  const optimalGainHarvest = Math.min(totalHarvestableGain, ltcgBracketRoom);



  // Tax bracket visualization data - include all brackets up to 37%
  const bracketChartData = yearBrackets?.income ? yearBrackets.income.map(bracket => ({
    name: bracket.label,
    max: bracket.max === Infinity ? (filingStatus === 'married' ? 900000 : 800000) : bracket.max,
    rate: bracket.rate * 100,
    fill: annualIncome >= bracket.min && (bracket.max === Infinity || annualIncome < bracket.max) ? '#F7931A' : '#27272a',
  })) : [];

  // Calculate wash trade net benefit (tax savings minus trading fees)
  const calculateWashTradeAnalysis = (lots, feePercent = DEFAULT_ROUND_TRIP_FEE_PERCENT) => {
    // For loss harvesting
    const lossLots = lots.filter(lot => lot.unrealizedGain < 0);
    const totalLossValue = lossLots.reduce((sum, lot) => sum + lot.currentValue, 0);
    const totalHarvestableLoss = lossLots.reduce((sum, lot) => sum + Math.abs(lot.unrealizedGain), 0);
    const lossTradingFees = totalLossValue * 2 * (feePercent / 100); // Round trip
    const lossTaxSavings = totalHarvestableLoss * combinedSTCGRate; // Can offset short-term gains or $3k ordinary income (federal + state)
    const lossNetBenefit = lossTaxSavings - lossTradingFees;

    // For gain harvesting - separate by holding period
    const longTermGainLots = lots.filter(lot => lot.unrealizedGain > 0 && lot.isLongTerm);
    const shortTermGainLots = lots.filter(lot => lot.unrealizedGain > 0 && !lot.isLongTerm);
    
    const totalLongTermGains = longTermGainLots.reduce((sum, lot) => sum + lot.unrealizedGain, 0);
    const totalShortTermGains = shortTermGainLots.reduce((sum, lot) => sum + lot.unrealizedGain, 0);
    const totalLongTermValue = longTermGainLots.reduce((sum, lot) => sum + lot.currentValue, 0);
    const totalShortTermValue = shortTermGainLots.reduce((sum, lot) => sum + lot.currentValue, 0);
    
    // Calculate how much of each type fits in the 0% bracket room
    // Prioritize long-term gains first (already qualify for preferential rates)
    let remainingRoom = ltcgBracketRoom;
    let harvestedLongTermGains = 0;
    let harvestedShortTermGains = 0;
    
    if (totalLongTermGains > 0) {
      harvestedLongTermGains = Math.min(totalLongTermGains, remainingRoom);
      remainingRoom -= harvestedLongTermGains;
    }
    
    // Use remaining room for short-term gains if any
    if (totalShortTermGains > 0 && remainingRoom > 0) {
      harvestedShortTermGains = Math.min(totalShortTermGains, remainingRoom);
      remainingRoom -= harvestedShortTermGains;
    }
    
    const optimalGainHarvest = harvestedLongTermGains + harvestedShortTermGains;
    
    // Calculate value to sell for each category
    // Sort lots by gain% (highest first) to minimize value traded for given gain
    const calculateValueForGain = (gainLots, targetGain) => {
      if (targetGain <= 0) return 0;
      const sorted = [...gainLots].sort((a, b) => {
        const aGainPercent = a.unrealizedGain / a.currentValue;
        const bGainPercent = b.unrealizedGain / b.currentValue;
        return bGainPercent - aGainPercent;
      });
      return sorted.reduce((acc, lot) => {
        if (acc.remaining <= 0) return acc;
        const gainFromLot = Math.min(lot.unrealizedGain, acc.remaining);
        const valueRatio = gainFromLot / lot.unrealizedGain;
        return {
          remaining: acc.remaining - gainFromLot,
          value: acc.value + (lot.currentValue * valueRatio)
        };
      }, { remaining: targetGain, value: 0 }).value;
    };
    
    const longTermValueToSell = calculateValueForGain(longTermGainLots, harvestedLongTermGains);
    const shortTermValueToSell = calculateValueForGain(shortTermGainLots, harvestedShortTermGains);
    const optimalGainValue = longTermValueToSell + shortTermValueToSell;
    
    // Trading fees are based on the VALUE traded (round trip = sell + rebuy)
    const gainTradingFees = optimalGainValue * 2 * (feePercent / 100);
    
    // Calculate future LTCG rate based on expectedFutureIncome (when user will sell)
    const futureIncome = expectedFutureIncome || 80000;
    const futureStdDeduction = filingStatus === 'married' ? 32200 : 16100; // 2026 estimates
    const futureTaxableIncome = Math.max(0, futureIncome - futureStdDeduction);
    
    // Determine future federal LTCG rate based on expected taxable income
    const futureZeroBracketTop = filingStatus === 'married' ? 96700 : 48350;
    const futureFifteenBracketTop = filingStatus === 'married' ? 600050 : 533400;
    
    let futureFederalLTCGRate;
    if (futureTaxableIncome <= futureZeroBracketTop) {
      futureFederalLTCGRate = 0;
    } else if (futureTaxableIncome <= futureFifteenBracketTop) {
      futureFederalLTCGRate = 0.15;
    } else {
      futureFederalLTCGRate = 0.20;
    }
    
    // State LTCG rate (use actual state rate, not income-dependent)
    const futureStateLTCGRate = effectiveStateLTCGRate || 0.035;
    
    // Short-term future rates (if user holds ST gains, they'd be taxed at ordinary rates)
    const futureFederalSTCGRate = 0.22; // Mid-bracket assumption for ordinary income
    const futureStateSTCGRate = effectiveStateSTCGRate || 0.05;
    
    // Future tax rates for each category
    const longTermFutureTaxRate = futureFederalLTCGRate + futureStateLTCGRate;
    const shortTermFutureTaxRate = futureFederalSTCGRate + futureStateSTCGRate;
    
    // Calculate future tax saved based on actual lot composition
    const longTermTaxSaved = harvestedLongTermGains * longTermFutureTaxRate;
    const shortTermTaxSaved = harvestedShortTermGains * shortTermFutureTaxRate;
    const gainFutureTaxSavings = longTermTaxSaved + shortTermTaxSaved;
    
    const gainNetBenefit = canHarvestGainsTaxFree ? gainFutureTaxSavings - gainTradingFees : -gainTradingFees;

    return {
      loss: {
        totalValue: totalLossValue,
        harvestableLoss: totalHarvestableLoss,
        tradingFees: lossTradingFees,
        taxSavings: lossTaxSavings,
        netBenefit: lossNetBenefit,
        isWorthwhile: lossNetBenefit > 0,
        lots: lossLots,
      },
      gain: {
        totalValue: totalLongTermValue + totalShortTermValue,
        harvestableGain: totalLongTermGains + totalShortTermGains,
        optimalHarvest: optimalGainHarvest,
        optimalValue: optimalGainValue,
        tradingFees: gainTradingFees,
        futureTaxSavings: gainFutureTaxSavings,
        netBenefit: gainNetBenefit,
        isWorthwhile: gainNetBenefit > 0 && canHarvestGainsTaxFree,
        lots: [...longTermGainLots, ...shortTermGainLots],
        // Breakdown for display
        longTermGains: harvestedLongTermGains,
        shortTermGains: harvestedShortTermGains,
        longTermTaxSaved: longTermTaxSaved,
        shortTermTaxSaved: shortTermTaxSaved,
        longTermLotCount: longTermGainLots.length,
        shortTermLotCount: shortTermGainLots.length,
      },
    };
  };

  // Calculate all-in fee percentage (explicit fees + estimated spread) matching Fee Analysis
  const avgFeePercent = useMemo(() => {
    // Filter to BTC buy transactions only (same as Fee Analysis)
    const btcBuyTxs = allTransactions.filter(t => t.asset_ticker === 'BTC' && t.type === 'buy');
    if (btcBuyTxs.length === 0) return DEFAULT_ROUND_TRIP_FEE_PERCENT;
    
    // Exchange spread estimates (matching FeeAnalyzer component)
    const EXCHANGE_SPREADS = {
      coinbase: 0.5, coinbase_pro: 0.1, kraken: 0.1, gemini: 0.5, binance_us: 0.1,
      strike: 0.3, cash_app: 2.2, swan: 0.2, river: 0.25, robinhood: 0.5,
    };
    const DEFAULT_SPREAD = 0.5;
    
    const matchExchangeSpread = (exchangeName) => {
      if (!exchangeName) return DEFAULT_SPREAD;
      const normalized = exchangeName.toLowerCase().trim();
      for (const [key, spread] of Object.entries(EXCHANGE_SPREADS)) {
        if (normalized.includes(key.replace('_', ' ')) || normalized.includes(key)) {
          return spread;
        }
      }
      return DEFAULT_SPREAD;
    };
    
    let totalExplicitFees = 0;
    let totalSpreadCost = 0;
    let totalVolume = 0;
    
    btcBuyTxs.forEach(tx => {
      const txVolume = (tx.quantity || 0) * (tx.price_per_unit || 0);
      totalVolume += txVolume;
      totalExplicitFees += (tx.trading_fee || 0) + (tx.withdrawal_fee || 0) + (tx.deposit_fee || 0);
      
      // Estimate spread based on exchange
      const spreadRate = matchExchangeSpread(tx.exchange_or_wallet);
      totalSpreadCost += txVolume * (spreadRate / 100);
    });
    
    if (totalVolume === 0) return DEFAULT_ROUND_TRIP_FEE_PERCENT;
    
    // All-in cost = explicit fees + spread, as percentage
    // For round trip (sell + rebuy), multiply by 2
    const allInRate = ((totalExplicitFees + totalSpreadCost) / totalVolume) * 100;
    return allInRate * 2; // Round trip
  }, [allTransactions]);

  const washTradeAnalysis = useMemo(() => calculateWashTradeAnalysis(taxableLotsForHarvest, avgFeePercent), [taxableLotsForHarvest, avgFeePercent, combinedSTCGRate, ltcgBracketRoom, canHarvestGainsTaxFree, filingStatus, stateRate, expectedFutureIncome, effectiveStateLTCGRate, effectiveStateSTCGRate]);

  // Generate Form 8949 style report
  const generateTaxReport = () => {
    let report = `FORM 8949 - Sales and Other Dispositions of Capital Assets\n`;
    report += `Tax Year: ${new Date().getFullYear()}\n`;
    report += `Generated: ${format(new Date(), 'MMMM d, yyyy')}\n\n`;
    report += `${'='.repeat(80)}\n\n`;

    report += `SUMMARY\n`;
    report += `-`.repeat(40) + `\n`;
    report += `Short-Term Capital Gains/Losses: $${shortTermGains.toLocaleString()}\n`;
    report += `Long-Term Capital Gains/Losses: $${longTermGains.toLocaleString()}\n`;
    report += `Estimated Tax Liability: $${estimatedTax.toLocaleString()}\n\n`;

    report += `TRANSACTIONS\n`;
    report += `-`.repeat(40) + `\n`;
    report += `Date\t\tType\tQty\t\tProceeds\tCost Basis\tGain/Loss\tTerm\n`;
    
    sellTxs.forEach(tx => {
      report += `${tx.date}\tSELL\t${tx.quantity}\t\t$${(tx.total_value || 0).toLocaleString()}\t$${(tx.cost_basis || 0).toLocaleString()}\t$${(tx.realized_gain_loss || 0).toLocaleString()}\t${tx.holding_period === 'long_term' ? 'LT' : 'ST'}\n`;
    });

    return report;
  };

  const handleDownloadReport = () => {
    const report = generateTaxReport();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax-report-${new Date().getFullYear()}-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Show loading skeleton while data is being fetched
  if (isLoadingData) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Tax Strategy</h1>
          <p className="text-zinc-500 mt-1">Cost basis optimization and tax planning</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center justify-between sm:justify-start">
          <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
            <SelectTrigger className="w-24 sm:w-32 bg-zinc-900 border-zinc-700 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {availableYears.length > 0 ? (
                availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))
              ) : (
                <SelectItem value={new Date().getFullYear().toString()}>{new Date().getFullYear()}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            size="sm"
            onClick={async () => {
              setExportingYear(true);
              try {
                const response = await base44.functions.invoke('exportForm8949', { year: selectedYear });
                const blob = new Blob([response.data], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Form8949_${selectedYear}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
              } catch (error) {
                console.error('Export error:', error);
              } finally {
                setExportingYear(false);
              }
            }}
            disabled={exportingYear}
            className="bg-transparent border-zinc-700 text-sm"
          >
            <Download className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">{exportingYear ? 'Exporting...' : 'Export 8949'}</span>
            <span className="sm:hidden">8949</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCsvImportOpen(true)} className="bg-transparent border-zinc-700 text-sm">
            <Upload className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={reconstructBuyTransactions}
            disabled={isReconstructing}
            className="bg-transparent border-zinc-700 text-sm"
          >
            {isReconstructing ? <Loader2 className="w-4 h-4 mr-1 sm:mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1 sm:mr-2" />}
            <span className="hidden sm:inline">{isReconstructing ? 'Reconstructing...' : 'Reconstruct Buys'}</span>
            <span className="sm:hidden">Fix</span>
          </Button>
          <Button onClick={() => setSaleFormOpen(true)} size="sm" className="brand-gradient text-white font-semibold shadow-lg shadow-orange-500/20 text-sm">
            <Calculator className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Record Sale</span>
            <span className="sm:hidden">Sell</span>
          </Button>
          <Button onClick={() => { setEditingTx(null); resetForm(); setFormOpen(true); }} size="sm" variant="outline" className="border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-sm">
            <Plus className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Add Buy</span>
            <span className="sm:hidden">Buy</span>
          </Button>
        </div>
      </div>

      {/* Tax Settings */}
      <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Tax Planning Settings</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger><Info className="w-4 h-4 text-zinc-500" /></TooltipTrigger>
                <TooltipContent className="max-w-xs bg-zinc-800 border-zinc-700">
                  <p>Set your income and filing status to calculate tax brackets and find optimization opportunities.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {/* Filing Status Toggle */}
          <div className="flex items-center gap-2 p-1 rounded-lg bg-zinc-800/50">
            <button
              onClick={() => setFilingStatus('single')}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                filingStatus === 'single' 
                  ? "bg-orange-500/20 text-orange-400" 
                  : "text-zinc-400 hover:text-zinc-300"
              )}
            >
              Single
            </button>
            <button
              onClick={() => setFilingStatus('married')}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                filingStatus === 'married' 
                  ? "bg-orange-500/20 text-orange-400" 
                  : "text-zinc-400 hover:text-zinc-300"
              )}
            >
              Married Filing Jointly
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Income Sliders */}
          <div className="space-y-4">
            {/* Current Income */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-zinc-300 text-sm">Household Taxable Income</Label>
                <span className="text-orange-400 font-semibold">${annualIncome.toLocaleString()}</span>
              </div>
              <Slider value={[annualIncome]} onValueChange={([v]) => setAnnualIncome(v)} min={0} max={1000000} step={5000} />
              <p className="text-xs text-zinc-500">{filingStatus === 'married' ? 'Combined household income' : 'Your individual income'}</p>
            </div>
            
            {/* Future Income */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Label className="text-zinc-300 text-sm">Expected Taxable Income (Year of Sale)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Enter your expected taxable income for the year you'll sell. This determines what tax rate you're avoiding by harvesting now. If selling during retirement, estimate your taxable withdrawals + Social Security.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-400 font-semibold">${(expectedFutureIncome ?? annualIncome).toLocaleString()}</span>
                  <span className="text-xs text-zinc-500">→ {(() => {
                    const futureIncome = expectedFutureIncome ?? annualIncome;
                    const futureStdDeduction = filingStatus === 'married' ? 32200 : 16100;
                    const futureTaxableIncome = Math.max(0, futureIncome - futureStdDeduction);
                    const futureZeroBracketTop = filingStatus === 'married' ? 96700 : 48350;
                    const futureFifteenBracketTop = filingStatus === 'married' ? 600050 : 533400;
                    
                    if (futureTaxableIncome <= futureZeroBracketTop) return '0% LTCG';
                    if (futureTaxableIncome <= futureFifteenBracketTop) return '15% LTCG';
                    return '20% LTCG';
                  })()}</span>
                </div>
              </div>
              <Slider value={[expectedFutureIncome ?? annualIncome]} onValueChange={([v]) => setExpectedFutureIncome(v)} min={0} max={500000} step={5000} />
              <p className="text-xs text-zinc-500">Your taxable income in the year you plan to sell these assets</p>
            </div>

            {/* State of Residence */}
            <div className="space-y-2 pt-2">
              <Label className="text-zinc-300 text-sm">State of Residence</Label>
              <Select value={stateOfResidence} onValueChange={setStateOfResidence}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 max-h-64">
                  {getStateOptions().map(state => (
                    <SelectItem key={state.value} value={state.value}>
                      {state.label} — {state.taxInfo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {STATE_TAX_CONFIG[stateOfResidence] && getStateTaxSummary(stateOfResidence)?.details.length > 0 && (
                <p className="text-xs text-zinc-500">
                  {getStateTaxSummary(stateOfResidence).details.join(' • ')}
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Tax Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-zinc-800/30">
              <p className="text-sm text-zinc-300 mb-2">Your Tax Brackets ({filingStatus === 'married' ? 'MFJ' : 'Single'})</p>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Short-term (Fed + {stateOfResidence}):</span>
                  <span className={combinedSTCGRate <= 0.12 ? "text-emerald-400" : "text-zinc-200"}>
                    {(combinedSTCGRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Long-term (Fed + {stateOfResidence}):</span>
                  <span className={effectiveLTCGRate === 0 && effectiveStateLTCGRate === 0 ? "text-emerald-400 font-semibold" : "text-zinc-200"}>
                    {effectiveLTCGRate === 0 && effectiveStateLTCGRate === 0 ? '0% ✓' : `${(combinedLTCGRate * 100).toFixed(1)}%`}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-800/30">
              <p className="text-sm text-zinc-300 mb-2">0% LTCG Bracket Room</p>
              <p className="text-2xl font-bold text-emerald-400">${ltcgBracketRoom.toLocaleString()}</p>
              <Progress value={yearBrackets?.ltcg?.[0]?.max ? (taxableIncome / yearBrackets.ltcg[0].max) * 100 : 0} className="h-2 mt-2 bg-zinc-700" />
              <p className="text-xs text-zinc-500 mt-1">
                Taxable income: ${taxableIncome.toLocaleString()} (after ${standardDeduction.toLocaleString()} std deduction)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards - NO DUPLICATE CARDS HERE */}

      {/* Summary Cards - Mobile Optimized */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">{selectedYear} Realized Short-Term</span>
            <div className={cn("p-1.5 rounded-lg", netShortTerm >= 0 ? "bg-emerald-400/10" : "bg-rose-400/10")}>
              {netShortTerm >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
            </div>
          </div>
          <p className={cn("text-2xl lg:text-3xl font-bold", netShortTerm >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {netShortTerm >= 0 ? '+' : '-'}${Math.round(Math.abs(netShortTerm)).toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 mt-1">{netShortTerm === 0 ? 'No ST sales' : `Taxed at ${(effectiveSTCGRate * 100).toFixed(0)}%`}</p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">{selectedYear} Realized Long-Term</span>
            <div className={cn("p-1.5 rounded-lg", netLongTerm >= 0 ? "bg-emerald-400/10" : "bg-rose-400/10")}>
              {netLongTerm >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
            </div>
          </div>
          <p className={cn("text-2xl font-bold", netLongTerm >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {netLongTerm >= 0 ? '+' : ''}${Math.round(Math.abs(netLongTerm)).toLocaleString()}
          </p>
          <p className={cn("text-xs mt-1", netLongTerm === 0 ? "text-zinc-500" : effectiveLTCGRate === 0 ? "text-emerald-400" : "text-zinc-500")}>
            {netLongTerm === 0 ? 'No LT sales' : effectiveLTCGRate === 0 ? '0% TAX!' : `Taxed at ${(effectiveLTCGRate * 100).toFixed(0)}%`}
          </p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Estimated Tax</span>
            <div className="p-1.5 rounded-lg bg-orange-400/10">
              <Receipt className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-orange-400">${estimatedTax.toLocaleString()}</p>
          <p className="text-xs text-zinc-500 mt-1">For {selectedYear}</p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Tax Savings This Year</span>
            <div className="p-1.5 rounded-lg bg-emerald-400/10">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            +${Math.round(actualTaxSavings.taxSavings).toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {actualTaxSavings.isNetLoss ? `From realized losses (Fed + ${stateOfResidence})` : 'From 0% harvesting'}
          </p>
          {actualTaxSavings.carryforwardLoss > 0 && (
            <p className="text-xs text-amber-400 mt-1">
              +${Math.round(actualTaxSavings.carryforwardLoss).toLocaleString()} loss carryforward
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1 flex-wrap">
          <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-700">Overview</TabsTrigger>
          <TabsTrigger value="lots" className="data-[state=active]:bg-zinc-700">Tax Lots</TabsTrigger>
          <TabsTrigger value="transactions" className="data-[state=active]:bg-zinc-700">Transactions</TabsTrigger>
          <TabsTrigger value="harvest-loss" className="data-[state=active]:bg-zinc-700">Loss Harvest</TabsTrigger>
          <TabsTrigger value="harvest-gain" className="data-[state=active]:bg-zinc-700">
            Gain Harvest
            {canHarvestGainsTaxFree && gainHarvestOpportunities.length > 0 && <span className="ml-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Tax-Free Gain Harvesting Card */}
          {canHarvestGainsTaxFree && gainHarvestOpportunities.length > 0 && (
            <div className={cn(
              "card-premium rounded-2xl p-6 border",
              washTradeAnalysis.gain.isWorthwhile ? "border-emerald-400/30 bg-emerald-400/5" : "border-zinc-800/50"
            )}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className={cn("font-semibold text-lg", washTradeAnalysis.gain.isWorthwhile ? "text-emerald-400" : "text-zinc-300")}>
                  Tax-Free Gain Harvesting {washTradeAnalysis.gain.isWorthwhile && 'Available!'}
                </h3>
              </div>
              
              <p className="text-zinc-400 text-sm mb-4">
                {washTradeAnalysis.gain.isWorthwhile 
                  ? 'Your income qualifies for 0% LTCG. Sell and rebuy to raise cost basis and avoid future 15% tax.'
                  : 'Fees currently exceed tax savings. Consider lower-fee exchanges or waiting for larger gains.'}
              </p>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-zinc-500">Room in 0% Bracket</p>
                  <p className="text-emerald-400 font-semibold text-lg">${ltcgBracketRoom.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Optimal Harvest</p>
                  <p className="text-orange-400 font-semibold text-lg">${washTradeAnalysis.gain.optimalHarvest.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Est. Fees (sell + rebuy)</p>
                  <p className="text-amber-400 font-semibold text-lg">-${washTradeAnalysis.gain.tradingFees.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Net Benefit</p>
                  <p className={cn("font-semibold text-lg", washTradeAnalysis.gain.isWorthwhile ? "text-emerald-400" : "text-rose-400")}>
                    {washTradeAnalysis.gain.netBenefit >= 0 ? '+' : ''}${washTradeAnalysis.gain.netBenefit.toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end mt-4">
                <Button onClick={() => setActiveTab('harvest-gain')} variant="outline" size="sm" className="bg-transparent border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10">
                  View Details →
                </Button>
              </div>
            </div>
          )}

          {/* Tax Loss Harvesting Card */}
          {harvestLossOpportunities.length > 0 && (
            <div className={cn(
              "card-premium rounded-2xl p-6 border",
              washTradeAnalysis.loss.isWorthwhile ? "border-rose-400/30 bg-rose-400/5" : "border-zinc-800/50"
            )}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-rose-400" />
                <h3 className={cn("font-semibold text-lg", washTradeAnalysis.loss.isWorthwhile ? "text-rose-400" : "text-zinc-300")}>
                  Tax Loss Harvesting {washTradeAnalysis.loss.isWorthwhile && 'Available!'}
                </h3>
              </div>
              
              <p className="text-zinc-400 text-sm mb-4">
                {washTradeAnalysis.loss.isWorthwhile 
                  ? 'Harvest losses to offset gains or reduce taxable income by up to $3,000/year.'
                  : 'Fees currently exceed tax savings at your rate. Consider lower-fee exchanges or waiting for larger losses.'}
              </p>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-zinc-500">Harvestable Losses</p>
                  <p className="text-rose-400 font-semibold text-lg">-${washTradeAnalysis.loss.harvestableLoss.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Tax Savings ({(effectiveSTCGRate * 100).toFixed(0)}%)</p>
                  <p className="text-emerald-400 font-semibold text-lg">+${washTradeAnalysis.loss.taxSavings.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Est. Fees (sell + rebuy)</p>
                  <p className="text-amber-400 font-semibold text-lg">-${washTradeAnalysis.loss.tradingFees.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Net Benefit</p>
                  <p className={cn("font-semibold text-lg", washTradeAnalysis.loss.isWorthwhile ? "text-emerald-400" : "text-rose-400")}>
                    {washTradeAnalysis.loss.netBenefit >= 0 ? '+' : ''}${washTradeAnalysis.loss.netBenefit.toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end mt-4">
                <Button onClick={() => setActiveTab('harvest-loss')} variant="outline" size="sm" className="bg-transparent border-rose-500/50 text-rose-400 hover:bg-rose-500/10">
                  View Details →
                </Button>
              </div>
            </div>
          )}

          {/* No harvesting opportunities message */}
          {!canHarvestGainsTaxFree && !washTradeAnalysis.loss.isWorthwhile && harvestLossOpportunities.length === 0 && gainHarvestOpportunities.length === 0 && (
            <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
              <p className="text-center text-zinc-400">
                No harvesting opportunities right now. Check back after market moves or income changes.
              </p>
              <p className="text-center text-zinc-500 text-sm mt-2">
                {taxLots.length} lots across {Object.keys(totalAssetsByTicker).length} assets
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tax Bracket Chart */}
            <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
              <h3 className="font-semibold mb-4">Income Tax Brackets ({selectedYear})</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bracketChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000)}k`} />
                    <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={12} width={40} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                      formatter={(value) => [`$${value.toLocaleString()}`, 'Bracket Max']}
                    />
                    <Bar dataKey="max" radius={[0, 4, 4, 0]}>
                      {bracketChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-zinc-500 mt-2">Your current bracket is highlighted in orange</p>
            </div>

            {/* Year Summary */}
            <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
              <h3 className="font-semibold mb-4">{selectedYear} Summary</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/30">
                  <span className="text-zinc-400">{totalRealized >= 0 ? 'Total Realized Gains' : 'Total Realized Losses'}</span>
                  <span className={cn("font-semibold", totalRealized >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {totalRealized >= 0 ? '' : '-'}${Math.abs(totalRealized).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/30">
                  <span className="text-zinc-400">Total Sales</span>
                  <span className="font-semibold text-zinc-200">{sellTxs.length}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/30">
                  <span className="text-zinc-400">Harvestable Losses</span>
                  <span className="font-semibold text-rose-400">-${totalHarvestableLoss.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/30">
                  <span className="text-zinc-400">Harvestable Gains (LT)</span>
                  <span className="font-semibold text-emerald-400">+${totalHarvestableGain.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lot Method Comparison - Dropdown */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-2">Tax Lot Selection Method</h3>
            <p className="text-sm text-zinc-500 mb-4">Select your preferred method for projections and tax calculations</p>
            <div className="space-y-2">
              <Label className="text-zinc-400">Cost Basis Method</Label>
              <Select value={costBasisMethod} onValueChange={setCostBasisMethod}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="FIFO">FIFO - First in, first out</SelectItem>
                  <SelectItem value="LIFO">LIFO - Last in, first out</SelectItem>
                  <SelectItem value="HIFO">HIFO - Highest cost first (Recommended)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500 mt-1">
                {costBasisMethod === 'FIFO' && 'Sells oldest lots first'}
                {costBasisMethod === 'LIFO' && 'Sells newest lots first'}
                {costBasisMethod === 'HIFO' && 'Sells highest cost lots first - minimizes gains'}
              </p>
            </div>
            <p className="text-xs text-zinc-600 mt-4">This method will be used in retirement projections and scenario comparisons.</p>
          </div>
        </TabsContent>

        {/* Tax Lots Tab */}
        <TabsContent value="lots">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <h3 className="font-semibold">Tax Lots (Unrealized)</h3>
                <p className="text-sm text-zinc-500">{taxLots.length} taxable lots across {Object.keys(totalAssetsByTicker).length} assets</p>
              </div>
              <div className="flex gap-2">
                <Select value={lotStatusFilter} onValueChange={setLotStatusFilter}>
                  <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="all">All Lots</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="partial">Partially Used</SelectItem>
                    <SelectItem value="used">Fully Used</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={lotSortOrder} onValueChange={setLotSortOrder}>
                  <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="asc">Oldest First</SelectItem>
                    <SelectItem value="desc">Newest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {taxLots.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No Tax Lots"
                description="Add buy transactions to track your cost basis"
              />
            ) : (
              <div className="space-y-3">
                {(() => {
                  const filtered = [...taxLots].filter((lot) => {
                    switch (lotStatusFilter) {
                      case 'available':
                        return (lot.status === 'available' || !lot.status) && (lot.remainingQuantity ?? lot.quantity) > 0;
                      case 'partial':
                        return lot.status === 'partially_sold' || 
                          (lot.remainingQuantity !== undefined && lot.remainingQuantity > 0 && lot.remainingQuantity < lot.quantity);
                      case 'used':
                        return lot.status === 'fully_sold' || lot.remainingQuantity === 0 || 
                          (lot.remainingQuantity !== undefined && lot.remainingQuantity <= 0);
                      default:
                        return true;
                    }
                  });

                  return filtered.sort((a, b) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return lotSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
                  }).map((lot) => {
                    const accountLabels = {
                      taxable: 'Taxable',
                      traditional_401k: '401(k)',
                      roth_401k: 'Roth 401(k)',
                      traditional_ira: 'Trad IRA',
                      roth_ira: 'Roth IRA',
                      hsa: 'HSA',
                      '529': '529',
                    };
                    const taxTreatmentLabels = {
                      taxable: 'Taxable',
                      tax_deferred: 'Tax-Deferred',
                      tax_free: 'Tax-Free',
                    };
                    const isTaxable = lot.taxTreatment === 'taxable';
                    
                    const holding = holdings.find(h => h.ticker === lot.asset_ticker);
                    const isCrypto = holding?.asset_type === 'crypto' || COINGECKO_IDS[lot.asset_ticker];
                    const displayQty = isCrypto ? lot.remainingQuantity.toFixed(8) : lot.remainingQuantity.toFixed(2);
                    const isFullyUsed = lot.status === 'fully_sold' || lot.remainingQuantity === 0;

                    return (
                  <div key={lot.id} className={cn("p-4 rounded-xl border", 
                    isFullyUsed ? "bg-rose-900/10 border-rose-500/20 opacity-50" : "bg-zinc-800/30 border-zinc-800"
                  )}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          {/* Quantity display with remaining */}
                          {lot.remainingQuantity !== lot.originalQuantity ? (
                            <div className="flex items-baseline gap-1.5">
                              <p className="font-medium text-lg">{displayQty} {lot.asset_ticker}</p>
                              <span className="text-xs text-zinc-500">/ {(() => {
                                const isCrypto = holding?.asset_type === 'crypto' || COINGECKO_IDS[lot.asset_ticker];
                                return isCrypto ? lot.originalQuantity.toFixed(8) : lot.originalQuantity.toFixed(2);
                              })()}</span>
                              <span className="text-xs text-amber-400 ml-1">
                                ({((lot.remainingQuantity / lot.originalQuantity) * 100).toFixed(1)}% left)
                              </span>
                            </div>
                          ) : (
                            <p className="font-medium text-lg">{displayQty} {lot.asset_ticker}</p>
                          )}

                          {/* Status badge */}
                          <Badge className={cn("text-xs border-0", 
                            isFullyUsed ? 'bg-rose-500/20 text-rose-400' :
                            lot.status === 'partially_sold' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          )}>
                            {isFullyUsed ? 'Used' :
                             lot.status === 'partially_sold' ? 'Partial' :
                             'Available'}
                          </Badge>

                          <Badge variant="outline" className={cn("text-xs", lot.isLongTerm ? 'border-emerald-400/50 text-emerald-400' : 'border-amber-400/50 text-amber-400')}>
                            {lot.isLongTerm ? 'Long-term' : `${lot.daysSincePurchase}d`}
                          </Badge>
                          <Badge variant="outline" className={cn("text-xs", isTaxable ? 'border-orange-400/50 text-orange-400' : 'border-purple-400/50 text-purple-400')}>
                            {accountLabels[lot.accountType] || 'Taxable'}
                          </Badge>
                          {accountLabels[lot.accountType] !== taxTreatmentLabels[lot.taxTreatment] && (
                            <Badge variant="outline" className={cn("text-xs", 
                              lot.taxTreatment === 'taxable' ? 'border-orange-400/50 text-orange-400' : 
                              lot.taxTreatment === 'tax_deferred' ? 'border-amber-400/50 text-amber-400' : 
                              'border-emerald-400/50 text-emerald-400')}>
                              {taxTreatmentLabels[lot.taxTreatment] || 'Taxable'}
                            </Badge>
                          )}
                          {lot.isLongTerm && lot.unrealizedGain > 0 && canHarvestGainsTaxFree && isTaxable && (
                            <Badge className="bg-emerald-400/20 text-emerald-400 border-0">0% Tax Eligible</Badge>
                          )}
                        </div>

                        {/* Progress bar for partially sold lots */}
                        {lot.status === 'partially_sold' && (
                          <div className="w-full max-w-xs mb-2">
                            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-amber-400 transition-all"
                                style={{ width: `${(lot.remainingQuantity / lot.originalQuantity) * 100}%` }}
                              />
                            </div>
                            </div>
                            )}
                            </div>
                      {!isFullyUsed && (
                        <div className="text-right">
                          <p className={cn("text-lg font-bold", lot.unrealizedGain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {lot.unrealizedGain >= 0 ? '+' : ''}{(lot.unrealizedGainPercent || 0).toFixed(1)}%
                          </p>
                          <p className="text-sm text-zinc-500">{lot.unrealizedGain >= 0 ? '+' : ''}${(lot.unrealizedGain || 0).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    {!isFullyUsed && (
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-zinc-500">Cost Basis</p>
                          <p className="font-medium">${(lot.costBasis || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Current Value</p>
                          <p className="font-medium">${(lot.currentValue || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Per BTC Cost</p>
                          <p className="font-medium">${(lot.price_per_unit || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    )}
                  </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold">Transaction History</h3>
                {selectedTxIds.length > 0 && (
                  <Badge className="bg-orange-500/20 text-orange-400">{selectedTxIds.length} selected</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
                  <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="all">All Assets</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="stocks">Stocks</SelectItem>
                    <SelectItem value="real_estate">Real Estate</SelectItem>
                    <SelectItem value="bonds">Bonds</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {selectedTxIds.length > 0 && (
                  <>
                    <Select value={bulkAccountType} onValueChange={setBulkAccountType}>
                      <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 h-9 text-sm">
                        <SelectValue placeholder="Account Type" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="taxable">Taxable</SelectItem>
                        <SelectItem value="traditional_401k">401(k)</SelectItem>
                        <SelectItem value="roth_401k">Roth 401(k)</SelectItem>
                        <SelectItem value="traditional_ira">Trad IRA</SelectItem>
                        <SelectItem value="roth_ira">Roth IRA</SelectItem>
                        <SelectItem value="hsa">HSA</SelectItem>
                        <SelectItem value="529">529</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => bulkUpdateAccountType.mutate({ ids: selectedTxIds, accountType: bulkAccountType })}
                      disabled={bulkUpdateAccountType.isPending}
                      className="bg-transparent border-zinc-700 h-9"
                    >
                      {bulkUpdateAccountType.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
                      Set Type
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        if (selectedTxIds.length > 0 && window.confirm(`Delete ${selectedTxIds.length} transactions?`)) {
                          bulkDeleteTx.mutate([...selectedTxIds]);
                        }
                      }}
                      disabled={bulkDeleteTx.isPending || selectedTxIds.length === 0}
                      className="bg-transparent border-rose-600/50 text-rose-400 hover:bg-rose-600/20 h-9"
                    >
                      {bulkDeleteTx.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                      Delete ({selectedTxIds.length})
                    </Button>
                  </>
                )}
                <Select value={txSortOrder} onValueChange={setTxSortOrder}>
                  <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="desc">Newest First</SelectItem>
                    <SelectItem value="asc">Oldest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Select All */}
            {allTransactions.length > 0 && (
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
                <input
                  type="checkbox"
                  checked={selectedTxIds.length === allTransactions.length && allTransactions.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800"
                />
                <span className="text-sm text-zinc-400">Select all ({allTransactions.length})</span>
              </div>
            )}
            {allTransactions.length === 0 ? (
              <EmptyState
                icon={Plus}
                title="No Transactions"
                description="Record buys and sells to track cost basis and tax impact"
                actionText="Add Transaction"
                onAction={() => { resetForm(); setFormOpen(true); }}
              />
            ) : (
              <div className="space-y-3">
                {[...allTransactions]
                  .filter(tx => {
                    if (assetTypeFilter === 'all') return true;
                    const holding = holdings.find(h => h.ticker === tx.asset_ticker);
                    const assetType = holding?.asset_type || (COINGECKO_IDS[tx.asset_ticker] ? 'crypto' : 'stocks');
                    return assetType === assetTypeFilter;
                  })
                  .sort((a, b) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return txSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
                  })
                  .map((tx) => {
                  const holding = holdings.find(h => h.ticker === tx.asset_ticker);
                  const accountType = tx.account_type || holding?.account_type || 'taxable';
                  const taxTreatment = getTaxTreatment(accountType);
                  const accountLabels = {
                    taxable: 'Taxable',
                    traditional_401k: '401(k)',
                    roth_401k: 'Roth 401(k)',
                    traditional_ira: 'Trad IRA',
                    roth_ira: 'Roth IRA',
                    hsa: 'HSA',
                    '529': '529',
                  };
                  const taxTreatmentLabels = {
                    taxable: 'Taxable',
                    tax_deferred: 'Tax-Deferred',
                    tax_free: 'Tax-Free',
                  };
                  const isTaxable = taxTreatment === 'taxable';
                  
                  return (
                  <div key={tx.id} className={cn(
                    "flex items-center justify-between p-4 rounded-xl hover:bg-zinc-800/50 transition-colors border",
                    selectedTxIds.includes(tx.id) ? "bg-orange-500/10 border-orange-500/30" : "bg-zinc-800/30 border-zinc-800"
                  )}>
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selectedTxIds.includes(tx.id)}
                        onChange={() => toggleSelectTx(tx.id)}
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800"
                      />
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", tx.type === 'buy' ? 'bg-emerald-400/10' : 'bg-rose-400/10')}>
                        {tx.type === 'buy' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-rose-400" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">
                            {tx.type === 'buy' ? 'Bought' : 'Sold'} {(() => {
                              const holding = holdings.find(h => h.ticker === tx.asset_ticker);
                              const assetName = holding?.asset_name || tx.asset_ticker;
                              const qty = tx.quantity || 0;
                              
                              // Format based on asset type
                              if (holding?.asset_type === 'real_estate') {
                                return assetName; // Just the name, no quantity (e.g., "Bought Home")
                              } else if (holding?.asset_type === 'crypto' || COINGECKO_IDS[tx.asset_ticker]) {
                                return `${qty.toFixed(qty < 1 ? 8 : 2)} ${tx.asset_ticker}`; // Crypto precision
                              } else {
                                return `${qty} ${assetName !== tx.asset_ticker ? assetName : `shares of ${tx.asset_ticker}`}`; // Stocks
                              }
                            })()}
                          </p>
                          {tx.holding_period && tx.type === 'sell' && (
                            <Badge variant="outline" className={cn("text-xs", tx.holding_period === 'long_term' ? 'border-emerald-400/50 text-emerald-400' : 'border-amber-400/50 text-amber-400')}>
                              {tx.holding_period === 'long_term' ? 'Long-term' : 'Short-term'}
                            </Badge>
                          )}
                          <Badge variant="outline" className={cn("text-xs", isTaxable ? 'border-orange-400/50 text-orange-400' : 'border-purple-400/50 text-purple-400')}>
                            {accountLabels[accountType] || 'Taxable'}
                          </Badge>
                          {accountLabels[accountType] !== taxTreatmentLabels[taxTreatment] && (
                            <Badge variant="outline" className={cn("text-xs", 
                              taxTreatment === 'taxable' ? 'border-orange-400/50 text-orange-400' : 
                              taxTreatment === 'tax_deferred' ? 'border-amber-400/50 text-amber-400' : 
                              'border-emerald-400/50 text-emerald-400')}>
                              {taxTreatmentLabels[taxTreatment] || 'Taxable'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-zinc-500">
                          @ ${(tx.price_per_unit || 0).toLocaleString()} • {tx.date ? format(new Date(tx.date), 'MMM d, yyyy') : 'No date'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">${(tx.total_value || 0).toLocaleString()}</p>
                        {tx.type === 'sell' && tx.realized_gain_loss !== undefined && (
                          <p className={cn("text-sm font-medium", (tx.realized_gain_loss || 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {(tx.realized_gain_loss || 0) >= 0 ? '+' : ''}{(tx.realized_gain_loss || 0).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => { setEditingTx(tx); setFormOpen(true); }} 
                          className="p-1.5 rounded-lg hover:bg-zinc-700 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                          aria-label={`Edit transaction for ${tx.asset_ticker}`}
                        >
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button 
                          onClick={() => { setItemToDelete({ type: 'transaction', item: tx }); setDeleteConfirmOpen(true); }} 
                          className="p-1.5 rounded-lg hover:bg-rose-600/50 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
                          aria-label={`Delete transaction for ${tx.asset_ticker}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                      </div>
                    </div>
                    </div>
                    );
                    })}
                    </div>
                    )}
                    </div>
                    </TabsContent>

        {/* Loss Harvest Tab */}
        <TabsContent value="harvest-loss">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold mb-2">Tax Loss Harvesting</h3>
                <p className="text-sm text-zinc-400">Sell taxable lots at a loss to offset gains. Watch for wash sales (30-day rule)!</p>
              </div>
              <Select value={lotStatusFilter} onValueChange={setLotStatusFilter}>
                <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="all">All Lots</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {harvestLossOpportunities.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50 mb-6">
                <div>
                  <p className="text-sm text-zinc-400">Harvestable Losses</p>
                  <p className="text-xl font-bold text-rose-400">-${washTradeAnalysis.loss.harvestableLoss.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Tax Savings ({(effectiveSTCGRate * 100).toFixed(0)}% rate)</p>
                  <p className="text-xl font-bold text-emerald-400">+${washTradeAnalysis.loss.taxSavings.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Est. Fees (sell + rebuy)</p>
                  <p className="text-xl font-bold text-amber-400">-${washTradeAnalysis.loss.tradingFees.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500">{avgFeePercent.toFixed(1)}% round trip</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Net Benefit</p>
                  <p className={cn("text-xl font-bold", washTradeAnalysis.loss.isWorthwhile ? "text-emerald-400" : "text-rose-400")}>
                    {washTradeAnalysis.loss.netBenefit >= 0 ? '+' : ''}${washTradeAnalysis.loss.netBenefit.toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {!washTradeAnalysis.loss.isWorthwhile && harvestLossOpportunities.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6">
                <p className="text-sm text-amber-400">
                  ⚠️ Trading fees exceed potential tax savings at your current tax rate ({(combinedSTCGRate * 100).toFixed(1)}% Fed + {stateOfResidence}). 
                  Consider using a lower-fee exchange or waiting for larger losses.
                </p>
              </div>
            )}

            {harvestLossOpportunities.length === 0 ? (
              <EmptyState
                icon={CheckCircle}
                title="No Losses to Harvest"
                description="All your lots are in profit - great job!"
              />
            ) : (
              <div className="space-y-3">
                {harvestLossOpportunities
                  .filter((lot) => {
                    if (lotStatusFilter === 'available') return lot.status === 'available' || !lot.status;
                    if (lotStatusFilter === 'partial') return lot.status === 'partially_sold';
                    if (lotStatusFilter === 'used') return lot.status === 'fully_sold' || lot.remainingQuantity <= 0;
                    return true;
                  })
                  .map((lot) => {
                  const lotValue = lot.currentValue;
                  const lotFees = lotValue * (avgFeePercent / 100);
                  const lotTaxSavings = Math.abs(lot.unrealizedGain) * combinedSTCGRate;
                  const lotNetBenefit = lotTaxSavings - lotFees;
                  const holding = holdings.find(h => h.ticker === lot.asset_ticker);
                  const isCrypto = holding?.asset_type === 'crypto' || COINGECKO_IDS[lot.asset_ticker];
                  const displayQty = isCrypto ? lot.remainingQuantity.toFixed(8) : lot.remainingQuantity.toFixed(2);
                  const isFullyUsed = lot.status === 'fully_sold' || lot.remainingQuantity <= 0;

                  return (
                    <div key={lot.id} className={cn(
                      "p-4 rounded-xl",
                      isFullyUsed ? "bg-rose-900/10 border border-rose-500/20 opacity-50 cursor-not-allowed" :
                      lotNetBenefit > 0 ? "bg-zinc-800/30 border border-emerald-400/20" : 
                      "bg-zinc-800/30 border border-zinc-700/50"
                    )}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {isFullyUsed ? (
                              <p className="font-medium text-rose-400 line-through">{displayQty} {lot.asset_ticker}</p>
                            ) : lot.status === 'partially_sold' ? (
                              <div className="flex items-baseline gap-1.5">
                                <p className="font-medium text-zinc-100">{displayQty}</p>
                                <span className="text-xs text-zinc-500">/ {isCrypto ? lot.originalQuantity.toFixed(8) : lot.originalQuantity.toFixed(2)} {lot.asset_ticker}</span>
                              </div>
                            ) : (
                              <p className="font-medium text-zinc-100">{displayQty} {lot.asset_ticker}</p>
                            )}

                            {/* Status badge */}
                            {isFullyUsed && (
                              <Badge className="bg-rose-500/20 text-rose-400 border-0 text-xs">Used</Badge>
                            )}
                            {lot.status === 'partially_sold' && !isFullyUsed && (
                              <Badge className="bg-amber-500/20 text-amber-400 border-0 text-xs">
                                Partial ({((lot.remainingQuantity / lot.originalQuantity) * 100).toFixed(0)}% left)
                              </Badge>
                            )}
                            {(lot.status === 'available' || !lot.status) && lot.remainingQuantity > 0 && (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-xs">Available</Badge>
                            )}
                          </div>
                          {isFullyUsed ? (
                            <p className="text-sm text-zinc-500 mt-1">Already sold - no remaining balance</p>
                          ) : (
                            <p className="text-sm text-zinc-400">Bought @ ${(lot.price_per_unit || 0).toLocaleString()} • Now ${(pricesByTicker[lot.asset_ticker] || 0).toLocaleString()}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-rose-400">-${Math.abs(lot.unrealizedGain).toLocaleString()}</p>
                          <p className="text-sm text-zinc-400">Harvestable loss</p>
                        </div>
                        </div>
                        {!isFullyUsed && (
                        <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-zinc-900/50 text-sm">
                          <div>
                            <p className="text-zinc-500">Tax Savings</p>
                            <p className="font-medium text-emerald-400">+${lotTaxSavings.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Trading Fees</p>
                            <p className="font-medium text-amber-400">-${lotFees.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Net Benefit</p>
                            <p className={cn("font-medium", lotNetBenefit > 0 ? "text-emerald-400" : "text-rose-400")}>
                              {lotNetBenefit >= 0 ? '+' : ''}${lotNetBenefit.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        )}
                        {!isFullyUsed && !COINGECKO_IDS[lot.asset_ticker] && (
                        <p className="text-xs text-amber-400 mt-2">⚠️ Wash sale rule: Can't rebuy within 30 days</p>
                        )}
                        </div>
                        );
                        })}
                        </div>
            )}
          </div>
        </TabsContent>

        {/* Gain Harvest Tab */}
        <TabsContent value="harvest-gain">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold mb-2">Tax-Free Gain Harvesting</h3>
                <p className="text-sm text-zinc-400">Reset cost basis by selling and rebuying at 0% LTCG rate</p>
              </div>
              <Select value={lotStatusFilter} onValueChange={setLotStatusFilter}>
                <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="all">All Lots</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!canHarvestGainsTaxFree ? (
              <div className="p-4 rounded-xl bg-amber-400/10 border border-amber-400/20 mb-6">
                <p className="text-sm text-amber-400">
                  Your taxable income (${taxableIncome.toLocaleString()} after ${standardDeduction.toLocaleString()} std deduction) exceeds the 0% LTCG bracket (${yearBrackets?.ltcg?.[0]?.max?.toLocaleString() || 'N/A'}).
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-emerald-400/10 border border-emerald-400/20 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <p className="text-sm text-zinc-300">0% LTCG Bracket Room</p>
                  </div>
                  <p className="text-xl font-bold text-emerald-400">${ltcgBracketRoom.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-300">Optimal Harvest</p>
                  <p className="text-xl font-bold text-orange-400">${washTradeAnalysis.gain.optimalHarvest.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-300">Est. Fees (sell + rebuy)</p>
                  <p className="text-xl font-bold text-amber-400">-${washTradeAnalysis.gain.tradingFees.toLocaleString()}</p>
                  <p className="text-xs text-zinc-400">{avgFeePercent.toFixed(1)}% round trip</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-300">Net Benefit (vs {(() => {
                    const futureIncome = expectedFutureIncome ?? annualIncome;
                    const futureStdDeduction = filingStatus === 'married' ? 32200 : 16100;
                    const futureTaxableIncome = Math.max(0, futureIncome - futureStdDeduction);
                    const futureZeroBracketTop = filingStatus === 'married' ? 96700 : 48350;
                    if (futureTaxableIncome <= futureZeroBracketTop) return '0%';
                    return '15%';
                  })()} future)</p>
                  <p className={cn("text-xl font-bold", washTradeAnalysis.gain.isWorthwhile ? "text-emerald-400" : "text-rose-400")}>
                    {washTradeAnalysis.gain.netBenefit >= 0 ? '+' : ''}${washTradeAnalysis.gain.netBenefit.toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {canHarvestGainsTaxFree && !washTradeAnalysis.gain.isWorthwhile && washTradeAnalysis.gain.optimalHarvest > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6">
                <p className="text-sm text-amber-400">
                  ⚠️ Trading fees may exceed future tax savings at {avgFeePercent.toFixed(1)}% round-trip cost. 
                  Consider a lower-fee exchange to make harvesting worthwhile.
                </p>
              </div>
            )}

            {gainHarvestOpportunities.length === 0 ? (
              <EmptyState
                icon={TrendingDown}
                title="No Long-Term Gains"
                description="Lots must be held 1+ year to qualify for 0% harvesting"
              />
            ) : (
              <div className="space-y-3">
                {gainHarvestOpportunities
                  .filter((lot) => {
                    if (lotStatusFilter === 'available') return lot.status === 'available' || !lot.status;
                    if (lotStatusFilter === 'partial') return lot.status === 'partially_sold';
                    if (lotStatusFilter === 'used') return lot.status === 'fully_sold' || lot.remainingQuantity <= 0;
                    return true;
                  })
                  .map((lot) => {
                  const lotFees = lot.currentValue * (avgFeePercent / 100);
                  const lotFutureTaxSavings = lot.unrealizedGain * (0.15 + stateRate); // Future 15% LTCG + state avoided
                  const lotNetBenefit = canHarvestGainsTaxFree ? lotFutureTaxSavings - lotFees : -lotFees;
                  const holding = holdings.find(h => h.ticker === lot.asset_ticker);
                  const isCrypto = holding?.asset_type === 'crypto' || COINGECKO_IDS[lot.asset_ticker];
                  const displayQty = isCrypto ? lot.remainingQuantity.toFixed(8) : lot.remainingQuantity.toFixed(2);
                  const isFullyUsed = lot.status === 'fully_sold' || lot.remainingQuantity <= 0;

                  return (
                    <div key={lot.id} className={cn(
                      "p-4 rounded-xl",
                      isFullyUsed ? "bg-rose-900/10 border border-rose-500/20 opacity-50 cursor-not-allowed" :
                      canHarvestGainsTaxFree && lotNetBenefit > 0 ? "bg-zinc-800/30 border border-emerald-400/30" :
                      "bg-zinc-800/30"
                    )}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {isFullyUsed ? (
                              <p className="font-medium text-rose-400 line-through">{displayQty} {lot.asset_ticker}</p>
                            ) : lot.status === 'partially_sold' ? (
                              <div className="flex items-baseline gap-1.5">
                                <p className="font-medium text-zinc-100">{displayQty}</p>
                                <span className="text-xs text-zinc-500">/ {isCrypto ? lot.originalQuantity.toFixed(8) : lot.originalQuantity.toFixed(2)} {lot.asset_ticker}</span>
                              </div>
                            ) : (
                              <p className="font-medium text-zinc-100">{displayQty} {lot.asset_ticker}</p>
                            )}

                            {/* Status badge */}
                            {isFullyUsed && (
                              <Badge className="bg-rose-500/20 text-rose-400 border-0 text-xs">Used</Badge>
                            )}
                            {lot.status === 'partially_sold' && !isFullyUsed && (
                              <Badge className="bg-amber-500/20 text-amber-400 border-0 text-xs">
                                Partial ({((lot.remainingQuantity / lot.originalQuantity) * 100).toFixed(0)}% left)
                              </Badge>
                            )}
                            {(lot.status === 'available' || !lot.status) && lot.remainingQuantity > 0 && (
                              <Badge className="bg-emerald-400/20 text-emerald-400 border-0">Long-term</Badge>
                            )}
                            {canHarvestGainsTaxFree && lotNetBenefit > 0 && !isFullyUsed && (
                              <Badge className="bg-emerald-400/20 text-emerald-400 border-0">Recommended</Badge>
                            )}
                          </div>
                          {isFullyUsed ? (
                            <p className="text-sm text-zinc-500 mt-1">Already sold - no remaining balance</p>
                          ) : (
                            <p className="text-sm text-zinc-400">Held for {lot.daysSincePurchase} days</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-emerald-400">+${lot.unrealizedGain.toLocaleString()}</p>
                          <p className={cn("text-sm", canHarvestGainsTaxFree ? "text-emerald-400" : "text-zinc-400")}>
                            {canHarvestGainsTaxFree ? '0% TAX NOW' : `${(effectiveLTCGRate * 100).toFixed(0)}% tax`}
                          </p>
                        </div>
                        </div>
                        {!isFullyUsed && (
                        <div className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-zinc-800/50 text-sm">
                          <div>
                            <p className="text-zinc-500">Current Basis</p>
                            <p className="font-medium text-zinc-200">${lot.costBasis.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500">New Basis</p>
                            <p className="font-medium text-emerald-400">${lot.currentValue.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Trading Fees</p>
                            <p className="font-medium text-amber-400">-${lotFees.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Net Benefit</p>
                            <p className={cn("font-medium", lotNetBenefit > 0 ? "text-emerald-400" : "text-rose-400")}>
                              {lotNetBenefit >= 0 ? '+' : ''}${lotNetBenefit.toLocaleString()}
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
        </TabsContent>
      </Tabs>

      {/* Buy Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTx ? 'Edit Transaction' : 'Add Buy Transaction'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Type</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
                    <SelectItem value="buy" className="text-zinc-100">Buy</SelectItem>
                    <SelectItem value="sell" className="text-zinc-100">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Asset Ticker</Label>
                <Input 
                  value={formData.asset_ticker} 
                  onChange={(e) => setFormData({ ...formData, asset_ticker: e.target.value.toUpperCase() })} 
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" 
                  placeholder="BTC, AAPL, etc."
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
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" 
                  placeholder="0.00"
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Price per Unit {fetchingPrice && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-orange-400" />}</Label>
                <Input 
                  type="number" 
                  step="any" 
                  value={formData.price_per_unit} 
                  onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })} 
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" 
                  placeholder="Auto-fetched"
                  required 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Date</Label>
              <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="bg-zinc-900 border-zinc-700 text-zinc-100" required />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Account</Label>
              <AccountSelector
                value={formData.account_id}
                onChange={(value) => {
                  if (value === '_create_') {
                    setShowCreateAccount(true);
                  } else {
                    setFormData({ ...formData, account_id: value === '_none_' ? '' : value });
                  }
                }}
              />
              <p className="text-xs text-zinc-500">Assign to account (e.g., Fidelity, Coinbase, Ledger)</p>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Transaction Fee</Label>
              <Input type="number" step="any" value={formData.trading_fee} onChange={(e) => setFormData({ ...formData, trading_fee: e.target.value })} placeholder="0.00" className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Exchange/Platform (Optional)</Label>
              <Input value={formData.exchange} onChange={(e) => setFormData({ ...formData, exchange: e.target.value })} placeholder="Coinbase, Strike..." className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" />
            </div>
            {formData.quantity && formData.price_per_unit && (
              <div className="p-3 rounded-xl bg-zinc-800/50">
                <p className="text-sm text-zinc-400">Total Value</p>
                <p className="text-xl font-bold text-orange-400">${(parseFloat(formData.quantity) * parseFloat(formData.price_per_unit)).toLocaleString()}</p>
              </div>
            )}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1 bg-transparent border-zinc-700 text-zinc-100">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold" disabled={fetchingPrice}>{editingTx ? 'Update' : 'Add'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sale Form Dialog */}
      <Dialog open={saleFormOpen} onOpenChange={setSaleFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Sale with Lot Selection</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaleSubmit} className="space-y-6 mt-4">
            {/* Account Selector */}
            <div className="space-y-2">
              <Label className="text-zinc-400">Account</Label>
              <Select
                value={saleForm.account_id || ''}
                onValueChange={(value) => setSaleForm({ 
                  ...saleForm, 
                  account_id: value,
                  asset_ticker: '',
                  selected_lots: []
                })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {accounts.map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.tax_treatment === 'tax_free' ? 'Tax-Free' : 
                                      account.tax_treatment === 'tax_deferred' ? 'Tax-Deferred' : 'Taxable'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Asset Selector - filtered by selected account */}
            <div className="space-y-2">
              <Label className="text-zinc-400">Asset to Sell</Label>
              <Select 
                value={saleForm.asset_ticker || ''} 
                onValueChange={(value) => setSaleForm({ ...saleForm, asset_ticker: value, selected_lots: [] })}
                disabled={!saleForm.account_id}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue placeholder={saleForm.account_id ? "Select asset..." : "Select account first..."} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {(() => {
                    const assetsForAccount = saleEligibleAssets.filter(a => a.account_id === saleForm.account_id);
                    return assetsForAccount.length === 0 ? (
                      <SelectItem value="_none_" disabled>No assets in this account</SelectItem>
                    ) : (
                      assetsForAccount.map(asset => (
                        <SelectItem key={`${asset.ticker}-${asset.account_id}`} value={asset.ticker}>
                          {asset.name} ({asset.ticker}) - {asset.totalRemaining.toFixed(asset.ticker === 'BTC' ? 8 : 2)} available
                        </SelectItem>
                      ))
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>

            {/* Sale Details */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Quantity ({saleForm.asset_ticker})</Label>
                <Input type="number" step="any" value={saleForm.quantity} onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} placeholder="0.1" className="bg-zinc-900 border-zinc-800" required />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Price per {saleForm.asset_ticker}</Label>
                <Input type="number" step="any" value={saleForm.price_per_unit} onChange={(e) => setSaleForm({ ...saleForm, price_per_unit: e.target.value })} placeholder={saleForm.asset_ticker === 'BTC' ? currentPrice.toString() : ''} className="bg-zinc-900 border-zinc-800" required />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Transaction Fee</Label>
                <Input type="number" step="any" value={saleForm.fee} onChange={(e) => setSaleForm({ ...saleForm, fee: e.target.value })} placeholder="0" className="bg-zinc-900 border-zinc-800" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Sale Date</Label>
                <Input type="date" value={saleForm.date} onChange={(e) => setSaleForm({ ...saleForm, date: e.target.value })} className="bg-zinc-900 border-zinc-800" required />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Exchange</Label>
                <Input value={saleForm.exchange} onChange={(e) => setSaleForm({ ...saleForm, exchange: e.target.value })} className="bg-zinc-900 border-zinc-800" />
              </div>
            </div>

            {/* Lot Selection Method */}
            <div className="space-y-4">
              <Label className="text-zinc-400">Cost Basis Method</Label>
              <RadioGroup value={saleForm.lot_method} onValueChange={(value) => {
                setSaleForm({ ...saleForm, lot_method: value, selected_lots: [] });
                setSpecificLotQuantities({});
              }} className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(LOT_METHODS).map(([key, method]) => (
                  <div key={key} className={cn(
                    "flex items-center space-x-2 p-3 rounded-xl border cursor-pointer transition-all",
                    saleForm.lot_method === key ? "border-orange-400/50 bg-orange-500/10" : "border-zinc-800 hover:border-zinc-700"
                  )}>
                    <RadioGroupItem value={key} id={key} />
                    <Label htmlFor={key} className="cursor-pointer">
                      <div>
                        <span className="font-medium text-sm">{method.name}</span>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{method.description}</p>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Method Comparison */}
            {saleOutcomes && (
              <div className="space-y-4">
                <Label className="text-zinc-400">Tax Impact Comparison</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {['FIFO', 'LIFO', 'HIFO', 'LOFO', 'AVG'].map(method => {
                    const outcome = saleOutcomes[method];
                    const isSelected = saleForm.lot_method === method;
                    
                    // Find lowest gain method
                    const allGains = ['FIFO', 'LIFO', 'HIFO', 'LOFO', 'AVG'].map(m => saleOutcomes[m]?.realizedGain ?? Infinity);
                    const lowestGain = Math.min(...allGains);
                    const isBest = outcome.realizedGain === lowestGain && outcome.isComplete;
                    
                    return (
                      <div key={method} className={cn(
                        "p-3 rounded-xl border transition-all cursor-pointer",
                        isSelected ? "border-orange-400/50 bg-orange-500/10" : "border-zinc-800 hover:border-zinc-700"
                      )} onClick={() => setSaleForm({ ...saleForm, lot_method: method })}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm">{LOT_METHODS[method].name}</span>
                          {isBest && <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">Best</Badge>}
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Basis</span>
                            <span>${outcome.totalCostBasis.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-zinc-800">
                            <span className="text-zinc-400">Gain</span>
                            <span className={cn("font-semibold", outcome.realizedGain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                              {outcome.realizedGain >= 0 ? '+' : ''}${outcome.realizedGain.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Term</span>
                            <span className={cn("text-[10px]", outcome.holdingPeriod === 'long_term' ? "text-emerald-400" : "text-amber-400")}>
                              {outcome.holdingPeriod === 'long_term' ? 'Long' : 'Short'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Specific Lot Selection */}
            {saleForm.lot_method === 'SPECIFIC' && (
              <div className="space-y-4">
                <Label className="text-zinc-400">Select Lots to Sell</Label>
                <div className="max-h-64 overflow-y-auto space-y-2 p-2 rounded-xl bg-zinc-900/50 border border-zinc-800">
                  {(() => {
                    const lotsForSale = allTransactions
                      .filter(tx => 
                        tx.type === 'buy' &&
                        tx.asset_ticker === saleForm.asset_ticker &&
                        tx.account_id === saleForm.account_id &&
                        (tx.remaining_quantity ?? tx.quantity) > 0
                      )
                      .map(tx => {
                        const remainingQuantity = tx.remaining_quantity ?? tx.quantity ?? 0;
                        const tickerPrice = pricesByTicker[saleForm.asset_ticker] || tx.price_per_unit || 0;
                        const currentValue = remainingQuantity * tickerPrice;
                        const costBasis = remainingQuantity * (tx.price_per_unit || 0);
                        const unrealizedGain = currentValue - costBasis;
                        const txDate = tx.date ? new Date(tx.date) : new Date();
                        const daysSincePurchase = differenceInDays(new Date(), txDate);
                        const isLongTerm = daysSincePurchase > 365;
                        
                        return {
                          ...tx,
                          remainingQuantity,
                          currentValue,
                          costBasis,
                          unrealizedGain,
                          unrealizedGainPercent: costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0,
                          isLongTerm,
                          daysSincePurchase,
                        };
                      });
                    
                    return lotsForSale.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-4">No lots available for {saleForm.asset_ticker}</p>
                    ) : (
                      lotsForSale.map(lot => {
                      const isSelected = saleForm.selected_lots.includes(lot.id);
                      const specifiedQty = specificLotQuantities[lot.id] || '';
                      
                      return (
                        <div key={lot.id} className={cn(
                          "p-3 rounded-lg border transition-all",
                          isSelected ? "border-orange-400/50 bg-orange-500/5" : "border-zinc-800 hover:border-zinc-700"
                        )}>
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSaleForm({ ...saleForm, selected_lots: [...saleForm.selected_lots, lot.id] });
                                } else {
                                  setSaleForm({ ...saleForm, selected_lots: saleForm.selected_lots.filter(id => id !== lot.id) });
                                  setSpecificLotQuantities(prev => {
                                    const updated = { ...prev };
                                    delete updated[lot.id];
                                    return updated;
                                  });
                                }
                              }}
                              className="mt-1 rounded border-zinc-600"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium">
                                    {(() => {
                                      const holding = holdings.find(h => h.ticker === lot.asset_ticker);
                                      const isCrypto = holding?.asset_type === 'crypto' || COINGECKO_IDS[lot.asset_ticker];
                                      const displayQty = isCrypto ? lot.remainingQuantity.toFixed(8) : lot.remainingQuantity.toFixed(2);
                                      return `${displayQty} ${lot.asset_ticker} available`;
                                    })()}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    Bought {lot.date ? format(new Date(lot.date), 'MMM d, yyyy') : 'Unknown'} @ ${(lot.price_per_unit || 0).toLocaleString()}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <Badge variant="outline" className={cn("text-[10px]", lot.isLongTerm ? 'border-emerald-400/50 text-emerald-400' : 'border-amber-400/50 text-amber-400')}>
                                    {lot.isLongTerm ? 'Long-term' : `${lot.daysSincePurchase}d`}
                                  </Badge>
                                  <p className={cn("text-xs mt-1", lot.unrealizedGain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                    {lot.unrealizedGain >= 0 ? '+' : ''}{lot.unrealizedGainPercent.toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="mt-2 flex items-center gap-2">
                                  <Label className="text-xs text-zinc-500">Qty to sell:</Label>
                                  <Input
                                    type="number"
                                    step="any"
                                    placeholder={`Max ${lot.remainingQuantity.toFixed(8)}`}
                                    value={specifiedQty}
                                    onChange={(e) => setSpecificLotQuantities(prev => ({
                                      ...prev,
                                      [lot.id]: parseFloat(e.target.value) || 0
                                    }))}
                                    className="h-7 text-xs bg-zinc-900 border-zinc-700 w-40"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setSpecificLotQuantities(prev => ({
                                      ...prev,
                                      [lot.id]: lot.remainingQuantity
                                    }))}
                                    className="text-xs text-orange-400 hover:underline"
                                  >
                                    Use all
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                      })
                      );
                      })()}
                      </div>
                {saleForm.selected_lots.length > 0 && (
                  <div className="p-3 rounded-lg bg-zinc-800/30 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Selected lots:</span>
                      <span>{saleForm.selected_lots.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Total from selected:</span>
                      <span>
                        {(() => {
                          const totalQty = Object.values(specificLotQuantities).reduce((sum, qty) => sum + (qty || 0), 0);
                          const ticker = saleForm.asset_ticker;
                          const holding = holdings.find(h => h.ticker === ticker);
                          const isCrypto = holding?.asset_type === 'crypto' || COINGECKO_IDS[ticker];
                          return isCrypto ? `${totalQty.toFixed(8)} ${ticker}` : `${totalQty.toFixed(2)} ${ticker}`;
                        })()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Selected Method Summary */}
            {saleOutcomes && saleOutcomes[saleForm.lot_method] && (
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <h4 className="font-semibold mb-3">Sale Summary ({LOT_METHODS[saleForm.lot_method].name})</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-zinc-500">Sale Proceeds</p>
                    <p className="text-lg font-semibold">${saleOutcomes[saleForm.lot_method].saleProceeds.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">Cost Basis {saleForm.lot_method === 'AVG' && `(Avg: $${saleOutcomes[saleForm.lot_method].avgCostBasis?.toLocaleString()})`}</p>
                    <p className="text-lg font-semibold">${saleOutcomes[saleForm.lot_method].totalCostBasis.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">Realized Gain/Loss</p>
                    <p className={cn("text-lg font-semibold", saleOutcomes[saleForm.lot_method].realizedGain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {saleOutcomes[saleForm.lot_method].realizedGain >= 0 ? '+' : ''}${saleOutcomes[saleForm.lot_method].realizedGain.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">Est. Tax (Fed + {stateOfResidence})</p>
                    <p className="text-lg font-semibold text-orange-400">
                      ${(saleOutcomes[saleForm.lot_method].realizedGain > 0 
                        ? saleOutcomes[saleForm.lot_method].realizedGain * (saleOutcomes[saleForm.lot_method].holdingPeriod === 'long_term' ? combinedLTCGRate : combinedSTCGRate)
                        : 0
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
                {/* Show lots being used */}
                {saleOutcomes[saleForm.lot_method].lotsUsed.length > 0 && !saleOutcomes[saleForm.lot_method].lotsUsed[0]?.isAvgCost && (
                  <div className="mt-4 pt-4 border-t border-zinc-700">
                    <p className="text-sm text-zinc-400 mb-2">Lots to be used:</p>
                    <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
                      {saleOutcomes[saleForm.lot_method].lotsUsed.map((lot, i) => {
                        const holding = holdings.find(h => h.ticker === saleForm.asset_ticker);
                        const isCrypto = holding?.asset_type === 'crypto' || COINGECKO_IDS[saleForm.asset_ticker];
                        const displayQty = isCrypto ? lot.qtyUsed.toFixed(8) : lot.qtyUsed.toFixed(2);
                        return (
                       <div key={i} className="flex justify-between p-2 rounded bg-zinc-900/50">
                         <span>{displayQty} {saleForm.asset_ticker} @ ${(lot.price_per_unit || 0).toLocaleString()}</span>
                         <span className={lot.isLongTerm ? "text-emerald-400" : "text-amber-400"}>
                           {lot.isLongTerm ? 'LT' : 'ST'}
                         </span>
                       </div>
                      );
                      })}
                    </div>
                  </div>
                )}
                {!saleOutcomes[saleForm.lot_method].isComplete && (
                  <div className="mt-3 p-2 rounded bg-rose-500/10 border border-rose-500/20">
                    <p className="text-sm text-rose-400">⚠️ Insufficient lots to complete this sale</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setSaleFormOpen(false)} className="flex-1 bg-transparent border-zinc-800">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold" disabled={!saleForm.account_id || !saleForm.asset_ticker || !saleOutcomes || !saleOutcomes[saleForm.lot_method]?.isComplete}>
                Record Sale
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <CsvImportDialog open={csvImportOpen} onClose={() => setCsvImportOpen(false)} />
      
      {/* Create Account Dialog */}
      <CreateAccountDialog
        open={showCreateAccount}
        onClose={() => setShowCreateAccount(false)}
        onCreated={(newAccount) => {
          setFormData({ ...formData, account_id: newAccount.id });
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md animate-in fade-in-0 zoom-in-95 duration-200">
          <DialogHeader>
            <DialogTitle>Delete Transaction?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-zinc-400">
              {itemToDelete?.type === 'transaction' && (
                <>
                  Are you sure you want to delete this <span className="font-semibold text-zinc-200">{itemToDelete.item?.type === 'buy' ? 'buy' : 'sell'}</span> transaction for <span className="font-semibold text-zinc-200">{itemToDelete.item?.asset_ticker}</span>?
                </>
              )}
            </p>
            <p className="text-sm text-rose-400">This action cannot be undone. Tax lots and holdings will be automatically updated.</p>
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
                  if (itemToDelete?.type === 'transaction') {
                    deleteTx.mutate(itemToDelete.item.id);
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