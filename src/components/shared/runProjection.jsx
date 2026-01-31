import { getRMDFactor } from '@/components/shared/taxData';
import { 
  estimateRetirementWithdrawalTaxes, 
  calculateTaxableSocialSecurity,
  calculateProgressiveIncomeTax,
  getLTCGRate
} from '@/components/tax/taxCalculations';
import { calculateStateTaxOnRetirement, calculateStateIncomeTax } from '@/components/shared/stateTaxConfig';
import { getTaxConfigForYear, get401kLimit, getRothIRALimit, getTraditionalIRALimit, getHSALimit, getRothIRAIncomeLimit, getFederalBrackets } from '@/components/shared/taxConfig';
import { selectLots } from '@/components/shared/lotSelectionHelpers';

/**
 * Get custom return rate for a given asset type and year.
 * Checks custom period definitions and returns matching rate or fallback.
 * 
 * @param {string} assetType - Asset type key: 'btc', 'stocks', 'realEstate', 'bonds', 'cash', 'other'
 * @param {number} yearIndex - Year index from projection start (0 = current year, 1 = next year, etc.)
 * @param {Object} customReturnPeriods - Object with arrays of periods per asset type
 * @param {number|null} fallbackRate - Default rate if no period matches (null for BTC to use Power Law)
 * @returns {number|null} - Return rate percentage, or null if no match and fallback is null
 */
/**
 * Get effective loan interest rate for a given projection year.
 * Models declining rates from current rate to future target rate over specified years.
 * 
 * @param {number} baseRate - Current interest rate (e.g., 12 for 12%)
 * @param {number} projectionYear - Year index from projection start (0 = current year)
 * @param {number|null} futureRate - Target future rate (e.g., 6 for 6%)
 * @param {number|null} yearsToReach - Years to reach the future rate (e.g., 15)
 * @returns {number} - Effective interest rate for this year
 */
export function getLoanRateForYear(baseRate, projectionYear, futureRate, yearsToReach) {
  if (!futureRate || !yearsToReach || yearsToReach <= 0) {
    return baseRate;
  }
  if (projectionYear >= yearsToReach) {
    return futureRate;
  }
  const annualDecline = (baseRate - futureRate) / yearsToReach;
  return Math.max(futureRate, baseRate - (annualDecline * projectionYear));
}

export function getCustomReturnForYear(assetType, yearIndex, customReturnPeriods, fallbackRate) {
  if (!customReturnPeriods || !customReturnPeriods[assetType]) {
    return fallbackRate;
  }
  
  const periods = customReturnPeriods[assetType];
  if (!Array.isArray(periods) || periods.length === 0) {
    return fallbackRate;
  }
  
  // Custom periods use yearIndex (1-based: year 1 = first year of projection)
  // Convert to 1-based for comparison with user-entered values
  const yearNumber = yearIndex + 1;
  
  // Find matching period (periods should be sorted by startYear)
  for (const period of periods) {
    const startYear = period.startYear;
    const endYear = period.endYear; // null means indefinite
    
    if (yearNumber >= startYear && (endYear === null || yearNumber <= endYear)) {
      return period.rate;
    }
  }
  
  return fallbackRate;
}

/**
 * UNIFIED PROJECTION ENGINE
 * Used by both:
 * 1. Main wealth projection chart (projections useMemo)
 * 2. runProjectionForRetirementAge (earliest retirement age calculation)
 * 
 * Ensures IDENTICAL results by using the exact same logic for:
 * - BTC-backed loan interest accrual (daily compounding)
 * - LTV monitoring with auto top-ups, liquidations, releases
 * - Debt amortization schedules (month-by-month)
 * - Goals and life events
 * - Tax-optimized withdrawal sequencing with accurate tax calculations
 * - Emergency measures (loan equity unlock, real estate liquidation)
 */
export function runUnifiedProjection({
  holdings,
  projectionId = 'unknown',
  projectionType = 'main', // 'main', 'monteCarlo', 'earliestAge', 'maxSpending'
  monteCarloIteration = null,
  _runId = `${projectionId}-${projectionType}-${monteCarloIteration || 0}`, // DETERMINISTIC: Unique identifier from params
  accounts,
  liabilities,
  collateralizedLoans,
  currentPrice,
  currentAge,
  retirementAge,
  lifeExpectancy,
  retirementAnnualSpending,
  effectiveSocialSecurity,
  socialSecurityStartAge,
  otherRetirementIncome,
  annualSavings,
  additionalAnnualSavings = 0,
  incomeGrowth,
  grossAnnualIncome,
  currentAnnualSpending,
  filingStatus,
  stateOfResidence,
  contribution401k,
  employer401kMatch,
  contributionRothIRA,
  contributionTraditionalIRA,
  contributionHSA,
  hsaFamilyCoverage,
  getBtcGrowthRate,
  effectiveInflation,
  effectiveStocksCagr,
  bondsCagr,
  realEstateCagr,
  cashCagr,
  otherCagr,
  savingsAllocationBtc,
  savingsAllocationStocks,
  savingsAllocationBonds,
  savingsAllocationCash,
  savingsAllocationOther,
  autoTopUpBtcCollateral,
  btcTopUpTriggerLtv,
  btcTopUpTargetLtv,
  btcLiquidationLtv,
  btcReleaseTriggerLtv,
  btcReleaseTargetLtv,
  goals = [],
  lifeEvents = [],
  getTaxTreatmentFromHolding,
  yearlyReturnOverrides = null, // { btc: number[], stocks: number[], bonds: number[], realEstate: number[], cash: number[], other: number[] }
  customReturnPeriods = {}, // { btc: [{startYear, endYear, rate}], stocks: [...], etc. }
  tickerReturns = {}, // { 'MSTR': 40, 'AAPL': 12 } - per-ticker overrides
  hypothetical_btc_loan = null,
  taxLots = [],
  costBasisMethod = 'HIFO',
  assetWithdrawalStrategy = 'proportional',
  withdrawalPriorityOrder = ['cash', 'bonds', 'stocks', 'other', 'btc'],
  withdrawalBlendPercentages = { cash: 0, bonds: 25, stocks: 35, other: 10, btc: 30 },
  investmentMode = 'all_surplus',
  monthlyInvestmentAmount = 0,
  assetReallocations = [],
  futureBtcLoanRate = null,
  futureBtcLoanRateYears = null,
  DEBUG = false,
}) {
  // Disable verbose logging for production (set to true only when debugging)
  const shouldLog = false;
  const runLabel = projectionType === 'monteCarlo' ? `MC-${monteCarloIteration}` : projectionType.toUpperCase();
  
  // Ensure deterministic order for all input arrays (sort by ID)
  const sortedHoldings = [...(holdings || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedLiabilities = [...(liabilities || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedCollateralizedLoans = [...(collateralizedLoans || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedGoals = [...(goals || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedLifeEvents = [...(lifeEvents || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedTaxLots = [...(taxLots || [])].sort((a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
    return (a.id || '').localeCompare(b.id || '');
  });

  const results = [];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const remainingMonthsThisYear = 12 - currentMonth;
  const currentYearProRataFactor = remainingMonthsThisYear / 12;
  
  // Helper: categorize asset type
  const getAssetCategory = (assetType, ticker) => {
    const tickerUpper = ticker?.toUpperCase() || '';
    const assetTypeLower = assetType?.toLowerCase() || '';
    if (tickerUpper === 'BTC' || assetTypeLower === 'btc' || assetTypeLower === 'crypto') return 'btc';
    if (assetTypeLower === 'stocks') return 'stocks';
    if (assetTypeLower === 'bonds') return 'bonds';
    if (assetTypeLower === 'cash') return 'cash';
    return 'other';
  };

  // Helper: get growth rate for a specific holding
  const getHoldingGrowthRate = (ticker, assetCategory, yearIndex, yearlyOverride) => {
    // Priority 1: Monte Carlo override
    if (yearlyOverride !== undefined) {
      return yearlyOverride;
    }
    
    // Priority 2: Per-ticker override (handle both legacy number and new object format)
    const tickerUpper = ticker?.toUpperCase();
    if (tickerUpper && tickerReturns && tickerReturns[tickerUpper] !== undefined) {
      const config = tickerReturns[tickerUpper];
      if (typeof config === 'number') return config;
      if (typeof config === 'object' && config.rate !== undefined) return config.rate;
    }
    
    // Priority 3: Custom period for asset class
    const assetClassDefaults = {
      btc: null, // Will use getBtcGrowthRate
      stocks: effectiveStocksCagr,
      bonds: bondsCagr,
      cash: cashCagr,
      other: otherCagr,
      realEstate: realEstateCagr
    };
    
    const customRate = getCustomReturnForYear(assetCategory, yearIndex, customReturnPeriods, assetClassDefaults[assetCategory]);
    if (customRate !== null) {
      return customRate;
    }
    
    // Priority 4: Default asset class rate
    return assetClassDefaults[assetCategory];
  };

  // Initialize portfolio from holdings
  const initializePortfolio = () => {
    const structure = {
      taxable: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
      taxDeferred: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
      taxFree: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
      realEstate: 0,
    };
    
    sortedHoldings.forEach(h => {
      const value = h.ticker === 'BTC' ? h.quantity * currentPrice : h.quantity * (h.current_price || 0);
      const taxTreatment = getTaxTreatmentFromHolding(h);
      const assetCategory = getAssetCategory(h.asset_type, h.ticker);
      
      if (taxTreatment === 'real_estate') {
        structure.realEstate += value;
        return;
      }
      
      let accountKey = 'taxable';
      if (taxTreatment === 'tax_deferred') accountKey = 'taxDeferred';
      else if (taxTreatment === 'tax_free') accountKey = 'taxFree';
      
      structure[accountKey][assetCategory] += value;
    });
    return structure;
  };

  let portfolio = initializePortfolio();

  // Helper functions
  const getAccountTotal = (accountKey) => {
    const acct = portfolio[accountKey];
    return acct.btc + acct.stocks + acct.bonds + acct.cash + acct.other;
  };
  
  const getTotalLiquid = () => {
    return getAccountTotal('taxable') + getAccountTotal('taxDeferred') + getAccountTotal('taxFree');
  };

  const getTotalPortfolio = (encumberedBtcValue = 0) => {
    return getTotalLiquid() + portfolio.realEstate + encumberedBtcValue;
  };

  const withdrawFromAccount = (accountKey, amount) => {
    const acct = portfolio[accountKey];
    const total = getAccountTotal(accountKey);
    if (total <= 0 || amount <= 0) return 0;
    
    const actualWithdrawal = Math.min(amount, total);
    const ratio = actualWithdrawal / total;
    
    acct.btc = Math.max(0, acct.btc * (1 - ratio));
    acct.stocks = Math.max(0, acct.stocks * (1 - ratio));
    acct.bonds = Math.max(0, acct.bonds * (1 - ratio));
    acct.cash = Math.max(0, acct.cash * (1 - ratio));
    acct.other = Math.max(0, acct.other * (1 - ratio));
    
    // Clean up dust (values under $1) to prevent compounding of near-zero balances
    const DUST_THRESHOLD = 1;
    if (acct.btc > 0 && acct.btc < DUST_THRESHOLD) acct.btc = 0;
    if (acct.stocks > 0 && acct.stocks < DUST_THRESHOLD) acct.stocks = 0;
    if (acct.bonds > 0 && acct.bonds < DUST_THRESHOLD) acct.bonds = 0;
    if (acct.cash > 0 && acct.cash < DUST_THRESHOLD) acct.cash = 0;
    if (acct.other > 0 && acct.other < DUST_THRESHOLD) acct.other = 0;
    
    return actualWithdrawal;
  };

  // Helper function to reduce holdingValues proportionally when withdrawals occur
  // This ensures dividend calculations reflect actual post-withdrawal values
  const reduceHoldingValuesForWithdrawal = (assetCategory, taxTreatment, withdrawalAmount, preWithdrawalTotal) => {
    if (withdrawalAmount <= 0 || preWithdrawalTotal <= 0) return;
    const reductionRatio = Math.min(1, withdrawalAmount / preWithdrawalTotal);
    holdingValues.forEach(hv => {
      if (hv.assetCategory === assetCategory && hv.taxTreatment === taxTreatment && hv.currentValue > 0) {
        hv.currentValue *= (1 - reductionRatio);
        if (hv.currentValue < 1) hv.currentValue = 0; // Clean up dust
      }
    });
  };

  // Enhanced withdrawal from taxable account with BTC lot tracking
  // Uses selectLots for BTC to get accurate cost basis, proportional for other assets
  const withdrawFromTaxableWithLots = (amount, currentBtcPrice, debugYear = null) => {
    const total = getAccountTotal('taxable');
    if (total <= 0 || amount <= 0) return { withdrawn: 0, btcCostBasis: 0, otherCostBasis: 0, totalCostBasis: 0, shortTermGain: 0, longTermGain: 0 };
    
    const actualWithdrawal = Math.min(amount, total);
    const acct = portfolio.taxable;
    
    let btcWithdrawn = 0;
    let btcCostBasis = 0;
    let btcShortTermGain = 0;
    let btcLongTermGain = 0;
    let otherWithdrawn = 0;
    let otherCostBasis = 0;
    
    // Determine how much to withdraw from each asset based on strategy
    let btcTarget = 0;
    let stocksTarget = 0;
    let bondsTarget = 0;
    let cashTarget = 0;
    let otherTarget = 0;
    
    // ============================================
    // STEP 1: ALWAYS withdraw cash FIRST (applies to ALL strategies)
    // Cash is spent before selling any assets
    // ============================================
    const availableCash = acct.cash || 0;
    let remainingAfterCash = actualWithdrawal;
    if (availableCash > 0 && remainingAfterCash > 0) {
      cashTarget = Math.min(remainingAfterCash, availableCash);
      remainingAfterCash -= cashTarget;
    }
    
    // ============================================
    // STEP 2: Apply strategy to remaining amount (after cash)
    // ============================================
    if (assetWithdrawalStrategy === 'proportional') {
      // Withdraw proportionally from non-cash assets
      const nonCashTotal = (acct.btc || 0) + (acct.stocks || 0) + (acct.bonds || 0) + (acct.other || 0);
      if (remainingAfterCash > 0 && nonCashTotal > 0) {
        const ratio = remainingAfterCash / nonCashTotal;
        btcTarget = acct.btc * ratio;
        stocksTarget = acct.stocks * ratio;
        bondsTarget = acct.bonds * ratio;
        otherTarget = acct.other * ratio;
      }
    } else if (assetWithdrawalStrategy === 'priority') {
      // Withdraw from priority order (excluding cash since already handled)
      for (const assetType of withdrawalPriorityOrder) {
        if (remainingAfterCash <= 0) break;
        if (assetType === 'cash') continue; // Skip cash, already handled above
        
        const available = acct[assetType] || 0;
        if (available <= 0) continue;
        
        const take = Math.min(remainingAfterCash, available);
        
        if (assetType === 'btc') btcTarget = take;
        else if (assetType === 'stocks') stocksTarget = take;
        else if (assetType === 'bonds') bondsTarget = take;
        else if (assetType === 'other') otherTarget = take;
        
        remainingAfterCash -= take;
      }
    } else if (assetWithdrawalStrategy === 'blended') {
      // Apply blended percentages to remaining amount (after cash)
      const totalPct = (withdrawalBlendPercentages.btc || 0) + 
                       (withdrawalBlendPercentages.stocks || 0) + 
                       (withdrawalBlendPercentages.bonds || 0) + 
                       (withdrawalBlendPercentages.other || 0);
      
      if (totalPct > 0 && remainingAfterCash > 0) {
        btcTarget = Math.min(acct.btc, remainingAfterCash * (withdrawalBlendPercentages.btc || 0) / totalPct);
        stocksTarget = Math.min(acct.stocks, remainingAfterCash * (withdrawalBlendPercentages.stocks || 0) / totalPct);
        bondsTarget = Math.min(acct.bonds, remainingAfterCash * (withdrawalBlendPercentages.bonds || 0) / totalPct);
        otherTarget = Math.min(acct.other, remainingAfterCash * (withdrawalBlendPercentages.other || 0) / totalPct);
        
        // If blend doesn't cover full amount (due to min constraints), take remainder proportionally
        const blendTotal = btcTarget + stocksTarget + bondsTarget + otherTarget;
        
        if (blendTotal < remainingAfterCash) {
          const shortfall = remainingAfterCash - blendTotal;
          const remainingTotal = (acct.btc - btcTarget) + (acct.stocks - stocksTarget) + 
                                  (acct.bonds - bondsTarget) + (acct.other - otherTarget);
          if (remainingTotal > 0) {
            const ratio = Math.min(1, shortfall / remainingTotal);
            btcTarget += (acct.btc - btcTarget) * ratio;
            stocksTarget += (acct.stocks - stocksTarget) * ratio;
            bondsTarget += (acct.bonds - bondsTarget) * ratio;
            otherTarget += (acct.other - otherTarget) * ratio;
          }
        }
      } else if (remainingAfterCash > 0) {
        // Fallback to proportional if no percentages set (excluding cash)
        const totalNonCash = acct.btc + acct.stocks + acct.bonds + acct.other;
        if (totalNonCash > 0) {
          const ratio = remainingAfterCash / totalNonCash;
          btcTarget = acct.btc * ratio;
          stocksTarget = acct.stocks * ratio;
          bondsTarget = acct.bonds * ratio;
          otherTarget = acct.other * ratio;
        }
      }
    }
    
    // === BTC: Use lot selection for accurate cost basis and holding period ===
    // Capture pre-withdrawal BTC value for holdingValues reduction
    const preWithdrawalBtc = acct.btc;
    if (btcTarget > 0 && currentBtcPrice > 0) {
      const btcQuantityToSell = btcTarget / currentBtcPrice;
      
      // Filter lots to only taxable BTC lots
      const taxableBtcLots = runningTaxLots.filter(lot => 
        lot.asset_ticker === 'BTC' && 
        (lot.account_type === 'taxable' || !lot.account_type)
      );
      
      // Calculate available quantity from lots
      const availableLotQty = taxableBtcLots.reduce((sum, lot) => sum + (lot.remaining_quantity ?? lot.quantity ?? 0), 0);
      
      if (taxableBtcLots.length > 0 && availableLotQty > 0 && btcQuantityToSell > 0) {
        const lotResult = selectLots(taxableBtcLots, 'BTC', btcQuantityToSell, costBasisMethod);
        
        btcCostBasis = lotResult.totalCostBasis;
        btcWithdrawn = lotResult.totalQuantitySold * currentBtcPrice;
        
        // Calculate short-term vs long-term gains based on lot holding periods
        // Use projection year (debugYear) instead of today's date for accurate future projections
        const currentDate = new Date(debugYear, 11, 31); // End of projection year
        const oneYearAgo = new Date(debugYear - 1, 11, 31); // One year before
        
        for (const selected of lotResult.selectedLots) {
          const lotPurchaseDate = selected.lot.date ? new Date(selected.lot.date) : null;
          const saleProceeds = selected.quantityFromLot * currentBtcPrice;
          const lotCostBasis = selected.quantityFromLot * (selected.lot.price_per_unit || 0);
          const gain = Math.max(0, saleProceeds - lotCostBasis);
          
          // Holding period: > 1 year = long-term, <= 1 year = short-term
          const isLongTerm = lotPurchaseDate && lotPurchaseDate <= oneYearAgo;
          if (isLongTerm) {
            btcLongTermGain += gain;
          } else {
            btcShortTermGain += gain;
          }
        }
        
        // Update running tax lots - reduce remaining quantities
        for (const selected of lotResult.selectedLots) {
          const lotIndex = runningTaxLots.findIndex(l => l.id === selected.lot.id || l.lot_id === selected.lot.lot_id);
          if (lotIndex >= 0) {
            const currentRemaining = runningTaxLots[lotIndex].remaining_quantity ?? runningTaxLots[lotIndex].quantity ?? 0;
            runningTaxLots[lotIndex] = {
              ...runningTaxLots[lotIndex],
              remaining_quantity: Math.max(0, currentRemaining - selected.quantityFromLot)
            };
          }
        }
        
        // Update portfolio
            console.log(`WITHDRAWAL DETAIL: btcWithdrawn USD = $${btcWithdrawn.toFixed(2)}, at price $${currentBtcPrice.toFixed(2)}, BTC qty = ${(btcWithdrawn/currentBtcPrice).toFixed(6)}, acct.btc BEFORE = $${acct.btc.toFixed(2)}`);
            acct.btc = Math.max(0, acct.btc - btcWithdrawn);
            console.log(`WITHDRAWAL DETAIL: acct.btc AFTER = $${acct.btc.toFixed(2)}`);

            // Reduce holdingValues for BTC proportionally
        reduceHoldingValuesForWithdrawal('btc', 'taxable', btcWithdrawn, preWithdrawalBtc);
      } else {
        // No lots available, fall back to proportional basis (assume long-term)
        btcWithdrawn = Math.min(btcTarget, acct.btc);
        const basisRatio = runningTaxableBasis > 0 ? runningTaxableBasis / total : 0;
        btcCostBasis = btcWithdrawn * basisRatio;
        btcLongTermGain = Math.max(0, btcWithdrawn - btcCostBasis); // Assume long-term when no lot data
        acct.btc = Math.max(0, acct.btc - btcWithdrawn);
        
        // Reduce holdingValues for BTC proportionally
        reduceHoldingValuesForWithdrawal('btc', 'taxable', btcWithdrawn, preWithdrawalBtc);
      }
    }
    
    // === Other assets: Use proportional cost basis (no lot tracking) ===
    // Assume stocks/bonds/other are long-term holdings for simplicity
    // Capture pre-withdrawal values for holdingValues reduction
    const preWithdrawalStocks = acct.stocks;
    const preWithdrawalBonds = acct.bonds;
    const preWithdrawalCash = acct.cash;
    const preWithdrawalOther = acct.other;
    
    // Cash has no capital gains - exclude from gain calculations
    const nonBtcWithdrawnForGains = stocksTarget + bondsTarget + otherTarget; // Exclude cashTarget
    const nonBtcWithdrawn = stocksTarget + bondsTarget + cashTarget + otherTarget; // Total for tracking
    let otherLongTermGain = 0;
    if (nonBtcWithdrawn > 0) {
      const nonBtcTotalForGains = acct.stocks + acct.bonds + acct.other; // Exclude acct.cash
      const basisRatio = (nonBtcTotalForGains > 0 && runningTaxableBasis > 0) ? 
        ((runningTaxableBasis - btcCostBasis) / nonBtcTotalForGains) : 0;
      
      otherCostBasis = nonBtcWithdrawnForGains * Math.min(1, basisRatio);
      otherWithdrawn = nonBtcWithdrawn;
      otherLongTermGain = Math.max(0, otherWithdrawn - otherCostBasis); // Assume long-term for non-BTC
      
      acct.stocks = Math.max(0, acct.stocks - stocksTarget);
      acct.bonds = Math.max(0, acct.bonds - bondsTarget);
      acct.cash = Math.max(0, acct.cash - cashTarget);
      acct.other = Math.max(0, acct.other - otherTarget);
      
      // Reduce holdingValues proportionally for each asset category withdrawn
      if (stocksTarget > 0) {
        reduceHoldingValuesForWithdrawal('stocks', 'taxable', stocksTarget, preWithdrawalStocks);
      }
      if (bondsTarget > 0) {
        reduceHoldingValuesForWithdrawal('bonds', 'taxable', bondsTarget, preWithdrawalBonds);
      }
      if (cashTarget > 0) {
        reduceHoldingValuesForWithdrawal('cash', 'taxable', cashTarget, preWithdrawalCash);
      }
      if (otherTarget > 0) {
        reduceHoldingValuesForWithdrawal('other', 'taxable', otherTarget, preWithdrawalOther);
      }
    }
    
    // Clean up tiny residual values (less than $1) to prevent exponential growth from near-zero balances
    // This fixes a bug where proportional/blended strategies leave tiny amounts that compound into millions
    const DUST_THRESHOLD = 1; // $1
    if (acct.btc > 0 && acct.btc < DUST_THRESHOLD) acct.btc = 0;
    if (acct.stocks > 0 && acct.stocks < DUST_THRESHOLD) acct.stocks = 0;
    if (acct.bonds > 0 && acct.bonds < DUST_THRESHOLD) acct.bonds = 0;
    if (acct.cash > 0 && acct.cash < DUST_THRESHOLD) acct.cash = 0;
    if (acct.other > 0 && acct.other < DUST_THRESHOLD) acct.other = 0;
    
    return {
      withdrawn: btcWithdrawn + otherWithdrawn,
      btcCostBasis,
      otherCostBasis,
      totalCostBasis: btcCostBasis + otherCostBasis,
      shortTermGain: btcShortTermGain, // Short-term gains (taxed as ordinary income)
      longTermGain: btcLongTermGain + otherLongTermGain, // Long-term gains (preferential rates)
    };
  };

  const addToAccount = (accountKey, amount) => {
    const acct = portfolio[accountKey];
    const currentTotal = getAccountTotal(accountKey);
    if (currentTotal > 0) {
      const btcRatio = acct.btc / currentTotal;
      const stocksRatio = acct.stocks / currentTotal;
      const bondsRatio = acct.bonds / currentTotal;
      const cashRatio = acct.cash / currentTotal;
      const otherRatio = acct.other / currentTotal;
      acct.btc += amount * btcRatio;
      acct.stocks += amount * stocksRatio;
      acct.bonds += amount * bondsRatio;
      acct.cash += amount * cashRatio;
      acct.other += amount * otherRatio;
    } else {
      acct.stocks += amount;
    }
  };

  // Simulate withdrawal WITHOUT modifying portfolio - for tax estimation only
  const simulateWithdrawalFromTaxable = (amount) => {
    const acct = portfolio.taxable;
    const totalValue = acct.btc + acct.stocks + acct.bonds + acct.cash + acct.other;
    if (totalValue <= 0 || amount <= 0) {
      return { withdrawn: 0, shortTermGain: 0, longTermGain: 0, totalCostBasis: 0 };
    }
    
    const actualWithdrawal = Math.min(amount, totalValue);
    
    // Estimate proportional withdrawal
    const btcValue = acct.btc || 0;
    const stocksValue = acct.stocks || 0;
    const bondsValue = acct.bonds || 0;
    const cashValue = acct.cash || 0;
    const otherValue = acct.other || 0;
    
    // Cash used first
    const cashUsed = Math.min(cashValue, actualWithdrawal);
    const remainingFromAssets = actualWithdrawal - cashUsed;
    
    if (remainingFromAssets <= 0) {
      return { withdrawn: actualWithdrawal, shortTermGain: 0, longTermGain: 0, totalCostBasis: actualWithdrawal };
    }
    
    // Proportional from non-cash assets
    const assetTotal = btcValue + stocksValue + bondsValue + otherValue;
    const btcPortion = assetTotal > 0 ? (btcValue / assetTotal) * remainingFromAssets : 0;
    const otherPortion = remainingFromAssets - btcPortion;
    
    // Estimate cost basis (use runningTaxableBasis ratio)
    const basisRatio = totalValue > 0 && runningTaxableBasis > 0 ? runningTaxableBasis / totalValue : 0.5;
    const estimatedBasis = (btcPortion + otherPortion) * Math.min(1, basisRatio);
    const estimatedGains = Math.max(0, (btcPortion + otherPortion) - estimatedBasis);
    
    return {
      withdrawn: actualWithdrawal,
      shortTermGain: 0, // Conservative: assume all long-term for simulation
      longTermGain: estimatedGains,
      totalCostBasis: cashUsed + estimatedBasis
    };
  };

  let firstDepletionAge = null;
  const birthYear = currentYear - currentAge;
  const rmdStartAge = birthYear <= 1950 ? 72 : birthYear <= 1959 ? 73 : 75;
  const PENALTY_FREE_AGE = 59.5;
  let cumulativeBtcPrice = currentPrice;
  let cumulativeSavings = 0;
  const liquidationEvents = [];

  // Initialize for Average Balance Method for dividends (declared outside loop)
  let beginningYearValues = [];
  let beginningReallocValues = [];
  
  // Create a mutable copy of tax lots for tracking remaining quantities through projection
  // Always use original quantity for projections - remaining_quantity is only for tracking within this projection run
  // Use sortedTaxLots for deterministic order
  let runningTaxLots = sortedTaxLots.map(lot => ({ 
    ...lot,
    remaining_quantity: lot.quantity ?? 0
  }));
  
  // Initialize debt tracking
  const tempRunningDebt = {};
  sortedLiabilities.forEach(liability => {
    tempRunningDebt[liability.id] = {
      ...liability,
      current_balance: liability.current_balance || 0,
      paid_off: false,
      entity_type: 'Liability',
    };
  });

  const tempRunningCollateralizedLoans = {};
  const pendingHypotheticalLoans = [];
  sortedCollateralizedLoans.forEach(loan => {
    tempRunningCollateralizedLoans[loan.id] = {
      ...loan,
      current_balance: loan.current_balance || 0,
      paid_off: false,
      entity_type: 'CollateralizedLoan',
      type: 'btc_collateralized',
      monthly_payment: loan.minimum_monthly_payment || 0,
    };
  });

  // Initialize BTC collateral tracking (must be before hypothetical loan processing)
  const encumberedBtc = {};
  let releasedBtc = {}; // Used for tracking released amounts for display/logging only (not for delayed processing)
  
  // Track per-loan collateral basis for accurate tax calculations on liquidation
  const loanCollateralBasis = {}; // { loanKey: total cost basis }
  const loanCollateralLots = {}; // { loanKey: array of lot assignments }
  let encumberedBtcBasis = 0; // CRITICAL: Must be declared before any code uses it
  


  // Populate encumberedBtc from existing liabilities/loans BEFORE hypothetical loan processing
  sortedLiabilities.forEach(liability => {
    if (liability.type === 'btc_collateralized' && liability.collateral_btc_amount) {
      const loanKey = liability.id;
      encumberedBtc[loanKey] = liability.collateral_btc_amount;
      releasedBtc[loanKey] = 0;
      
      if (DEBUG) {
        console.log('=== LOADING BTC LOAN (Liability) ===');
        console.log('Name:', liability.name);
        console.log('ID:', liability.id);
        console.log('loanKey:', loanKey);
        console.log('collateral_btc_amount:', liability.collateral_btc_amount);
        console.log('collateral_lots count:', liability.collateral_lots?.length || 0);
        console.log('collateral_total_basis from entity:', liability.collateral_total_basis);
      }
      
      // Use stored lot data if available (new loans)
      if (liability.collateral_lots && liability.collateral_lots.length > 0) {
        const calculatedBasis = liability.collateral_lots.reduce((sum, lot) => sum + (lot.cost_basis || 0), 0);
        if (DEBUG) console.log('Calculated basis from lots:', calculatedBasis);
        
        const basisToUse = liability.collateral_total_basis || calculatedBasis;
        if (DEBUG) console.log('Basis to use:', basisToUse);
        
        loanCollateralLots[loanKey] = liability.collateral_lots;
        loanCollateralBasis[loanKey] = basisToUse;
        
        if (DEBUG) {
          console.log('Set loanCollateralBasis[' + loanKey + '] =', loanCollateralBasis[loanKey]);
        }
        
        // Remove these lots from runningTaxLots (they're locked as collateral)
        liability.collateral_lots.forEach(collateralLot => {
          const lotIndex = runningTaxLots.findIndex(t => t.id === collateralLot.lot_id);
          if (lotIndex !== -1) {
            const currentRemaining = runningTaxLots[lotIndex].remaining_quantity ?? runningTaxLots[lotIndex].quantity ?? 0;
            runningTaxLots[lotIndex].remaining_quantity = Math.max(0, currentRemaining - collateralLot.btc_amount);
            if (runningTaxLots[lotIndex].remaining_quantity <= 0.00000001) {
              runningTaxLots.splice(lotIndex, 1);
            }
          }
        });
      } else if (DEBUG) {
        console.log('No collateral_lots - will use proportional basis fallback');
      }
      // Legacy loans without lot data will use proportional basis (calculated later)
    }
  });

  sortedCollateralizedLoans.forEach(loan => {
    if (loan.collateral_btc_amount) {
      const loanKey = `loan_${loan.id}`;
      encumberedBtc[loanKey] = loan.collateral_btc_amount;
      releasedBtc[loanKey] = 0;
      
      if (DEBUG) {
        console.log('=== LOADING BTC LOAN (CollateralizedLoan) ===');
        console.log('Name:', loan.name);
        console.log('ID:', loan.id);
        console.log('loanKey:', loanKey);
        console.log('collateral_btc_amount:', loan.collateral_btc_amount);
        console.log('collateral_lots count:', loan.collateral_lots?.length || 0);
        console.log('collateral_total_basis from entity:', loan.collateral_total_basis);
      }
      
      // Use stored lot data if available (new loans)
      if (loan.collateral_lots && loan.collateral_lots.length > 0) {
        const calculatedBasis = loan.collateral_lots.reduce((sum, lot) => sum + (lot.cost_basis || 0), 0);
        if (DEBUG) console.log('Calculated basis from lots:', calculatedBasis);
        
        const basisToUse = loan.collateral_total_basis || calculatedBasis;
        if (DEBUG) console.log('Basis to use:', basisToUse);
        
        loanCollateralLots[loanKey] = loan.collateral_lots;
        loanCollateralBasis[loanKey] = basisToUse;
        
        if (DEBUG) {
          console.log('Set loanCollateralBasis[' + loanKey + '] =', loanCollateralBasis[loanKey]);
        }
        
        // Remove these lots from runningTaxLots (they're locked as collateral)
        loan.collateral_lots.forEach(collateralLot => {
          const lotIndex = runningTaxLots.findIndex(t => t.id === collateralLot.lot_id);
          if (lotIndex !== -1) {
            const currentRemaining = runningTaxLots[lotIndex].remaining_quantity ?? runningTaxLots[lotIndex].quantity ?? 0;
            runningTaxLots[lotIndex].remaining_quantity = Math.max(0, currentRemaining - collateralLot.btc_amount);
            if (runningTaxLots[lotIndex].remaining_quantity <= 0.00000001) {
              runningTaxLots.splice(lotIndex, 1);
            }
          }
        });
      } else if (DEBUG) {
        console.log('No collateral_lots - will use proportional basis fallback');
      }
      // Legacy loans without lot data will use proportional basis (calculated later)
    }
  });

  // Track cost basis for taxable accounts
  const taxableHoldings = sortedHoldings.filter(h => getTaxTreatmentFromHolding(h) === 'taxable');
  const initialTaxableCostBasis = taxableHoldings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
  let runningTaxableBasis = initialTaxableCostBasis;

  // Calculate initial taxable value BEFORE subtracting encumbered
  const initialTaxableValueBeforeEncumbered = portfolio.taxable.btc + portfolio.taxable.stocks + portfolio.taxable.bonds + portfolio.taxable.cash + portfolio.taxable.other;

  // Subtract encumbered BTC from taxable
  const totalInitialEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
  const initialEncumberedBtcValue = totalInitialEncumberedBtc * currentPrice;
  portfolio.taxable.btc = Math.max(0, portfolio.taxable.btc - initialEncumberedBtcValue);

  // Calculate and subtract proportional basis for encumbered BTC
  // This tracks the cost basis "locked" in collateral separately
  // For loans WITH stored lot data, we already have per-loan basis in loanCollateralBasis
  // For legacy loans WITHOUT lot data, calculate proportional basis as fallback
  
  // Sum up basis from loans that have stored lot data
  const loansWithStoredBasis = Object.values(loanCollateralBasis).reduce((sum, basis) => sum + basis, 0);
  
  // For loans without stored lot data, calculate proportional fallback
  let legacyCollateralBtc = 0;
  [...sortedLiabilities, ...sortedCollateralizedLoans].forEach(loan => {
    const loanKey = loan.collateral_btc_amount ? (sortedLiabilities.includes(loan) ? loan.id : `loan_${loan.id}`) : null;
    if (loanKey && !loanCollateralBasis[loanKey] && loan.collateral_btc_amount > 0) {
      legacyCollateralBtc += loan.collateral_btc_amount;
    }
  });
  
  const legacyCollateralValue = legacyCollateralBtc * currentPrice;
  let legacyProportionalBasis = 0;
  if (initialTaxableValueBeforeEncumbered > 0 && legacyCollateralValue > 0) {
    legacyProportionalBasis = runningTaxableBasis * (legacyCollateralValue / initialTaxableValueBeforeEncumbered);
    
    // Assign proportional basis to each legacy loan
    [...sortedLiabilities, ...sortedCollateralizedLoans].forEach(loan => {
      const loanKey = loan.collateral_btc_amount ? (sortedLiabilities.includes(loan) ? loan.id : `loan_${loan.id}`) : null;
      if (loanKey && !loanCollateralBasis[loanKey] && loan.collateral_btc_amount > 0) {
        const loanCollateralValue = loan.collateral_btc_amount * currentPrice;
        loanCollateralBasis[loanKey] = legacyProportionalBasis * (loanCollateralValue / legacyCollateralValue);
        loanCollateralLots[loanKey] = []; // No specific lots for legacy
      }
    });
  }
  
  // CRITICAL: Set initial encumberedBtcBasis BEFORE hypothetical loan processing
  encumberedBtcBasis = loansWithStoredBasis + legacyProportionalBasis;
  
  if (DEBUG) {
    console.log('=== FINAL COLLATERAL BASIS STATE ===');
    console.log('loansWithStoredBasis:', loansWithStoredBasis);
    console.log('legacyProportionalBasis:', legacyProportionalBasis);
    console.log('encumberedBtcBasis (total):', encumberedBtcBasis);
    Object.keys(loanCollateralBasis).forEach(key => {
      console.log('loanCollateralBasis[' + key + ']:', {
        basis: loanCollateralBasis[key],
        btc: encumberedBtc[key]
      });
    });
  }
  
  if (initialTaxableValueBeforeEncumbered > 0 && initialEncumberedBtcValue > 0) {
    runningTaxableBasis = Math.max(0, runningTaxableBasis - encumberedBtcBasis);
  }

  // Process hypothetical BTC loan if provided (after all initializations)
  if (hypothetical_btc_loan?.enabled) {
    const loanStartAge = (hypothetical_btc_loan.start_age !== undefined && hypothetical_btc_loan.start_age !== null && hypothetical_btc_loan.start_age !== '')
      ? parseInt(hypothetical_btc_loan.start_age) 
      : currentAge;
    
    const hypotheticalLoanObj = {
      id: 'hypothetical_btc_loan',
      name: 'Hypothetical BTC Loan',
      type: 'btc_collateralized',
      current_balance: hypothetical_btc_loan.loan_amount || 0,
      interest_rate: hypothetical_btc_loan.interest_rate || 12,
      collateral_btc_amount: hypothetical_btc_loan.collateral_btc || 0,
      liquidation_ltv: btcLiquidationLtv || 80,
      start_age: loanStartAge,
      pay_off_age: (hypothetical_btc_loan.pay_off_age !== undefined && hypothetical_btc_loan.pay_off_age !== null && hypothetical_btc_loan.pay_off_age !== '') 
        ? parseInt(hypothetical_btc_loan.pay_off_age) 
        : null,
      use_of_proceeds: hypothetical_btc_loan.use_of_proceeds || 'cash',
      isHypothetical: true,
      enabled: true,
      paid_off: false,
      entity_type: 'CollateralizedLoan',
    };
    
    if (loanStartAge > currentAge) {
      pendingHypotheticalLoans.push(hypotheticalLoanObj);
    } else {
      tempRunningCollateralizedLoans[hypotheticalLoanObj.id] = hypotheticalLoanObj;
      const loanKey = `loan_${hypotheticalLoanObj.id}`;
      if (hypotheticalLoanObj.collateral_btc_amount > 0) {
        encumberedBtc[loanKey] = hypotheticalLoanObj.collateral_btc_amount;
        releasedBtc[loanKey] = 0;
        
        // Subtract collateral value from liquid BTC (matches future-year activation at line 1228)
        const collateralValue = hypotheticalLoanObj.collateral_btc_amount * currentPrice;
        portfolio.taxable.btc = Math.max(0, portfolio.taxable.btc - collateralValue);
        
        // Assign lots at runtime for hypothetical loans using selectLots
        const availableBtcLots = runningTaxLots.filter(lot => 
          lot.asset_ticker === 'BTC' && 
          (lot.account_type === 'taxable' || !lot.account_type) &&
          (lot.remaining_quantity ?? lot.quantity ?? 0) > 0
        );
        
        if (availableBtcLots.length > 0) {
          const lotResult = selectLots(
            availableBtcLots, 
            'BTC', 
            hypotheticalLoanObj.collateral_btc_amount, 
            costBasisMethod
          );
          
          const assignedLots = [];
          let totalBasis = 0;
          
          for (const selected of lotResult.selectedLots) {
            assignedLots.push({
              lot_id: selected.lot.id,
              btc_amount: selected.quantityFromLot,
              cost_basis: selected.costBasis,
              price_per_unit: selected.costPerUnit,
              acquired_date: selected.lot.date
            });
            totalBasis += selected.costBasis;
            
            // Remove from runningTaxLots
            const lotIndex = runningTaxLots.findIndex(t => t.id === selected.lot.id);
            if (lotIndex !== -1) {
              runningTaxLots[lotIndex].remaining_quantity = Math.max(0, 
                (runningTaxLots[lotIndex].remaining_quantity ?? runningTaxLots[lotIndex].quantity ?? 0) - selected.quantityFromLot
              );
              if (runningTaxLots[lotIndex].remaining_quantity <= 0.00000001) {
                runningTaxLots.splice(lotIndex, 1);
              }
            }
          }
          
          loanCollateralLots[loanKey] = assignedLots;
          loanCollateralBasis[loanKey] = totalBasis;
          
          // Reduce runningTaxableBasis by the basis now locked in collateral
          runningTaxableBasis = Math.max(0, runningTaxableBasis - totalBasis);
          encumberedBtcBasis += totalBasis;
        } else {
          // Fallback if no lots available - use 50% of collateral value as basis
          const collateralValue = hypotheticalLoanObj.collateral_btc_amount * currentPrice;
          loanCollateralBasis[loanKey] = collateralValue * 0.5;
          loanCollateralLots[loanKey] = [];
        }
      }
      
      const proceeds = hypotheticalLoanObj.current_balance;
      if (proceeds > 0) {
        if (hypotheticalLoanObj.use_of_proceeds === 'btc') {
          // Buy BTC with loan proceeds - track quantity for proper growth
          const btcQuantityPurchased = proceeds / currentPrice;
          if (DEBUG) console.log('[LOAN BTC BUY] Year 0: $' + proceeds.toLocaleString() + ' / $' + currentPrice.toLocaleString() + ' = ' + btcQuantityPurchased.toFixed(4) + ' BTC');
          portfolio.taxable.btc += proceeds;
          runningTaxableBasis += proceeds;
          
          // Create tax lot for the BTC purchase
          runningTaxLots.push({
            id: `loan-btc-purchase-${hypotheticalLoanObj.id}`,
            lot_id: `loan-btc-purchase-${hypotheticalLoanObj.id}`,
            asset_ticker: 'BTC',
            quantity: btcQuantityPurchased,
            remaining_quantity: btcQuantityPurchased,
            price_per_unit: currentPrice,
            cost_basis: proceeds,
            date: `${currentYear}-01-01`,
            account_type: 'taxable',
            source: 'loan_proceeds',
          });
        } else if (hypotheticalLoanObj.use_of_proceeds === 'stocks') {
          // Buy stocks with loan proceeds
          portfolio.taxable.stocks += proceeds;
          runningTaxableBasis += proceeds;
        } else {
          // 'cash' (for spending) - This will be added to yearLifeEventIncome in Year 0
          // For now, just mark it with a flag so we can add it to yearLifeEventIncome in the loop
          portfolio.taxable.cash += proceeds; // Temporary - will be converted to income in Year 0
        }
      }
    }
  }

  // Get standard deduction - this is the BASE deduction
  // Age-based senior additions are applied per-year in the loop since age changes
  const taxConfigForYear = getTaxConfigForYear(currentYear);
  const standardDeductions = taxConfigForYear?.standardDeduction || { single: 16100, married: 32200 };
  const baseStandardDeduction = standardDeductions[filingStatus] || standardDeductions.single;

  // Track Roth contributions for accurate early withdrawal tax calculations
  // This must be defined BEFORE the main loop so it's accessible in asset reallocation
  const totalRothContributions = accounts
    .filter(a => ['401k_roth', 'ira_roth', 'roth_401k', 'roth_ira', 'hsa'].includes(a.account_type))
    .reduce((sum, a) => sum + (a.roth_contributions || 0), 0);
  
  // Capture initial Roth balance for tracking withdrawals through projection
  const initialRothBalance = (portfolio.taxFree.btc || 0) + (portfolio.taxFree.stocks || 0) + 
    (portfolio.taxFree.bonds || 0) + (portfolio.taxFree.cash || 0) + (portfolio.taxFree.other || 0);
  
  // Track Roth contribution basis that gets depleted over time
  // Conservative default: 0 assumes all Roth balance is earnings (most conservative for high-growth portfolios)
  let runningRothContributionBasis = totalRothContributions;

  // Track loan proceeds that should be treated as income (use_of_proceeds === 'cash')
  let immediateUseCashProceeds = 0;
  if (hypothetical_btc_loan?.enabled) {
    const loanStartAge = (hypothetical_btc_loan.start_age !== undefined && hypothetical_btc_loan.start_age !== null && hypothetical_btc_loan.start_age !== '')
      ? parseInt(hypothetical_btc_loan.start_age) 
      : currentAge;
    
    // If loan starts immediately (at currentAge) and use_of_proceeds is 'cash', track it
    if (loanStartAge === currentAge && hypothetical_btc_loan.use_of_proceeds === 'cash') {
      immediateUseCashProceeds = hypothetical_btc_loan.loan_amount || 0;
    }
  }

  // Track individual holding values for dividend calculations
  // We need to track values through the projection since dividends are based on current value
  const holdingValues = sortedHoldings.map(h => {
    const initialValue = h.ticker === 'BTC' ? h.quantity * currentPrice : h.quantity * (h.current_price || 0);
    const taxTreatment = getTaxTreatmentFromHolding(h);
    const assetCategory = getAssetCategory(h.asset_type, h.ticker);
    const tickerUpper = h.ticker?.toUpperCase();
    
    // Get dividend config: priority is tickerReturns override > holding default
    let dividendYield = h.dividend_yield || 0;
    let dividendQualified = h.dividend_qualified !== false; // default true
    
    if (tickerUpper && tickerReturns && tickerReturns[tickerUpper]) {
      const override = tickerReturns[tickerUpper];
      if (typeof override === 'object') {
        // New format with dividend info
        if (override.dividendYield !== undefined) dividendYield = override.dividendYield;
        if (override.dividendQualified !== undefined) dividendQualified = override.dividendQualified;
      }
    }
    
    return {
      ticker: tickerUpper,
      assetType: h.asset_type,
      assetCategory,
      taxTreatment,
      currentValue: initialValue,
      dividendYield,
      dividendQualified,
    };
  });

  // Track executed asset reallocations (for scenario reallocations with dividend-producing assets)
  const executedReallocations = [];

  // Helper to get ticker return rate (handles both legacy number and new object format)
  const getTickerReturnRate = (ticker, defaultRate) => {
    const tickerUpper = ticker?.toUpperCase();
    if (!tickerUpper || !tickerReturns || !tickerReturns[tickerUpper]) return defaultRate;
    const config = tickerReturns[tickerUpper];
    if (typeof config === 'number') return config;
    if (typeof config === 'object' && config.rate !== undefined) return config.rate;
    return defaultRate;
  };

  // Helper to get total portfolio for debug logging
  const getPortfolioTotal = () => {
    return getAccountTotal('taxable') + getAccountTotal('taxDeferred') + getAccountTotal('taxFree') + portfolio.realEstate;
  };

  // Main projection loop
  for (let i = 0; i <= lifeExpectancy - currentAge; i++) {
    const year = currentYear + i;
    const age = currentAge + i;
    const isRetired = age >= retirementAge;
    const yearsFromNow = i;
    
    // DEBUG: Track BTC at very start of loop iteration
    const btcAtLoopStart = portfolio.taxable.btc;
    const btcQtyAtLoopStart = cumulativeBtcPrice > 0 ? portfolio.taxable.btc / cumulativeBtcPrice : 0;
    console.log(`\n=== YEAR LOOP START ${year} (Age ${age}) ===`);
    console.log(`BTC at loop start: $${btcAtLoopStart.toFixed(2)}, qty = ${btcQtyAtLoopStart.toFixed(6)} BTC, price = $${cumulativeBtcPrice.toFixed(0)}`);

    // DEBUG: Log first 2 years to diagnose scenario comparison issues
    if (i <= 1 && DEBUG) {
      console.log(`\n=== runUnifiedProjection Year ${i} (Age ${age}) DEBUG ===`);
      console.log('isRetired:', isRetired);
      console.log('retirementAge param:', retirementAge);
      console.log('currentAnnualSpending param:', currentAnnualSpending);
      console.log('retirementAnnualSpending param:', retirementAnnualSpending);
      console.log('grossAnnualIncome param:', grossAnnualIncome);
      console.log('Portfolio BEFORE year processing:', JSON.stringify({
        taxableBtc: Math.round(portfolio.taxable?.btc || 0),
        taxableStocks: Math.round(portfolio.taxable?.stocks || 0),
        taxableCash: Math.round(portfolio.taxable?.cash || 0),
        taxableTotal: Math.round(getAccountTotal('taxable')),
        taxDeferredTotal: Math.round(getAccountTotal('taxDeferred')),
        taxFreeTotal: Math.round(getAccountTotal('taxFree')),
        realEstate: Math.round(portfolio.realEstate || 0),
        grandTotal: Math.round(getPortfolioTotal())
      }));
    }

    // EARLY EXIT: If already depleted, zero everything and skip all calculations
    // Also check if total liquid assets are essentially zero (under $100) to catch edge cases
    const totalLiquidCheck = getAccountTotal('taxable') + getAccountTotal('taxDeferred') + getAccountTotal('taxFree') + portfolio.realEstate;
    const isEffectivelyDepleted = (firstDepletionAge !== null && age > firstDepletionAge) || (firstDepletionAge !== null && totalLiquidCheck < 100);

    if (isEffectivelyDepleted) {
      // Zero all portfolio state to prevent any value from being added back
      portfolio.taxable = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
      portfolio.taxDeferred = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
      portfolio.taxFree = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
      portfolio.realEstate = 0;
      runningTaxableBasis = 0;
      encumberedBtcBasis = 0;
      cumulativeSavings = 0;
      
      // Zero all encumbered BTC and released BTC to prevent collateral releases
      Object.keys(encumberedBtc).forEach(key => { encumberedBtc[key] = 0; });
      Object.keys(releasedBtc).forEach(key => { delete releasedBtc[key]; });
      releasedBtc = {};
      
      // Mark all debts as paid off to stop processing
      Object.values(tempRunningDebt).forEach(liab => { liab.current_balance = 0; liab.paid_off = true; });
      Object.values(tempRunningCollateralizedLoans).forEach(loan => { loan.current_balance = 0; loan.paid_off = true; });
      
      results.push({
        year,
        age,
        isRetired,
        depleted: true,
        btcLiquid: 0,
        btcEncumbered: 0,
        stocks: 0,
        realEstate: 0,
        bonds: 0,
        cash: 0,
        total: 0,
        realTotal: 0,
        liquid: 0,
        taxable: 0,
        taxDeferred: 0,
        taxFree: 0,
        accountTotal: 0,
        totalDebt: 0,
        savings: 0,
        netCashFlow: 0,
        yearGrossIncome: 0,
        yearSpending: 0,
        socialSecurityIncome: 0,
        isWithdrawing: false,
        yearWithdrawal: 0,
        yearGoalWithdrawal: 0,
        retirementSpendingOnly: 0,
        withdrawFromTaxable: 0,
        withdrawFromTaxDeferred: 0,
        withdrawFromTaxFree: 0,
        withdrawFromRealEstate: 0,
        withdrawFromLoanPayoff: 0,
        realEstateSold: false,
        realEstateSaleProceeds: 0,
        totalWithdrawalAmount: 0,
        taxesPaid: 0,
        federalTaxPaid: 0,
        stateTaxPaid: 0,
        penaltyPaid: 0,
        canAccessPenaltyFree: age >= PENALTY_FREE_AGE,
        rmdAmount: 0,
        rmdWithdrawn: 0,
        excessRmdReinvested: 0,
        rmdStartAge: rmdStartAge,
        debtPayments: 0,
        loanPayoffs: [],
        debtPayoffs: [],
        liquidations: [],
        btcPrice: 0,
        btcGrowthRate: 0,
        encumberedBtc: 0,
        liquidBtc: 0,
        btcLoanDetails: [],
        totalBtcLoanDebt: 0,
        totalBtcCollateralValue: 0,
        totalRegularDebt: 0,
        hasEvent: false,
        hasGoalWithdrawal: false,
        goalNames: [],
      });
      continue; // Skip to next year
    }

    let socialSecurityIncome = 0;
    let rmdAmount = 0;
    let rmdWithdrawn = 0;
    let excessRmd = 0;
    let taxesPaid = 0;
    let federalTaxPaid = 0;
    let stateTaxPaid = 0;
    let penaltyPaid = 0;
    let withdrawFromTaxable = 0;
    let withdrawFromTaxDeferred = 0;
    let withdrawFromTaxFree = 0;
    let withdrawFromRealEstate = 0;
    let realEstateSaleProceeds = 0;
    let fromLoanPayoff = 0;
    const yearLoanPayoffs = [];
    let yearSavings = 0;
    let yearGrossIncome = 0;
    let yearSpending = 0;
    let desiredWithdrawal = 0;
    let yearLifeEventIncome = 0;
    let yearLifeEventTaxableIncome = 0; // Track taxable one-time income (bonuses, etc.)
    let yearLoanProceeds = 0; // Track loan proceeds used for spending
    let year401k = 0;
    let yearRoth = 0;
    let yearTraditionalIRA = 0;
    let yearHSA = 0;
    let yearEmployerMatch = 0;
    let retirementNetCashFlow = 0;
    let preRetireNetCashFlow = 0;
    let yearQualifiedDividends = 0;
    let yearNonQualifiedDividends = 0;
    let totalDividendIncome = 0;
    
    // Early withdrawal tracking (before age 59.5)
    let yearEarlyWithdrawalTax = 0;
    let yearEarlyWithdrawalPenalty = 0;
    let yearReallocationDetails = [];
    let shortTermGainsTax = 0;
    let longTermGainsTax = 0;
    let yearTaxableIncome = 0; // Track taxable income for bracket visualization
    
    // Calculate age-specific standard deduction (includes 65+ additional)
    let currentStandardDeduction = baseStandardDeduction;
    if (age >= 65) {
      const isMarried = filingStatus === 'married' || filingStatus === 'married_filing_jointly';
      const additionalDeduction = isMarried 
        ? (standardDeductions.additional_married || 1650) * 2  // Both spouses if MFJ
        : (standardDeductions.additional_single || 2050);
      currentStandardDeduction += additionalDeduction;
      
      if (DEBUG && i === 0) {
        console.log('👴 Senior Standard Deduction - Age', age);
        console.log('   Base deduction:', baseStandardDeduction);
        console.log('   Additional deduction:', additionalDeduction);
        console.log('   Total deduction:', currentStandardDeduction);
      }
    }

    // BTC growth and price tracking - priority: Monte Carlo > Custom Periods > Power Law/model
    const customBtcRate = getCustomReturnForYear('btc', i, customReturnPeriods, null);
    const yearBtcGrowth = yearlyReturnOverrides?.btc?.[i] !== undefined 
      ? yearlyReturnOverrides.btc[i] 
      : customBtcRate !== null
        ? customBtcRate
        : getBtcGrowthRate(yearsFromNow, effectiveInflation);
    if (i > 0) {
      const priceBeforeGrowth = cumulativeBtcPrice;
      cumulativeBtcPrice = cumulativeBtcPrice * (1 + yearBtcGrowth / 100);
    }

    // ============================================
    // APPLY ASSET GROWTH IMMEDIATELY AFTER PRICE UPDATE
    // This ensures released collateral and new investments don't get same-year growth
    // ============================================
    
    // Initialize weighted stocks growth rates
    let effectiveTaxableStocksGrowth = effectiveStocksCagr;
    let effectiveTaxDeferredStocksGrowth = effectiveStocksCagr;
    let effectiveTaxFreeStocksGrowth = effectiveStocksCagr;

    // CRITICAL: Capture beginning-of-year values BEFORE applying growth (for Average Balance Method dividends)
    beginningYearValues = holdingValues.map(hv => ({
      ticker: hv.ticker,
      beginningValue: hv.currentValue
    }));
    
    beginningReallocValues = executedReallocations.map(r => ({
      id: r.id,
      beginningValue: r.currentValue
    }));

    if (i > 0) {
      const yearStocksGrowth = yearlyReturnOverrides?.stocks?.[i] !== undefined 
        ? yearlyReturnOverrides.stocks[i] 
        : getCustomReturnForYear('stocks', i, customReturnPeriods, effectiveStocksCagr);
      const yearBondsGrowth = yearlyReturnOverrides?.bonds?.[i] !== undefined 
        ? yearlyReturnOverrides.bonds[i] 
        : getCustomReturnForYear('bonds', i, customReturnPeriods, bondsCagr);
      const yearCashGrowth = yearlyReturnOverrides?.cash?.[i] !== undefined 
        ? yearlyReturnOverrides.cash[i] 
        : getCustomReturnForYear('cash', i, customReturnPeriods, cashCagr);
      const yearOtherGrowth = yearlyReturnOverrides?.other?.[i] !== undefined 
        ? yearlyReturnOverrides.other[i] 
        : getCustomReturnForYear('other', i, customReturnPeriods, otherCagr);
      const yearRealEstateGrowth = yearlyReturnOverrides?.realEstate?.[i] !== undefined 
        ? yearlyReturnOverrides.realEstate[i] 
        : getCustomReturnForYear('realEstate', i, customReturnPeriods, realEstateCagr);

      // Calculate weighted average growth for stocks by account type
      const calculateWeightedStocksGrowth = (taxTreatmentFilter) => {
        let totalValue = 0;
        let weightedGrowth = 0;
        
        holdingValues.forEach(hv => {
          if (hv.assetCategory === 'stocks' && hv.taxTreatment === taxTreatmentFilter && hv.currentValue > 0) {
            const tickerRate = getTickerReturnRate(hv.ticker, null);
            const holdingGrowthRate = tickerRate !== null ? tickerRate : yearStocksGrowth;
            totalValue += hv.currentValue;
            weightedGrowth += hv.currentValue * holdingGrowthRate;
          }
        });
        
        return totalValue > 0 ? weightedGrowth / totalValue : yearStocksGrowth;
      };
      
      effectiveTaxableStocksGrowth = calculateWeightedStocksGrowth('taxable');
      effectiveTaxDeferredStocksGrowth = calculateWeightedStocksGrowth('tax_deferred');
      effectiveTaxFreeStocksGrowth = calculateWeightedStocksGrowth('tax_free');

      const GROWTH_DUST_THRESHOLD = 1;
      
      // Apply growth to each account type
      const applyGrowth = (acct, stocksGrowthRate) => {
        if (acct.btc >= GROWTH_DUST_THRESHOLD && yearBtcGrowth !== 0) acct.btc *= (1 + yearBtcGrowth / 100);
        else if (acct.btc < GROWTH_DUST_THRESHOLD) acct.btc = 0;
        if (acct.stocks >= GROWTH_DUST_THRESHOLD && stocksGrowthRate !== 0) acct.stocks *= (1 + stocksGrowthRate / 100);
        else if (acct.stocks < GROWTH_DUST_THRESHOLD) acct.stocks = 0;
        if (acct.bonds >= GROWTH_DUST_THRESHOLD && yearBondsGrowth !== 0) acct.bonds *= (1 + yearBondsGrowth / 100);
        else if (acct.bonds < GROWTH_DUST_THRESHOLD) acct.bonds = 0;
        if (acct.cash >= GROWTH_DUST_THRESHOLD && yearCashGrowth !== 0) acct.cash *= (1 + yearCashGrowth / 100);
        else if (acct.cash < GROWTH_DUST_THRESHOLD) acct.cash = 0;
        if (acct.other >= GROWTH_DUST_THRESHOLD && yearOtherGrowth !== 0) acct.other *= (1 + yearOtherGrowth / 100);
        else if (acct.other < GROWTH_DUST_THRESHOLD) acct.other = 0;
      };
      
      applyGrowth(portfolio.taxable, effectiveTaxableStocksGrowth);
      applyGrowth(portfolio.taxDeferred, effectiveTaxDeferredStocksGrowth);
      applyGrowth(portfolio.taxFree, effectiveTaxFreeStocksGrowth);
      
      if (portfolio.realEstate >= GROWTH_DUST_THRESHOLD && yearRealEstateGrowth !== 0) portfolio.realEstate *= (1 + yearRealEstateGrowth / 100);
      else if (portfolio.realEstate < GROWTH_DUST_THRESHOLD) portfolio.realEstate = 0;
      
      // Update tracked holding values for dividend calculations
      holdingValues.forEach(hv => {
        if (hv.currentValue < 1) {
          hv.currentValue = 0;
          return;
        }
        let growthRate;
        if (hv.assetCategory === 'btc') {
          growthRate = yearBtcGrowth;
        } else {
          const tickerRate = getTickerReturnRate(hv.ticker, null);
          if (tickerRate !== null) {
            growthRate = tickerRate;
          } else if (hv.assetCategory === 'stocks') {
            if (hv.taxTreatment === 'taxable') growthRate = effectiveTaxableStocksGrowth;
            else if (hv.taxTreatment === 'tax_deferred') growthRate = effectiveTaxDeferredStocksGrowth;
            else if (hv.taxTreatment === 'tax_free') growthRate = effectiveTaxFreeStocksGrowth;
            else growthRate = yearStocksGrowth;
          } else if (hv.assetCategory === 'bonds') growthRate = yearBondsGrowth;
          else if (hv.assetCategory === 'cash') growthRate = yearCashGrowth;
          else if (hv.assetCategory === 'realEstate') growthRate = yearRealEstateGrowth;
          else growthRate = yearOtherGrowth;
        }
        hv.currentValue *= (1 + growthRate / 100);
      });
      
      // Update executed reallocation values
      executedReallocations.forEach(realloc => {
        if (realloc.currentValue < 1) {
          realloc.currentValue = 0;
          return;
        }
        realloc.currentValue *= (1 + (realloc.buy_cagr || effectiveTaxableStocksGrowth) / 100);
      });
    }

    // === IMMEDIATE LOAN PROCEEDS (Year 0 only) ===
    // If a loan was activated immediately with use_of_proceeds === 'cash', add to income
    if (i === 0 && immediateUseCashProceeds > 0) {
      yearLoanProceeds += immediateUseCashProceeds;
      // Remove from portfolio.taxable.cash since we're treating it as income instead
      portfolio.taxable.cash = Math.max(0, portfolio.taxable.cash - immediateUseCashProceeds);
      runningTaxableBasis = Math.max(0, runningTaxableBasis - immediateUseCashProceeds);
      if (DEBUG) console.log(`💰 Immediate loan proceeds for spending (Year 0): $${immediateUseCashProceeds.toLocaleString()}`);
    }

    // === HYPOTHETICAL LOAN ACTIVATION ===
    const loansToActivateThisYear = pendingHypotheticalLoans.filter(loan => age === loan.start_age);
    loansToActivateThisYear.forEach(newLoan => {
      const liquidBtcQuantity = portfolio.taxable.btc / cumulativeBtcPrice;
      const collateralNeeded = newLoan.collateral_btc_amount || 0;
      
      if (collateralNeeded > 0 && liquidBtcQuantity < collateralNeeded) {
        liquidationEvents.push({
          year, age, type: 'loan_activation_failed',
          liabilityName: newLoan.name,
          message: `Insufficient BTC: need ${collateralNeeded.toFixed(4)}, have ${liquidBtcQuantity.toFixed(4)}`
        });
        return;
      }
      
      tempRunningCollateralizedLoans[newLoan.id] = newLoan;
      const loanKey = `loan_${newLoan.id}`;
      
      if (collateralNeeded > 0) {
        const collateralValue = collateralNeeded * cumulativeBtcPrice;
        portfolio.taxable.btc -= collateralValue;
        encumberedBtc[loanKey] = collateralNeeded;
        releasedBtc[loanKey] = 0;
        
        // Assign lots at activation time using selectLots for accurate basis tracking
        const availableBtcLotsForActivation = runningTaxLots.filter(lot => 
          lot.asset_ticker === 'BTC' && 
          (lot.account_type === 'taxable' || !lot.account_type) &&
          (lot.remaining_quantity ?? lot.quantity ?? 0) > 0
        );
        
        if (availableBtcLotsForActivation.length > 0) {
          const lotResult = selectLots(
            availableBtcLotsForActivation, 
            'BTC', 
            collateralNeeded, 
            costBasisMethod
          );
          
          const assignedLots = [];
          let totalBasis = 0;
          
          for (const selected of lotResult.selectedLots) {
            assignedLots.push({
              lot_id: selected.lot.id,
              btc_amount: selected.quantityFromLot,
              cost_basis: selected.costBasis,
              price_per_unit: selected.costPerUnit,
              acquired_date: selected.lot.date
            });
            totalBasis += selected.costBasis;
            
            // Remove from runningTaxLots
            const lotIndex = runningTaxLots.findIndex(t => t.id === selected.lot.id);
            if (lotIndex !== -1) {
              runningTaxLots[lotIndex].remaining_quantity = Math.max(0, 
                (runningTaxLots[lotIndex].remaining_quantity ?? runningTaxLots[lotIndex].quantity ?? 0) - selected.quantityFromLot
              );
              if (runningTaxLots[lotIndex].remaining_quantity <= 0.00000001) {
                runningTaxLots.splice(lotIndex, 1);
              }
            }
          }
          
          loanCollateralLots[loanKey] = assignedLots;
          loanCollateralBasis[loanKey] = totalBasis;
          encumberedBtcBasis += totalBasis;
          runningTaxableBasis = Math.max(0, runningTaxableBasis - totalBasis);
        } else {
          // Fallback: proportional basis if no lots available
          const taxableTotal = getAccountTotal('taxable');
          if (taxableTotal > 0 && runningTaxableBasis > 0) {
            const basisToTransfer = runningTaxableBasis * (collateralValue / (taxableTotal + collateralValue));
            encumberedBtcBasis += basisToTransfer;
            runningTaxableBasis -= basisToTransfer;
            loanCollateralBasis[loanKey] = basisToTransfer;
            loanCollateralLots[loanKey] = [];
          }
        }
      }
      
      const proceeds = newLoan.current_balance;
      if (proceeds > 0) {
        // Track loan proceeds regardless of use
        yearLoanProceeds += proceeds;
        
        if (newLoan.use_of_proceeds === 'btc') {
          // Buy BTC with loan proceeds - track quantity for proper growth
          const btcQuantityPurchased = proceeds / cumulativeBtcPrice;
          if (DEBUG) console.log('[LOAN BTC BUY] Year ' + year + ' (Age ' + age + '): $' + proceeds.toLocaleString() + ' / $' + cumulativeBtcPrice.toLocaleString() + ' = ' + btcQuantityPurchased.toFixed(4) + ' BTC');
          portfolio.taxable.btc += proceeds;
          runningTaxableBasis += proceeds;
          
          // Create tax lot for the BTC purchase
          runningTaxLots.push({
            id: `loan-btc-purchase-${newLoan.id}-${year}`,
            lot_id: `loan-btc-purchase-${newLoan.id}-${year}`,
            asset_ticker: 'BTC',
            quantity: btcQuantityPurchased,
            remaining_quantity: btcQuantityPurchased,
            price_per_unit: cumulativeBtcPrice,
            cost_basis: proceeds,
            date: `${year}-01-01`,
            account_type: 'taxable',
            source: 'loan_proceeds',
          });
        } else if (newLoan.use_of_proceeds === 'stocks') {
          // Buy stocks with loan proceeds
          portfolio.taxable.stocks += proceeds;
          runningTaxableBasis += proceeds;
        } else {
          // 'cash' (for spending) - Don't add to yearLifeEventIncome, only yearLoanProceeds
          // yearLoanProceeds was already incremented above at line 946
          if (DEBUG) console.log(`💰 Loan proceeds for spending: $${proceeds.toLocaleString()}`);
        }
        
        liquidationEvents.push({
          year, age, type: 'loan_activation',
          liabilityName: newLoan.name,
          message: `Activated: $${Math.round(proceeds).toLocaleString()} → ${newLoan.use_of_proceeds}`
        });
      }
      
      const idx = pendingHypotheticalLoans.indexOf(newLoan);
      if (idx > -1) pendingHypotheticalLoans.splice(idx, 1);
    });

    // Social Security - calculate REGARDLESS of retirement status
    if (age >= socialSecurityStartAge && effectiveSocialSecurity > 0) {
      const yearsToSSStart = Math.max(0, socialSecurityStartAge - currentAge);
      const yearsReceivingSS = age - socialSecurityStartAge;
      socialSecurityIncome = effectiveSocialSecurity * 
        Math.pow(1 + effectiveInflation / 100, yearsToSSStart) * 
        Math.pow(1 + effectiveInflation / 100, yearsReceivingSS);
    }

    // Released collateral is now added to liquid portfolio immediately when released (same year)
    // No need to process from previous year - this eliminates the one-year timing mismatch bug

    // Life events: expense adjustments only
    // NOTE: income_change events are handled later via yearLifeEventIncome for consistent display
    let activeExpenseAdjustment = 0;
    
    sortedLifeEvents.forEach(event => {
      // Recurring expense changes
      if (event.event_type === 'expense_change') {
        const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
        if (year >= event.year && year < eventEndYear) activeExpenseAdjustment += event.amount;
      }
      // Home purchase ongoing mortgage/expenses
      if (event.event_type === 'home_purchase' && event.year <= year && event.monthly_expense_impact > 0) {
        activeExpenseAdjustment += event.monthly_expense_impact * 12;
      }
    });

    // Life events & Goals: asset impacts and withdrawals
    let eventImpact = 0;
    let yearGoalWithdrawal = 0;
    let yearLifeEventExpense = 0; // Track expenses from life events separately
    const liabilitiesWithPayoffGoals = new Set();
    const loansWithPayoffGoals = new Set();

    // DEBUG: Log life events being processed
    if (i === 0 && DEBUG) {
      console.log('🟡 LIFE EVENTS TO PROCESS:', lifeEvents.map(e => ({
        name: e.name,
        event_type: e.event_type,
        year: e.year,
        amount: e.amount,
        affects: e.affects
      })));
    }
    if (DEBUG) {
      console.log('🟡 CURRENT PROJECTION YEAR:', year, 'AGE:', age);
    }

    sortedLifeEvents.forEach(event => {
      // DEBUG: Check each event
      if (DEBUG && ['inheritance', 'windfall', 'gift'].includes(event.event_type)) {
        console.log('🔵 Checking event:', event.event_type, 'event.year:', event.year, 'projection year:', year, 'age:', age, 'match year:', event.year === year, 'match age:', event.year === age);
      }
      if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
        if (DEBUG && ['inheritance', 'windfall', 'gift'].includes(event.event_type)) {
          console.log('🟢 EVENT MATCHED - Processing event:', event.event_type, event.amount);
          console.log('  Portfolio BEFORE event processing:', {
            taxableBtc: Math.round(portfolio.taxable?.btc || 0),
            taxableStocks: Math.round(portfolio.taxable?.stocks || 0),
            taxableCash: Math.round(portfolio.taxable?.cash || 0),
            total: Math.round(getPortfolioTotal())
          });
        }
        // Handle assets-affecting events (inheritance, windfall, one-time inflows)
        // These flow through yearLifeEventIncome to cover spending first, then excess goes to savings
        // DO NOT directly invest here - that causes double-counting
        if (event.affects === 'assets' && event.amount > 0) {
          const eventAmount = event.amount;
          const eventType = event.event_type;
          
          // All taxable income life events go through yearLifeEventIncome
          // This ensures consistent display in both pre-retirement and retirement
          const isTaxableIncome = ['income_change', 'bonus', 'income', 'pension', 'rental_income', 'business_income', 'annuity'].includes(eventType);
          
          if (isTaxableIncome) {
            // Track separately for tax calculation
            yearLifeEventTaxableIncome += eventAmount;
            yearLifeEventIncome += eventAmount;
            if (DEBUG) console.log(`💰 Taxable life event: $${eventAmount.toLocaleString()} from ${event.name}`);
          } else {
            // Non-taxable inflows (inheritance, gift, windfall)
            if (DEBUG) console.log(`💰 Non-taxable life event (${eventType}): $${eventAmount.toLocaleString()} from ${event.name}`);
            yearLifeEventIncome += eventAmount;
          }
        }
        // Also handle inheritance/windfall/gift event types if NOT already handled above
        else if (['inheritance', 'windfall', 'gift', 'asset_sale'].includes(event.event_type) && event.amount > 0 && event.affects !== 'assets') {
          const eventType = event.event_type;
          
          // asset_sale might have capital gains implications, but for simplicity treat as non-taxable inflow
          // (the gain would have been taxed at sale, this is just the proceeds)
          if (DEBUG) console.log(`💰 Non-taxable life event (${eventType}): $${event.amount.toLocaleString()} from ${event.name}`);
          
          yearLifeEventIncome += event.amount;
        }
        // Handle one-time expenses:
        // 1. major_expense event type (always an expense)
        // 2. expense_change with affects='expenses' and _isOneTime flag (from buildProjectionParams)
        // Note: event.amount is always positive here (Math.abs applied in buildProjectionParams)
        if (event.year === year) {
          const isOneTimeExpense = event.event_type === 'major_expense' || 
            (event.event_type === 'expense_change' && event.affects === 'expenses' && event._isOneTime);
          
          if (isOneTimeExpense) {
            const expenseAmount = event.amount; // Already positive from buildProjectionParams
            yearLifeEventExpense += expenseAmount; // Track for tooltip display - NOT added to yearGoalWithdrawal to avoid double-counting
            if (DEBUG) console.log(`🔴 Processed one-time expense: $${expenseAmount.toLocaleString()} from ${event.event_type} (${event.name})`);
          }
        }
        // Home purchase down payment
        if (event.event_type === 'home_purchase' && event.year === year) {
          eventImpact -= (event.down_payment || 0);
          yearLifeEventExpense += (event.down_payment || 0); // Track for tooltip - NOT added to yearGoalWithdrawal to avoid double-counting
        }
      }
    });

    // Goals: withdrawal and debt payoff
    sortedGoals.forEach(goal => {
      if (goal.withdraw_from_portfolio && goal.target_date && goal.type !== 'debt_payoff') {
        const goalYear = new Date(goal.target_date).getFullYear();
        if (goalYear === year) {
          yearGoalWithdrawal += goal.target_amount || 0;
        }
      }
      
      if (goal.type === 'debt_payoff' && goal.linked_liability_id) {
        const payoffStrategy = goal.payoff_strategy || 'minimum';
        const isLoan = goal.linked_liability_id.startsWith('loan_');
        const actualId = isLoan ? goal.linked_liability_id.substring(5) : goal.linked_liability_id;
        
        if (payoffStrategy === 'extra' && goal.extra_monthly_payment > 0) {
          const targetYear = goal.target_date ? new Date(goal.target_date).getFullYear() : currentYear;
          if (year >= targetYear) {
            const annualPayment = goal.extra_monthly_payment * 12;
            yearGoalWithdrawal += annualPayment;
            
            if (isLoan) {
              loansWithPayoffGoals.add(actualId);
              const loan = tempRunningCollateralizedLoans[actualId];
              if (loan && !loan.paid_off) {
                loan.current_balance = Math.max(0, loan.current_balance - annualPayment);
                if (loan.current_balance <= 0.01) loan.paid_off = true;
              }
            } else {
              liabilitiesWithPayoffGoals.add(actualId);
              const liability = tempRunningDebt[actualId];
              if (liability && !liability.paid_off) {
                liability.current_balance = Math.max(0, liability.current_balance - annualPayment);
                if (liability.current_balance <= 0.01) liability.paid_off = true;
              }
            }
          }
        } else if (payoffStrategy === 'lump_sum' && goal.lump_sum_date) {
          const lumpSumYear = new Date(goal.lump_sum_date).getFullYear();
          if (year === lumpSumYear) {
            yearGoalWithdrawal += goal.target_amount || 0;
            
            if (isLoan) {
              loansWithPayoffGoals.add(actualId);
              const loan = tempRunningCollateralizedLoans[actualId];
              if (loan && !loan.paid_off) {
                loan.current_balance = 0;
                loan.paid_off = true;
              }
            } else {
              liabilitiesWithPayoffGoals.add(actualId);
              const liability = tempRunningDebt[actualId];
              if (liability && !liability.paid_off) {
                liability.current_balance = 0;
                liability.paid_off = true;
              }
            }
          }
        }
      }
    });

    // Debt amortization with month-by-month simulation
    let actualAnnualDebtPayments = 0;
    const thisYearDebtPayoffs = [];

    Object.keys(tempRunningDebt).sort().map(k => tempRunningDebt[k]).forEach(liability => {
      if (!liabilitiesWithPayoffGoals.has(liability.id) && !liability.paid_off) {
        const hasPayment = liability.monthly_payment && liability.monthly_payment > 0;
        const hasInterest = liability.interest_rate && liability.interest_rate > 0;
        const isBtcLoan = liability.type === 'btc_collateralized';

        if (hasPayment) {
          let remainingBalance = liability.current_balance;
          const startMonth = (i === 0) ? currentMonth : 0;

          for (let month = startMonth; month < 12; month++) {
            if (remainingBalance <= 0) {
              if (!liability.paid_off) {
                thisYearDebtPayoffs.push({ name: liability.name, liability_name: liability.name, month: month + 1 });
                liability.paid_off = true;
              }
              break;
            }

            const monthlyInterest = hasInterest ? remainingBalance * (liability.interest_rate / 100 / 12) : 0;
            const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
            const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);
            
            remainingBalance = Math.max(0, remainingBalance - principalPayment);
            actualAnnualDebtPayments += paymentThisMonth;
          }
          liability.current_balance = remainingBalance;
          if (remainingBalance <= 0.01 && !liability.paid_off) {
            thisYearDebtPayoffs.push({ name: liability.name, liability_name: liability.name });
            liability.paid_off = true;
          }
        } else if (hasInterest && !isBtcLoan) {
          const annualInterest = liability.current_balance * (liability.interest_rate / 100);
          liability.current_balance += annualInterest;
        } else if (isBtcLoan && hasInterest && i > 0) {
          // Apply declining rate if configured
          const effectiveRate = getLoanRateForYear(
            liability.interest_rate,
            i,
            futureBtcLoanRate,
            futureBtcLoanRateYears
          );
          const dailyRate = effectiveRate / 100 / 365;
          liability.current_balance = liability.current_balance * Math.pow(1 + dailyRate, 365);
        }
      }

      // BTC Collateral Management for Liabilities
      if (liability.type === 'btc_collateralized' && encumberedBtc[liability.id] > 0) {
        const collateralValue = encumberedBtc[liability.id] * cumulativeBtcPrice;
        let currentLTV = (liability.current_balance / collateralValue) * 100;
        
        const liquidationLTV = liability.liquidation_ltv || 80;
        const releaseLTV = btcReleaseTriggerLtv || 30;
        const triggerLTV = btcTopUpTriggerLtv || 70;
        const targetLTV = btcTopUpTargetLtv || 50; // Ledn resets to 50% LTV after top-up
        const releaseTargetLTV = btcReleaseTargetLtv || 40;

        // Auto Top-up
        if (autoTopUpBtcCollateral && currentLTV >= triggerLTV && currentLTV < liquidationLTV) {
          const targetCollateralValue = liability.current_balance / (targetLTV / 100);
          const additionalBtcNeeded = (targetCollateralValue / cumulativeBtcPrice) - encumberedBtc[liability.id];
          const liquidBtcAvailable = portfolio.taxable.btc / cumulativeBtcPrice;
          
          if (additionalBtcNeeded > 0 && liquidBtcAvailable >= additionalBtcNeeded) {
            // Transfer proportional basis from taxable to encumbered
            const additionalBtcValue = additionalBtcNeeded * cumulativeBtcPrice;
            const taxableBtcValueBeforeTopUp = portfolio.taxable.btc;
            if (taxableBtcValueBeforeTopUp > 0 && runningTaxableBasis > 0) {
              const taxableTotal = getAccountTotal('taxable');
              const basisToTransfer = runningTaxableBasis * (additionalBtcValue / taxableTotal);
              encumberedBtcBasis += basisToTransfer;
              runningTaxableBasis = Math.max(0, runningTaxableBasis - basisToTransfer);
            }
            
            encumberedBtc[liability.id] += additionalBtcNeeded;
            portfolio.taxable.btc -= additionalBtcValue;
            liquidationEvents.push({
              year,
              age,
              type: 'top_up',
              liabilityName: liability.name || liability.lender || 'BTC Loan',
              message: `Added ${additionalBtcNeeded.toFixed(4)} BTC to bring LTV from ${currentLTV.toFixed(1)}% to ${targetLTV}%`
            });
          }
        }

        const postTopUpCollateralValue = encumberedBtc[liability.id] * cumulativeBtcPrice;
        const postTopUpLTV = (liability.current_balance / postTopUpCollateralValue) * 100;

        // Liquidation at 80% LTV
        if (postTopUpLTV >= liquidationLTV) {
          const totalCollateralBtc = encumberedBtc[liability.id];
          const debtBalance = liability.current_balance;
          const btcNeededToPayOff = debtBalance / cumulativeBtcPrice;

          const btcToSell = Math.min(btcNeededToPayOff, totalCollateralBtc);
          const proceedsFromSale = btcToSell * cumulativeBtcPrice;
          const newDebtBalance = Math.max(0, debtBalance - proceedsFromSale);
          const remainingCollateralBtc = totalCollateralBtc - btcToSell;
          
          // Reduce encumberedBtcBasis proportionally for liquidated BTC
          const totalEncumberedBtcAmount = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
          if (totalEncumberedBtcAmount > 0 && encumberedBtcBasis > 0) {
            const basisReduction = encumberedBtcBasis * (btcToSell / totalEncumberedBtcAmount);
            encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisReduction);
          }
          
          liability.current_balance = newDebtBalance;
          encumberedBtc[liability.id] = remainingCollateralBtc;
          
          liquidationEvents.push({
            year,
            age,
            type: newDebtBalance <= 0 ? 'full_liquidation' : 'partial_liquidation',
            liabilityName: liability.name || liability.lender || 'BTC Loan',
            btcAmount: btcToSell,
            proceeds: proceedsFromSale,
            remainingDebt: newDebtBalance,
            remainingCollateral: remainingCollateralBtc,
            message: newDebtBalance <= 0 
              ? `Fully liquidated: ${btcToSell.toFixed(4)} BTC ($${Math.round(proceedsFromSale).toLocaleString()}) to pay off $${Math.round(debtBalance).toLocaleString()} debt`
              : `Partially liquidated: ${btcToSell.toFixed(4)} BTC at ${postTopUpLTV.toFixed(1)}% LTV`
          });
          
          if (newDebtBalance <= 0.01) {
            liability.paid_off = true;
            if (remainingCollateralBtc > 0) {
              // Immediately add remaining collateral to liquid BTC (not delayed)
              const remainingValue = remainingCollateralBtc * cumulativeBtcPrice;
              portfolio.taxable.btc += remainingValue;
              
              // Restore basis for the released collateral
              const basisToRestore = loanCollateralBasis[liability.id] || 0;
              runningTaxableBasis += basisToRestore;
              encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisToRestore);
              loanCollateralBasis[liability.id] = 0;
              
              encumberedBtc[liability.id] = 0;
              releasedBtc[liability.id] = remainingCollateralBtc; // Track for display only
            }
          }
        }
        // Release at 30% LTV
        else if (postTopUpLTV <= releaseLTV) {
          if (liability.current_balance <= 0) {
            // Full release - debt paid off, release all remaining collateral
            const fullReleaseQty = encumberedBtc[liability.id];
            if (fullReleaseQty > 0) {
              const fullReleaseValue = fullReleaseQty * cumulativeBtcPrice;
              portfolio.taxable.btc += fullReleaseValue; // Add to liquid immediately (same year)
              
              // Restore proportional basis for released collateral
              const totalEncumberedBtcBeforeRelease = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
              if (totalEncumberedBtcBeforeRelease > 0 && encumberedBtcBasis > 0) {
                const releaseRatio = Math.min(1, fullReleaseQty / totalEncumberedBtcBeforeRelease);
                const basisToRestore = encumberedBtcBasis * releaseRatio;
                runningTaxableBasis += basisToRestore;
                encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisToRestore);
              }
              
              encumberedBtc[liability.id] = 0;
              liquidationEvents.push({
                year,
                age,
                type: 'release',
                liabilityName: liability.name || liability.lender || 'BTC Loan',
                message: `Released ${fullReleaseQty.toFixed(4)} BTC (debt fully paid)`
              });
            }
          } else {
            // Partial release - LTV too low, release excess collateral
            const currentCollateral = encumberedBtc[liability.id];
            const targetCollateralForLoan = liability.current_balance / (releaseTargetLTV / 100) / cumulativeBtcPrice;
            const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
            if (excessCollateral > 0) {
              const excessCollateralValue = excessCollateral * cumulativeBtcPrice;
              portfolio.taxable.btc += excessCollateralValue; // Add to liquid immediately (same year)
              
              // Restore proportional basis for released collateral
              const totalEncumberedBtcBeforeRelease = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
              if (totalEncumberedBtcBeforeRelease > 0 && encumberedBtcBasis > 0) {
                const releaseRatio = Math.min(1, excessCollateral / totalEncumberedBtcBeforeRelease);
                const basisToRestore = encumberedBtcBasis * releaseRatio;
                runningTaxableBasis += basisToRestore;
                encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisToRestore);
              }
              
              encumberedBtc[liability.id] = targetCollateralForLoan;
              liquidationEvents.push({
                year,
                age,
                type: 'release',
                liabilityName: liability.name || liability.lender || 'BTC Loan',
                message: `Released ${excessCollateral.toFixed(4)} BTC (LTV ${postTopUpLTV.toFixed(1)}% → ${releaseTargetLTV}%)`
              });
            }
          }
        }
      }
    });

    // Process Collateralized Loans
    Object.keys(tempRunningCollateralizedLoans).sort().map(k => tempRunningCollateralizedLoans[k]).forEach(loan => {
      if (!loansWithPayoffGoals.has(loan.id) && !loan.paid_off) {
        const hasInterest = loan.interest_rate && loan.interest_rate > 0;
        const hasMinPayment = loan.minimum_monthly_payment && loan.minimum_monthly_payment > 0;

        if (hasMinPayment) {
          let remainingBalance = loan.current_balance;
          const startMonth = (i === 0) ? currentMonth : 0;

          for (let month = startMonth; month < 12; month++) {
            if (remainingBalance <= 0) {
              if (!loan.paid_off) {
                thisYearDebtPayoffs.push({ name: loan.name, liability_name: loan.name, month: month + 1 });
                loan.paid_off = true;
              }
              break;
            }
            const monthlyInterest = hasInterest ? remainingBalance * (loan.interest_rate / 100 / 12) : 0;
            const principalPayment = Math.max(0, loan.minimum_monthly_payment - monthlyInterest);
            const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, loan.minimum_monthly_payment);
            remainingBalance = Math.max(0, remainingBalance - principalPayment);
            actualAnnualDebtPayments += paymentThisMonth;
          }
          loan.current_balance = remainingBalance;
          if (remainingBalance <= 0.01 && !loan.paid_off) {
            thisYearDebtPayoffs.push({ name: loan.name, liability_name: loan.name });
            loan.paid_off = true;
          }
        } else if (hasInterest && i > 0) {
          // Apply declining rate if configured
          const effectiveRate = getLoanRateForYear(
            loan.interest_rate,
            i,
            futureBtcLoanRate,
            futureBtcLoanRateYears
          );
          const dailyRate = effectiveRate / 100 / 365;
          loan.current_balance = loan.current_balance * Math.pow(1 + dailyRate, 365);
        }
      }

      // Collateral Management for Collateralized Loans
      const loanKey = `loan_${loan.id}`;
      if (encumberedBtc[loanKey] > 0) {
        const collateralValue = encumberedBtc[loanKey] * cumulativeBtcPrice;
        let currentLTV = (loan.current_balance / collateralValue) * 100;
        
        const liquidationLTV = loan.liquidation_ltv || 80;
        const releaseLTV = btcReleaseTriggerLtv || 30;
        const triggerLTV = btcTopUpTriggerLtv || 70;
        const targetLTV = btcTopUpTargetLtv || 50; // Ledn resets to 50% LTV after top-up
        const releaseTargetLTV = btcReleaseTargetLtv || 40;

        // Auto Top-up
        if (autoTopUpBtcCollateral && currentLTV >= triggerLTV && currentLTV < liquidationLTV) {
          const targetCollateralValue = loan.current_balance / (targetLTV / 100);
          const additionalBtcNeeded = (targetCollateralValue / cumulativeBtcPrice) - encumberedBtc[loanKey];
          const liquidBtcAvailable = portfolio.taxable.btc / cumulativeBtcPrice;
          
          if (additionalBtcNeeded > 0 && liquidBtcAvailable >= additionalBtcNeeded) {
            // Transfer proportional basis from taxable to encumbered
            const additionalBtcValue = additionalBtcNeeded * cumulativeBtcPrice;
            const taxableBtcValueBeforeTopUp = portfolio.taxable.btc;
            if (taxableBtcValueBeforeTopUp > 0 && runningTaxableBasis > 0) {
              const taxableTotal = getAccountTotal('taxable');
              const basisToTransfer = runningTaxableBasis * (additionalBtcValue / taxableTotal);
              encumberedBtcBasis += basisToTransfer;
              runningTaxableBasis = Math.max(0, runningTaxableBasis - basisToTransfer);
            }
            
            encumberedBtc[loanKey] += additionalBtcNeeded;
            portfolio.taxable.btc -= additionalBtcValue;
            liquidationEvents.push({
              year,
              age,
              type: 'top_up',
              liabilityName: loan.name || loan.lender || 'BTC Loan',
              message: `Added ${additionalBtcNeeded.toFixed(4)} BTC to bring LTV from ${currentLTV.toFixed(1)}% to ${targetLTV}%`
            });
          }
        }

        const postTopUpCollateralValue = encumberedBtc[loanKey] * cumulativeBtcPrice;
        const postTopUpLTV = (loan.current_balance / postTopUpCollateralValue) * 100;

        // Liquidation
        if (postTopUpLTV >= liquidationLTV) {
          const totalCollateralBtc = encumberedBtc[loanKey];
          const debtBalance = loan.current_balance;
          const btcNeededToPayOff = debtBalance / cumulativeBtcPrice;

          const btcToSell = Math.min(btcNeededToPayOff, totalCollateralBtc);
          const proceedsFromSale = btcToSell * cumulativeBtcPrice;
          const newDebtBalance = Math.max(0, debtBalance - proceedsFromSale);
          const remainingCollateralBtc = totalCollateralBtc - btcToSell;
          
          // Reduce encumberedBtcBasis proportionally for liquidated BTC
          const totalEncumberedBtcAmount = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
          if (totalEncumberedBtcAmount > 0 && encumberedBtcBasis > 0) {
            const basisReduction = encumberedBtcBasis * (btcToSell / totalEncumberedBtcAmount);
            encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisReduction);
          }
          
          loan.current_balance = newDebtBalance;
          encumberedBtc[loanKey] = remainingCollateralBtc;
          if (tempRunningDebt[loan.id]) tempRunningDebt[loan.id].current_balance = newDebtBalance;
          
          liquidationEvents.push({
            year,
            age,
            type: newDebtBalance <= 0 ? 'full_liquidation' : 'partial_liquidation',
            liabilityName: loan.name || loan.lender || 'BTC Loan',
            btcAmount: btcToSell,
            proceeds: proceedsFromSale,
            remainingDebt: newDebtBalance,
            remainingCollateral: remainingCollateralBtc,
            message: newDebtBalance <= 0 
              ? `Fully liquidated: ${btcToSell.toFixed(4)} BTC ($${Math.round(proceedsFromSale).toLocaleString()}) to pay off $${Math.round(debtBalance).toLocaleString()} debt`
              : `Partially liquidated: ${btcToSell.toFixed(4)} BTC at ${postTopUpLTV.toFixed(1)}% LTV`
          });
          
          if (newDebtBalance <= 0.01) {
            loan.paid_off = true;
            if (tempRunningDebt[loan.id]) tempRunningDebt[loan.id].paid_off = true;
            if (remainingCollateralBtc > 0) {
              // Immediately add remaining collateral to liquid BTC (not delayed)
              const remainingValue = remainingCollateralBtc * cumulativeBtcPrice;
              portfolio.taxable.btc += remainingValue;
              
              // Restore basis for the released collateral
              const basisToRestore = loanCollateralBasis[loanKey] || 0;
              runningTaxableBasis += basisToRestore;
              encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisToRestore);
              loanCollateralBasis[loanKey] = 0;
              
              encumberedBtc[loanKey] = 0;
              releasedBtc[loanKey] = remainingCollateralBtc; // Track for display only
            }
          }
        }
        // Release
        else if (postTopUpLTV <= releaseLTV) {
          if (loan.current_balance <= 0) {
            // Full release - debt paid off, release all remaining collateral
            const fullReleaseQty = encumberedBtc[loanKey];
            if (fullReleaseQty > 0) {
              const fullReleaseValue = fullReleaseQty * cumulativeBtcPrice;
              portfolio.taxable.btc += fullReleaseValue; // Add to liquid immediately (same year)
              
              // Restore proportional basis for released collateral
              const totalEncumberedBtcBeforeRelease = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
              if (totalEncumberedBtcBeforeRelease > 0 && encumberedBtcBasis > 0) {
                const releaseRatio = Math.min(1, fullReleaseQty / totalEncumberedBtcBeforeRelease);
                const basisToRestore = encumberedBtcBasis * releaseRatio;
                runningTaxableBasis += basisToRestore;
                encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisToRestore);
              }
              
              encumberedBtc[loanKey] = 0;
              liquidationEvents.push({
                year,
                age,
                type: 'release',
                liabilityName: loan.name || loan.lender || 'BTC Loan',
                message: `Released ${fullReleaseQty.toFixed(4)} BTC (debt fully paid)`
              });
            }
          } else {
            // Partial release - LTV too low, release excess collateral
            const currentCollateral = encumberedBtc[loanKey];
            const targetCollateralForLoan = loan.current_balance / (releaseTargetLTV / 100) / cumulativeBtcPrice;
            const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
            if (excessCollateral > 0) {
              // DEBUG: Trace collateral release
              console.log(`COLLATERAL RELEASE DEBUG Year ${year} (Age ${age}):`, {
                loanKey,
                loanName: loan.name || loan.lender,
                currentCollateral,
                targetCollateralForLoan,
                excessCollateral,
                encumberedBtcBEFORE: encumberedBtc[loanKey],
                cumulativeBtcPrice,
                loanBalance: loan.current_balance,
                releaseTargetLTV
              });
              
              const excessCollateralValue = excessCollateral * cumulativeBtcPrice;
              portfolio.taxable.btc += excessCollateralValue; // Add to liquid immediately (same year)
              
              // Restore proportional basis for released collateral
              const totalEncumberedBtcBeforeRelease = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
              if (totalEncumberedBtcBeforeRelease > 0 && encumberedBtcBasis > 0) {
                const releaseRatio = Math.min(1, excessCollateral / totalEncumberedBtcBeforeRelease);
                const basisToRestore = encumberedBtcBasis * releaseRatio;
                runningTaxableBasis += basisToRestore;
                encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisToRestore);
              }
              
              encumberedBtc[loanKey] = targetCollateralForLoan;
              
              // DEBUG: After update
              console.log(`COLLATERAL RELEASE DEBUG Year ${year} AFTER:`, {
                encumberedBtcAFTER: encumberedBtc[loanKey],
                totalEncumberedBtc: Object.values(encumberedBtc).reduce((s,v) => s+v, 0)
              });
              
              liquidationEvents.push({
                year,
                age,
                type: 'release',
                liabilityName: loan.name || loan.lender || 'BTC Loan',
                message: `Released ${excessCollateral.toFixed(4)} BTC (LTV ${postTopUpLTV.toFixed(1)}% → ${releaseTargetLTV}%)`
              });
            }
          }
        }
      }
    });
    
    // DEBUG: Log encumberedBtc state at end of collateral processing
    console.log(`YEAR ${year} (Age ${age}) - encumberedBtc after collateral processing:`, JSON.stringify(encumberedBtc));
    console.log(`BTC AFTER ALL COLLATERAL PROCESSING Year ${year}: $${portfolio.taxable.btc.toFixed(2)}, implied qty = ${(portfolio.taxable.btc / cumulativeBtcPrice).toFixed(6)} BTC, change from loop start = $${(portfolio.taxable.btc - btcAtLoopStart).toFixed(2)}`);

    // ============================================
    // PROCESS ASSET REALLOCATIONS (Scenario-specific)
    // ============================================
    if (assetReallocations && assetReallocations.length > 0) {
      // Sort reallocations by ID for deterministic order, then use index for lot IDs
      const sortedReallocations = [...assetReallocations].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      sortedReallocations.forEach((realloc, reallocIndex) => {
        // execution_year is stored as an AGE (e.g., 31), not calendar year
        // Convert age to calendar year for comparison
        let targetYear = realloc.execution_year;
        if (targetYear && targetYear < 200) {
          // It's an age, convert: check if current projection age matches the execution age
          if (age !== targetYear) return;
        } else {
          // It's a calendar year
          if (targetYear !== year) return;
        }
        
        const sellAmount = realloc.sell_amount || 0;
        if (sellAmount <= 0) return;
        
        // Get source info from holding or direct fields
        let sourceAccountType = realloc.source_account_type;
        let sellAssetType = realloc.sell_asset_type;
        
        if (realloc.sell_holding_id && sortedHoldings) {
          const holdingToSell = sortedHoldings.find(h => h.id === realloc.sell_holding_id);
          if (holdingToSell) {
            if (!sourceAccountType) {
              const taxTreatment = getTaxTreatmentFromHolding(holdingToSell);
              sourceAccountType = taxTreatment || holdingToSell.account_type || 'taxable';
            }
            if (!sellAssetType) sellAssetType = holdingToSell.asset_type || 'btc';
          }
        }
        
        // Normalize account types
        sourceAccountType = (sourceAccountType || 'taxable').toLowerCase();
        if (sourceAccountType.includes('roth') || sourceAccountType === 'tax_free') sourceAccountType = 'tax_free';
        else if (sourceAccountType.includes('traditional') || sourceAccountType.includes('401k') || sourceAccountType.includes('ira') || sourceAccountType === 'tax_deferred') sourceAccountType = 'tax_deferred';
        else sourceAccountType = 'taxable';
        
        sellAssetType = (sellAssetType || 'btc').toLowerCase();
        const sellAssetCategory = getAssetCategory(sellAssetType, sellAssetType === 'btc' ? 'BTC' : null);
        
        let destinationAccountType = (realloc.destination_account_type || 'taxable').toLowerCase();
        if (destinationAccountType.includes('roth') || destinationAccountType === 'tax_free') destinationAccountType = 'tax_free';
        else if (destinationAccountType.includes('traditional') || destinationAccountType.includes('401k') || destinationAccountType.includes('ira') || destinationAccountType === 'tax_deferred') destinationAccountType = 'tax_deferred';
        else destinationAccountType = 'taxable';
        
        const buyAssetType = (realloc.buy_asset_type || 'btc').toLowerCase();
        const buyAssetName = realloc.buy_asset_name || 'Cash';
        const buyCagr = realloc.buy_cagr || 0;
        const buyDividendYield = realloc.buy_dividend_yield || 0;
        const buyDividendQualified = realloc.buy_dividend_qualified !== false;
        
        if (DEBUG) console.log(`[Year ${year}] Age ${age}: Executing reallocation - Sell $${sellAmount} ${sellAssetCategory} from ${sourceAccountType}, buy ${buyAssetType} in ${destinationAccountType}`);
        
        // Determine source portfolio key
        let sourcePortfolioKey = 'taxable';
        if (sourceAccountType === 'tax_deferred') sourcePortfolioKey = 'taxDeferred';
        else if (sourceAccountType === 'tax_free') sourcePortfolioKey = 'taxFree';
        
        // Check available balance
        const availableInSource = portfolio[sourcePortfolioKey]?.[sellAssetCategory] || 0;
        const actualSellAmount = Math.min(sellAmount, availableInSource);
        
        if (actualSellAmount <= 0) {
          if (DEBUG) console.log(`[Year ${year}] Reallocation skipped - no ${sellAssetCategory} available in ${sourcePortfolioKey}`);
          return;
        }
        
        // === STEP 1: SELL FROM SOURCE ===
        portfolio[sourcePortfolioKey][sellAssetCategory] -= actualSellAmount;
        
        // Reduce holdingValues proportionally
        const preWithdrawalAmount = availableInSource;
        reduceHoldingValuesForWithdrawal(sellAssetCategory, sourceAccountType, actualSellAmount, preWithdrawalAmount);
        
        // === STEP 2: CALCULATE TAXES/PENALTIES ===
        let reallocTaxes = 0;
        let reallocPenalties = 0;
        let costBasis = 0;
        let gains = 0;
        
        if (sourcePortfolioKey === 'taxable') {
          // Taxable: Calculate capital gains using lot selection for BTC
          if (sellAssetCategory === 'btc' && runningTaxLots.length > 0) {
            const btcQtyToSell = actualSellAmount / cumulativeBtcPrice;
            const taxableBtcLots = runningTaxLots.filter(lot => 
              lot.asset_ticker === 'BTC' && 
              (lot.account_type === 'taxable' || !lot.account_type) &&
              (lot.remaining_quantity ?? lot.quantity) > 0
            );
            
            if (taxableBtcLots.length > 0) {
              const lotResult = selectLots(taxableBtcLots, 'BTC', btcQtyToSell, costBasisMethod);
              costBasis = lotResult.totalCostBasis;
              
              // Update running tax lots
              for (const selected of lotResult.selectedLots) {
                const lotIndex = runningTaxLots.findIndex(l => l.id === selected.lot.id || l.lot_id === selected.lot.lot_id);
                if (lotIndex >= 0) {
                  const currentRemaining = runningTaxLots[lotIndex].remaining_quantity ?? runningTaxLots[lotIndex].quantity ?? 0;
                  runningTaxLots[lotIndex].remaining_quantity = Math.max(0, currentRemaining - selected.quantityFromLot);
                }
              }
            } else {
              // Fallback: estimate cost basis from runningTaxableBasis
              const taxableTotal = getAccountTotal('taxable');
              costBasis = taxableTotal > 0 ? actualSellAmount * (runningTaxableBasis / taxableTotal) : actualSellAmount * 0.5;
            }
          } else {
            // Non-BTC: estimate cost basis proportionally
            const taxableTotal = getAccountTotal('taxable');
            costBasis = taxableTotal > 0 ? actualSellAmount * (runningTaxableBasis / taxableTotal) : actualSellAmount * 0.5;
          }
          
          gains = Math.max(0, actualSellAmount - costBasis);
          const ltcgRate = getLTCGRate(0, filingStatus, year); // Simplified - no stacking
          reallocTaxes = gains * ltcgRate;
          runningTaxableBasis = Math.max(0, runningTaxableBasis - costBasis);
          
        } else if (sourcePortfolioKey === 'taxFree') {
          // Roth IRA: Contributions are always tax-free and penalty-free
          // Earnings are taxed as ORDINARY INCOME + 10% penalty if withdrawn before 59.5
          if (age < PENALTY_FREE_AGE) {
            // Calculate current Roth balance
            const currentRothBalance = (portfolio.taxFree.btc || 0) + (portfolio.taxFree.stocks || 0) + 
              (portfolio.taxFree.bonds || 0) + (portfolio.taxFree.cash || 0) + (portfolio.taxFree.other || 0);
            
            // Track how much has already been withdrawn from Roth (contributions withdrawn first per IRS ordering)
            const alreadyWithdrawnFromRoth = Math.max(0, initialRothBalance - currentRothBalance);
            
            // Contributions remaining = total contributions minus what's already been withdrawn
            const contributionsRemaining = Math.max(0, totalRothContributions - alreadyWithdrawnFromRoth);
            
            // This withdrawal: contributions portion (tax-free) vs earnings portion (taxable)
            const fromContributions = Math.min(actualSellAmount, contributionsRemaining);
            const fromEarnings = Math.max(0, actualSellAmount - fromContributions);
            
            if (fromEarnings > 0) {
              // Earnings taxed as ORDINARY INCOME (not capital gains) plus 10% penalty
              // Use progressive tax calculation for accuracy
              const earningsTax = calculateProgressiveIncomeTax(fromEarnings, filingStatus, year);
              const ordinaryIncomeRate = fromEarnings > 0 ? (earningsTax / fromEarnings) : 0.24;
              reallocTaxes = fromEarnings * Math.max(ordinaryIncomeRate, 0.10); // At least 10% bracket
              reallocPenalties = fromEarnings * 0.10;
              
              if (DEBUG) console.log(`[Year ${year}] Roth early withdrawal: $${actualSellAmount.toFixed(0)} total - $${fromContributions.toFixed(0)} from contributions (tax-free), $${fromEarnings.toFixed(0)} from earnings (ordinary income tax + 10% penalty)`);
            } else {
              if (DEBUG) console.log(`[Year ${year}] Roth early withdrawal: $${actualSellAmount.toFixed(0)} entirely from contributions (tax-free, no penalty)`);
            }
          }
          // After 59.5: All Roth withdrawals are tax-free and penalty-free
          
        } else if (sourcePortfolioKey === 'taxDeferred') {
          // Traditional IRA/401k: Full amount taxed as ordinary income using progressive brackets
          // Get inflation-adjusted income brackets for the projection year
          const incomeBracketsData = getFederalBrackets(year, filingStatus, effectiveInflation / 100);
          const incomeBrackets = incomeBracketsData.map(b => ({
            max: b.max,
            rate: b.rate / 100
          }));

          // Estimate cumulative taxable income for this year (for proper bracket stacking)
          // Use current year's gross income as base, adjusted for growth
          let cumulativeTaxableIncomeForRealloc = Math.max(0, grossAnnualIncome * Math.pow(1 + incomeGrowth / 100, i));

          // Calculate progressive income tax on the withdrawal
          let taxOnTaxDeferred = 0;
          let remainingAmount = actualSellAmount;
          
          for (const bracket of incomeBrackets) {
            if (remainingAmount <= 0) break;
            const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncomeForRealloc);
            const amountInBracket = Math.min(remainingAmount, roomInBracket);
            taxOnTaxDeferred += amountInBracket * bracket.rate;
            cumulativeTaxableIncomeForRealloc += amountInBracket;
            remainingAmount -= amountInBracket;
          }
          
          reallocTaxes = taxOnTaxDeferred;
          
          // 10% early withdrawal penalty if under 59.5
          if (age < PENALTY_FREE_AGE) {
            reallocPenalties = actualSellAmount * 0.10;
          }
        }
        
        // === STEP 3: NET PROCEEDS ===
        const netProceeds = actualSellAmount - reallocTaxes - reallocPenalties;
        
        // === STEP 4: BUY INTO DESTINATION ===
        const buyCategory = buyAssetType === 'btc' ? 'btc' : 
                           buyAssetType === 'stocks' ? 'stocks' : 
                           buyAssetType === 'bonds' ? 'bonds' : 
                           buyAssetType === 'cash' ? 'cash' : 'other';
        
        // Determine destination portfolio key
        let destPortfolioKey = 'taxable';
        if (destinationAccountType === 'tax_deferred') destPortfolioKey = 'taxDeferred';
        else if (destinationAccountType === 'tax_free') destPortfolioKey = 'taxFree';
        
        portfolio[destPortfolioKey][buyCategory] += netProceeds;
        if (destPortfolioKey === 'taxable') {
          runningTaxableBasis += netProceeds; // New basis = net proceeds (only for taxable)
        }
        
        // === STEP 5: CREATE TAX LOT IF BUYING BTC IN TAXABLE ===
        if (buyAssetType === 'btc' && netProceeds > 0 && destPortfolioKey === 'taxable') {
          const btcQtyPurchased = netProceeds / cumulativeBtcPrice;
          runningTaxLots.push({
            id: `realloc-${year}-${realloc.id || reallocIndex}`,
            lot_id: `realloc-${year}-${realloc.id || reallocIndex}`,
            asset_ticker: 'BTC',
            quantity: btcQtyPurchased,
            remaining_quantity: btcQtyPurchased,
            price_per_unit: cumulativeBtcPrice,
            cost_basis: netProceeds,
            date: `${year}-01-01`,
            account_type: 'taxable',
            source: 'reallocation',
          });
        }
        
        // === STEP 6: TRACK FOR DIVIDEND CALCULATIONS ===
        executedReallocations.push({
          id: realloc.id || `realloc-${year}`,
          year,
          sellAssetType: sellAssetCategory,
          buyAssetName,
          buyAssetType,
          soldAmount: actualSellAmount,
          taxesPaid: reallocTaxes,
          penaltiesPaid: reallocPenalties,
          netProceeds,
          capitalGains: gains,
          currentValue: netProceeds,
          buy_cagr: buyCagr,
          buy_dividend_yield: buyDividendYield,
          buy_dividend_qualified: buyDividendQualified,
        });
        
        // Add taxes/penalties to year totals
        taxesPaid += reallocTaxes;
        federalTaxPaid += reallocTaxes;
        penaltyPaid += reallocPenalties;
        
        // Track early withdrawal details separately for tooltips
        if (age < PENALTY_FREE_AGE) {
          yearEarlyWithdrawalTax += reallocTaxes;
          yearEarlyWithdrawalPenalty += reallocPenalties;
        }
        
        // Track reallocation details for tooltip display
        yearReallocationDetails.push({
          fromAccount: sourcePortfolioKey,
          toAccount: destPortfolioKey,
          sellAsset: sellAssetCategory,
          buyAsset: buyAssetType,
          amount: Math.round(actualSellAmount),
          netProceeds: Math.round(netProceeds),
          taxPaid: Math.round(reallocTaxes),
          penaltyPaid: Math.round(reallocPenalties),
          capitalGains: Math.round(gains),
        });
        
        if (DEBUG) {
          console.log(`[Year ${year}] Executed reallocation:`);
          console.log(`  Sold: $${actualSellAmount.toLocaleString()} ${sellAssetCategory} from ${sourcePortfolioKey}`);
          console.log(`  Cost Basis: $${costBasis.toLocaleString()}, Gains: $${gains.toLocaleString()}`);
          console.log(`  Taxes: $${reallocTaxes.toLocaleString()}, Penalties: $${reallocPenalties.toLocaleString()}`);
          console.log(`  Bought: $${netProceeds.toLocaleString()} ${buyAssetType} (${destPortfolioKey})`);
        }
      });
    }

    // Initialize weighted stocks growth rates (will be calculated each year)
    let effectiveTaxableStocksGrowth = effectiveStocksCagr;
    let effectiveTaxDeferredStocksGrowth = effectiveStocksCagr;
    let effectiveTaxFreeStocksGrowth = effectiveStocksCagr;

    // Apply growth AFTER collateral management
    // NOTE: We're applying blanket growth rates here because portfolio structure aggregates by asset category
    // Per-ticker returns would require tracking individual holdings through projection (future enhancement)
    if (i > 0) {
      const yearStocksGrowth = yearlyReturnOverrides?.stocks?.[i] !== undefined 
        ? yearlyReturnOverrides.stocks[i] 
        : getCustomReturnForYear('stocks', i, customReturnPeriods, effectiveStocksCagr);
      const yearBondsGrowth = yearlyReturnOverrides?.bonds?.[i] !== undefined 
        ? yearlyReturnOverrides.bonds[i] 
        : getCustomReturnForYear('bonds', i, customReturnPeriods, bondsCagr);
      const yearCashGrowth = yearlyReturnOverrides?.cash?.[i] !== undefined 
        ? yearlyReturnOverrides.cash[i] 
        : getCustomReturnForYear('cash', i, customReturnPeriods, cashCagr);
      const yearOtherGrowth = yearlyReturnOverrides?.other?.[i] !== undefined 
        ? yearlyReturnOverrides.other[i] 
        : getCustomReturnForYear('other', i, customReturnPeriods, otherCagr);
      const yearRealEstateGrowth = yearlyReturnOverrides?.realEstate?.[i] !== undefined 
        ? yearlyReturnOverrides.realEstate[i] 
        : getCustomReturnForYear('realEstate', i, customReturnPeriods, realEstateCagr);

      // CRITICAL: Capture beginning-of-year values BEFORE applying growth (for Average Balance Method dividends)
      beginningYearValues = holdingValues.map(hv => ({
        ticker: hv.ticker,
        beginningValue: hv.currentValue
      }));
      
      beginningReallocValues = executedReallocations.map(r => ({
        id: r.id,
        beginningValue: r.currentValue
      }));

      // Calculate weighted average growth for stocks by account type based on holdingValues
      // This ensures portfolio aggregate growth matches individual holding growth rates
      const calculateWeightedStocksGrowth = (taxTreatmentFilter) => {
        let totalValue = 0;
        let weightedGrowth = 0;
        
        holdingValues.forEach(hv => {
          if (hv.assetCategory === 'stocks' && hv.taxTreatment === taxTreatmentFilter && hv.currentValue > 0) {
            const tickerRate = getTickerReturnRate(hv.ticker, null);
            const holdingGrowthRate = tickerRate !== null ? tickerRate : yearStocksGrowth;
            totalValue += hv.currentValue;
            weightedGrowth += hv.currentValue * holdingGrowthRate;
          }
        });
        
        return totalValue > 0 ? weightedGrowth / totalValue : yearStocksGrowth;
      };
      
      effectiveTaxableStocksGrowth = calculateWeightedStocksGrowth('taxable');
      effectiveTaxDeferredStocksGrowth = calculateWeightedStocksGrowth('tax_deferred');
      effectiveTaxFreeStocksGrowth = calculateWeightedStocksGrowth('tax_free');

      // Apply growth only to balances above dust threshold to prevent compounding near-zero values
      // CRITICAL: Only apply growth if the rate is non-zero (prevents cash from growing when cashCagr=0)
      const GROWTH_DUST_THRESHOLD = 1; // Don't apply growth to values under $1
      
      // DEBUG: Log BTC value BEFORE growth applied
      const btcBeforeGrowth = portfolio.taxable.btc;
      
      // Apply growth to each account type with appropriate weighted stocks growth
      const applyGrowth = (acct, stocksGrowthRate) => {
        if (acct.btc >= GROWTH_DUST_THRESHOLD && yearBtcGrowth !== 0) acct.btc *= (1 + yearBtcGrowth / 100);
        else if (acct.btc < GROWTH_DUST_THRESHOLD) acct.btc = 0;
        if (acct.stocks >= GROWTH_DUST_THRESHOLD && stocksGrowthRate !== 0) acct.stocks *= (1 + stocksGrowthRate / 100);
        else if (acct.stocks < GROWTH_DUST_THRESHOLD) acct.stocks = 0;
        if (acct.bonds >= GROWTH_DUST_THRESHOLD && yearBondsGrowth !== 0) acct.bonds *= (1 + yearBondsGrowth / 100);
        else if (acct.bonds < GROWTH_DUST_THRESHOLD) acct.bonds = 0;
        if (acct.cash >= GROWTH_DUST_THRESHOLD && yearCashGrowth !== 0) acct.cash *= (1 + yearCashGrowth / 100);
        else if (acct.cash < GROWTH_DUST_THRESHOLD) acct.cash = 0;
        if (acct.other >= GROWTH_DUST_THRESHOLD && yearOtherGrowth !== 0) acct.other *= (1 + yearOtherGrowth / 100);
        else if (acct.other < GROWTH_DUST_THRESHOLD) acct.other = 0;
      };
      
      applyGrowth(portfolio.taxable, effectiveTaxableStocksGrowth);
      applyGrowth(portfolio.taxDeferred, effectiveTaxDeferredStocksGrowth);
      applyGrowth(portfolio.taxFree, effectiveTaxFreeStocksGrowth);
      
      // DEBUG: Log BTC growth impact
      const btcAfterGrowth = portfolio.taxable.btc;
      console.log(`BTC ASSET GROWTH Year ${year}: BEFORE = $${btcBeforeGrowth.toFixed(2)}, AFTER = $${btcAfterGrowth.toFixed(2)}, growth rate = ${yearBtcGrowth.toFixed(2)}%, USD added = $${(btcAfterGrowth - btcBeforeGrowth).toFixed(2)}`);
      console.log(`BTC QTY CHECK Year ${year}: before growth qty = ${(btcBeforeGrowth / cumulativeBtcPrice).toFixed(6)}, after growth qty = ${(btcAfterGrowth / cumulativeBtcPrice).toFixed(6)}, QTY CHANGE = ${((btcAfterGrowth - btcBeforeGrowth) / cumulativeBtcPrice).toFixed(6)} BTC`);
      
      if (portfolio.realEstate >= GROWTH_DUST_THRESHOLD && yearRealEstateGrowth !== 0) portfolio.realEstate *= (1 + yearRealEstateGrowth / 100);
      else if (portfolio.realEstate < GROWTH_DUST_THRESHOLD) portfolio.realEstate = 0;
      
      // Update tracked holding values for dividend calculations (AFTER capturing beginning values)
      holdingValues.forEach(hv => {
        if (hv.currentValue < 1) {
          hv.currentValue = 0;
          return;
        }
        // Get growth rate for this holding
        let growthRate;
        if (hv.assetCategory === 'btc') {
          growthRate = yearBtcGrowth;
        } else {
          const tickerRate = getTickerReturnRate(hv.ticker, null);
          if (tickerRate !== null) {
            growthRate = tickerRate;
          } else if (hv.assetCategory === 'stocks') {
            // Use the weighted growth rate based on tax treatment
            if (hv.taxTreatment === 'taxable') {
              growthRate = effectiveTaxableStocksGrowth;
            } else if (hv.taxTreatment === 'tax_deferred') {
              growthRate = effectiveTaxDeferredStocksGrowth;
            } else if (hv.taxTreatment === 'tax_free') {
              growthRate = effectiveTaxFreeStocksGrowth;
            } else {
              growthRate = yearStocksGrowth;
            }
          } else if (hv.assetCategory === 'bonds') {
            growthRate = yearBondsGrowth;
          } else if (hv.assetCategory === 'cash') {
            growthRate = yearCashGrowth;
          } else if (hv.assetCategory === 'realEstate') {
            growthRate = yearRealEstateGrowth;
          } else {
            growthRate = yearOtherGrowth;
          }
        }
        
        hv.currentValue *= (1 + growthRate / 100);
      });
      
      // Update executed reallocation values
      executedReallocations.forEach(realloc => {
        if (realloc.currentValue < 1) {
          realloc.currentValue = 0;
          return;
        }
        realloc.currentValue *= (1 + (realloc.buy_cagr || effectiveTaxableStocksGrowth) / 100);
      });
    }

    // ESTIMATED DIVIDEND INCOME (calculated early, before withdrawals)
    // This estimate reduces how much we need to withdraw from the portfolio
    // Uses current holding values (post-growth, pre-withdrawal) as approximation
    // Final accurate dividend will be calculated later using Average Balance Method
    let estimatedDividendIncome = 0;
    holdingValues.forEach(hv => {
      if (hv.dividendYield > 0 && (hv.taxTreatment === 'taxable' || hv.taxTreatment === 'real_estate') && hv.currentValue > 0) {
        estimatedDividendIncome += hv.currentValue * (hv.dividendYield / 100);
      }
    });
    executedReallocations.forEach(realloc => {
      if (realloc.buy_dividend_yield > 0 && realloc.currentValue > 0) {
        estimatedDividendIncome += realloc.currentValue * (realloc.buy_dividend_yield / 100);
      }
    });

    let ranOutOfMoneyThisYear = false;

    // PRE-RETIREMENT
    if (!isRetired) {
      const baseGrossIncome = grossAnnualIncome * Math.pow(1 + incomeGrowth / 100, i);
      yearGrossIncome = baseGrossIncome; // Life event income shows separately via yearLifeEventIncome
      
      // Calculate contribution limits
      const yearLimit401k = get401kLimit(year, age);
      const yearLimitRoth = getRothIRALimit(year, age);
      const yearLimitTraditionalIRA = getTraditionalIRALimit(year, age);
      const yearLimitHSA = getHSALimit(year, age, hsaFamilyCoverage);
      
      // IRS Rule: Can't contribute more than earned income
      const maxContributionAllowed = Math.max(0, yearGrossIncome);
      let remainingIncomeForContributions = maxContributionAllowed;
      
      // 401k - capped at IRS limit AND earned income
      year401k = Math.min(
        (contribution401k || 0) * Math.pow(1 + incomeGrowth / 100, i),
        yearLimit401k,
        remainingIncomeForContributions
      );
      remainingIncomeForContributions -= year401k;
      
      // Traditional IRA - capped at IRS limit AND remaining earned income
      yearTraditionalIRA = Math.min(
        (contributionTraditionalIRA || 0) * Math.pow(1 + incomeGrowth / 100, i),
        yearLimitTraditionalIRA,
        remainingIncomeForContributions
      );
      remainingIncomeForContributions -= yearTraditionalIRA;
      
      // HSA - capped at IRS limit AND remaining earned income
      yearHSA = Math.min(
        (contributionHSA || 0) * Math.pow(1 + incomeGrowth / 100, i),
        yearLimitHSA,
        remainingIncomeForContributions
      );
      remainingIncomeForContributions -= yearHSA;
      
      // Roth IRA - capped at IRS limit, remaining earned income, AND apply income phase-out
      const rothIncomeLimit = getRothIRAIncomeLimit(year, filingStatus);
      let rothPhaseOutMultiplier = 1;
      const adjustedGrossIncome = yearGrossIncome - year401k - yearTraditionalIRA - yearHSA;
      if (adjustedGrossIncome >= rothIncomeLimit.phaseOutEnd) {
        rothPhaseOutMultiplier = 0;
      } else if (adjustedGrossIncome > rothIncomeLimit.phaseOutStart) {
        rothPhaseOutMultiplier = (rothIncomeLimit.phaseOutEnd - adjustedGrossIncome) / 
          (rothIncomeLimit.phaseOutEnd - rothIncomeLimit.phaseOutStart);
      }
      yearRoth = Math.min(
        (contributionRothIRA || 0) * Math.pow(1 + incomeGrowth / 100, i) * rothPhaseOutMultiplier,
        yearLimitRoth,
        remainingIncomeForContributions
      );
      
      yearEmployerMatch = (employer401kMatch || 0) * Math.pow(1 + incomeGrowth / 100, i);
      
      yearTaxableIncome = Math.max(0, yearGrossIncome + yearLifeEventTaxableIncome - year401k - yearTraditionalIRA - yearHSA - currentStandardDeduction);
      const yearFederalTax = calculateProgressiveIncomeTax(yearTaxableIncome, filingStatus, year);
      const yearStateTax = calculateStateIncomeTax({ 
        income: yearGrossIncome + yearLifeEventTaxableIncome - year401k - yearTraditionalIRA - yearHSA, 
        filingStatus, 
        state: stateOfResidence, 
        year,
        inflationRate: effectiveInflation / 100
      });
      
      federalTaxPaid = yearFederalTax;
      stateTaxPaid = yearStateTax;
      taxesPaid = yearFederalTax + yearStateTax;
      // Net income = gross - taxes - pre-tax contributions (401k, Traditional IRA, HSA come from paycheck)
      // Add estimated dividend income (calculated before withdrawals) for cash flow decisions
      // Add life event income (inheritance, windfall, etc.) AND loan proceeds - already invested in portfolio but also adds to cash flow
      const yearNetIncome = yearGrossIncome - taxesPaid - year401k - yearTraditionalIRA - yearHSA + estimatedDividendIncome + yearLifeEventIncome + yearLoanProceeds;

      // Calculate base spending WITHOUT one-time life event expenses (for tooltip display)
      const baseSpendingOnly = (currentAnnualSpending * Math.pow(1 + effectiveInflation / 100, i)) + activeExpenseAdjustment;
      // Total spending need includes one-time life event expenses
      const totalSpendingNeed = (baseSpendingOnly + yearLifeEventExpense);
      const proRatedTotalSpending = i === 0 ? totalSpendingNeed * currentYearProRataFactor : totalSpendingNeed;
      // yearSpending for tooltip should be just base spending (life event expense shown separately)
      yearSpending = i === 0 ? baseSpendingOnly * currentYearProRataFactor : baseSpendingOnly;
      
      const proRatedNetIncome = i === 0 ? yearNetIncome * currentYearProRataFactor : yearNetIncome;
      const proRatedYearRoth = i === 0 ? yearRoth * currentYearProRataFactor : yearRoth;
      // Use proRatedTotalSpending (includes life event expenses) for actual savings calculation
      yearSavings = proRatedNetIncome - proRatedTotalSpending - proRatedYearRoth - yearGoalWithdrawal;

      cumulativeSavings += yearSavings;

      // Add additional savings being tested (for "Save More" card binary search)
      if (additionalAnnualSavings > 0) {
        const inflatedAdditionalSavings = additionalAnnualSavings * Math.pow(1 + incomeGrowth / 100, i);
        const proRatedAdditional = i === 0 ? inflatedAdditionalSavings * currentYearProRataFactor : inflatedAdditionalSavings;

        // Add to yearSavings first
        yearSavings += proRatedAdditional;
        cumulativeSavings += proRatedAdditional;

        // Only invest per allocation if we end up with a SURPLUS
        // If still in deficit, the savings just reduce withdrawal (don't double-count)
        if (yearSavings > 0) {
          const totalAllocation = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
          if (totalAllocation > 0) {
            portfolio.taxable.btc += proRatedAdditional * (savingsAllocationBtc / totalAllocation);
            portfolio.taxable.stocks += proRatedAdditional * (savingsAllocationStocks / totalAllocation);
            portfolio.taxable.bonds += proRatedAdditional * (savingsAllocationBonds / totalAllocation);
            portfolio.taxable.cash += proRatedAdditional * (savingsAllocationCash / totalAllocation);
            portfolio.taxable.other += proRatedAdditional * (savingsAllocationOther / totalAllocation);
          } else {
            portfolio.taxable.btc += proRatedAdditional;
          }
          runningTaxableBasis += proRatedAdditional;
        }
      }
      
      addToAccount('taxDeferred', year401k + yearTraditionalIRA + yearEmployerMatch);
      addToAccount('taxFree', yearRoth + yearHSA);

      if (yearSavings < 0) {
        const deficit = Math.abs(yearSavings);
        const taxableBalance = getAccountTotal('taxable');
        const taxDeferredBalance = getAccountTotal('taxDeferred');
        const taxFreeBalance = getAccountTotal('taxFree');
        const effectiveRunningTaxableBasis = Math.min(taxableBalance, runningTaxableBasis);
        const estimatedCurrentGainRatio = taxableBalance > 0 ? Math.max(0, (taxableBalance - effectiveRunningTaxableBasis) / taxableBalance) : 0;

        // First, simulate withdrawal to get accurate gain breakdown from lots
        const prelimTaxableWithdraw = withdrawFromTaxableWithLots(
          Math.min(deficit, taxableBalance), 
          cumulativeBtcPrice, 
          year
        );
        
        const taxEstimate = estimateRetirementWithdrawalTaxes({
          withdrawalNeeded: deficit,
          taxableBalance: prelimTaxableWithdraw.withdrawn,
          taxDeferredBalance,
          taxFreeBalance,
          rothContributions: totalRothContributions,
          rothContributionBasis: runningRothContributionBasis,
          shortTermGain: prelimTaxableWithdraw.shortTermGain,
          longTermGain: prelimTaxableWithdraw.longTermGain,
          qualifiedDividends: yearQualifiedDividends,
          nonQualifiedDividends: yearNonQualifiedDividends,
          filingStatus,
          age: age,
          otherIncome: 0,
          year: year,
          inflationRate: effectiveInflation / 100,
        });
        
        // Update Roth contribution basis after withdrawal
        runningRothContributionBasis = taxEstimate.newRothContributionBasis || runningRothContributionBasis;

        // Calculate Roth earnings portion for state tax (before 59.5, earnings are taxable)
      let rothEarningsForStateTax = 0;
      if (age < PENALTY_FREE_AGE && taxEstimate.fromTaxFree > 0) {
        // IRS ordering: contributions come out first, then earnings
        const rothContributionsUsed = Math.min(taxEstimate.fromTaxFree, runningRothContributionBasis);
        rothEarningsForStateTax = Math.max(0, taxEstimate.fromTaxFree - rothContributionsUsed);
      }
      
      const preRetireStateTax = calculateStateTaxOnRetirement({
          state: stateOfResidence,
          age: age,
          filingStatus: filingStatus,
          totalAGI: (grossAnnualIncome * Math.pow(1 + incomeGrowth / 100, i)) + yearLifeEventTaxableIncome + deficit + rothEarningsForStateTax,
          socialSecurityIncome: 0,
          taxDeferredWithdrawal: (taxEstimate.fromTaxDeferred || 0) + rothEarningsForStateTax,
          taxableWithdrawal: prelimTaxableWithdraw.withdrawn,
          taxableGainPortion: prelimTaxableWithdraw.shortTermGain + prelimTaxableWithdraw.longTermGain,
          pensionIncome: 0,
          year: year,
          inflationRate: effectiveInflation / 100
        });

        // Separate penalties from taxes in pre-retirement deficit
        const preRetireWithdrawalTaxOnly = (taxEstimate.totalTax || 0) - (taxEstimate.totalPenalty || 0);
        federalTaxPaid += preRetireWithdrawalTaxOnly;
        stateTaxPaid += preRetireStateTax;
        taxesPaid += preRetireWithdrawalTaxOnly + preRetireStateTax;
        penaltyPaid = taxEstimate.totalPenalty || 0;
        shortTermGainsTax += (taxEstimate.taxOnShortTermGains || 0);
        longTermGainsTax += (taxEstimate.taxOnLongTermGains || 0);
        
        // Track early withdrawal penalties for spending deficits (before 59.5)
        if (age < PENALTY_FREE_AGE && penaltyPaid > 0) {
          yearEarlyWithdrawalPenalty += penaltyPaid;
          // Track tax on early withdrawals from tax-advantaged accounts
          const taxDeferredTax = (taxEstimate.fromTaxDeferred || 0) * 0.24; // Simplified marginal rate
          const taxFreeTax = taxEstimate.taxFreeEarningsTax || 0;
          yearEarlyWithdrawalTax += taxDeferredTax + taxFreeTax;
        }

        // Use results from the preliminary withdrawal (lots already updated)
        withdrawFromTaxable = prelimTaxableWithdraw.withdrawn;
        runningTaxableBasis = Math.max(0, runningTaxableBasis - prelimTaxableWithdraw.totalCostBasis);
        withdrawFromTaxDeferred = withdrawFromAccount('taxDeferred', taxEstimate.fromTaxDeferred || 0);
        withdrawFromTaxFree = withdrawFromAccount('taxFree', taxEstimate.fromTaxFree || 0);

        // Calculate total actually withdrawn
        const totalActuallyWithdrawn = (withdrawFromTaxable || 0) + (withdrawFromTaxDeferred || 0) + (withdrawFromTaxFree || 0);
        // Include taxes and penalties in the total amount needed from portfolio
        const totalDeficitPlusTaxes = deficit + (taxEstimate.totalTax || 0) + preRetireStateTax + (taxEstimate.totalPenalty || 0);
        let remainingShortfall = totalDeficitPlusTaxes - totalActuallyWithdrawn;
        
        // For pre-retirement deficit, the true net cash flow includes withdrawal taxes
        preRetireNetCashFlow = -totalDeficitPlusTaxes;

        // Force additional withdrawals if shortfall (same as retirement)
        if (remainingShortfall > 0) {
          const taxableRemaining = getAccountTotal('taxable');
          if (taxableRemaining > 0) {
            const forceFromTaxable = Math.min(remainingShortfall, taxableRemaining);
            const forceResult = withdrawFromTaxableWithLots(forceFromTaxable, cumulativeBtcPrice, year);
            withdrawFromTaxable += forceResult.withdrawn;
            runningTaxableBasis = Math.max(0, runningTaxableBasis - forceResult.totalCostBasis);
            remainingShortfall -= forceResult.withdrawn;
          }
          
          const taxDeferredRemaining = getAccountTotal('taxDeferred');
          if (remainingShortfall > 0 && taxDeferredRemaining > 0) {
            const forceFromTaxDeferred = Math.min(remainingShortfall, taxDeferredRemaining);
            withdrawFromAccount('taxDeferred', forceFromTaxDeferred);
            withdrawFromTaxDeferred += forceFromTaxDeferred;
            remainingShortfall -= forceFromTaxDeferred;
          }
          
          const taxFreeRemaining = getAccountTotal('taxFree');
          if (remainingShortfall > 0 && taxFreeRemaining > 0) {
            const forceFromTaxFree = Math.min(remainingShortfall, taxFreeRemaining);
            withdrawFromAccount('taxFree', forceFromTaxFree);
            withdrawFromTaxFree += forceFromTaxFree;
            remainingShortfall -= forceFromTaxFree;
          }
          
          // Emergency: Unlock loan equity (same logic as retirement)
          if (remainingShortfall > 0) {
            const activeLoansWithEquity = [
              ...Object.values(tempRunningDebt).filter(l => l.type === 'btc_collateralized' && !l.paid_off && l.current_balance > 0),
              ...Object.values(tempRunningCollateralizedLoans).filter(l => !l.paid_off && l.current_balance > 0)
            ].map(loan => {
              const loanKey = loan.entity_type === 'CollateralizedLoan' ? `loan_${loan.id}` : loan.id;
              const lockedBtc = encumberedBtc[loanKey] || loan.collateral_btc_amount || 0;
              const collateralValue = lockedBtc * cumulativeBtcPrice;
              const equity = collateralValue - loan.current_balance;
              return { ...loan, loanKey, lockedBtc, collateralValue, equity, ltv: collateralValue > 0 ? (loan.current_balance / collateralValue) * 100 : 100 };
            }).filter(loan => loan.equity > 0).sort((a, b) => a.ltv - b.ltv);

            for (const loan of activeLoansWithEquity) {
              if (remainingShortfall <= 0) break;
              
              const debtToPay = loan.current_balance;
              const btcToSellForDebt = debtToPay / cumulativeBtcPrice;
              const btcReleased = loan.lockedBtc - btcToSellForDebt;
              const equityReleasedGross = btcReleased * cumulativeBtcPrice;
              
              // Use per-loan stored basis for accurate tax calculation
              const loanKey = loan.loanKey;
              const storedBasis = loanCollateralBasis[loanKey] || 0;
              const storedBtc = encumberedBtc[loanKey] || loan.collateral_btc_amount || 0;
              
              const saleProceeds = btcToSellForDebt * cumulativeBtcPrice;
              
              let costBasisForSale = 0;
              
              if (storedBtc > 0 && storedBasis > 0) {
                // Use actual per-loan basis - proportional to amount being sold
                const percentSold = Math.min(1, btcToSellForDebt / storedBtc);
                costBasisForSale = storedBasis * percentSold;
                
                // Reduce stored basis for remaining collateral
                loanCollateralBasis[loanKey] = storedBasis * (1 - percentSold);
              } else {
                // Fallback to 50% basis for loans without stored lot data
                costBasisForSale = saleProceeds * 0.5;
              }
              
              const gainOnSale = Math.max(0, saleProceeds - costBasisForSale);
              
              // Also reduce global encumberedBtcBasis for tracking
              const totalEncumberedBtcAmount = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
              if (totalEncumberedBtcAmount > 0 && encumberedBtcBasis > 0) {
                const basisReduction = encumberedBtcBasis * (btcToSellForDebt / totalEncumberedBtcAmount);
                encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisReduction);
              }
              
              // Include the capital gain in the income base for determining the LTCG rate
              // The gain "stacks" on top of other income to determine the marginal rate
              const taxableIncomeBase = withdrawFromTaxable + withdrawFromTaxDeferred;
              const incomeBaseForLTCGRate = taxableIncomeBase + gainOnSale;
              const taxRate = getLTCGRate(incomeBaseForLTCGRate, filingStatus, year);
              
              const taxOnSale = gainOnSale * taxRate;
              
              const netEquityAvailable = equityReleasedGross - taxOnSale;
              const appliedToDeficit = Math.min(netEquityAvailable, remainingShortfall);
              
              if (DEBUG) {
                console.log('netEquityAvailable:', netEquityAvailable);
                console.log('appliedToDeficit:', appliedToDeficit);
                console.log('remainingShortfall before:', remainingShortfall);
              }
              
              remainingShortfall -= appliedToDeficit;
              fromLoanPayoff += appliedToDeficit;
              
              if (tempRunningDebt[loan.id]) {
                tempRunningDebt[loan.id].current_balance = 0;
                tempRunningDebt[loan.id].paid_off = true;
              }
              if (tempRunningCollateralizedLoans[loan.id]) {
                tempRunningCollateralizedLoans[loan.id].current_balance = 0;
                tempRunningCollateralizedLoans[loan.id].paid_off = true;
              }
              
              // Return released BTC to taxable with restored basis
              // But subtract the tax that needs to be paid on the sale
              const releasedBtcValue = btcReleased * cumulativeBtcPrice;
              const netValueAfterTax = Math.max(0, releasedBtcValue - taxOnSale);
              
              // Safety check
              if (isNaN(releasedBtcValue) || isNaN(netValueAfterTax)) {
                console.error('NaN detected in equity calculation:', {
                  btcReleased,
                  cumulativeBtcPrice,
                  releasedBtcValue,
                  taxOnSale,
                  netValueAfterTax
                });
              }
              
              portfolio.taxable.btc += netValueAfterTax;
              
              if (DEBUG) {
                console.log('🔄 EQUITY RETURN for ' + loan.name + ':');
                console.log('   releasedBtcValue (gross):', releasedBtcValue);
                console.log('   taxOnSale:', taxOnSale);
                console.log('   netValueAfterTax:', netValueAfterTax);
                console.log('   portfolio.taxable.btc after:', portfolio.taxable.btc);
              }
              
              // Restore proportional basis for released collateral to runningTaxableBasis
              // Basis restored should also reflect the net after-tax value
              if (storedBtc > 0 && storedBasis > 0) {
                const releasedBasisPortion = storedBasis * (btcReleased / storedBtc);
                runningTaxableBasis += releasedBasisPortion;
              }
              
              encumberedBtc[loanKey] = 0;
              delete loanCollateralBasis[loanKey];
              delete loanCollateralLots[loanKey];
              taxesPaid += taxOnSale;
              
              yearLoanPayoffs.push({ 
                loanName: loan.name || loan.lender || 'BTC Loan', 
                debtPaid: debtToPay, 
                btcSold: btcToSellForDebt, 
                btcReleased: btcReleased, 
                equityReleased: releasedBtcValue,
                taxOnSale: taxOnSale, 
                netEquity: netValueAfterTax,
                appliedToDeficit: appliedToDeficit, 
                costBasis: costBasisForSale, 
                capitalGain: gainOnSale 
              });
              

            }
          }
          
          // Last resort: Real Estate
          if (remainingShortfall > 0 && portfolio.realEstate > 0) {
            const preWithdrawalRealEstate = portfolio.realEstate;
            realEstateSaleProceeds = portfolio.realEstate;
            portfolio.realEstate = 0;
            withdrawFromRealEstate = Math.min(remainingShortfall, realEstateSaleProceeds);
            const excessProceeds = realEstateSaleProceeds - withdrawFromRealEstate;
            if (excessProceeds > 0) portfolio.taxable.cash += excessProceeds;
            remainingShortfall -= withdrawFromRealEstate;
            
            // Reduce holdingValues for real estate (sells entirely)
            reduceHoldingValuesForWithdrawal('other', 'real_estate', preWithdrawalRealEstate, preWithdrawalRealEstate);
          }
          
          // Only mark depleted if significant shortfall remains
          if (remainingShortfall > deficit * 0.05) {
            ranOutOfMoneyThisYear = true;
            if (firstDepletionAge === null) {
              firstDepletionAge = age;
            }
          }
        }

        if (getTotalPortfolio() <= 0) {
          ranOutOfMoneyThisYear = true;
          if (firstDepletionAge === null) {
            firstDepletionAge = age;
          }
        }
      } else if (yearSavings > 0) {
        // Surplus - set preRetireNetCashFlow to positive yearSavings
        preRetireNetCashFlow = yearSavings;
        
        // Determine how much to actually invest based on investment mode
        let investableAmount = yearSavings;
        let cashRemains = 0;

        if (investmentMode === 'custom' && monthlyInvestmentAmount > 0) {
          const customAnnualInvestment = monthlyInvestmentAmount * 12;
          // Pro-rate for first year if needed
          const effectiveCustomInvestment = i === 0 ? customAnnualInvestment * currentYearProRataFactor : customAnnualInvestment;
          investableAmount = Math.min(yearSavings, effectiveCustomInvestment);
          cashRemains = yearSavings - investableAmount;
        }

        if (DEBUG) {
          const totalAlloc = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
          console.log(`Year ${i} (Age ${age}) - Investment Mode Debug:`);
          console.log(`  investmentMode: ${investmentMode}`);
          console.log(`  monthlyInvestmentAmount: ${monthlyInvestmentAmount}`);
          console.log(`  yearSavings (surplus): $${Math.round(yearSavings).toLocaleString()}`);
          console.log(`  investableAmount: $${Math.round(investableAmount).toLocaleString()}`);
          console.log(`  cashRemains: $${Math.round(cashRemains).toLocaleString()}`);
          console.log(`  BTC allocation: ${savingsAllocationBtc}%`);
          console.log(`  Amount to BTC: $${Math.round(totalAlloc > 0 ? investableAmount * (savingsAllocationBtc / totalAlloc) : 0).toLocaleString()}`);
        }
        
        // Invest the determined amount according to allocation
        if (investableAmount > 0) {
          const totalAllocation = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
          if (totalAllocation > 0) {
            // Calculate dollar amounts for each asset class
            const btcInvestment = investableAmount * (savingsAllocationBtc / totalAllocation);
            const stocksInvestment = investableAmount * (savingsAllocationStocks / totalAllocation);
            const bondsInvestment = investableAmount * (savingsAllocationBonds / totalAllocation);
            const cashInvestment = investableAmount * (savingsAllocationCash / totalAllocation);
            const otherInvestment = investableAmount * (savingsAllocationOther / totalAllocation);
            
            // Add to portfolio dollar values
            portfolio.taxable.btc += btcInvestment;
            portfolio.taxable.stocks += stocksInvestment;
            portfolio.taxable.bonds += bondsInvestment;
            portfolio.taxable.cash += cashInvestment;
            portfolio.taxable.other += otherInvestment;
            
            // Create tax lot for BTC purchase (if any BTC was purchased)
            if (btcInvestment > 0 && cumulativeBtcPrice > 0) {
              const btcQuantityPurchased = btcInvestment / cumulativeBtcPrice;
              
              // Add to running tax lots for proper cost basis tracking during withdrawals
              runningTaxLots.push({
                id: `investment-year-${i}`,
                lot_id: `investment-year-${i}`,
                asset_ticker: 'BTC',
                quantity: btcQuantityPurchased,
                remaining_quantity: btcQuantityPurchased,
                price_per_unit: cumulativeBtcPrice,
                cost_basis: btcInvestment,
                date: `${year}-01-01`,
                account_type: 'taxable',
                source: 'investment',
              });
              
              if (DEBUG) {
                console.log(`  Year ${i}: Created investment tax lot - ${btcQuantityPurchased.toFixed(6)} BTC @ $${cumulativeBtcPrice.toLocaleString()}`);
                console.log(`  Total runningTaxLots count: ${runningTaxLots.length}`);
                const totalBtcInLots = runningTaxLots.reduce((sum, lot) => sum + (lot.remaining_quantity || 0), 0);
                console.log(`  Total BTC quantity in all lots: ${totalBtcInLots.toFixed(6)}`);
              }
            }
          } else {
            portfolio.taxable.cash += investableAmount;
          }
          runningTaxableBasis += investableAmount;
        }

        // Add any remaining surplus to cash (not invested)
        if (cashRemains > 0) {
          portfolio.taxable.cash += cashRemains;
        }
      } else {
        // yearSavings === 0, no deficit or surplus
        preRetireNetCashFlow = 0;
      }

      // DEBUG: Log AFTER pre-retirement processing
      if (i <= 1 && DEBUG) {
        console.log('POST PRE-RETIREMENT PROCESSING:');
        console.log('yearSpending:', Math.round(yearSpending));
        console.log('yearSavings:', Math.round(yearSavings));
        console.log('withdrawFromTaxable:', Math.round(withdrawFromTaxable));
        console.log('withdrawFromTaxDeferred:', Math.round(withdrawFromTaxDeferred));
        console.log('withdrawFromTaxFree:', Math.round(withdrawFromTaxFree));
        console.log('taxesPaid:', Math.round(taxesPaid));
        console.log('Portfolio AFTER year processing:', JSON.stringify({
          taxableBtc: Math.round(portfolio.taxable?.btc || 0),
          taxableStocks: Math.round(portfolio.taxable?.stocks || 0),
          taxableCash: Math.round(portfolio.taxable?.cash || 0),
          taxableTotal: Math.round(getAccountTotal('taxable')),
          taxDeferredTotal: Math.round(getAccountTotal('taxDeferred')),
          taxFreeTotal: Math.round(getAccountTotal('taxFree')),
          realEstate: Math.round(portfolio.realEstate || 0),
          grandTotal: Math.round(getPortfolioTotal())
        }));
      }
    } else {
      // RETIREMENT
      const btcAtYearStart = portfolio.taxable.btc;
      const btcQtyAtYearStart = btcAtYearStart / cumulativeBtcPrice;
      console.log(`BTC TRACKING Year ${year} (Age ${age}) START: portfolio.taxable.btc = $${btcAtYearStart.toFixed(2)}, qty = ${btcQtyAtYearStart.toFixed(6)} BTC`);
      
      const nominalSpendingAtRetirement = retirementAnnualSpending * Math.pow(1 + effectiveInflation / 100, Math.max(0, retirementAge - currentAge));
      // Calculate base spending WITHOUT life event expenses (for tooltip display)
      const baseSpendingOnly = nominalSpendingAtRetirement * Math.pow(1 + effectiveInflation / 100, age - retirementAge);
      // Total withdrawal need includes life event expenses
      const baseDesiredWithdrawal = baseSpendingOnly + yearLifeEventExpense;
      desiredWithdrawal = i === 0 ? baseDesiredWithdrawal * currentYearProRataFactor : baseDesiredWithdrawal;
      // yearSpending should be just the base spending (for tooltip), NOT including life event expenses
      yearSpending = i === 0 ? baseSpendingOnly * currentYearProRataFactor : baseSpendingOnly;

      // RMD calculation
      const taxDeferredBalanceForRMD = getAccountTotal('taxDeferred');
      if (age >= rmdStartAge && taxDeferredBalanceForRMD > 0) {
        const rmdFactor = getRMDFactor(age);
        if (rmdFactor > 0) rmdAmount = taxDeferredBalanceForRMD / rmdFactor;
      }
      
      if (rmdAmount > 0) {
        rmdWithdrawn = Math.min(rmdAmount, getAccountTotal('taxDeferred'));
        withdrawFromAccount('taxDeferred', rmdWithdrawn);
        withdrawFromTaxDeferred = rmdWithdrawn;
      }

      // Social Security is now calculated earlier (before retirement/pre-retirement split)
      // In retirement, dividend income adds to available income to fund spending
      // Use estimatedDividendIncome here (calculated before withdrawals) to properly reduce withdrawal needs
      // Include life event income (inheritance, windfall, etc.) AND loan proceeds - already invested but also reduces withdrawal need
      const totalRetirementIncome = otherRetirementIncome + socialSecurityIncome + estimatedDividendIncome + yearLifeEventIncome + yearLoanProceeds;
      const taxableSocialSecurity = calculateTaxableSocialSecurity(socialSecurityIncome, otherRetirementIncome + desiredWithdrawal, filingStatus);
      const totalOtherIncomeForTax = otherRetirementIncome + taxableSocialSecurity + rmdWithdrawn + yearLifeEventTaxableIncome;
      


      // Calculate taxable income for retirement year (ordinary income portion)
      yearTaxableIncome = Math.max(0, totalOtherIncomeForTax - currentStandardDeduction);
      const federalTaxOnOtherIncome = calculateProgressiveIncomeTax(yearTaxableIncome, filingStatus, year);
      
      const netSpendingNeed = Math.max(0, desiredWithdrawal - totalRetirementIncome - rmdWithdrawn);
      
      excessRmd = Math.max(0, rmdWithdrawn - Math.max(0, desiredWithdrawal - totalRetirementIncome));
      if (excessRmd > 0) {
        portfolio.taxable.cash += excessRmd;
        runningTaxableBasis += excessRmd;
      }
      
      const totalWithdrawalForTaxCalculation = netSpendingNeed + yearGoalWithdrawal;
      const totalAvailableBalance = getTotalLiquid();
      const cappedWithdrawal = Math.min(totalWithdrawalForTaxCalculation, totalAvailableBalance);

      const taxableBalance = getAccountTotal('taxable');
      const taxDeferredBalance = getAccountTotal('taxDeferred');
      const taxFreeBalance = getAccountTotal('taxFree');
      const effectiveRunningTaxableBasis = Math.min(taxableBalance, runningTaxableBasis);
      const estimatedCurrentGainRatio = taxableBalance > 0 ? Math.max(0, (taxableBalance - effectiveRunningTaxableBasis) / taxableBalance) : 0;

      // SIMULATE taxable withdrawal for tax estimation (does NOT modify portfolio)
      const prelimRetirementTaxable = simulateWithdrawalFromTaxable(
        Math.min(cappedWithdrawal, taxableBalance)
      );

      const taxEstimate = estimateRetirementWithdrawalTaxes({
        withdrawalNeeded: cappedWithdrawal,
        taxableBalance: prelimRetirementTaxable.withdrawn,
        taxDeferredBalance,
        taxFreeBalance,
        rothContributions: totalRothContributions,
        rothContributionBasis: runningRothContributionBasis,
        shortTermGain: prelimRetirementTaxable.shortTermGain,
        longTermGain: prelimRetirementTaxable.longTermGain,
        qualifiedDividends: yearQualifiedDividends,
        nonQualifiedDividends: yearNonQualifiedDividends,
        filingStatus,
        age: age,
        otherIncome: totalOtherIncomeForTax,
        year: year,
        inflationRate: effectiveInflation / 100,
      });
      
      // Update Roth contribution basis after withdrawal
      runningRothContributionBasis = taxEstimate.newRothContributionBasis || runningRothContributionBasis;

      // Calculate Roth earnings portion for state tax (before 59.5, earnings are taxable)
      let retirementRothEarningsForStateTax = 0;
      if (age < PENALTY_FREE_AGE && taxEstimate.fromTaxFree > 0) {
        // IRS ordering: contributions come out first, then earnings
        const rothContributionsUsed = Math.min(taxEstimate.fromTaxFree, runningRothContributionBasis);
        retirementRothEarningsForStateTax = Math.max(0, taxEstimate.fromTaxFree - rothContributionsUsed);
      }
      
      const stateTax = calculateStateTaxOnRetirement({
        state: stateOfResidence,
        age: age,
        filingStatus: filingStatus,
        totalAGI: totalOtherIncomeForTax + cappedWithdrawal + retirementRothEarningsForStateTax,
        socialSecurityIncome: socialSecurityIncome,
        taxDeferredWithdrawal: (taxEstimate.fromTaxDeferred || 0) + retirementRothEarningsForStateTax, // Roth earnings taxed as ordinary income
        taxableWithdrawal: prelimRetirementTaxable.withdrawn,
        taxableGainPortion: prelimRetirementTaxable.shortTermGain + prelimRetirementTaxable.longTermGain,
        pensionIncome: otherRetirementIncome,
        year: year,
        inflationRate: effectiveInflation / 100
      });

      // Separate penalties from taxes (taxEstimate.totalTax includes penalties)
      const withdrawalTaxOnly = (taxEstimate.totalTax || 0) - (taxEstimate.totalPenalty || 0);
      federalTaxPaid = federalTaxOnOtherIncome + withdrawalTaxOnly;
      stateTaxPaid = stateTax;
      taxesPaid = federalTaxOnOtherIncome + withdrawalTaxOnly + stateTax;
      penaltyPaid = taxEstimate.totalPenalty || 0;
      shortTermGainsTax += (taxEstimate.taxOnShortTermGains || 0);
      longTermGainsTax += (taxEstimate.taxOnLongTermGains || 0);
      
      // Track early withdrawal penalties for retirement spending (before 59.5)
      if (age < PENALTY_FREE_AGE && penaltyPaid > 0) {
        yearEarlyWithdrawalPenalty += penaltyPaid;
        // Track tax on early withdrawals from tax-advantaged accounts
        const taxDeferredTax = (taxEstimate.fromTaxDeferred || 0) * 0.24; // Simplified marginal rate
        const taxFreeTax = taxEstimate.taxFreeEarningsTax || 0;
        yearEarlyWithdrawalTax += taxDeferredTax + taxFreeTax;
      }

      // Calculate retirement net cash flow: income - spending - goals - taxes
      // Positive = surplus, Negative = deficit
      
      // DEBUG: Trace retirement cash flow calculation
      console.log(`RETIREMENT CASHFLOW DEBUG Year ${year} (Age ${age}):`, {
        totalRetirementIncome,
        socialSecurityIncome,
        otherRetirementIncome,
        estimatedDividendIncome,
        yearLifeEventIncome,
        yearLoanProceeds,
        rmdWithdrawn,
        desiredWithdrawal,
        taxesPaid,
        penaltyPaid,
        yearGoalWithdrawal,
        incomeTotal: totalRetirementIncome + rmdWithdrawn,
        expenseTotal: desiredWithdrawal + taxesPaid + penaltyPaid + yearGoalWithdrawal
      });
      
      retirementNetCashFlow = (totalRetirementIncome + rmdWithdrawn) - (desiredWithdrawal + taxesPaid + penaltyPaid + yearGoalWithdrawal);
      
      console.log(`RETIREMENT CASHFLOW DEBUG Year ${year} RESULT:`, {
        retirementNetCashFlow,
        isSurplus: retirementNetCashFlow > 0,
        isDeficit: retirementNetCashFlow < 0
      });

      // Handle retirement income surplus - reinvest excess into taxable account per savings allocation
      // This allows income surplus to go into growth assets rather than just cash
      if (retirementNetCashFlow > 0) {
        const totalAllocation = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
        
        console.log(`⚠️ SURPLUS INVESTMENT Year ${year} (Age ${age}):`, {
          surplus: retirementNetCashFlow,
          totalAllocation,
          savingsAllocationBtc,
          btcInvestAmount: totalAllocation > 0 ? retirementNetCashFlow * (savingsAllocationBtc / totalAllocation) : 0,
          btcPriceBefore: portfolio.taxable.btc,
          btcQuantityBefore: portfolio.taxable.btc / cumulativeBtcPrice
        });
        
        if (totalAllocation > 0) {
          const btcInvest = retirementNetCashFlow * (savingsAllocationBtc / totalAllocation);
          const stocksInvest = retirementNetCashFlow * (savingsAllocationStocks / totalAllocation);
          const bondsInvest = retirementNetCashFlow * (savingsAllocationBonds / totalAllocation);
          const cashInvest = retirementNetCashFlow * (savingsAllocationCash / totalAllocation);
          const otherInvest = retirementNetCashFlow * (savingsAllocationOther / totalAllocation);
          
          portfolio.taxable.btc += btcInvest;
          portfolio.taxable.stocks += stocksInvest;
          portfolio.taxable.bonds += bondsInvest;
          portfolio.taxable.cash += cashInvest;
          portfolio.taxable.other += otherInvest;
          
          // Create tax lot for BTC surplus investment
          if (btcInvest > 0 && cumulativeBtcPrice > 0) {
            const btcQuantityPurchased = btcInvest / cumulativeBtcPrice;
            runningTaxLots.push({
              id: `retirement-surplus-year-${i}`,
              lot_id: `retirement-surplus-year-${i}`,
              asset_ticker: 'BTC',
              quantity: btcQuantityPurchased,
              remaining_quantity: btcQuantityPurchased,
              price_per_unit: cumulativeBtcPrice,
              cost_basis: btcInvest,
              date: `${year}-01-01`,
              account_type: 'taxable',
              source: 'retirement_surplus',
            });
            if (DEBUG) console.log(`💰 Retirement surplus: Created tax lot for ${btcQuantityPurchased.toFixed(6)} BTC @ $${cumulativeBtcPrice.toLocaleString()}`);
          }
        } else {
          portfolio.taxable.cash += retirementNetCashFlow;
        }
        runningTaxableBasis += retirementNetCashFlow;
        
        if (DEBUG) console.log(`💰 Retirement surplus: $${retirementNetCashFlow.toLocaleString()} invested per savings allocation`);
      }

      // Only withdraw from portfolio if there's an actual deficit (not for taxes that income covers)
      const totalNeededFromAccounts = Math.max(0, -retirementNetCashFlow);
      
      // Only process withdrawals if there's actually a deficit
      if (totalNeededFromAccounts > 0) {
        // NOW execute the REAL withdrawal since we confirmed there's a deficit
        const actualTaxableWithdrawal = withdrawFromTaxableWithLots(
          Math.min(totalNeededFromAccounts, taxableBalance),
          cumulativeBtcPrice,
          year
        );
        withdrawFromTaxable = actualTaxableWithdrawal.withdrawn;
        runningTaxableBasis = Math.max(0, runningTaxableBasis - actualTaxableWithdrawal.totalCostBasis);
        
        console.log(`BTC TRACKING Year ${year} AFTER WITHDRAWAL: portfolio.taxable.btc = $${portfolio.taxable.btc.toFixed(2)}, withdrawn = $${withdrawFromTaxable.toFixed(2)}, change from start = $${(portfolio.taxable.btc - btcAtYearStart).toFixed(2)}`);
        
        const requestedFromTaxDeferred = taxEstimate.fromTaxDeferred || 0;
        const requestedFromTaxFree = taxEstimate.fromTaxFree || 0;

        const actualFromTaxDeferred = withdrawFromAccount('taxDeferred', requestedFromTaxDeferred);
        withdrawFromTaxFree = withdrawFromAccount('taxFree', requestedFromTaxFree);
        withdrawFromTaxDeferred = rmdWithdrawn + actualFromTaxDeferred;

        let totalWithdrawnFromAccounts = withdrawFromTaxable + withdrawFromTaxDeferred + withdrawFromTaxFree;
        
        const fullWithdrawalNeed = totalNeededFromAccounts;
        let remainingShortfall = fullWithdrawalNeed - totalWithdrawnFromAccounts;
        
        // Force additional withdrawals if shortfall
        if (remainingShortfall > 0) {
          const taxableRemaining = getAccountTotal('taxable');
          if (taxableRemaining > 0) {
            const forceFromTaxable = Math.min(remainingShortfall, taxableRemaining);
            const forceRetirementResult = withdrawFromTaxableWithLots(forceFromTaxable, cumulativeBtcPrice, year);
            withdrawFromTaxable += forceRetirementResult.withdrawn;
            runningTaxableBasis = Math.max(0, runningTaxableBasis - forceRetirementResult.totalCostBasis);
            totalWithdrawnFromAccounts += forceRetirementResult.withdrawn;
            remainingShortfall -= forceRetirementResult.withdrawn;
          }
          
          const taxDeferredRemaining = getAccountTotal('taxDeferred');
          if (remainingShortfall > 0 && taxDeferredRemaining > 0) {
            const forceFromTaxDeferred = Math.min(remainingShortfall, taxDeferredRemaining);
            withdrawFromAccount('taxDeferred', forceFromTaxDeferred);
            withdrawFromTaxDeferred += forceFromTaxDeferred;
            totalWithdrawnFromAccounts += forceFromTaxDeferred;
            remainingShortfall -= forceFromTaxDeferred;
          }
          
          const taxFreeRemaining = getAccountTotal('taxFree');
          if (remainingShortfall > 0 && taxFreeRemaining > 0) {
            const forceFromTaxFree = Math.min(remainingShortfall, taxFreeRemaining);
            withdrawFromAccount('taxFree', forceFromTaxFree);
            withdrawFromTaxFree += forceFromTaxFree;
            totalWithdrawnFromAccounts += forceFromTaxFree;
            remainingShortfall -= forceFromTaxFree;
          }
          
          // Emergency: Unlock loan equity
          if (remainingShortfall > 0) {
            const activeLoansWithEquity = [
              ...Object.values(tempRunningDebt).filter(l => l.type === 'btc_collateralized' && !l.paid_off && l.current_balance > 0),
              ...Object.values(tempRunningCollateralizedLoans).filter(l => !l.paid_off && l.current_balance > 0)
            ].map(loan => {
              const loanKey = loan.entity_type === 'CollateralizedLoan' ? `loan_${loan.id}` : loan.id;
              const lockedBtc = encumberedBtc[loanKey] || loan.collateral_btc_amount || 0;
              const collateralValue = lockedBtc * cumulativeBtcPrice;
              const equity = collateralValue - loan.current_balance;
              return { ...loan, loanKey, lockedBtc, collateralValue, equity, ltv: collateralValue > 0 ? (loan.current_balance / collateralValue) * 100 : 100 };
            }).filter(loan => loan.equity > 0).sort((a, b) => a.ltv - b.ltv);

            for (const loan of activeLoansWithEquity) {
              if (remainingShortfall <= 0) break;
              
              const debtToPay = loan.current_balance;
              const btcToSellForDebt = debtToPay / cumulativeBtcPrice;
              const btcReleased = loan.lockedBtc - btcToSellForDebt;
              const equityReleasedGross = btcReleased * cumulativeBtcPrice;
              
              // Use per-loan stored basis for accurate tax calculation
              const loanKey = loan.loanKey;
              const storedBasis = loanCollateralBasis[loanKey] || 0;
              const storedBtc = encumberedBtc[loanKey] || loan.collateral_btc_amount || 0;
              
              const saleProceeds = btcToSellForDebt * cumulativeBtcPrice;
              
              let costBasisForSale = 0;
              
              if (storedBtc > 0 && storedBasis > 0) {
                // Use actual per-loan basis - proportional to amount being sold
                const percentSold = Math.min(1, btcToSellForDebt / storedBtc);
                costBasisForSale = storedBasis * percentSold;
                
                // Reduce stored basis for remaining collateral
                loanCollateralBasis[loanKey] = storedBasis * (1 - percentSold);
              } else {
                // Fallback to 50% basis for loans without stored lot data
                costBasisForSale = saleProceeds * 0.5;
              }
              
              const gainOnSale = Math.max(0, saleProceeds - costBasisForSale);
              
              // Also reduce global encumberedBtcBasis for tracking
              const totalEncumberedBtcAmount = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
              if (totalEncumberedBtcAmount > 0 && encumberedBtcBasis > 0) {
                const basisReduction = encumberedBtcBasis * (btcToSellForDebt / totalEncumberedBtcAmount);
                encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisReduction);
              }
              
              // Include the capital gain in the income base for determining the LTCG rate
              // The gain "stacks" on top of other income to determine the marginal rate
              const taxableIncomeBase = (totalOtherIncomeForTax || 0) + withdrawFromTaxable + withdrawFromTaxDeferred;
              const incomeBaseForLTCGRate = taxableIncomeBase + gainOnSale;
              const taxRate = getLTCGRate(incomeBaseForLTCGRate, filingStatus, year);
              
              const taxOnSale = gainOnSale * taxRate;
              
              const netEquityAvailable = equityReleasedGross - taxOnSale;
              const appliedToDeficit = Math.min(netEquityAvailable, remainingShortfall);
              
              if (DEBUG) {
                console.log('netEquityAvailable:', netEquityAvailable);
                console.log('appliedToDeficit:', appliedToDeficit);
                console.log('remainingShortfall before:', remainingShortfall);
              }
              
              remainingShortfall -= appliedToDeficit;
              fromLoanPayoff += appliedToDeficit;
              totalWithdrawnFromAccounts += appliedToDeficit;
              
              if (tempRunningDebt[loan.id]) {
                tempRunningDebt[loan.id].current_balance = 0;
                tempRunningDebt[loan.id].paid_off = true;
              }
              if (tempRunningCollateralizedLoans[loan.id]) {
                tempRunningCollateralizedLoans[loan.id].current_balance = 0;
                tempRunningCollateralizedLoans[loan.id].paid_off = true;
              }
              
              // Return released BTC to taxable with restored basis
              // But subtract the tax that needs to be paid on the sale
              const releasedBtcValue = btcReleased * cumulativeBtcPrice;
              const netValueAfterTax = Math.max(0, releasedBtcValue - taxOnSale);
              
              // Safety check
              if (isNaN(releasedBtcValue) || isNaN(netValueAfterTax)) {
                console.error('NaN detected in equity calculation:', {
                  btcReleased,
                  cumulativeBtcPrice,
                  releasedBtcValue,
                  taxOnSale,
                  netValueAfterTax
                });
              }
              
              portfolio.taxable.btc += netValueAfterTax;
              
              if (DEBUG) {
                console.log('🔄 EQUITY RETURN for ' + loan.name + ':');
                console.log('   releasedBtcValue (gross):', releasedBtcValue);
                console.log('   taxOnSale:', taxOnSale);
                console.log('   netValueAfterTax:', netValueAfterTax);
                console.log('   portfolio.taxable.btc after:', portfolio.taxable.btc);
              }
              
              // Restore proportional basis for released collateral to runningTaxableBasis
              // Basis restored should also reflect the net after-tax value
              if (storedBtc > 0 && storedBasis > 0) {
                const releasedBasisPortion = storedBasis * (btcReleased / storedBtc);
                runningTaxableBasis += releasedBasisPortion;
              }
              
              encumberedBtc[loanKey] = 0;
              delete loanCollateralBasis[loanKey];
              delete loanCollateralLots[loanKey];
              taxesPaid += taxOnSale;
              
              yearLoanPayoffs.push({ 
                loanName: loan.name || loan.lender || 'BTC Loan', 
                debtPaid: debtToPay, 
                btcSold: btcToSellForDebt, 
                btcReleased: btcReleased, 
                equityReleased: releasedBtcValue,
                taxOnSale: taxOnSale, 
                netEquity: netValueAfterTax,
                appliedToDeficit: appliedToDeficit, 
                costBasis: costBasisForSale, 
                capitalGain: gainOnSale 
              });
              

            }
          }
          
          // Last resort: Real Estate
          if (remainingShortfall > 0 && portfolio.realEstate > 0) {
            const preWithdrawalRealEstateRetirement = portfolio.realEstate;
            realEstateSaleProceeds = portfolio.realEstate;
            portfolio.realEstate = 0;
            withdrawFromRealEstate = Math.min(remainingShortfall, realEstateSaleProceeds);
            const excessProceeds = realEstateSaleProceeds - withdrawFromRealEstate;
            if (excessProceeds > 0) portfolio.taxable.cash += excessProceeds;
            remainingShortfall -= withdrawFromRealEstate;
            
            // Reduce holdingValues for real estate (sells entirely)
            reduceHoldingValuesForWithdrawal('other', 'real_estate', preWithdrawalRealEstateRetirement, preWithdrawalRealEstateRetirement);
          }
          
          if (remainingShortfall > desiredWithdrawal * 0.05) ranOutOfMoneyThisYear = true;
        }
      }

      if (getTotalPortfolio() <= 0) ranOutOfMoneyThisYear = true;
      
      console.log(`BTC TRACKING Year ${year} END OF RETIREMENT SECTION: portfolio.taxable.btc = $${portfolio.taxable.btc.toFixed(2)}, NET CHANGE = $${(portfolio.taxable.btc - btcAtYearStart).toFixed(2)}, qty change = ${((portfolio.taxable.btc - btcAtYearStart) / cumulativeBtcPrice).toFixed(6)} BTC`);

      // DEBUG: Log AFTER retirement processing
      if (i <= 1 && DEBUG) {
        console.log('POST RETIREMENT PROCESSING:');
        console.log('desiredWithdrawal:', Math.round(desiredWithdrawal));
        console.log('yearSpending:', Math.round(yearSpending));
        console.log('withdrawFromTaxable:', Math.round(withdrawFromTaxable));
        console.log('withdrawFromTaxDeferred:', Math.round(withdrawFromTaxDeferred));
        console.log('withdrawFromTaxFree:', Math.round(withdrawFromTaxFree));
        console.log('taxesPaid:', Math.round(taxesPaid));
        console.log('retirementNetCashFlow:', Math.round(retirementNetCashFlow));
        console.log('Portfolio AFTER year processing:', JSON.stringify({
          taxableBtc: Math.round(portfolio.taxable?.btc || 0),
          taxableStocks: Math.round(portfolio.taxable?.stocks || 0),
          taxableCash: Math.round(portfolio.taxable?.cash || 0),
          taxableTotal: Math.round(getAccountTotal('taxable')),
          taxDeferredTotal: Math.round(getAccountTotal('taxDeferred')),
          taxFreeTotal: Math.round(getAccountTotal('taxFree')),
          realEstate: Math.round(portfolio.realEstate || 0),
          grandTotal: Math.round(getPortfolioTotal())
        }));
      }
    }

    // Calculate dividend income using Average Balance Method (AFTER all withdrawals)
    // Dividends = (Beginning Value + Ending Value) / 2 × Yield
    // This approximates receiving dividends throughout the year
    // For year 0, use currentValue as both beginning and ending (no growth yet)
    holdingValues.forEach((hv, index) => {
      if (hv.dividendYield > 0 && (hv.taxTreatment === 'taxable' || hv.taxTreatment === 'real_estate')) {
        const beginningValue = i > 0 ? (beginningYearValues[index]?.beginningValue || 0) : hv.currentValue;
        const endingValue = hv.currentValue; // Now this is the TRUE end-of-year value after withdrawals
        const averageValue = (beginningValue + endingValue) / 2;
        
        if (averageValue > 0) {
          const annualDividend = averageValue * (hv.dividendYield / 100);
          // Real estate income (rental/REITs) is typically non-qualified (taxed as ordinary income)
          const isQualified = hv.taxTreatment === 'real_estate' ? false : hv.dividendQualified;
          if (isQualified) {
            yearQualifiedDividends += annualDividend;
          } else {
            yearNonQualifiedDividends += annualDividend;
          }
        }
        }
        });

        // Calculate dividend income from executed asset reallocations
        executedReallocations.forEach((realloc, index) => {
        if (realloc.buy_dividend_yield > 0 && realloc.currentValue > 0) {
        const beginningValue = i > 0 ? (beginningReallocValues[index]?.beginningValue || 0) : realloc.currentValue;
        const endingValue = realloc.currentValue;
        const averageValue = (beginningValue + endingValue) / 2;

        if (averageValue > 0) {
          const annualDividend = averageValue * (realloc.buy_dividend_yield / 100);
          if (realloc.buy_dividend_qualified !== false) {
            yearQualifiedDividends += annualDividend;
          } else {
            yearNonQualifiedDividends += annualDividend;
          }
        }
        }
        });

        totalDividendIncome = yearQualifiedDividends + yearNonQualifiedDividends;

    // Debug: Log BTC lot tracking at end of year (disabled - only runs when DEBUG is true)
    if (DEBUG && i <= 2) {
      const totalBtcInLots = runningTaxLots.reduce((sum, lot) => sum + (lot.remaining_quantity || 0), 0);
      const totalBtcValue = portfolio.taxable.btc + portfolio.taxDeferred.btc + portfolio.taxFree.btc;
      console.log(`  End of Year ${i}: portfolio.taxable.btc = $${Math.round(portfolio.taxable.btc).toLocaleString()}, BTC in lots = ${totalBtcInLots.toFixed(6)}, liquidBtc calc = ${(totalBtcValue / cumulativeBtcPrice).toFixed(6)}`);
    }

        // Calculate totals
    const currentTotalEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
    const encumberedBtcValueThisYear = currentTotalEncumberedBtc * cumulativeBtcPrice;
    
    // DEBUG: Log final encumberedBtc state for yearByYear output
    console.log(`YEAR ${year} END - encumberedBtc state:`, JSON.stringify(encumberedBtc));
    console.log(`YEAR ${year} END - totalEncumberedBtc: ${currentTotalEncumberedBtc}, value: $${Math.round(encumberedBtcValueThisYear)}, btcPrice: $${Math.round(cumulativeBtcPrice)}`);
    
    // End-of-year dust cleanup for all accounts to prevent compounding of near-zero balances
    const DUST_THRESHOLD_EOY = 10; // Increased threshold to catch more edge cases
    ['taxable', 'taxDeferred', 'taxFree'].forEach(accountKey => {
      const acct = portfolio[accountKey];
      if (acct.btc > 0 && acct.btc < DUST_THRESHOLD_EOY) acct.btc = 0;
      if (acct.stocks > 0 && acct.stocks < DUST_THRESHOLD_EOY) acct.stocks = 0;
      if (acct.bonds > 0 && acct.bonds < DUST_THRESHOLD_EOY) acct.bonds = 0;
      if (acct.cash > 0 && acct.cash < DUST_THRESHOLD_EOY) acct.cash = 0;
      if (acct.other > 0 && acct.other < DUST_THRESHOLD_EOY) acct.other = 0;
    });
    if (portfolio.realEstate > 0 && portfolio.realEstate < DUST_THRESHOLD_EOY) portfolio.realEstate = 0;
    
    const liquidAssetsAfterYear = getTotalLiquid() + portfolio.realEstate;
    
    // Check for depletion with a reasonable threshold (under $100 total is effectively depleted)
    const DEPLETION_THRESHOLD = 100;
    if (liquidAssetsAfterYear < DEPLETION_THRESHOLD && firstDepletionAge === null) {
      firstDepletionAge = age;
      ranOutOfMoneyThisYear = true;
      
      // Force zero all balances to prevent any future growth
      portfolio.taxable = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
      portfolio.taxDeferred = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
      portfolio.taxFree = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
      portfolio.realEstate = 0;
    }
    // Once depleted, stay depleted - don't reset firstDepletionAge



    // Get asset totals
    const getAssetTotal = (assetKey) => {
      return portfolio.taxable[assetKey] + portfolio.taxDeferred[assetKey] + portfolio.taxFree[assetKey];
    };
    
    // Calculate total debt
    const totalDebt = Object.values(tempRunningDebt).reduce((sum, liab) => sum + liab.current_balance, 0) +
                      Object.values(tempRunningCollateralizedLoans).reduce((sum, loan) => sum + loan.current_balance, 0);
    
    // BTC Loan Details - include BOTH Liability and CollateralizedLoan entities
    const btcLoanDetails = [];
    
    // Add Liability entities
    Object.values(tempRunningDebt)
      .filter(l => l.type === 'btc_collateralized' && !l.paid_off)
      .forEach(loan => {
        const collateralBtc = encumberedBtc[loan.id] || loan.collateral_btc_amount || 0;
        const collateralValue = collateralBtc * cumulativeBtcPrice;
        const ltv = collateralValue > 0 ? (loan.current_balance / collateralValue) * 100 : 0;
        btcLoanDetails.push({
          name: loan.name,
          balance: Math.round(loan.current_balance),
          collateralBtc: collateralBtc,
          collateralValue: Math.round(collateralValue),
          ltv: Math.round(ltv),
          status: ltv < 40 ? 'healthy' : ltv < 60 ? 'moderate' : 'elevated'
        });
      });
    
    // Add CollateralizedLoan entities
    Object.values(tempRunningCollateralizedLoans)
      .filter(l => !l.paid_off)
      .forEach(loan => {
        const loanKey = `loan_${loan.id}`;
        const collateralBtc = encumberedBtc[loanKey] || loan.collateral_btc_amount || 0;
        const collateralValue = collateralBtc * cumulativeBtcPrice;
        const ltv = collateralValue > 0 ? (loan.current_balance / collateralValue) * 100 : 0;
        btcLoanDetails.push({
          name: loan.name,
          balance: Math.round(loan.current_balance),
          collateralBtc: collateralBtc,
          collateralValue: Math.round(collateralValue),
          ltv: Math.round(ltv),
          status: ltv < 40 ? 'healthy' : ltv < 60 ? 'moderate' : 'elevated'
        });
      });
    
    const yearLiquidations = liquidationEvents.filter(e => e.year === year);
    const realTotal = getTotalPortfolio(encumberedBtcValueThisYear) / Math.pow(1 + effectiveInflation / 100, i);
    
    const totalWithdrawalAmount = isRetired 
      ? Math.round((withdrawFromTaxable || 0) + (withdrawFromTaxDeferred || 0) + (withdrawFromTaxFree || 0) + (withdrawFromRealEstate || 0) + (fromLoanPayoff || 0))
      : yearSavings < 0 
        ? Math.round((withdrawFromTaxable || 0) + (withdrawFromTaxDeferred || 0) + (withdrawFromTaxFree || 0) + (withdrawFromRealEstate || 0) + (fromLoanPayoff || 0))
        : 0;



    results.push({
      year,
      age,
      isRetired,
      depleted: ranOutOfMoneyThisYear,
      
      // Asset values for chart stacking
      btcLiquid: Math.round(getAssetTotal('btc')),
      btcEncumbered: Math.round(encumberedBtcValueThisYear),
      stocks: Math.round(getAssetTotal('stocks')),
      realEstate: Math.round(portfolio.realEstate),
      bonds: Math.round(getAssetTotal('bonds')),
      cash: Math.round(getAssetTotal('cash')),
      
      // Totals
      total: Math.round(getTotalPortfolio(encumberedBtcValueThisYear)),
      realTotal: Math.round(realTotal),
      liquid: Math.round(getTotalLiquid()),
      taxable: Math.round(getAccountTotal('taxable')),
      taxDeferred: Math.round(getAccountTotal('taxDeferred')),
      taxFree: Math.round(getAccountTotal('taxFree')),
      accountTotal: Math.round(getTotalLiquid()),
      totalDebt: Math.round(totalDebt),
      
      // Income/Spending
      savings: Math.round(cumulativeSavings),
      netCashFlow: isRetired ? Math.round(retirementNetCashFlow || 0) : Math.round(preRetireNetCashFlow),
      yearGrossIncome: !isRetired ? Math.round(yearGrossIncome) : 0,
      yearSpending: !isRetired ? Math.round(yearSpending) : 0,
      otherRetirementIncome: isRetired ? Math.round(otherRetirementIncome) : 0,
      socialSecurityIncome: Math.round(socialSecurityIncome),
      
      // Withdrawals
      isWithdrawing: isRetired || yearSavings < 0,
      yearWithdrawal: isRetired ? Math.round(desiredWithdrawal) : 0,
      yearGoalWithdrawal: Math.round(yearGoalWithdrawal),
      retirementSpendingOnly: isRetired ? Math.round(desiredWithdrawal) : 0,
      withdrawFromTaxable: Math.round(withdrawFromTaxable),
      withdrawFromTaxDeferred: Math.round(withdrawFromTaxDeferred),
      withdrawFromTaxFree: Math.round(withdrawFromTaxFree),
      withdrawFromRealEstate: Math.round(withdrawFromRealEstate),
      withdrawFromLoanPayoff: Math.round(fromLoanPayoff),
      realEstateSold: realEstateSaleProceeds > 0,
      realEstateSaleProceeds: Math.round(realEstateSaleProceeds),
      totalWithdrawalAmount: totalWithdrawalAmount,
      
      // Taxes & Penalties
      taxesPaid: Math.round(taxesPaid),
      federalTaxPaid: Math.round(federalTaxPaid),
      stateTaxPaid: Math.round(stateTaxPaid),
      penaltyPaid: Math.round(penaltyPaid),
      taxableIncome: Math.round(yearTaxableIncome),
      canAccessPenaltyFree: age >= PENALTY_FREE_AGE,
      
      // RMD
      rmdAmount: Math.round(rmdAmount),
      rmdWithdrawn: Math.round(rmdWithdrawn),
      excessRmdReinvested: Math.round(excessRmd),
      rmdStartAge: rmdStartAge,
      
      // Debt tracking
      debtPayments: Math.round(actualAnnualDebtPayments),
      loanPayoffs: yearLoanPayoffs,
      debtPayoffs: thisYearDebtPayoffs,
      liquidations: yearLiquidations,
      
      // BTC info
      btcPrice: Math.round(cumulativeBtcPrice),
      btcGrowthRate: yearBtcGrowth,
      stocksGrowthRate: i > 0 ? (yearlyReturnOverrides?.stocks?.[i] !== undefined ? yearlyReturnOverrides.stocks[i] : effectiveTaxableStocksGrowth) : effectiveStocksCagr,
      realEstateGrowthRate: i > 0 ? (yearlyReturnOverrides?.realEstate?.[i] !== undefined ? yearlyReturnOverrides.realEstate[i] : realEstateCagr) : realEstateCagr,
      bondsGrowthRate: i > 0 ? (yearlyReturnOverrides?.bonds?.[i] !== undefined ? yearlyReturnOverrides.bonds[i] : bondsCagr) : bondsCagr,
      cashGrowthRate: i > 0 ? (yearlyReturnOverrides?.cash?.[i] !== undefined ? yearlyReturnOverrides.cash[i] : cashCagr) : cashCagr,
      
      // Tax breakdown for tooltip
      shortTermGainsTax: Math.round(shortTermGainsTax),
      longTermGainsTax: Math.round(longTermGainsTax),
      encumberedBtc: currentTotalEncumberedBtc,
      liquidBtc: Math.max(0, getAssetTotal('btc') / cumulativeBtcPrice),
      
      // BTC Loan details
      btcLoanDetails: btcLoanDetails,
      totalBtcLoanDebt: Math.round(
        Object.values(tempRunningDebt)
          .filter(l => l.type === 'btc_collateralized' && !l.paid_off)
          .reduce((sum, l) => sum + (l.current_balance || 0), 0)
        + Object.values(tempRunningCollateralizedLoans)
          .filter(l => !l.paid_off)
          .reduce((sum, l) => sum + (l.current_balance || 0), 0)
      ),
      totalBtcCollateralValue: Math.round(
        Object.keys(encumberedBtc).reduce((sum, loanKey) => {
          const btcQty = encumberedBtc[loanKey] || 0;
          return sum + (btcQty * cumulativeBtcPrice);
        }, 0)
      ),
      totalRegularDebt: Math.round(Object.values(tempRunningDebt)
        .filter(l => l.type !== 'btc_collateralized' && !l.paid_off)
        .reduce((sum, l) => sum + l.current_balance, 0)),
      
      // Event markers
      hasEvent: sortedLifeEvents.some(e => e.year === year) ||
        sortedGoals.some(g => g.withdraw_from_portfolio && g.target_date && new Date(g.target_date).getFullYear() === year),
      hasGoalWithdrawal: yearGoalWithdrawal > 0,
      goalNames: [],
      goalFunding: Math.round(yearGoalWithdrawal),
      lifeEventIncome: Math.round(yearLifeEventIncome),
      lifeEventTaxableIncome: Math.round(yearLifeEventTaxableIncome),
      lifeEventExpense: Math.round(yearLifeEventExpense),
      // Debug: log when life event taxable income exists during retirement
      ...(yearLifeEventTaxableIncome > 0 && isRetired ? { _debugLifeEventTax: `Taxable income $${yearLifeEventTaxableIncome} included in totalOtherIncomeForTax` } : {}),
      loanProceeds: Math.round(yearLoanProceeds),
      
      // Dividend income
      qualifiedDividends: Math.round(yearQualifiedDividends),
      nonQualifiedDividends: Math.round(yearNonQualifiedDividends),
      totalDividendIncome: Math.round(totalDividendIncome),
      
      // Retirement contributions (pre-retirement only)
      year401kContribution: !isRetired ? Math.round(year401k || 0) : 0,
      yearRothContribution: !isRetired ? Math.round(yearRoth || 0) : 0,
      yearTraditionalIRAContribution: !isRetired ? Math.round(yearTraditionalIRA || 0) : 0,
      yearHSAContribution: !isRetired ? Math.round(yearHSA || 0) : 0,
      yearEmployer401kMatch: !isRetired ? Math.round(yearEmployerMatch || 0) : 0,
      
      // Early withdrawal tracking (before age 59.5)
      earlyWithdrawalTax: Math.round(yearEarlyWithdrawalTax),
      earlyWithdrawalPenalty: Math.round(yearEarlyWithdrawalPenalty),
      
      // Asset reallocation tracking
      hasReallocation: yearReallocationDetails.length > 0,
      reallocationDetails: yearReallocationDetails,
    });
  }
  
  const survives = firstDepletionAge === null;
  const finalYear = results[results.length - 1];
  

  
  return {
    survives,
    finalPortfolio: finalYear?.total || 0,
    depleteAge: firstDepletionAge,
    yearByYear: results,
  };
}