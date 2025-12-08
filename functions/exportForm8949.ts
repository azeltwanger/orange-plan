import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { year } = await req.json();

    if (!year) {
      return Response.json({ error: 'Year is required' }, { status: 400 });
    }

    // Fetch all transactions for the year
    const allTransactions = await base44.entities.Transaction.list();
    const yearTransactions = allTransactions.filter(t => {
      const txDate = new Date(t.date);
      return txDate.getFullYear() === parseInt(year);
    });

    // Filter only sell transactions with realized gains/losses
    const sellTransactions = yearTransactions.filter(t => t.type === 'sell');

    // Separate short-term and long-term
    const shortTerm = sellTransactions.filter(t => t.holding_period === 'short_term');
    const longTerm = sellTransactions.filter(t => t.holding_period === 'long_term');

    // Calculate totals
    const shortTermGainLoss = shortTerm.reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);
    const longTermGainLoss = longTerm.reduce((sum, t) => sum + (t.realized_gain_loss || 0), 0);

    // Format for Form 8949
    const formatTransaction = (tx) => ({
      description: `${tx.quantity} ${tx.asset_ticker}`,
      dateAcquired: tx.lot_id ? new Date(tx.lot_id.split('_')[1]).toLocaleDateString() : 'Various',
      dateSold: new Date(tx.date).toLocaleDateString(),
      proceeds: tx.total_value.toFixed(2),
      costBasis: tx.cost_basis ? tx.cost_basis.toFixed(2) : '0.00',
      gainLoss: (tx.realized_gain_loss || 0).toFixed(2),
    });

    const report = {
      year: year,
      shortTerm: {
        transactions: shortTerm.map(formatTransaction),
        totalGainLoss: shortTermGainLoss.toFixed(2),
      },
      longTerm: {
        transactions: longTerm.map(formatTransaction),
        totalGainLoss: longTermGainLoss.toFixed(2),
      },
      totalGainLoss: (shortTermGainLoss + longTermGainLoss).toFixed(2),
    };

    // Generate CSV content
    let csv = `Form 8949 Report - Tax Year ${year}\n\n`;
    
    csv += `SHORT-TERM CAPITAL GAINS AND LOSSES\n`;
    csv += `Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain/Loss\n`;
    report.shortTerm.transactions.forEach(tx => {
      csv += `"${tx.description}",${tx.dateAcquired},${tx.dateSold},${tx.proceeds},${tx.costBasis},${tx.gainLoss}\n`;
    });
    csv += `\nTotal Short-Term Gain/Loss:,,,,,${report.shortTerm.totalGainLoss}\n\n`;

    csv += `LONG-TERM CAPITAL GAINS AND LOSSES\n`;
    csv += `Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain/Loss\n`;
    report.longTerm.transactions.forEach(tx => {
      csv += `"${tx.description}",${tx.dateAcquired},${tx.dateSold},${tx.proceeds},${tx.costBasis},${tx.gainLoss}\n`;
    });
    csv += `\nTotal Long-Term Gain/Loss:,,,,,${report.longTerm.totalGainLoss}\n\n`;
    csv += `Total Capital Gain/Loss:,,,,,${report.totalGainLoss}\n`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=Form8949_${year}.csv`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});