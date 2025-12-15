import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInDays } from 'date-fns';
import { Plus, Pencil, Trash2, Receipt, TrendingUp, TrendingDown, Calendar, AlertTriangle, CheckCircle, Sparkles, RefreshCw, Info, Download, Calculator, DollarSign, Scale, ChevronRight, Upload, Loader2 } from 'lucide-react';
import { getTaxDataForYear } from '@/components/tax/taxCalculations';
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
  const [selectedTxIds, setSelectedTxIds] = useState([]);
  const [bulkAccountType, setBulkAccountType] = useState('taxable');
  const [assetTypeFilter, setAssetTypeFilter] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [exportingYear, setExportingYear] = useState(false);
  const queryClient = useQueryClient();

  // Tax planning settings
  const [annualIncome, setAnnualIncome] = useState(0);
  const [targetTaxableIncome, setTargetTaxableIncome] = useState(48350);
  const [filingStatus, setFilingStatus] = useState('single');

  // Sale form state
  const [saleForm, setSaleForm] = useState({
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
      console.log('Price fetch failed:', err);
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
      };

      const tx = await base44.entities.Transaction.create(txData);

      // Sync to Holdings - match by ticker AND account_id
      const existingHolding = holdings.find(h => 
        h.ticker === data.asset_ticker && 
        (data.account_id ? h.account_id === data.account_id : !h.account_id)
      );
      const knownCrypto = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'LTC'];
      const taxTreatment = getTaxTreatment(finalAccountType);
      
      if (data.type === 'buy') {
        if (existingHolding) {
          // Update existing holding
          const newQty = (existingHolding.quantity || 0) + data.quantity;
          const newCostBasis = (existingHolding.cost_basis_total || 0) + total;
          await base44.entities.Holding.update(existingHolding.id, {
            quantity: newQty,
            cost_basis_total: newCostBasis,
            current_price: data.price_per_unit,
          });
        } else {
          // Create new holding with proper account type and tax treatment
          await base44.entities.Holding.create({
            asset_name: data.asset_ticker,
            asset_type: knownCrypto.includes(data.asset_ticker) ? 'crypto' : 'stocks',
            ticker: data.asset_ticker,
            quantity: data.quantity,
            current_price: data.price_per_unit,
            cost_basis_total: total,
            account_type: finalAccountType,
            tax_treatment: taxTreatment,
            account_id: data.account_id || undefined,
          });
        }
      } else if (data.type === 'sell' && existingHolding) {
        // Reduce holding quantity on sell
        const newQty = Math.max(0, (existingHolding.quantity || 0) - data.quantity);
        // Reduce cost basis by the cost basis of sold units
        const newCostBasis = Math.max(0, (existingHolding.cost_basis_total || 0) - (data.cost_basis || 0));
        await base44.entities.Holding.update(existingHolding.id, {
          quantity: newQty,
          cost_basis_total: newCostBasis,
        });
      }

      return tx;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      setFormOpen(false);
      setSaleFormOpen(false);
      resetForm();
    },
  });

  const updateTx = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, {
      ...data,
      total_value: data.quantity * data.price_per_unit,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setFormOpen(false);
      setEditingTx(null);
      resetForm();
    },
  });

  const deleteTx = useMutation({
    mutationFn: async (id) => {
      // Get the transaction before deleting to update holdings
      const tx = transactions.find(t => t.id === id);
      await base44.entities.Transaction.delete(id);
      
      // Sync holdings - reduce quantity and cost basis
      if (tx && tx.type === 'buy') {
        const existingHolding = holdings.find(h => 
          h.ticker === tx.asset_ticker && 
          (tx.account_id ? h.account_id === tx.account_id : !h.account_id)
        );
        
        if (existingHolding) {
          const newQty = Math.max(0, (existingHolding.quantity || 0) - (tx.quantity || 0));
          const newCostBasis = Math.max(0, (existingHolding.cost_basis_total || 0) - (tx.total_value || 0));
          
          if (newQty <= 0) {
            // Delete holding if quantity is 0
            await base44.entities.Holding.delete(existingHolding.id);
          } else {
            // Update holding
            await base44.entities.Holding.update(existingHolding.id, {
              quantity: newQty,
              cost_basis_total: newCostBasis,
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
    },
  });

  const bulkDeleteTx = useMutation({
    mutationFn: async (ids) => {
      // Delete all in parallel for maximum speed
      await Promise.all(ids.map(id => base44.entities.Transaction.delete(id)));
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
      for (const id of ids) {
        await base44.entities.Transaction.update(id, { account_type: accountType });
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
    setSaleForm({ quantity: '', price_per_unit: '', date: format(new Date(), 'yyyy-MM-dd'), fee: '', lot_method: 'HIFO', selected_lots: [], exchange: '' });
    setSpecificLotQuantities({});
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
    console.log("=== TAX LOTS RECALCULATION ===");
    console.log("All transactions count:", allTransactions.length);
    
    // Group by asset ticker to process each separately
    const allTickers = [...new Set(allTransactions.map(t => t.asset_ticker))];
    const allLots = [];
    
    for (const ticker of allTickers) {
      const buyTxs = allTransactions.filter(t => t.type === 'buy' && t.asset_ticker === ticker && isTaxableTransaction(t));
      const sellTxs = allTransactions.filter(t => t.type === 'sell' && t.asset_ticker === ticker && isTaxableTransaction(t));
      
      console.log(`Processing ${ticker}: ${buyTxs.length} buys, ${sellTxs.length} sells`);
      
      // Calculate total sold quantity for this ticker
      const totalSold = sellTxs.reduce((sum, t) => sum + (t.quantity || 0), 0);
      
      // Sort buys by date for FIFO tracking (we'll use this to reduce quantities)
      const sortedBuys = [...buyTxs].sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Track remaining quantity per lot after sales (using FIFO for simplicity)
      let remainingSold = totalSold;
      
      const tickerLots = sortedBuys.map(tx => {
      let remainingQuantity = tx.quantity || 0;
      
      // Reduce this lot's quantity by sold amount (FIFO)
      if (remainingSold > 0) {
        const soldFromThisLot = Math.min(remainingSold, remainingQuantity);
        remainingQuantity -= soldFromThisLot;
        remainingSold -= soldFromThisLot;
      }
      
      // Get current price for this ticker
      const tickerPrice = pricesByTicker[ticker] || (tx.price_per_unit || 0);
      const currentValue = remainingQuantity * tickerPrice;
      const perUnitCost = tx.price_per_unit || 0;
      const costBasis = remainingQuantity * perUnitCost;
      
      // DEBUG: Log if price is suspiciously high
      if (perUnitCost > 150000) {
        console.log("⚠️ HIGH PRICE DETECTED:", {
          ticker,
          txId: tx.id,
          date: tx.date,
          pricePerUnit: perUnitCost,
          quantity: tx.quantity,
          remainingQuantity,
          rawTx: tx
        });
      }
      const unrealizedGain = currentValue - costBasis;
      const txDate = tx.date ? new Date(tx.date) : new Date();
      const daysSincePurchase = isNaN(txDate.getTime()) ? 0 : differenceInDays(new Date(), txDate);
      const isLongTerm = daysSincePurchase > 365;
      
      // Get account type and tax treatment from the transaction itself first, then fall back to holding
      const holding = holdings.find(h => h.ticker === tx.asset_ticker && 
        (tx.account_id ? h.account_id === tx.account_id : true));
      const accountType = tx.account_type || holding?.account_type || 'taxable';
      const taxTreatment = getTaxTreatment(accountType);
      
        return {
          ...tx,
          originalQuantity: tx.quantity,
          remainingQuantity,
          currentValue,
          costBasis,
          unrealizedGain,
          unrealizedGainPercent: costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0,
          isLongTerm,
          daysSincePurchase,
          accountType,
          taxTreatment,
        };
      }).filter(lot => lot.remainingQuantity > 0);
      
      allLots.push(...tickerLots);
    }
    
    console.log("=== TAX LOTS RESULT ===");
    console.log("Total lots created:", allLots.length);
    console.log("BTC lots:", allLots.filter(l => l.asset_ticker === 'BTC').map(l => ({
      id: l.id,
      date: l.date,
      pricePerUnit: l.price_per_unit,
      remainingQty: l.remainingQuantity,
      costBasis: l.costBasis
    })));
    console.log("========================");
    
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
  const calculateSaleOutcome = (saleQty, salePricePerUnit, fee, method, selectedLots = [], specificLotQuantities = {}) => {
    const saleProceeds = (saleQty * salePricePerUnit) - (parseFloat(fee) || 0);
    let remainingQty = saleQty;
    let totalCostBasis = 0;
    let hasLongTerm = false;
    let hasShortTerm = false;
    const lotsUsed = [];

    // Handle Average Cost method
    if (method === 'AVG') {
      const avgCost = calculateAverageCostBasis(taxLots);
      const totalAvailable = taxLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
      
      if (saleQty <= totalAvailable) {
        totalCostBasis = saleQty * avgCost;
        // For avg cost, determine holding period based on weighted average of lots
        let longTermQty = 0;
        let shortTermQty = 0;
        taxLots.forEach(lot => {
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
      const lotsToUse = taxLots.filter(l => selectedLots.includes(l.id));
      
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
      const lotsToUse = sortLotsByMethod(taxLots, method);

      if (method === 'HIFO') {
        console.log("=== HIFO DEBUG ===");
        console.log("All tax lots:", taxLots.map(l => ({
          ticker: l.asset_ticker,
          date: l.date,
          pricePerUnit: l.price_per_unit,
          remainingQty: l.remainingQuantity,
          costBasis: l.costBasis
        })));
        console.log("Lots sorted by price (highest first):", lotsToUse.map(l => ({
          ticker: l.asset_ticker,
          date: l.date,
          pricePerUnit: l.price_per_unit,
          remainingQty: l.remainingQuantity
        })));
      }

      for (const lot of lotsToUse) {
        if (remainingQty <= 0) break;
        const qtyFromLot = Math.min(remainingQty, lot.remainingQuantity);
        totalCostBasis += qtyFromLot * (lot.price_per_unit || 0);
        if (lot.isLongTerm) hasLongTerm = true;
        else hasShortTerm = true;
        lotsUsed.push({ ...lot, qtyUsed: qtyFromLot });
        remainingQty -= qtyFromLot;

        if (method === 'HIFO') {
          console.log("Selected lot:", {
            ticker: lot.asset_ticker,
            qtyUsed: qtyFromLot,
            pricePerUnit: lot.price_per_unit,
            costBasisPerBTC: lot.price_per_unit,
            totalFromThisLot: qtyFromLot * (lot.price_per_unit || 0)
          });
        }
      }

      if (method === 'HIFO') {
        console.log("HIFO Summary:", {
          totalCostBasis: totalCostBasis.toFixed(2),
          lotsUsedCount: lotsUsed.length
        });
        console.log("==================");
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

  // Calculate outcomes for all methods
  const saleOutcomes = useMemo(() => {
    if (!saleForm.quantity || !saleForm.price_per_unit) return null;
    const qty = parseFloat(saleForm.quantity);
    const price = parseFloat(saleForm.price_per_unit);
    const fee = parseFloat(saleForm.fee) || 0;

    return {
      FIFO: calculateSaleOutcome(qty, price, fee, 'FIFO'),
      LIFO: calculateSaleOutcome(qty, price, fee, 'LIFO'),
      HIFO: calculateSaleOutcome(qty, price, fee, 'HIFO'),
      LOFO: calculateSaleOutcome(qty, price, fee, 'LOFO'),
      AVG: calculateSaleOutcome(qty, price, fee, 'AVG'),
      SPECIFIC: calculateSaleOutcome(qty, price, fee, 'SPECIFIC', saleForm.selected_lots, specificLotQuantities),
    };
  }, [saleForm.quantity, saleForm.price_per_unit, saleForm.fee, saleForm.selected_lots, specificLotQuantities, taxLots]);

  const handleSaleSubmit = (e) => {
    e.preventDefault();
    const outcome = saleOutcomes[saleForm.lot_method];
    if (!outcome || !outcome.isComplete) return;

    createTx.mutate({
      type: 'sell',
      asset_ticker: 'BTC',
      quantity: parseFloat(saleForm.quantity),
      price_per_unit: parseFloat(saleForm.price_per_unit),
      date: saleForm.date,
      exchange: saleForm.exchange,
      cost_basis: outcome.totalCostBasis,
      realized_gain_loss: outcome.realizedGain,
      holding_period: outcome.holdingPeriod,
      notes: `Lot method: ${saleForm.lot_method}. Fee: $${saleForm.fee || 0}`,
    });
  };

  // Tax calculations - filtered by selected year
  const sellTxs = transactionsForTaxCalc.filter(t => t.type === 'sell');
  const shortTermGains = sellTxs.filter(t => t.holding_period === 'short_term').reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);
  const longTermGains = sellTxs.filter(t => t.holding_period === 'long_term').reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);
  const totalRealized = shortTermGains + longTermGains;
  
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
  
  // Standard deduction effectively increases the 0% LTCG bracket
  // Taxable income = Gross income - Standard deduction
  // So if gross income is $0, you can realize gains up to (standard deduction + 0% bracket max) at 0%
  const standardDeduction = standardDeductions[filingStatus];
  const taxableIncome = Math.max(0, annualIncome - standardDeduction);
  
  // 0% LTCG bracket room is based on taxable income, not gross income
  // If taxable income is below the 0% threshold, you have room
  const ltcgBracketRoom = yearBrackets?.ltcg?.[0]?.max ? Math.max(0, yearBrackets.ltcg[0].max - taxableIncome) : 0;
  const canHarvestGainsTaxFree = yearBrackets?.ltcg?.[0]?.max ? taxableIncome < yearBrackets.ltcg[0].max : false;

  const estimatedTax = (shortTermGains > 0 ? shortTermGains * effectiveSTCGRate : 0) + (longTermGains > 0 ? longTermGains * effectiveLTCGRate : 0);

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
    const lossTaxSavings = totalHarvestableLoss * effectiveSTCGRate; // Can offset short-term gains or $3k ordinary income
    const lossNetBenefit = lossTaxSavings - lossTradingFees;

    // For gain harvesting (0% LTCG)
    const gainLots = lots.filter(lot => lot.unrealizedGain > 0 && lot.isLongTerm);
    const totalGainValue = gainLots.reduce((sum, lot) => sum + lot.currentValue, 0);
    const totalHarvestableGain = gainLots.reduce((sum, lot) => sum + lot.unrealizedGain, 0);
    const optimalGainHarvest = Math.min(totalHarvestableGain, ltcgBracketRoom);
    
    // Calculate the value we need to sell to realize the optimal gain amount
    // Sort lots by gain% (highest first) to minimize value traded for given gain
    const sortedGainLots = [...gainLots].sort((a, b) => {
      const aGainPercent = a.unrealizedGain / a.currentValue;
      const bGainPercent = b.unrealizedGain / b.currentValue;
      return bGainPercent - aGainPercent; // Higher gain% first = less value to trade
    });
    
    const optimalGainValue = optimalGainHarvest > 0 
      ? sortedGainLots.reduce((acc, lot) => {
          if (acc.remaining <= 0) return acc;
          const gainFromLot = Math.min(lot.unrealizedGain, acc.remaining);
          const valueRatio = gainFromLot / lot.unrealizedGain;
          return {
            remaining: acc.remaining - gainFromLot,
            value: acc.value + (lot.currentValue * valueRatio)
          };
        }, { remaining: optimalGainHarvest, value: 0 }).value
      : 0;
    
    // Trading fees are based on the VALUE traded, not the gain
    // Round trip = sell + rebuy = 2x the value
    const gainTradingFees = optimalGainValue * 2 * (feePercent / 100);
    
    // Tax savings = future tax avoided by resetting basis (15% LTCG on future sale)
    const gainFutureTaxSavings = optimalGainHarvest * 0.15; // Assume 15% LTCG in future
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
        totalValue: totalGainValue,
        harvestableGain: totalHarvestableGain,
        optimalHarvest: optimalGainHarvest,
        optimalValue: optimalGainValue,
        tradingFees: gainTradingFees,
        futureTaxSavings: gainFutureTaxSavings,
        netBenefit: gainNetBenefit,
        isWorthwhile: gainNetBenefit > 0 && canHarvestGainsTaxFree,
        lots: gainLots,
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

  const washTradeAnalysis = useMemo(() => calculateWashTradeAnalysis(taxableLotsForHarvest, avgFeePercent), [taxableLotsForHarvest, avgFeePercent, effectiveSTCGRate, ltcgBracketRoom, canHarvestGainsTaxFree, filingStatus]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Tax Strategy</h1>
          <p className="text-zinc-500 mt-1">Cost basis optimization and tax planning</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
            <SelectTrigger className="w-32 bg-zinc-900 border-zinc-700">
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
            className="bg-transparent border-zinc-700"
          >
            <Download className="w-4 h-4 mr-2" />
            {exportingYear ? 'Exporting...' : 'Export 8949'}
          </Button>
          <Button variant="outline" onClick={() => setCsvImportOpen(true)} className="bg-transparent border-zinc-700">
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Button onClick={() => setSaleFormOpen(true)} className="brand-gradient text-white font-semibold shadow-lg shadow-orange-500/20">
            <Calculator className="w-4 h-4 mr-2" />
            Record Sale
          </Button>
          <Button onClick={() => { setEditingTx(null); resetForm(); setFormOpen(true); }} variant="outline" className="border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Buy
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
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label className="text-zinc-300">Household Taxable Income</Label>
              <span className="text-orange-400 font-semibold">${annualIncome.toLocaleString()}</span>
            </div>
            <Slider value={[annualIncome]} onValueChange={([v]) => setAnnualIncome(v)} min={0} max={1000000} step={5000} />
            <p className="text-xs text-zinc-500">
              {filingStatus === 'married' ? 'Combined household income' : 'Your individual income'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-800/30">
            <p className="text-sm text-zinc-300 mb-2">Your Tax Brackets ({filingStatus === 'married' ? 'MFJ' : 'Single'})</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Short-term rate:</span>
                <span className={effectiveSTCGRate <= 0.12 ? "text-emerald-400" : "text-zinc-200"}>{(effectiveSTCGRate * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Long-term rate:</span>
                <span className={effectiveLTCGRate === 0 ? "text-emerald-400 font-semibold" : "text-zinc-200"}>
                  {effectiveLTCGRate === 0 ? '0% ✓' : `${(effectiveLTCGRate * 100).toFixed(0)}%`}
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

      {/* 0% Tax Bracket Alert */}
      {canHarvestGainsTaxFree && gainHarvestOpportunities.length > 0 && (
        <div className="card-premium rounded-2xl p-6 border border-emerald-400/30">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-emerald-400/10">
              <Sparkles className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-emerald-400 text-lg mb-2">Tax-Free Gain Harvesting Available!</h3>
              <p className="text-zinc-300 mb-4">
                Your income qualifies for 0% long-term capital gains tax. Sell and immediately rebuy to raise your cost basis tax-free.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 p-4 rounded-xl bg-zinc-800/50">
                <div>
                  <p className="text-sm text-zinc-400">Room in 0% Bracket</p>
                  <p className="text-xl font-bold text-emerald-400">${ltcgBracketRoom.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Optimal Harvest</p>
                  <p className="text-xl font-bold text-orange-400">${washTradeAnalysis.gain.optimalHarvest.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Future Tax Saved (15%)</p>
                  <p className="text-xl font-bold text-emerald-400">+${washTradeAnalysis.gain.futureTaxSavings.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Est. Trading Fees ({avgFeePercent.toFixed(1)}%)</p>
                  <p className="text-xl font-bold text-amber-400">-${washTradeAnalysis.gain.tradingFees.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Net Benefit</p>
                  <p className={cn("text-xl font-bold", washTradeAnalysis.gain.isWorthwhile ? "text-emerald-400" : "text-rose-400")}>
                    {washTradeAnalysis.gain.netBenefit >= 0 ? '+' : ''}${washTradeAnalysis.gain.netBenefit.toLocaleString()}
                  </p>
                </div>
              </div>
              {!washTradeAnalysis.gain.isWorthwhile && washTradeAnalysis.gain.optimalHarvest > 0 && (
                <p className="text-sm text-amber-400 mt-3">
                  ⚠️ Trading fees may exceed tax savings. Consider lower-fee exchanges or larger harvest amounts.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">{selectedYear} Short-Term Realized</span>
          <div className={cn("p-1.5 rounded-lg", shortTermGains >= 0 ? "bg-emerald-400/10" : "bg-rose-400/10")}>
            {shortTermGains >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
          </div>
        </div>
        <p className={cn("text-2xl font-bold", shortTermGains >= 0 ? "text-emerald-400" : "text-rose-400")}>
          {shortTermGains >= 0 ? '+' : '-'}${Math.abs(shortTermGains).toLocaleString()}
        </p>
        <p className="text-xs text-zinc-500 mt-1">{shortTermGains === 0 ? 'No ST sales this year' : `Taxed at ${(effectiveSTCGRate * 100).toFixed(0)}%`}</p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">{selectedYear} Long-Term Realized</span>
          <div className={cn("p-1.5 rounded-lg", longTermGains >= 0 ? "bg-emerald-400/10" : "bg-rose-400/10")}>
            {longTermGains >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
          </div>
        </div>
        <p className={cn("text-2xl font-bold", longTermGains >= 0 ? "text-emerald-400" : "text-rose-400")}>
          {longTermGains >= 0 ? '+' : '-'}${Math.abs(longTermGains).toLocaleString()}
        </p>
        <p className={cn("text-xs mt-1", longTermGains === 0 ? "text-zinc-500" : effectiveLTCGRate === 0 ? "text-emerald-400" : "text-zinc-500")}>
          {longTermGains === 0 ? 'No LT sales this year' : effectiveLTCGRate === 0 ? '0% TAX!' : `Taxed at ${(effectiveLTCGRate * 100).toFixed(0)}%`}
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
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Taxable Assets</span>
            <div className="p-1.5 rounded-lg bg-orange-400/10">
              <Receipt className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-orange-400">{Object.keys(totalAssetsByTicker).length}</p>
          <p className="text-xs text-zinc-500 mt-1">{taxLots.length} taxable lots</p>
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
          {/* Tax Liability Summary */}
          <div className="card-premium rounded-2xl p-6 border border-orange-500/20">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-orange-400" />
              {selectedYear} Tax Liability Summary
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-500">YTD Short-Term Gains</p>
                <p className={cn("text-xl font-bold", shortTermGains >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {shortTermGains >= 0 ? '+' : ''}${Math.abs(shortTermGains).toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500">Tax: ${((shortTermGains > 0 ? shortTermGains * effectiveSTCGRate : 0)).toLocaleString()}</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-500">YTD Long-Term Gains</p>
                <p className={cn("text-xl font-bold", longTermGains >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {longTermGains >= 0 ? '+' : ''}${Math.abs(longTermGains).toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500">Tax: ${((longTermGains > 0 ? longTermGains * effectiveLTCGRate : 0)).toLocaleString()}</p>
              </div>
              <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <p className="text-sm text-zinc-500">Est. Total Tax</p>
                <p className="text-xl font-bold text-orange-400">${estimatedTax.toLocaleString()}</p>
                <p className="text-xs text-zinc-500">On {sellTxs.length} sales</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-500">Taxable Holdings</p>
                <p className="text-xl font-bold text-orange-400">{Object.keys(totalAssetsByTicker).length} assets</p>
                <p className="text-xs text-zinc-500">{taxLots.length} lots</p>
              </div>
            </div>
          </div>

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

          {/* Lot Method Comparison */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-2">Tax Lot Selection Methods</h3>
            <p className="text-sm text-zinc-500 mb-4">Compare different methods to minimize your tax liability</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(LOT_METHODS).slice(0, 3).map(([key, method]) => (
                <div key={key} className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700">
                  <h4 className="font-semibold text-orange-400">{method.name}</h4>
                  <p className="text-sm text-zinc-500 mt-1">{method.description}</p>
                  {key === 'HIFO' && (
                    <Badge className="mt-2 bg-emerald-500/20 text-emerald-400">Recommended</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Tax Lots Tab */}
        <TabsContent value="lots">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Tax Lots (Unrealized)</h3>
                <p className="text-sm text-zinc-500">{taxLots.length} taxable lots across {Object.keys(totalAssetsByTicker).length} assets</p>
              </div>
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
            {taxLots.length === 0 ? (
              <p className="text-center text-zinc-500 py-12">No tax lots. Add buy transactions to create lots.</p>
            ) : (
              <div className="space-y-3">
                {[...taxLots]
                  .sort((a, b) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return lotSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
                  })
                  .map((lot) => {
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
                  
                  return (
                  <div key={lot.id} className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-800">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{displayQty} {lot.asset_ticker}</p>
                          {lot.originalQuantity !== lot.remainingQuantity && (
                            <span className="text-xs text-zinc-500">(of {lot.originalQuantity} original)</span>
                          )}
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
                        <p className="text-sm text-zinc-500">
                          Bought {lot.date ? format(new Date(lot.date), 'MMM d, yyyy') : 'Unknown date'} @ ${(lot.price_per_unit || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-lg font-bold", lot.unrealizedGain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {lot.unrealizedGain >= 0 ? '+' : ''}{(lot.unrealizedGainPercent || 0).toFixed(1)}%
                        </p>
                        <p className="text-sm text-zinc-500">{lot.unrealizedGain >= 0 ? '+' : ''}${(lot.unrealizedGain || 0).toLocaleString()}</p>
                      </div>
                    </div>
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
                  </div>
                );})}
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
              <p className="text-center text-zinc-500 py-12">No transactions recorded yet</p>
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
                        <button onClick={() => { setEditingTx(tx); setFormOpen(true); }} className="p-1.5 rounded-lg hover:bg-zinc-700">
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button onClick={() => deleteTx.mutate(tx.id)} className="p-1.5 rounded-lg hover:bg-rose-600/50">
                          <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                );})}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Loss Harvest Tab */}
        <TabsContent value="harvest-loss">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-2">Tax Loss Harvesting</h3>
            <p className="text-sm text-zinc-400 mb-6">Sell taxable lots at a loss to offset gains. Watch for wash sales (30-day rule)!</p>
            
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
                  <p className="text-sm text-zinc-400">Est. Trading Fees ({avgFeePercent.toFixed(1)}%)</p>
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
                  ⚠️ Trading fees exceed potential tax savings at your current tax rate ({(effectiveSTCGRate * 100).toFixed(0)}%). 
                  Consider using a lower-fee exchange or waiting for larger losses.
                </p>
              </div>
            )}

            {harvestLossOpportunities.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-emerald-400/50 mx-auto mb-4" />
                <p className="text-zinc-400">No losses to harvest - all lots are in profit!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {harvestLossOpportunities.map((lot) => {
                  const lotValue = lot.currentValue;
                  const lotFees = lotValue * (avgFeePercent / 100);
                  const lotTaxSavings = Math.abs(lot.unrealizedGain) * effectiveSTCGRate;
                  const lotNetBenefit = lotTaxSavings - lotFees;
                  const holding = holdings.find(h => h.ticker === lot.asset_ticker);
                  const isCrypto = holding?.asset_type === 'crypto' || COINGECKO_IDS[lot.asset_ticker];
                  const displayQty = isCrypto ? lot.remainingQuantity.toFixed(8) : lot.remainingQuantity.toFixed(2);
                  
                  return (
                    <div key={lot.id} className={cn("p-4 rounded-xl bg-zinc-800/30", lotNetBenefit > 0 ? "border border-emerald-400/20" : "border border-zinc-700/50")}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium text-zinc-100">{displayQty} {lot.asset_ticker}</p>
                          <p className="text-sm text-zinc-400">Bought @ ${(lot.price_per_unit || 0).toLocaleString()} • Now ${(pricesByTicker[lot.asset_ticker] || 0).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-rose-400">-${Math.abs(lot.unrealizedGain).toLocaleString()}</p>
                          <p className="text-sm text-zinc-400">Harvestable loss</p>
                        </div>
                      </div>
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
                      {!COINGECKO_IDS[lot.asset_ticker] && (
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
            <h3 className="font-semibold mb-2">Tax-Free Gain Harvesting</h3>
            <p className="text-sm text-zinc-400 mb-6">Reset cost basis by selling and rebuying at 0% LTCG rate</p>

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
                  <p className="text-sm text-zinc-300">Est. Trading Fees</p>
                  <p className="text-xl font-bold text-amber-400">-${washTradeAnalysis.gain.tradingFees.toLocaleString()}</p>
                  <p className="text-xs text-zinc-400">{avgFeePercent.toFixed(1)}% round trip</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-300">Net Benefit (vs 15% future)</p>
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
              <div className="text-center py-12">
                <TrendingDown className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">No long-term gains to harvest (lots must be held 1+ year)</p>
              </div>
            ) : (
              <div className="space-y-3">
                {gainHarvestOpportunities.map((lot) => {
                  const lotFees = lot.currentValue * (avgFeePercent / 100);
                  const lotFutureTaxSavings = lot.unrealizedGain * 0.15; // Future 15% LTCG avoided
                  const lotNetBenefit = canHarvestGainsTaxFree ? lotFutureTaxSavings - lotFees : -lotFees;
                  const holding = holdings.find(h => h.ticker === lot.asset_ticker);
                  const isCrypto = holding?.asset_type === 'crypto' || COINGECKO_IDS[lot.asset_ticker];
                  const displayQty = isCrypto ? lot.remainingQuantity.toFixed(8) : lot.remainingQuantity.toFixed(2);
                  
                  return (
                    <div key={lot.id} className={cn("p-4 rounded-xl bg-zinc-800/30", canHarvestGainsTaxFree && lotNetBenefit > 0 && "border border-emerald-400/30")}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-zinc-100">{displayQty} {lot.asset_ticker}</p>
                            <Badge className="bg-emerald-400/20 text-emerald-400 border-0">Long-term</Badge>
                            {canHarvestGainsTaxFree && lotNetBenefit > 0 && (
                              <Badge className="bg-emerald-400/20 text-emerald-400 border-0">Recommended</Badge>
                            )}
                          </div>
                          <p className="text-sm text-zinc-400">Held for {lot.daysSincePurchase} days</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-emerald-400">+${lot.unrealizedGain.toLocaleString()}</p>
                          <p className={cn("text-sm", canHarvestGainsTaxFree ? "text-emerald-400" : "text-zinc-400")}>
                            {canHarvestGainsTaxFree ? '0% TAX NOW' : `${(effectiveLTCGRate * 100).toFixed(0)}% tax`}
                          </p>
                        </div>
                      </div>
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
            {/* Sale Details */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Quantity (BTC)</Label>
                <Input type="number" step="any" value={saleForm.quantity} onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} placeholder="0.1" className="bg-zinc-900 border-zinc-800" required />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Price per BTC</Label>
                <Input type="number" step="any" value={saleForm.price_per_unit} onChange={(e) => setSaleForm({ ...saleForm, price_per_unit: e.target.value })} placeholder={currentPrice.toString()} className="bg-zinc-900 border-zinc-800" required />
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
                    );
                  })}
                </div>
              </div>
            )}

            {/* Specific Lot Selection */}
            {saleForm.lot_method === 'SPECIFIC' && (
              <div className="space-y-4">
                <Label className="text-zinc-400">Select Lots to Sell</Label>
                <div className="max-h-64 overflow-y-auto space-y-2 p-2 rounded-xl bg-zinc-900/50 border border-zinc-800">
                  {taxLots.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-4">No lots available</p>
                  ) : (
                    taxLots.map(lot => {
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
                  )}
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
                          const firstLot = taxLots.find(l => saleForm.selected_lots.includes(l.id));
                          const ticker = firstLot?.asset_ticker || 'BTC';
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
                    <p className="text-sm text-zinc-500">Est. Tax</p>
                    <p className="text-lg font-semibold text-orange-400">
                      ${(saleOutcomes[saleForm.lot_method].realizedGain > 0 
                        ? saleOutcomes[saleForm.lot_method].realizedGain * (saleOutcomes[saleForm.lot_method].holdingPeriod === 'long_term' ? effectiveLTCGRate : effectiveSTCGRate)
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
                      {saleOutcomes[saleForm.lot_method].lotsUsed.map((lot, i) => (
                        <div key={i} className="flex justify-between p-2 rounded bg-zinc-900/50">
                          <span>{lot.qtyUsed.toFixed(8)} BTC @ ${(lot.price_per_unit || 0).toLocaleString()}</span>
                          <span className={lot.isLongTerm ? "text-emerald-400" : "text-amber-400"}>
                            {lot.isLongTerm ? 'LT' : 'ST'}
                          </span>
                        </div>
                      ))}
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
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold" disabled={!saleOutcomes || !saleOutcomes[saleForm.lot_method]?.isComplete}>
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
    </div>
  );
}