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
import { syncHoldingFromLots } from '@/components/shared/syncHoldings';

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

const HOLDING_FIELDS = [
  { key: 'asset_ticker', label: 'Asset Ticker', required: true, description: 'e.g., BTC, VOO' },
  { key: 'quantity', label: 'Quantity', required: true, description: 'Amount currently held' },
  { key: 'cost_basis_total', label: 'Total Cost Basis', required: true, description: 'Total amount paid' },
  { key: 'acquisition_date', label: 'Acquisition Date', required: false, description: 'YYYY-MM-DD or estimated' },
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
  const [importType, setImportType] = useState('transactions');
  const [lotMethod, setLotMethod] = useState('HIFO');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('taxable_brokerage');
  const [newAccountInstitution, setNewAccountInstitution] = useState('');
  const [importStats, setImportStats] = useState(null);
  const [detectedDuplicates, setDetectedDuplicates] = useState([]);
  const [importDuplicates, setImportDuplicates] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [rowAssetTypes, setRowAssetTypes] = useState({});
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
    setImportType('transactions');
    setDetectedDuplicates([]);
    setImportDuplicates(false);
    setSelectedAccountId('');
    setNewAccountName('');
    setNewAccountType('taxable_brokerage');
    setNewAccountInstitution('');
    setSelectedRows(new Set());
    setRowAssetTypes({});
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

  // Auto-detect asset type based on ticker
  const detectAssetType = (ticker) => {
    if (!ticker) return 'stocks';
    const upperTicker = ticker.toUpperCase();
    if (upperTicker === 'BTC') return 'btc';
    const cryptoTickers = ['ETH', 'SOL', 'XRP', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LINK', 'DOGE', 'SHIB', 'LTC', 'BCH', 'UNI', 'ATOM', 'XLM', 'ALGO', 'FIL', 'NEAR', 'APT', 'ARB'];
    if (cryptoTickers.includes(upperTicker)) return 'other';
    return 'stocks';
  };

  // Initialize asset types when preview data loads
  useEffect(() => {
    if (mappedPreviewData.length > 0 && importType === 'holdings') {
      const initialTypes = {};
      mappedPreviewData.forEach((row, index) => {
        initialTypes[index] = detectAssetType(row.asset_ticker);
      });
      setRowAssetTypes(initialTypes);
    }
  }, [mappedPreviewData, importType]);

  // Process transactions with tax lot matching
  const processTransactionsWithLots = (rawTransactions, method) => {
    const existingBuys = existingTransactions
      .filter(t => t.type === 'buy')
      .map(t => ({
        id: t.id,
        asset_ticker: t.asset_ticker,
        date: t.date,
        quantity: t.quantity,
        price_per_unit: t.price_per_unit,
        cost_basis: t.cost_basis,
        remainingQuantity: t.remaining_quantity ?? t.quantity,
        isExisting: true,
      }));

    const sortedTransactions = [...rawTransactions].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    const processedTransactions = [];
    let stats = { buys: 0, sells: 0, totalGains: 0, totalLosses: 0, shortTerm: 0, longTerm: 0 };

    const lotPool = [...existingBuys];
    const modifiedLotIds = new Set(); // Track which existing lots were modified by sells

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
          remaining_quantity: tx.quantity, // CRITICAL FIX: Set explicitly
        };
        
        processedTransactions.push(buyTx);
        lotPool.push({
          id: lotId,
          asset_ticker: tx.asset_ticker,
          date: tx.date,
          quantity: tx.quantity,
          price_per_unit: tx.price_per_unit,
          cost_basis: costBasis,
          remainingQuantity: tx.quantity,
          isExisting: false,
        });
      } else if (isSell) {
        stats.sells++;
        const saleDate = new Date(tx.date);
        
        let availableLots = lotPool
          .filter(lot => 
            lot.asset_ticker === tx.asset_ticker && 
            lot.remainingQuantity > 0 &&
            new Date(lot.date) <= saleDate
          );

        switch (method) {
          case 'FIFO':
            availableLots.sort((a, b) => new Date(a.date) - new Date(b.date));
            break;
          case 'LIFO':
            availableLots.sort((a, b) => new Date(b.date) - new Date(a.date));
            break;
          case 'HIFO':
            availableLots.sort((a, b) => (b.price_per_unit || 0) - (a.price_per_unit || 0));
            break;
          case 'AVG':
            break;
        }

        let remainingToSell = tx.quantity;
        let totalCostBasis = 0;
        let hasLongTerm = false;
        let hasShortTerm = false;
        const lotsUsed = []; // CRITICAL FIX: Track lots used

        if (method === 'AVG') {
          const totalQty = availableLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
          const totalCost = availableLots.reduce((sum, lot) => 
            sum + (lot.remainingQuantity * (lot.price_per_unit || 0)), 0
          );
          const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
          totalCostBasis = tx.quantity * avgCost;
          
          for (const lot of availableLots) {
            if (remainingToSell <= 0) break;
            const qtyFromLot = Math.min(remainingToSell, lot.remainingQuantity);
            lot.remainingQuantity -= qtyFromLot;
            remainingToSell -= qtyFromLot;
            
            // Track modified existing lots for database update
            if (lot.isExisting && lot.id) {
              modifiedLotIds.add(lot.id);
            }
            
            const daysSincePurchase = differenceInDays(saleDate, new Date(lot.date));
            if (daysSincePurchase > 365) hasLongTerm = true;
            else hasShortTerm = true;

            lotsUsed.push({
              lot_id: lot.id,
              quantity_sold: qtyFromLot,
              cost_basis: qtyFromLot * (lot.price_per_unit || 0),
              price_per_unit: lot.price_per_unit || 0,
              purchase_date: lot.date,
            });
          }
        } else {
          for (const lot of availableLots) {
            if (remainingToSell <= 0) break;
            const qtyFromLot = Math.min(remainingToSell, lot.remainingQuantity);
            const costFromLot = qtyFromLot * (lot.price_per_unit || 0);
            
            totalCostBasis += costFromLot;
            lot.remainingQuantity -= qtyFromLot;
            remainingToSell -= qtyFromLot;
            
            // Track modified existing lots for database update
            if (lot.isExisting && lot.id) {
              modifiedLotIds.add(lot.id);
            }
            
            const daysSincePurchase = differenceInDays(saleDate, new Date(lot.date));
            if (daysSincePurchase > 365) hasLongTerm = true;
            else hasShortTerm = true;

            // CRITICAL FIX: Record which lot was used and how much
            lotsUsed.push({
              lot_id: lot.id,
              quantity_sold: qtyFromLot,
              cost_basis: costFromLot,
              price_per_unit: lot.price_per_unit || 0,
              purchase_date: lot.date,
            });
          }
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
          lots_used: lotsUsed, // CRITICAL FIX: Attach lots_used array
        });
      }
    }

    // Return modified lot info for database updates
    const modifiedLots = [];
    for (const lotId of modifiedLotIds) {
      const lot = lotPool.find(l => l.id === lotId);
      if (lot) {
        modifiedLots.push({
          id: lotId,
          remainingQuantity: lot.remainingQuantity,
        });
      }
    }

    return { transactions: processedTransactions, stats, modifiedLots };
  };

  // Process holdings import with asset types
  const processHoldings = (rawHoldings, assetTypes = {}) => {
    const results = [];
    let stats = { holdings: 0, errors: 0 };

    rawHoldings.forEach((row, index) => {
      const quantity = parseFloat(row.quantity) || 0;
      const costBasisTotal = parseFloat(row.cost_basis_total) || 0;
      const ticker = String(row.asset_ticker || '').toUpperCase().trim();
      
      if (!ticker || quantity <= 0 || costBasisTotal < 0) {
        stats.errors++;
        return;
      }

      stats.holdings++;
      const pricePerUnit = quantity > 0 ? costBasisTotal / quantity : 0;
      
      let acquisitionDate;
      try {
        acquisitionDate = row.acquisition_date ? row.acquisition_date : '2015-01-01';
      } catch {
        acquisitionDate = '2015-01-01';
      }
      
      const lotId = `holding-import-${ticker}-${Date.now()}-${index}`;
      
      results.push({
        holding: {
          ticker: ticker,
          asset_name: ticker,
          quantity: quantity,
          cost_basis_total: costBasisTotal,
          current_price: pricePerUnit,
          asset_type: assetTypes[index] || detectAssetType(ticker),
          notes: 'Imported from CSV',
        },
        syntheticTransaction: {
          type: 'buy',
          asset_ticker: ticker,
          quantity: quantity,
          remaining_quantity: quantity,
          cost_basis: costBasisTotal,
          price_per_unit: pricePerUnit,
          total_value: costBasisTotal,
          date: acquisitionDate,
          exchange_or_wallet: 'Imported',
          notes: `Synthetic buy from holdings import`,
          lot_id: lotId,
        }
      });
    });
    
    return { results, stats };
  };

  const activeFields = importType === 'transactions' ? TRANSACTION_FIELDS : HOLDING_FIELDS;

  // Stringify mapping for stable dependency
  const mappingKey = JSON.stringify(mapping);

  // Check for duplicates when entering Step 3
  React.useEffect(() => {
    if (step !== 3) {
      setDetectedDuplicates([]);
      setImportDuplicates(false);
      return;
    }
    
    if (fullCsvData.length === 0 || importType !== 'transactions') {
      return;
    }

    const parsedMapping = JSON.parse(mappingKey);
    
    const rawData = fullCsvData.map(row => {
      const item = {};
      for (const field of TRANSACTION_FIELDS) {
        const mappedColumn = parsedMapping[field.key];
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
            if (value.includes('sell') || value.includes('sold') || value === 'sale' || value === 's') {
              value = 'sell';
            } else {
              value = 'buy';
            }
          }
          item[field.key] = value;
        }
      }
      return item;
    }).filter(tx => tx.quantity > 0 && tx.price_per_unit > 0);

    const dupes = [];
    for (const tx of rawData) {
      if (tx.transaction_id) {
        const match = existingTransactions.find(e => e.transaction_id === tx.transaction_id);
        if (match) {
          dupes.push({ new: tx, existing: match });
          continue;
        }
      }
      const exactMatch = existingTransactions.find(e =>
        e.asset_ticker === tx.asset_ticker &&
        e.type === tx.type &&
        Math.abs((e.quantity || 0) - (tx.quantity || 0)) < 0.000001 &&
        Math.abs((e.price_per_unit || 0) - (tx.price_per_unit || 0)) < 0.000001 &&
        new Date(e.date).toDateString() === new Date(tx.date).toDateString() &&
        e.exchange_or_wallet === tx.exchange_or_wallet
      );
      if (exactMatch) {
        dupes.push({ new: tx, existing: exactMatch });
      }
    }
    setDetectedDuplicates(dupes);
  }, [step, fullCsvData, importType, mappingKey, existingTransactions]);

  const mappedPreviewData = useMemo(() => {
    if (!csvData || csvData.length === 0 || Object.keys(mapping).length === 0) return [];
    return csvData.map(row => {
      const previewRow = {};
      for (const field of activeFields) {
        const mappedColumn = mapping[field.key];
        if (mappedColumn && row[mappedColumn] !== undefined) {
          let value = row[mappedColumn];
          if (['quantity', 'price_per_unit', 'trading_fee', 'cost_basis_total'].includes(field.key)) {
            value = parseFloat(String(value).replace(/[^0-9.-]+/g, "")) || 0;
          } else if (field.key === 'date' || field.key === 'acquisition_date') {
            value = String(value).split(' ')[0];
          } else if (field.key === 'asset_ticker') {
            value = String(value).toUpperCase();
          } else if (field.key === 'type') {
            value = String(value).toLowerCase().trim();
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
  }, [csvData, mapping, activeFields]);

  const allRequiredFieldsMapped = useMemo(() => {
    return activeFields.every(field => 
      !field.required || (mapping[field.key] && csvHeaders.includes(mapping[field.key]))
    );
  }, [mapping, csvHeaders, activeFields]);

  const importData = useMutation({
    mutationFn: async () => {
      // Parse all data with mapped fields
      const rawData = fullCsvData.map(row => {
        const item = {};
        for (const field of activeFields) {
          const mappedColumn = mapping[field.key];
          if (mappedColumn && row[mappedColumn] !== undefined) {
            let value = row[mappedColumn];
            if (['quantity', 'price_per_unit', 'trading_fee', 'cost_basis_total'].includes(field.key)) {
              value = parseFloat(String(value).replace(/[^0-9.-]+/g, "")) || 0;
            } else if (field.key === 'date' || field.key === 'acquisition_date') {
              value = String(value).split(' ')[0];
            } else if (field.key === 'asset_ticker') {
              value = String(value).toUpperCase();
            } else if (field.key === 'type') {
              value = String(value).toLowerCase().trim();
              if (value.includes('sell') || value.includes('sold') || value === 'sale' || value === 's') {
                value = 'sell';
              } else if (value.includes('buy') || value.includes('bought') || value === 'purchase' || value === 'b') {
                value = 'buy';
              } else if (!['buy', 'sell'].includes(value)) {
                value = 'buy';
              }
            }
            item[field.key] = value;
          }
        }
        return item;
      });

      // Create new account if needed
      let finalAccountId = selectedAccountId;
      let taxTreatment = 'taxable';
      let legacyAccountType = 'taxable';

      if (selectedAccountId === '_new_' && newAccountName.trim()) {
        const taxTreatment = 
          newAccountType?.includes('roth') || newAccountType === 'hsa' 
            ? 'tax_free' 
            : newAccountType?.includes('traditional') 
              ? 'tax_deferred' 
              : 'taxable';
        
        const newAccount = await base44.entities.Account.create({
          name: newAccountName.trim(),
          account_type: newAccountType,
          tax_treatment: taxTreatment,
          institution: newAccountInstitution?.trim() || undefined,
        });
        
        finalAccountId = newAccount.id;
        console.log(`✅ Created new account: ${newAccount.name} (${newAccount.id})`);
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
      }

      // ===== HOLDINGS IMPORT =====
      if (importType === 'holdings') {
        const { results, stats } = processHoldings(rawData, rowAssetTypes);
        
        for (const { holding, syntheticTransaction } of results) {
          // Create or update holding
          const existingHolding = await base44.entities.Holding.list();
          const match = existingHolding.find(h => 
            h.ticker === holding.ticker && h.account_id === finalAccountId
          );
          
          if (match) {
            await base44.entities.Holding.update(match.id, {
              quantity: (match.quantity || 0) + holding.quantity,
              cost_basis_total: (match.cost_basis_total || 0) + holding.cost_basis_total,
            });
          } else {
            await base44.entities.Holding.create({
              ...holding,
              account_id: finalAccountId,
              account_type: legacyAccountType,
              tax_treatment: taxTreatment,
            });
          }
          
          // Create synthetic transaction for tax lot tracking
          await base44.entities.Transaction.create({
            ...syntheticTransaction,
            account_id: finalAccountId,
            account_type: legacyAccountType,
          });
        }
        
        setImportStats(stats);
        return { count: results.length, stats };
      }

      // ===== TRANSACTIONS IMPORT =====
      const validTransactions = rawData.filter(tx => tx.quantity > 0 && tx.price_per_unit > 0);
      const { transactions: processedTransactions, stats, modifiedLots } = processTransactionsWithLots(validTransactions, lotMethod);
      stats.duplicatesSkipped = rawData.length - validTransactions.length;

      // Smart duplicate detection
      const findDuplicate = (newTx) => {
        if (newTx.transaction_id) {
          return existingTransactions.find(existing => 
            existing.transaction_id === newTx.transaction_id
          );
        }
        return existingTransactions.find(existing => 
          existing.asset_ticker === newTx.asset_ticker &&
          existing.type === newTx.type &&
          Math.abs((existing.quantity || 0) - (newTx.quantity || 0)) < 0.000001 &&
          Math.abs((existing.price_per_unit || 0) - (newTx.price_per_unit || 0)) < 0.000001 &&
          new Date(existing.date).toDateString() === new Date(newTx.date).toDateString() &&
          existing.exchange_or_wallet === newTx.exchange_or_wallet
        );
      };

      const uniqueTransactions = [];
      let duplicateCount = 0;
      for (const tx of processedTransactions) {
        const existingMatch = findDuplicate(tx);
        if (existingMatch && !importDuplicates) {
          duplicateCount++;
        } else {
          uniqueTransactions.push(tx);
        }
      }
      stats.duplicatesSkipped += duplicateCount;

      if (uniqueTransactions.length === 0) {
        throw new Error('No new transactions to import (all duplicates)');
      }

      const transactionsToCreate = uniqueTransactions.map(tx => {
        let txAccountId = finalAccountId;
        
        if (!finalAccountId && tx.exchange_or_wallet) {
          const matchingAccount = accounts.find(a => 
            a.name.toLowerCase().trim() === tx.exchange_or_wallet.toLowerCase().trim()
          );
          if (matchingAccount) {
            txAccountId = matchingAccount.id;
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
        for (const tx of transactionsToCreate) {
          try {
            await base44.entities.Transaction.create(tx);
          } catch (innerErr) {
            stats.duplicatesSkipped = (stats.duplicatesSkipped || 0) + 1;
          }
        }
      }
      
      setImportStats(stats);

      // CRITICAL: Update existing lots that were consumed by sell transactions
      if (modifiedLots && modifiedLots.length > 0) {
        console.log(`=== UPDATING ${modifiedLots.length} MODIFIED LOTS IN DATABASE ===`);
        for (const lot of modifiedLots) {
          await base44.entities.Transaction.update(lot.id, {
            remaining_quantity: lot.remainingQuantity,
          });
          console.log(`Updated lot ${lot.id}: remaining_quantity = ${lot.remainingQuantity}`);
        }
      }

      // Sync holdings from lots (source of truth)
      console.log("=== SYNCING HOLDINGS FROM LOTS ===");
      const uniqueAssets = [...new Set(transactionsToCreate.map(tx => `${tx.asset_ticker}|${tx.account_id || ''}`))];
      
      for (const key of uniqueAssets) {
        const [ticker, accountId] = key.split('|');
        if (ticker && accountId) {
          await syncHoldingFromLots(ticker, accountId);
        }
      }
      
      console.log("=== SYNC COMPLETE ===");

      return { count: uniqueTransactions.length, stats };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(`Imported ${data.count} ${importType} successfully!`);
      setStep(4);
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
            Import from CSV
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
                <p className="text-zinc-200 text-lg font-medium">Import Data from CSV</p>
                <p className="text-zinc-500 text-sm mt-1">Choose what kind of data you're importing</p>
              </div>

              {/* Import Type Selection */}
              <div className="w-full max-w-md space-y-3">
                <Label className="text-zinc-300 font-medium">What are you importing?</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setImportType('transactions')}
                    className={cn(
                      "p-4 rounded-lg border text-left transition-all",
                      importType === 'transactions'
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                    )}
                  >
                    <div className="font-medium text-zinc-200">Transaction History</div>
                    <div className="text-xs text-zinc-400 mt-1">Buys & sells with dates & prices</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportType('holdings')}
                    className={cn(
                      "p-4 rounded-lg border text-left transition-all",
                      importType === 'holdings'
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                    )}
                  >
                    <div className="font-medium text-zinc-200">Current Holdings</div>
                    <div className="text-xs text-zinc-400 mt-1">For limited transaction history</div>
                  </button>
                </div>
              </div>
              
              {/* Instructions */}
              <div className="w-full max-w-md p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 text-left">
                {importType === 'transactions' ? (
                  <>
                    <p className="text-sm font-medium text-zinc-300 mb-3">Required CSV columns for Transactions:</p>
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
                    <p className="text-xs text-zinc-500 mt-3">Optional: Trading Fee, Exchange/Wallet, Transaction ID, Notes</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-zinc-300 mb-3">Required CSV columns for Holdings:</p>
                    <ul className="text-xs text-zinc-400 space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-orange-400 font-semibold">•</span>
                        <span><strong className="text-zinc-300">Asset Ticker</strong> — e.g., "BTC", "VOO", "AAPL"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-orange-400 font-semibold">•</span>
                        <span><strong className="text-zinc-300">Quantity</strong> — Amount currently held</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-orange-400 font-semibold">•</span>
                        <span><strong className="text-zinc-300">Total Cost Basis</strong> — Total amount paid</span>
                      </li>
                    </ul>
                    <p className="text-xs text-zinc-500 mt-3">Optional: Acquisition Date</p>
                    <div className="mt-3 pt-3 border-t border-zinc-700">
                     <p className="text-sm text-zinc-300">
                       <span className="text-orange-400 font-semibold">💡 Use this for:</span> Old accounts with limited history (e.g., Fidelity only gives 5 years). Creates a single buy transaction per holding for future tax lot tracking. Asset type is auto-detected and can be edited in preview.
                     </p>
                    </div>
                  </>
                )}
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
                  Map your CSV columns to {importType} fields below.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeFields.map(field => (
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
                <p className="text-xs text-zinc-500 mb-3">Select an existing account or create a new one for these {importType}.</p>
                <Select
                  value={selectedAccountId || ''}
                  onValueChange={(value) => {
                    if (value === '_create_') {
                      setSelectedAccountId('_new_');
                      setNewAccountName('');
                      setNewAccountType('taxable_brokerage');
                      setNewAccountInstitution('');
                    } else {
                      setSelectedAccountId(value);
                    }
                  }}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-700">
                    <SelectValue placeholder="Select or create an account..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {accounts.map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} ({account.account_type?.replace(/_/g, ' ')})
                      </SelectItem>
                    ))}
                    <div className="border-t border-zinc-700 my-1" />
                    <SelectItem value="_create_" className="text-orange-400">
                      <Plus className="w-4 h-4 inline mr-2" /> Create New Account
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {!selectedAccountId && (
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mt-3">
                    <p className="text-blue-400 text-sm">
                      📋 Select an existing account or create a new one to import these {importType}.
                    </p>
                  </div>
                )}

                {selectedAccountId === '_new_' && (
                  <div className="mt-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-4">
                    <h4 className="text-sm font-medium text-zinc-300">Create New Account</h4>
                    
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Account Name *</label>
                      <Input
                        type="text"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        placeholder="e.g., Cold Storage BTC, Coinbase, Fidelity 401k"
                        className="bg-zinc-900 border-zinc-700"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Account Type *</label>
                      <Select value={newAccountType} onValueChange={setNewAccountType}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          <SelectItem value="taxable_brokerage">Taxable Brokerage</SelectItem>
                          <SelectItem value="taxable_crypto">Taxable Crypto (Exchange/Wallet)</SelectItem>
                          <SelectItem value="ira_roth">Roth IRA (Tax-Free)</SelectItem>
                          <SelectItem value="ira_traditional">Traditional IRA (Tax-Deferred)</SelectItem>
                          <SelectItem value="401k_roth">Roth 401k (Tax-Free)</SelectItem>
                          <SelectItem value="401k_traditional">Traditional 401k (Tax-Deferred)</SelectItem>
                          <SelectItem value="hsa">HSA (Tax-Free)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Institution (optional)</label>
                      <Input
                        type="text"
                        value={newAccountInstitution}
                        onChange={(e) => setNewAccountInstitution(e.target.value)}
                        placeholder="e.g., Fidelity, Coinbase, Ledger"
                        className="bg-zinc-900 border-zinc-700"
                      />
                    </div>
                    
                    <div className="text-xs text-zinc-500">
                      Tax Treatment: {
                        newAccountType?.includes('roth') || newAccountType === 'hsa' 
                          ? '🟢 Tax-Free (no taxes on gains)' 
                          : newAccountType?.includes('traditional') || newAccountType?.includes('401k')
                            ? '🟡 Tax-Deferred (taxed on withdrawal)'
                            : '🔴 Taxable (capital gains taxes apply)'
                      }
                    </div>
                    
                    {!newAccountName.trim() && (
                      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded p-2">
                        <p className="text-yellow-400 text-xs">
                          ⚠️ Please enter a name for your new account.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Lot Method Selection - Only for transactions */}
              {/* Duplicate Warning */}
              {detectedDuplicates.length > 0 && importType === 'transactions' && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-400 mb-3">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">
                      {detectedDuplicates.length} potential duplicate(s) found
                    </span>
                  </div>
                  
                  <p className="text-sm text-zinc-400 mb-3">
                    These transactions match existing records. This could be legitimate (multiple purchases same day) or accidental re-import.
                  </p>
                  
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importDuplicates}
                        onChange={(e) => setImportDuplicates(e.target.checked)}
                        className="rounded border-zinc-600 bg-zinc-700 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="text-sm text-zinc-300">Import duplicates anyway</span>
                    </label>
                  </div>
                  
                  <details className="mt-3">
                    <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">
                      Show duplicate details
                    </summary>
                    <div className="mt-2 max-h-32 overflow-y-auto text-xs text-zinc-400 space-y-1">
                      {detectedDuplicates.slice(0, 10).map((d, i) => (
                        <div key={i} className="p-2 bg-zinc-800/50 rounded">
                          {d.new.type?.toUpperCase()} {d.new.quantity} {d.new.asset_ticker} @ ${d.new.price_per_unit} on {d.new.date}
                        </div>
                      ))}
                      {detectedDuplicates.length > 10 && (
                        <div className="text-zinc-500">...and {detectedDuplicates.length - 10} more</div>
                      )}
                    </div>
                  </details>
                </div>
              )}

              {importType === 'transactions' && (
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
              )}

              {/* Preview Table */}
              <div>
                <p className="text-sm text-zinc-400 mb-2">Preview (first 10 rows of {fullCsvData.length}):</p>
                
                {importType === 'holdings' ? (
                  <div className="space-y-3">
                    {/* Bulk actions bar - only show when rows selected */}
                    {selectedRows.size > 0 && (
                      <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                        <span className="text-sm text-orange-400 font-medium">{selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected</span>
                        <Select
                          onValueChange={(value) => {
                            const newTypes = { ...rowAssetTypes };
                            selectedRows.forEach(index => {
                              newTypes[index] = value;
                            });
                            setRowAssetTypes(newTypes);
                          }}
                        >
                          <SelectTrigger className="w-44 bg-zinc-900 border-zinc-700 text-zinc-100">
                            <SelectValue placeholder="Bulk Set Type..." />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700">
                            <SelectItem value="btc" className="text-zinc-100">BTC (Bitcoin)</SelectItem>
                            <SelectItem value="stocks" className="text-zinc-100">Stocks</SelectItem>
                            <SelectItem value="bonds" className="text-zinc-100">Bonds</SelectItem>
                            <SelectItem value="real_estate" className="text-zinc-100">Real Estate</SelectItem>
                            <SelectItem value="cash" className="text-zinc-100">Cash</SelectItem>
                            <SelectItem value="other" className="text-zinc-100">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedRows(new Set())}
                          className="text-zinc-400 hover:text-zinc-100"
                        >
                          Clear Selection
                        </Button>
                      </div>
                    )}

                    {/* Table */}
                    <div className="border border-zinc-800 rounded-lg overflow-hidden">
                      {/* Header */}
                      <div className="grid grid-cols-12 gap-2 p-3 bg-zinc-800/50 text-sm font-medium text-zinc-400">
                        <div className="col-span-1 flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedRows.size === mappedPreviewData.length && mappedPreviewData.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRows(new Set(mappedPreviewData.map((_, i) => i)));
                              } else {
                                setSelectedRows(new Set());
                              }
                            }}
                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-900"
                          />
                        </div>
                        <div className="col-span-2">Ticker</div>
                        <div className="col-span-2">Quantity</div>
                        <div className="col-span-2">Cost Basis</div>
                        <div className="col-span-2">Date</div>
                        <div className="col-span-3">Asset Type</div>
                      </div>

                      {/* Rows */}
                      <div className="max-h-64 overflow-y-auto">
                        {mappedPreviewData.map((row, index) => (
                          <div 
                            key={index} 
                            className={cn(
                              "grid grid-cols-12 gap-2 p-3 items-center text-sm border-t border-zinc-800",
                              selectedRows.has(index) && 'bg-orange-500/5'
                            )}
                          >
                            <div className="col-span-1">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(index)}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedRows);
                                  if (e.target.checked) {
                                    newSelected.add(index);
                                  } else {
                                    newSelected.delete(index);
                                  }
                                  setSelectedRows(newSelected);
                                }}
                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-900"
                              />
                            </div>
                            <div className="col-span-2 text-zinc-100 font-medium">{row.asset_ticker}</div>
                            <div className="col-span-2 text-zinc-100">{Number(row.quantity).toFixed(8)}</div>
                            <div className="col-span-2 text-zinc-100">${Number(row.cost_basis_total).toLocaleString()}</div>
                            <div className="col-span-2 text-zinc-400">{row.acquisition_date || '—'}</div>
                            <div className="col-span-3">
                              <Select
                                value={rowAssetTypes[index] || 'stocks'}
                                onValueChange={(value) => {
                                  setRowAssetTypes({ ...rowAssetTypes, [index]: value });
                                }}
                              >
                                <SelectTrigger className="h-8 bg-zinc-900 border-zinc-700 text-zinc-100">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-700">
                                  <SelectItem value="btc" className="text-zinc-100">BTC</SelectItem>
                                  <SelectItem value="stocks" className="text-zinc-100">Stocks</SelectItem>
                                  <SelectItem value="bonds" className="text-zinc-100">Bonds</SelectItem>
                                  <SelectItem value="real_estate" className="text-zinc-100">Real Estate</SelectItem>
                                  <SelectItem value="cash" className="text-zinc-100">Cash</SelectItem>
                                  <SelectItem value="other" className="text-zinc-100">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg border-zinc-700 max-h-48">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-700">
                          {activeFields.filter(f => mapping[f.key]).map(field => (
                            <TableHead key={field.key} className="text-zinc-400 text-xs whitespace-nowrap">
                              {field.label}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappedPreviewData.map((row, index) => (
                          <TableRow key={index} className="border-zinc-800">
                            {activeFields.filter(f => mapping[f.key]).map(field => (
                              <TableCell key={field.key} className={cn(
                                "text-xs whitespace-nowrap",
                                row[field.key] === '—' && 'text-rose-400',
                                field.key === 'type' && row[field.key] === 'buy' && 'text-emerald-400',
                                field.key === 'type' && row[field.key] === 'sell' && 'text-rose-400'
                              )}>
                                {['quantity', 'price_per_unit', 'trading_fee', 'cost_basis_total'].includes(field.key)
                                  ? (typeof row[field.key] === 'number' ? row[field.key].toLocaleString() : row[field.key])
                                  : row[field.key]}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {importType === 'transactions' && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-400">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    Sell transactions will be automatically matched to tax lots using <strong>{LOT_METHODS[lotMethod].name}</strong>. 
                    Cost basis and gains will be calculated based on your existing and imported buy transactions.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(2)} className="bg-transparent border-zinc-700">
                  Back
                </Button>
                <Button 
                  type="button"
                  onClick={() => importData.mutate()} 
                  disabled={
                    importData.isPending || 
                    !selectedAccountId || 
                    (selectedAccountId === '_new_' && (!newAccountName.trim() || !newAccountType))
                  }
                  className="brand-gradient text-white"
                >
                  {importData.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
                  ) : (
                    <>Import {fullCsvData.length} {importType === 'holdings' ? 'Holdings' : 'Transactions'}</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && importStats && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-zinc-100">Import Complete!</p>
                <p className="text-zinc-400 mt-1">Your {importType} have been imported and processed.</p>
              </div>

              {importType === 'transactions' ? (
                <>
                  <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                      <p className="text-2xl font-bold text-emerald-400">{importStats.buys || 0}</p>
                      <p className="text-xs text-zinc-400">Buys</p>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                      <p className="text-2xl font-bold text-rose-400">{importStats.sells || 0}</p>
                      <p className="text-xs text-zinc-400">Sells</p>
                    </div>
                  </div>

                  {importStats.duplicatesSkipped > 0 && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <p className="text-sm text-amber-400">
                        <AlertTriangle className="w-4 h-4 inline mr-1" />
                        {importStats.duplicatesSkipped} invalid row{importStats.duplicatesSkipped !== 1 ? 's' : ''} skipped
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 text-sm text-zinc-400">
                    <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400">{importStats.shortTerm || 0} Short-term</span>
                    <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400">{importStats.longTerm || 0} Long-term</span>
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{importStats.holdings || 0}</p>
                  <p className="text-xs text-zinc-400">Holdings Imported</p>
                  {importStats.errors > 0 && (
                    <p className="text-xs text-amber-400 mt-1">{importStats.errors} rows had errors</p>
                  )}
                </div>
              )}

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