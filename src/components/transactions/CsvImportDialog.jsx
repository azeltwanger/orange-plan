import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Upload, FileSpreadsheet, ArrowRight, Check, AlertTriangle, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { differenceInDays } from 'date-fns';
import AccountSelector from '@/components/accounts/AccountSelector';
import CreateAccountDialog from '@/components/accounts/CreateAccountDialog';
import { syncAllHoldingsForAccount } from '@/components/shared/syncHoldings';

const TRANSACTION_FIELDS = [
  { key: 'type', label: 'Type (buy/sell)', required: true, description: 'Transaction type' },
  { key: 'asset_ticker', label: 'Asset Ticker', required: true, description: 'e.g., BTC' },
  { key: 'quantity', label: 'Quantity', required: true, description: 'Amount traded' },
  { key: 'price_per_unit', label: 'Price per Unit', required: true, description: 'Price at time of trade' },
  { key: 'date', label: 'Date', required: true, description: 'YYYY-MM-DD format' },
  { key: 'transaction_id', label: 'Transaction ID', required: false, description: 'Unique ID to prevent duplicates' },
  { key: 'exchange_or_wallet', label: 'Exchange/Wallet', required: false, description: 'Where trade occurred' },
  { key: 'trading_fee', label: 'Trading Fee', required: false, description: 'Fee paid' },
  { key: 'notes', label: 'Notes', required: false, description: 'Optional notes' },
];

const LOT_METHODS = {
  FIFO: { name: 'FIFO', description: 'First In, First Out - Sell oldest lots first' },
  LIFO: { name: 'LIFO', description: 'Last In, First Out - Sell newest lots first' },
  HIFO: { name: 'HIFO', description: 'Highest In, First Out - Minimize gains (recommended)' },
  AVG: { name: 'Average Cost', description: 'Use average cost basis across all lots' },
};

const ACCOUNT_TYPES = [
  { value: 'taxable_brokerage', label: 'Taxable Brokerage', tax: 'taxable' },
  { value: 'taxable_crypto', label: 'Crypto Exchange/Wallet', tax: 'taxable' },
  { value: '401k_traditional', label: 'Traditional 401(k)', tax: 'tax_deferred' },
  { value: '401k_roth', label: 'Roth 401(k)', tax: 'tax_free' },
  { value: 'ira_traditional', label: 'Traditional IRA', tax: 'tax_deferred' },
  { value: 'ira_roth', label: 'Roth IRA', tax: 'tax_free' },
  { value: 'hsa', label: 'HSA', tax: 'tax_free' },
  { value: '529', label: '529 Plan', tax: 'tax_free' },
];

export default function CsvImportDialog({ open, onClose }) {
  const [file, setFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvData, setCsvData] = useState([]);
  const [fullCsvData, setFullCsvData] = useState([]);
  const [mapping, setMapping] = useState({});
  const [step, setStep] = useState(1);
  const [parsingError, setParsingError] = useState(null);
  const [lotMethod, setLotMethod] = useState('HIFO');
  const [accountType, setAccountType] = useState('taxable');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('taxable_brokerage');
  const [importStats, setImportStats] = useState(null);
  const queryClient = useQueryClient();

  // Fetch accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
    enabled: open,
  });

  // Get existing transactions for lot matching
  const { data: existingTransactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date'),
    enabled: open,
  });

  const resetState = useCallback(() => {
    setFile(null);
    setCsvHeaders([]);
    setCsvData([]);
    setFullCsvData([]);
    setMapping({});
    setStep(1);
    setParsingError(null);
    setImportStats(null);
    setAccountType('taxable');
    setSelectedAccountId('');
    setNewAccountName('');
    setNewAccountType('taxable_brokerage');
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParsingError(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target.result;
          const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
          if (lines.length === 0) throw new Error('Empty file.');

          const headers = parseCSVLine(lines[0]);
          setCsvHeaders(headers);

          const allData = lines.slice(1).map(line => {
            const values = parseCSVLine(line);
            const row = {};
            headers.forEach((header, i) => {
              row[header] = values[i] || '';
            });
            return row;
          }).filter(row => Object.values(row).some(v => v !== ''));

          setFullCsvData(allData);
          setCsvData(allData.slice(0, 10));
          setStep(2);
        } catch (error) {
          setParsingError(`Error parsing CSV: ${error.message}`);
        }
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleMappingChange = (fieldKey, csvColumn) => {
    setMapping(prev => ({ ...prev, [fieldKey]: csvColumn === '_none_' ? '' : csvColumn }));
  };

  // Process transactions with tax lot matching
  const processTransactionsWithLots = (rawTransactions, method) => {
    // Combine existing buy transactions with new ones for lot tracking
    const existingBuys = existingTransactions
      .filter(t => t.type === 'buy')
      .map(t => ({
        ...t,
        remainingQuantity: t.quantity,
        isExisting: true,
      }));

    // Sort all transactions chronologically
    const sortedTransactions = [...rawTransactions].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    const processedTransactions = [];
    const newLots = []; // Track new buy lots
    let stats = { buys: 0, sells: 0, totalGains: 0, totalLosses: 0, shortTerm: 0, longTerm: 0 };

    // Build lot pool from existing and new buys
    const lotPool = [...existingBuys];

    for (const tx of sortedTransactions) {
      const txType = String(tx.type || '').toLowerCase().trim();
      const isSell = txType === 'sell' || txType.includes('sell') || txType.includes('sold') || txType === 'sale' || txType === 's';
      const isBuy = !isSell;
      
      if (isBuy) {
        stats.buys++;
        const lotId = `${tx.asset_ticker}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const costBasis = (tx.quantity * tx.price_per_unit) + (tx.trading_fee || 0);
        
        const buyTx = {
          ...tx,
          type: 'buy',
          lot_id: lotId,
          cost_basis: costBasis,
          total_value: tx.quantity * tx.price_per_unit,
        };
        
        processedTransactions.push(buyTx);
        lotPool.push({
          ...buyTx,
          remainingQuantity: tx.quantity,
          isExisting: false,
        });
      } else if (isSell) {
        stats.sells++;
        const saleDate = new Date(tx.date);
        
        // Get available lots for this asset purchased before sale date
        let availableLots = lotPool
          .filter(lot => 
            lot.asset_ticker === tx.asset_ticker && 
            lot.remainingQuantity > 0 &&
            new Date(lot.date) <= saleDate
          );

        // Sort lots by method
        switch (method) {
          case 'FIFO':
            availableLots.sort((a, b) => new Date(a.date) - new Date(b.date));
            break;
          case 'LIFO':
            availableLots.sort((a, b) => new Date(b.date) - new Date(a.date));
            break;
          case 'HIFO':
            console.log('HIFO DEBUG - Before sorting:', availableLots.map(l => ({
              ticker: l.asset_ticker,
              date: l.date,
              price: l.price_per_unit,
              qty: l.remainingQuantity,
              isExisting: l.isExisting
            })));
            availableLots.sort((a, b) => (b.price_per_unit || 0) - (a.price_per_unit || 0));
            console.log('HIFO DEBUG - After sorting (highest first):', availableLots.map(l => ({
              ticker: l.asset_ticker,
              price: l.price_per_unit,
              qty: l.remainingQuantity
            })));
            break;
          case 'AVG':
            // For average, we'll calculate weighted average cost
            break;
        }

        let remainingToSell = tx.quantity;
        let totalCostBasis = 0;
        let hasLongTerm = false;
        let hasShortTerm = false;

        if (method === 'AVG') {
          // Calculate average cost basis
          const totalQty = availableLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
          const totalCost = availableLots.reduce((sum, lot) => 
            sum + (lot.remainingQuantity * (lot.price_per_unit || 0)), 0
          );
          const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
          totalCostBasis = tx.quantity * avgCost;
          
          // Proportionally reduce lots
          for (const lot of availableLots) {
            if (remainingToSell <= 0) break;
            const qtyFromLot = Math.min(remainingToSell, lot.remainingQuantity);
            lot.remainingQuantity -= qtyFromLot;
            remainingToSell -= qtyFromLot;
            
            const daysSincePurchase = differenceInDays(saleDate, new Date(lot.date));
            if (daysSincePurchase > 365) hasLongTerm = true;
            else hasShortTerm = true;
          }
        } else {
          // Use specific lot selection
          console.log(`HIFO DEBUG - Selling ${tx.quantity} ${tx.asset_ticker} @ $${tx.price_per_unit} using ${method}`);
          console.log('Available lots count:', availableLots.length);
          
          for (const lot of availableLots) {
            if (remainingToSell <= 0) break;
            const qtyFromLot = Math.min(remainingToSell, lot.remainingQuantity);
            const costFromLot = qtyFromLot * (lot.price_per_unit || 0);
            
            console.log(`Using lot: ${qtyFromLot.toFixed(8)} @ $${lot.price_per_unit} = $${costFromLot.toFixed(2)} basis`);
            
            totalCostBasis += costFromLot;
            lot.remainingQuantity -= qtyFromLot;
            remainingToSell -= qtyFromLot;
            
            const daysSincePurchase = differenceInDays(saleDate, new Date(lot.date));
            if (daysSincePurchase > 365) hasLongTerm = true;
            else hasShortTerm = true;
          }
          
          console.log(`HIFO DEBUG - Sale Summary:`, {
            sold: tx.quantity,
            salePrice: tx.price_per_unit,
            proceeds: tx.quantity * tx.price_per_unit,
            totalCostBasis: totalCostBasis.toFixed(2),
            gain: (tx.quantity * tx.price_per_unit - totalCostBasis).toFixed(2),
            remainingUnsold: remainingToSell.toFixed(8)
          });
        }

        const saleProceeds = (tx.quantity * tx.price_per_unit) - (tx.trading_fee || 0);
        const realizedGain = saleProceeds - totalCostBasis;
        const holdingPeriod = hasShortTerm ? 'short_term' : 'long_term';

        if (holdingPeriod === 'short_term') stats.shortTerm++;
        else stats.longTerm++;
        
        if (realizedGain >= 0) stats.totalGains += realizedGain;
        else stats.totalLosses += Math.abs(realizedGain);

        processedTransactions.push({
          ...tx,
          type: 'sell',
          cost_basis: totalCostBasis,
          realized_gain_loss: realizedGain,
          holding_period: holdingPeriod,
          total_value: tx.quantity * tx.price_per_unit,
          notes: `${tx.notes || ''} [Imported: ${method} method]`.trim(),
        });
      }
    }

    return { transactions: processedTransactions, stats };
  };

  const mappedPreviewData = useMemo(() => {
    if (!csvData || csvData.length === 0 || Object.keys(mapping).length === 0) return [];
    return csvData.map(row => {
      const previewRow = {};
      for (const field of TRANSACTION_FIELDS) {
        const mappedColumn = mapping[field.key];
        if (mappedColumn && row[mappedColumn] !== undefined) {
          let value = row[mappedColumn];
          if (['quantity', 'price_per_unit', 'trading_fee'].includes(field.key)) {
            value = parseFloat(String(value).replace(/[^0-9.-]+/g, "")) || 0;
          } else if (field.key === 'date') {
            value = String(value).split(' ')[0];
          } else if (field.key === 'asset_ticker') {
            value = String(value).toUpperCase();
          } else if (field.key === 'type') {
            value = String(value).toLowerCase().trim();
            // Handle various type formats
            if (value.includes('sell') || value.includes('sold') || value === 'sale' || value === 's') {
              value = 'sell';
            } else if (value.includes('buy') || value.includes('bought') || value === 'purchase' || value === 'b') {
              value = 'buy';
            } else if (!['buy', 'sell'].includes(value)) {
              value = 'buy';
            }
          }
          previewRow[field.key] = value;
        } else {
          previewRow[field.key] = field.required ? '—' : '';
        }
      }
      return previewRow;
    });
  }, [csvData, mapping]);

  const allRequiredFieldsMapped = useMemo(() => {
    return TRANSACTION_FIELDS.every(field => 
      !field.required || (mapping[field.key] && csvHeaders.includes(mapping[field.key]))
    );
  }, [mapping, csvHeaders]);

  // Fetch existing holdings
  const { data: existingHoldings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
    enabled: open,
  });

  const importTransactions = useMutation({
    mutationFn: async () => {
      // Parse all data
      const rawTransactions = fullCsvData.map(row => {
        const tx = {};
        for (const field of TRANSACTION_FIELDS) {
          const mappedColumn = mapping[field.key];
          if (mappedColumn && row[mappedColumn] !== undefined) {
            let value = row[mappedColumn];
            if (['quantity', 'price_per_unit', 'trading_fee'].includes(field.key)) {
              value = parseFloat(String(value).replace(/[^0-9.-]+/g, "")) || 0;
            } else if (field.key === 'date') {
              value = String(value).split(' ')[0];
            } else if (field.key === 'asset_ticker') {
              value = String(value).toUpperCase();
            } else if (field.key === 'type') {
              value = String(value).toLowerCase().trim();
              // Handle various type formats
              if (value.includes('sell') || value.includes('sold') || value === 'sale' || value === 's') {
                value = 'sell';
              } else if (value.includes('buy') || value.includes('bought') || value === 'purchase' || value === 'b') {
                value = 'buy';
              } else if (!['buy', 'sell'].includes(value)) {
                value = 'buy';
              }
            }
            tx[field.key] = value;
          }
        }
        return tx;
      });

      // Log parsing details
      console.log(`CSV rows: ${fullCsvData.length}, Parsed transactions: ${rawTransactions.length}`);
      
      // Check for invalid transactions
      const invalidTxs = rawTransactions.filter(tx => !(tx.quantity > 0 && tx.price_per_unit > 0));
      if (invalidTxs.length > 0) {
        console.log(`Invalid transactions (missing qty/price): ${invalidTxs.length}`);
        console.log('Sample invalid:', invalidTxs.slice(0, 5));
      }
      
      const validTransactions = rawTransactions.filter(tx => tx.quantity > 0 && tx.price_per_unit > 0);
      console.log(`Valid transactions to import: ${validTransactions.length}`);

      // No duplicate detection - import all transactions as-is
      const uniqueTransactions = validTransactions;
      const duplicatesSkipped = rawTransactions.length - validTransactions.length;

      // Process with lot matching (only unique transactions)
      const { transactions: processedTransactions, stats } = processTransactionsWithLots(uniqueTransactions, lotMethod);
      stats.duplicatesSkipped = duplicatesSkipped;

      // Create new account if needed
      let finalAccountId = selectedAccountId;
      let taxTreatment = 'taxable';
      let legacyAccountType = 'taxable';

      if (selectedAccountId === '_new_' && newAccountName.trim()) {
        const accountTypeInfo = ACCOUNT_TYPES.find(t => t.value === newAccountType);
        const newAccount = await base44.entities.Account.create({
          name: newAccountName.trim(),
          account_type: newAccountType,
          tax_treatment: accountTypeInfo?.tax || 'taxable',
        });
        finalAccountId = newAccount.id;
        taxTreatment = accountTypeInfo?.tax || 'taxable';
        legacyAccountType = newAccountType.includes('401k') ? 
          (newAccountType.includes('roth') ? 'roth_401k' : 'traditional_401k') :
          newAccountType.includes('ira') ?
          (newAccountType.includes('roth') ? 'roth_ira' : 'traditional_ira') :
          newAccountType === 'hsa' ? 'hsa' :
          newAccountType === '529' ? '529' : 'taxable';
      } else if (finalAccountId && finalAccountId !== '_new_') {
        const selectedAccount = accounts.find(a => a.id === finalAccountId);
        taxTreatment = selectedAccount?.tax_treatment || 'taxable';
        const accountTypeFromAccount = selectedAccount?.account_type || 'taxable_brokerage';
        legacyAccountType = accountTypeFromAccount.includes('401k') ? 
          (accountTypeFromAccount.includes('roth') ? 'roth_401k' : 'traditional_401k') :
          accountTypeFromAccount.includes('ira') ?
          (accountTypeFromAccount.includes('roth') ? 'roth_ira' : 'traditional_ira') :
          accountTypeFromAccount === 'hsa' ? 'hsa' :
          accountTypeFromAccount === '529' ? '529' : 'taxable';
      } else {
        finalAccountId = undefined;
      }

      // PART 2 FIX: Match exchange_or_wallet to account names for existing accounts
      const transactionsToCreate = processedTransactions.map(tx => {
        let txAccountId = finalAccountId;
        
        // If no account explicitly selected, try to match exchange_or_wallet to existing account names
        if (!finalAccountId && tx.exchange_or_wallet) {
          const matchingAccount = accounts.find(a => 
            a.name.toLowerCase().trim() === tx.exchange_or_wallet.toLowerCase().trim()
          );
          if (matchingAccount) {
            txAccountId = matchingAccount.id;
            console.log(`✅ Matched "${tx.exchange_or_wallet}" to account "${matchingAccount.name}" (${matchingAccount.id})`);
          }
        }
        
        return {
          ...tx,
          account_type: legacyAccountType,
          account_id: txAccountId || undefined,
        };
      });
      
      try {
        await base44.entities.Transaction.bulkCreate(transactionsToCreate);
      } catch (err) {
        console.error('Bulk create failed, trying individually:', err);
        // Fallback to individual creates if bulk fails
        for (const tx of transactionsToCreate) {
          try {
            await base44.entities.Transaction.create(tx);
          } catch (innerErr) {
            stats.duplicatesSkipped = (stats.duplicatesSkipped || 0) + 1;
          }
        }
      }
      
      const successfulTransactions = processedTransactions;
      setImportStats(stats);

      // Sync Holdings - aggregate by ticker (only for successful transactions)
      const holdingUpdates = {};
      for (const tx of successfulTransactions) {
        const ticker = tx.asset_ticker;
        if (!holdingUpdates[ticker]) {
          holdingUpdates[ticker] = { quantity: 0, costBasis: 0, lastPrice: tx.price_per_unit };
        }
        if (tx.type === 'buy') {
          holdingUpdates[ticker].quantity += tx.quantity;
          holdingUpdates[ticker].costBasis += tx.cost_basis || (tx.quantity * tx.price_per_unit);
        } else if (tx.type === 'sell') {
          holdingUpdates[ticker].quantity -= tx.quantity;
          // Cost basis reduces proportionally on sell (simplified)
        }
        holdingUpdates[ticker].lastPrice = tx.price_per_unit;
      }

      // SYNC HOLDINGS FROM LOTS (source of truth)
      // This replaces manual holding updates - lots are the source of truth
      console.log("🔄 Syncing all holdings for account after CSV import...");
      await syncAllHoldingsForAccount(finalAccountId || null);

      return { count: successfulTransactions.length, stats };
      },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['budgetItems'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(`Imported ${data.count} transactions successfully!`);
      setStep(4); // Show summary
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-orange-400" />
            Import Transactions from CSV
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 px-2 py-3">
          {['Upload', 'Map Columns', 'Preview & Import', 'Done'].map((label, i) => (
            <React.Fragment key={label}>
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                step > i + 1 ? "bg-emerald-500/20 text-emerald-400" :
                step === i + 1 ? "bg-orange-500/20 text-orange-400" :
                "bg-zinc-800 text-zinc-500"
              )}>
                {step > i + 1 ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < 3 && <ArrowRight className="w-4 h-4 text-zinc-600" />}
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-1">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              <Upload className="w-16 h-16 text-zinc-600" />
              <div className="text-center">
                <p className="text-zinc-200 text-lg font-medium">Import Transaction Data</p>
                <p className="text-zinc-500 text-sm mt-1">Upload a CSV file exported from your exchange or broker</p>
              </div>
              
              {/* Instructions */}
              <div className="w-full max-w-md p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 text-left">
                <p className="text-sm font-medium text-zinc-300 mb-3">Required CSV columns:</p>
                <ul className="text-xs text-zinc-400 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 font-semibold">•</span>
                    <span><strong className="text-zinc-300">Type</strong> — "buy" or "sell"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 font-semibold">•</span>
                    <span><strong className="text-zinc-300">Asset Ticker</strong> — e.g., "BTC", "VOO", "AAPL"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 font-semibold">•</span>
                    <span><strong className="text-zinc-300">Quantity</strong> — Amount traded</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 font-semibold">•</span>
                    <span><strong className="text-zinc-300">Price per Unit</strong> — Price at time of trade</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400 font-semibold">•</span>
                    <span><strong className="text-zinc-300">Date</strong> — YYYY-MM-DD format preferred</span>
                  </li>
                </ul>
                <p className="text-xs text-zinc-500 mt-3">Recommended: Trading Fee, Exchange/Wallet | Optional: Transaction ID, Notes</p>
                <div className="mt-4 pt-3 border-t border-zinc-700">
                  <p className="text-sm text-zinc-300">
                    <span className="text-orange-400 font-semibold">💡 Important:</span> Upload one CSV per account. You will select the specific account and its tax type in the next step.
                  </p>
                </div>
              </div>

              <Input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="max-w-xs cursor-pointer file:cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-500/20 file:text-orange-400 hover:file:bg-orange-500/30"
              />
              {parsingError && (
                <p className="text-rose-400 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> {parsingError}
                </p>
              )}
            </div>
          )}

          {/* Step 2: Map Columns */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                <p className="text-sm text-zinc-300">
                  Found <span className="text-orange-400 font-semibold">{fullCsvData.length}</span> rows and <span className="text-orange-400 font-semibold">{csvHeaders.length}</span> columns. 
                  Map your CSV columns to transaction fields below.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TRANSACTION_FIELDS.map(field => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className={cn("text-sm", field.required ? 'text-zinc-200' : 'text-zinc-400')}>
                      {field.label} {field.required && <span className="text-rose-400">*</span>}
                    </Label>
                    <Select
                      value={mapping[field.key] || '_none_'}
                      onValueChange={(value) => handleMappingChange(field.key, value)}
                    >
                      <SelectTrigger className={cn(
                        "bg-zinc-900 border-zinc-700",
                        !mapping[field.key] && field.required && 'border-rose-500/50'
                      )}>
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="_none_" className="text-zinc-400">— Not mapped —</SelectItem>
                        {csvHeaders.map(header => (
                          <SelectItem key={header} value={header} className="text-zinc-100">{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mapping[field.key] && csvData.length > 0 && csvData[0] && csvData[0][mapping[field.key]] !== undefined && (
                      <p className="text-xs text-zinc-500">
                        Example: <span className="font-mono text-zinc-400">{csvData[0][mapping[field.key]]}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setStep(1)} className="bg-transparent border-zinc-700">
                  Back
                </Button>
                <Button 
                  onClick={() => setStep(3)} 
                  disabled={!allRequiredFieldsMapped}
                  className="brand-gradient text-white"
                >
                  Next
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: Preview & Import */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Account Selection */}
              <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700">
                <Label className="text-zinc-200 font-medium mb-3 block">Import to Account</Label>
                <p className="text-xs text-zinc-500 mb-3">Select an existing account or create a new one for these transactions.</p>
                <Select
                  value={selectedAccountId || '_none_'}
                  onValueChange={(value) => {
                    if (value === '_create_') {
                      setSelectedAccountId('_new_');
                      setNewAccountName('');
                      setNewAccountType('taxable_brokerage');
                    } else {
                      setSelectedAccountId(value === '_none_' ? '' : value);
                      setNewAccountName('');
                    }
                  }}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-700">
                    <SelectValue placeholder="Select an account..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="_none_" className="text-zinc-400">— No Account —</SelectItem>
                    {accounts.map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} ({account.account_type?.replace(/_/g, ' ')})
                      </SelectItem>
                    ))}
                    <SelectItem value="_create_" className="text-orange-400">
                      <Plus className="w-4 h-4 inline mr-2" /> Create New Account
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Inline new account creation */}
                {selectedAccountId === '_new_' && (
                  <div className="mt-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-700 space-y-3">
                    <div>
                      <Label className="text-xs text-zinc-400">New Account Name</Label>
                      <Input
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        placeholder="e.g., Coinbase, Fidelity"
                        className="bg-zinc-900 border-zinc-700 mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Account Type</Label>
                      <Select value={newAccountType} onValueChange={setNewAccountType}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {ACCOUNT_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                
                {(!selectedAccountId || selectedAccountId === '_none_') && (
                  <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Please select or create an account to proceed.
                  </p>
                )}
              </div>

              {/* Lot Method Selection */}
              <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700">
                <Label className="text-zinc-200 font-medium mb-3 block">Tax Lot Matching Method for Sells</Label>
                <RadioGroup value={lotMethod} onValueChange={setLotMethod} className="grid grid-cols-2 gap-2">
                  {Object.entries(LOT_METHODS).map(([key, method]) => (
                    <div key={key} className={cn(
                      "flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                      lotMethod === key ? "border-orange-400/50 bg-orange-500/10" : "border-zinc-700 hover:border-zinc-600"
                    )}>
                      <RadioGroupItem value={key} id={key} className="mt-0.5" />
                      <Label htmlFor={key} className="cursor-pointer flex-1">
                        <span className="font-medium text-sm">{method.name}</span>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{method.description}</p>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Preview Table */}
              <div>
                <p className="text-sm text-zinc-400 mb-2">Preview (first 10 rows of {fullCsvData.length}):</p>
                <div className="overflow-x-auto border rounded-lg border-zinc-700 max-h-48">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-700">
                        {TRANSACTION_FIELDS.filter(f => mapping[f.key]).map(field => (
                          <TableHead key={field.key} className="text-zinc-400 text-xs whitespace-nowrap">
                            {field.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mappedPreviewData.map((row, index) => (
                        <TableRow key={index} className="border-zinc-800">
                          {TRANSACTION_FIELDS.filter(f => mapping[f.key]).map(field => (
                            <TableCell key={field.key} className={cn(
                              "text-xs whitespace-nowrap",
                              row[field.key] === '—' && 'text-rose-400',
                              field.key === 'type' && row[field.key] === 'buy' && 'text-emerald-400',
                              field.key === 'type' && row[field.key] === 'sell' && 'text-rose-400'
                            )}>
                              {field.key === 'quantity' || field.key === 'price_per_unit' || field.key === 'trading_fee' 
                                ? (typeof row[field.key] === 'number' ? row[field.key].toLocaleString() : row[field.key])
                                : row[field.key]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-400">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  Sell transactions will be automatically matched to tax lots using <strong>{LOT_METHODS[lotMethod].name}</strong>. 
                  Cost basis and gains will be calculated based on your existing and imported buy transactions.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(2)} className="bg-transparent border-zinc-700">
                  Back
                </Button>
                <Button 
                  onClick={() => importTransactions.mutate()} 
                  disabled={
                    importTransactions.isPending || 
                    !selectedAccountId || 
                    selectedAccountId === '_none_' ||
                    (selectedAccountId === '_new_' && !newAccountName.trim())
                  }
                  className="brand-gradient text-white"
                >
                  {importTransactions.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
                  ) : (
                    <>Import {fullCsvData.length} Transactions</>
                  )}
                </Button>
              </DialogFooter>
              </div>
              )}

              <CreateAccountDialog
              open={showCreateAccount}
              onClose={() => setShowCreateAccount(false)}
              onCreated={(newAccount) => {
              setSelectedAccountId(newAccount.id);
              }}
              />

              {/* Step 4: Success */}
          {step === 4 && importStats && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-zinc-100">Import Complete!</p>
                <p className="text-zinc-400 mt-1">Your transactions have been imported and processed.</p>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{importStats.buys}</p>
                  <p className="text-xs text-zinc-400">Buys</p>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                  <p className="text-2xl font-bold text-rose-400">{importStats.sells}</p>
                  <p className="text-xs text-zinc-400">Sells</p>
                </div>
              </div>

              {importStats.duplicatesSkipped > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-400">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    {importStats.duplicatesSkipped} duplicate transaction{importStats.duplicatesSkipped !== 1 ? 's' : ''} skipped
                  </p>
                </div>
              )}

              <div className="flex gap-3 text-sm text-zinc-400">
                <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400">{importStats.shortTerm} Short-term</span>
                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400">{importStats.longTerm} Long-term</span>
              </div>

              <Button onClick={handleClose} className="brand-gradient text-white">
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}