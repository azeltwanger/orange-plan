import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Newton-Raphson method to solve for IRR
function calculateXIRR(cashFlows, dates, guess = 0.1) {
  // cashFlows: array of amounts (negative = outflow, positive = inflow)
  // dates: array of Date objects corresponding to each cashflow
  
  if (cashFlows.length !== dates.length || cashFlows.length < 2) {
    return null;
  }
  
  const daysBetween = (d1, d2) => (d2 - d1) / (1000 * 60 * 60 * 24);
  const firstDate = dates[0];
  
  // Convert dates to years from first date
  const years = dates.map(d => daysBetween(firstDate, d) / 365);
  
  // NPV function: sum of cashflows / (1 + rate)^years
  const npv = (rate) => {
    return cashFlows.reduce((sum, cf, i) => {
      return sum + cf / Math.pow(1 + rate, years[i]);
    }, 0);
  };
  
  // Derivative of NPV
  const npvDerivative = (rate) => {
    return cashFlows.reduce((sum, cf, i) => {
      if (years[i] === 0) return sum;
      return sum - (years[i] * cf) / Math.pow(1 + rate, years[i] + 1);
    }, 0);
  };
  
  // Newton-Raphson iteration
  let rate = guess;
  const maxIterations = 100;
  const tolerance = 0.0000001;
  
  for (let i = 0; i < maxIterations; i++) {
    const npvValue = npv(rate);
    const derivative = npvDerivative(rate);
    
    if (Math.abs(derivative) < tolerance) {
      // Derivative too small, try bisection
      break;
    }
    
    const newRate = rate - npvValue / derivative;
    
    if (Math.abs(newRate - rate) < tolerance) {
      return newRate;
    }
    
    // Bound the rate to avoid divergence
    rate = Math.max(-0.99, Math.min(10, newRate));
  }
  
  // Fallback: bisection method if Newton-Raphson fails
  let low = -0.99;
  let high = 5;
  
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid);
    
    if (Math.abs(npvMid) < tolerance) {
      return mid;
    }
    
    if (npv(low) * npvMid < 0) {
      high = mid;
    } else {
      low = mid;
    }
  }
  
  return (low + high) / 2;
}

// Parse various date formats
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Try ISO format first
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // Try M/D/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(d.getTime())) return d;
  }
  
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get request body for current prices
    let currentPrices = {};
    try {
      const body = await req.json();
      currentPrices = body.currentPrices || {};
    } catch {
      // No body provided, will use holdings for prices
    }
    
    // Fetch all transactions and holdings
    const [transactions, holdings] = await Promise.all([
      base44.entities.Transaction.list(),
      base44.entities.Holding.list()
    ]);
    
    if (!transactions || transactions.length === 0) {
      return Response.json({
        success: false,
        error: 'No transactions available',
        metrics: null
      });
    }
    
    // Filter transactions with valid dates and exclude soft-deleted
    const validTransactions = transactions.filter(tx => {
      const date = parseDate(tx.date);
      // Exclude soft-deleted transactions and those without valid dates
      if (tx.is_deleted === true) return false;
      return date !== null;
    });
    
    if (validTransactions.length === 0) {
      return Response.json({
        success: false,
        error: 'No transactions with valid dates',
        metrics: null
      });
    }
    
    // Sort transactions by date
    validTransactions.sort((a, b) => parseDate(a.date) - parseDate(b.date));
    
    // Build cashflows array
    // Negative = money going out (buys/investments)
    // Positive = money coming in (sells/withdrawals)
    const cashFlows = [];
    const dates = [];
    
    let totalInvested = 0;
    let totalWithdrawn = 0;
    
    for (const tx of validTransactions) {
      const txDate = parseDate(tx.date);
      const amount = tx.cost_basis || (tx.quantity * tx.price_per_unit) || tx.total_value || 0;
      
      if (tx.type === 'buy') {
        cashFlows.push(-Math.abs(amount)); // Money out
        totalInvested += Math.abs(amount);
      } else if (tx.type === 'sell') {
        const saleAmount = tx.total_value || (tx.quantity * tx.price_per_unit) || 0;
        cashFlows.push(Math.abs(saleAmount)); // Money in
        totalWithdrawn += Math.abs(saleAmount);
      }
      
      dates.push(txDate);
    }
    
    // Calculate current portfolio value
    let currentPortfolioValue = 0;
    const holdingsByTicker = {};
    
    for (const holding of holdings) {
      if (holding.quantity > 0) {
        const price = currentPrices[holding.ticker] || holding.current_price || 0;
        const value = holding.quantity * price;
        currentPortfolioValue += value;
        holdingsByTicker[holding.ticker] = {
          quantity: holding.quantity,
          value,
          price
        };
      }
    }
    
    if (currentPortfolioValue <= 0) {
      return Response.json({
        success: false,
        error: 'Current portfolio value is zero',
        metrics: {
          totalInvested,
          currentValue: 0,
          totalGainLoss: -totalInvested + totalWithdrawn,
          totalReturnPercent: -100,
          annualizedIRR: null,
          holdingPeriodDays: 0
        }
      });
    }
    
    // Add current portfolio value as final positive cashflow (today)
    const now = new Date();
    cashFlows.push(currentPortfolioValue);
    dates.push(now);
    
    // Calculate holding period
    const firstTxDate = dates[0];
    const holdingPeriodDays = Math.round((now - firstTxDate) / (1000 * 60 * 60 * 24));
    const holdingPeriodYears = holdingPeriodDays / 365;
    
    // Calculate simple metrics
    const totalGainLoss = currentPortfolioValue - totalInvested + totalWithdrawn;
    const totalReturnPercent = totalInvested > 0 
      ? ((currentPortfolioValue + totalWithdrawn - totalInvested) / totalInvested) * 100 
      : 0;
    
    // Calculate IRR using XIRR
    let annualizedIRR = null;
    
    if (cashFlows.length >= 2 && holdingPeriodDays >= 1) {
      try {
        const irr = calculateXIRR(cashFlows, dates);
        if (irr !== null && isFinite(irr) && !isNaN(irr)) {
          annualizedIRR = irr * 100; // Convert to percentage
        }
      } catch (err) {
        console.error('IRR calculation error:', err);
      }
    }
    
    // Fallback to simple CAGR if IRR fails
    let simpleCAGR = null;
    if (holdingPeriodYears >= 0.1 && totalInvested > 0) {
      const endValue = currentPortfolioValue + totalWithdrawn;
      simpleCAGR = (Math.pow(endValue / totalInvested, 1 / holdingPeriodYears) - 1) * 100;
    }
    
    return Response.json({
      success: true,
      metrics: {
        totalInvested: Math.round(totalInvested * 100) / 100,
        totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
        currentValue: Math.round(currentPortfolioValue * 100) / 100,
        totalGainLoss: Math.round(totalGainLoss * 100) / 100,
        totalReturnPercent: Math.round(totalReturnPercent * 100) / 100,
        annualizedIRR: annualizedIRR !== null ? Math.round(annualizedIRR * 100) / 100 : null,
        simpleCAGR: simpleCAGR !== null ? Math.round(simpleCAGR * 100) / 100 : null,
        holdingPeriodDays,
        holdingPeriodYears: Math.round(holdingPeriodYears * 100) / 100,
        firstTransactionDate: firstTxDate.toISOString().split('T')[0],
        transactionCount: validTransactions.length,
        holdingsBreakdown: holdingsByTicker
      }
    });
    
  } catch (error) {
    console.error('Portfolio IRR calculation error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});