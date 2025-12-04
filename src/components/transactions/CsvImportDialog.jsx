import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Upload, FileSpreadsheet, ArrowRight, Check, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { differenceInDays } from 'date-fns';

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

export default function CsvImportDialog({ open, onClose }) {
  const [file, setFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvData, setCsvData] = useState([]);
  const [fullCsvData, setFullCsvData] = useState([]);
  const [mapping, setMapping] = useState({});
  const [step, setStep] = useState(1);
  const [parsingError, setParsingError] = useState(null);
  const [lotMethod, setLotMethod] = useState('HIFO');
  const [importStats, setImportStats] = useState(null);
  const queryClient = useQueryClient();

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
      if (tx.type === 'buy') {
        stats.buys++;
        const lotId = `${tx.asset_ticker}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const costBasis = (tx.quantity * tx.price_per_unit) + (tx.trading_fee || 0);
        
        const buyTx = {
          ...tx,
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
      } else if (tx.type === 'sell') {
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
            availableLots.sort((a, b) => (b.price_per_unit || 0) - (a.price_per_unit || 0));
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
          for (const lot of availableLots) {
            if (remainingToSell <= 0) break;
            const qtyFromLot = Math.min(remainingToSell, lot.remainingQuantity);
            totalCostBasis += qtyFromLot * (lot.price_per_unit || 0);
            lot.remainingQuantity -= qtyFromLot;
            remainingToSell -= qtyFromLot;
            
            const daysSincePurchase = differenceInDays(saleDate, new Date(lot.date));
            if (daysSincePurchase > 365) hasLongTerm = true;
            else hasShortTerm = true;
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
    if (csvData.length === 0 || Object.keys(mapping).length === 0) return [];
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
            value = String(value).toLowerCase();
            if (!['buy', 'sell'].includes(value)) value = 'buy';
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
              value = String(value).toLowerCase();
              if (!['buy', 'sell'].includes(value)) value = 'buy';
            }
            tx[field.key] = value;
          }
        }
        return tx;
      }).filter(tx => tx.quantity > 0 && tx.price_per_unit > 0);

      // Duplicate detection - check against existing transactions by transaction_id first, then by key
      const existingTxIds = new Set(
        existingTransactions.filter(t => t.transaction_id).map(t => t.transaction_id)
      );
      const existingTxKeys = new Set(
        existingTransactions.map(t => 
          `${t.type}-${t.asset_ticker}-${t.quantity}-${t.price_per_unit}-${t.date}`
        )
      );

      const uniqueTransactions = rawTransactions.filter(tx => {
        // Check by transaction_id first if present
        if (tx.transaction_id && existingTxIds.has(tx.transaction_id)) {
          return false;
        }
        const key = `${tx.type}-${tx.asset_ticker}-${tx.quantity}-${tx.price_per_unit}-${tx.date}`;
        return !existingTxKeys.has(key);
      });

      const duplicatesSkipped = rawTransactions.length - uniqueTransactions.length;

      // Process with lot matching (only unique transactions)
      const { transactions, stats } = processTransactionsWithLots(uniqueTransactions, lotMethod);
      stats.duplicatesSkipped = duplicatesSkipped;
      setImportStats(stats);

      // Bulk create transactions
      await base44.entities.Transaction.bulkCreate(transactions);

      // Sync Holdings - aggregate by ticker
      const holdingUpdates = {};
      for (const tx of transactions) {
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

      // Update or create holdings
      for (const [ticker, data] of Object.entries(holdingUpdates)) {
        const existingHolding = existingHoldings.find(h => h.ticker === ticker);
        if (existingHolding) {
          // Update existing holding
          const newQty = Math.max(0, (existingHolding.quantity || 0) + data.quantity);
          const newCostBasis = (existingHolding.cost_basis_total || 0) + data.costBasis;
          await base44.entities.Holding.update(existingHolding.id, {
            quantity: newQty,
            cost_basis_total: newCostBasis,
            current_price: data.lastPrice,
          });
        } else if (data.quantity > 0) {
          // Create new holding
          await base44.entities.Holding.create({
            asset_name: ticker,
            asset_type: ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'LTC'].includes(ticker) ? 'crypto' : 'stocks',
            ticker: ticker,
            quantity: data.quantity,
            current_price: data.lastPrice,
            cost_basis_total: data.costBasis,
            account_type: 'taxable',
          });
        }
      }

      return { count: transactions.length, stats };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['budgetItems'] });
      toast.success(`Imported ${data.count} transactions successfully!`);
      setStep(4); // Show summary
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
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
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Upload className="w-16 h-16 text-zinc-600" />
              <div className="text-center">
                <p className="text-zinc-200 text-lg font-medium">Upload your CSV file</p>
                <p className="text-zinc-500 text-sm mt-1">Export transactions from your exchange and import them here</p>
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
                        <SelectItem value="_none_" className="text-zinc-500 italic">— Not mapped —</SelectItem>
                        {csvHeaders.map(header => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mapping[field.key] && csvData[0] && (
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
                  Preview Import
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: Preview & Import */}
          {step === 3 && (
            <div className="space-y-4">
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
                  disabled={importTransactions.isPending}
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

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-lg">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{importStats.buys}</p>
                  <p className="text-xs text-zinc-400">Buys</p>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                  <p className="text-2xl font-bold text-rose-400">{importStats.sells}</p>
                  <p className="text-xs text-zinc-400">Sells</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-800 text-center">
                  <p className="text-2xl font-bold text-emerald-400">+${importStats.totalGains.toLocaleString()}</p>
                  <p className="text-xs text-zinc-400">Total Gains</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-800 text-center">
                  <p className="text-2xl font-bold text-rose-400">-${importStats.totalLosses.toLocaleString()}</p>
                  <p className="text-xs text-zinc-400">Total Losses</p>
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