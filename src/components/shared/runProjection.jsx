import { getRMDFactor } from '@/components/shared/taxData';
import { 
  estimateRetirementWithdrawalTaxes, 
  calculateTaxableSocialSecurity,
  calculateProgressiveIncomeTax,
  getLTCGRate
} from '@/components/tax/taxCalculations';
import { calculateStateTaxOnRetirement, calculateStateIncomeTax } from '@/components/shared/stateTaxConfig';
import { getTaxConfigForYear, get401kLimit, getRothIRALimit, getTraditionalIRALimit, getHSALimit, getRothIRAIncomeLimit } from '@/components/shared/taxConfig';
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
  DEBUG = false,
}) {
  console.log('runUnifiedProjection CALLED with tickerReturns:', Object.keys(tickerReturns || {}).length > 0 ? 'HAS DATA' : 'EMPTY', tickerReturns);

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
    
    holdings.forEach(h => {
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
    
    if (assetWithdrawalStrategy === 'proportional') {
      // Withdraw proportionally from all assets
      const ratio = actualWithdrawal / total;
      btcTarget = acct.btc * ratio;
      stocksTarget = acct.stocks * ratio;
      bondsTarget = acct.bonds * ratio;
      cashTarget = acct.cash * ratio;
      otherTarget = acct.other * ratio;
    } else if (assetWithdrawalStrategy === 'priority') {
      // Withdraw in priority order until amount is met
      // CRITICAL FIX: Fully exhaust each asset before moving to the next
      let remaining = actualWithdrawal;
      for (const assetType of withdrawalPriorityOrder) {
        if (remaining <= 0) break;
        const available = acct[assetType] || 0;
        if (available <= 0) continue; // Skip empty assets
        const take = Math.min(remaining, available);
        if (assetType === 'btc') btcTarget = take;
        else if (assetType === 'stocks') stocksTarget = take;
        else if (assetType === 'bonds') bondsTarget = take;
        else if (assetType === 'cash') cashTarget = take;
        else if (assetType === 'other') otherTarget = take;
        remaining -= take;
      }
    } else if (assetWithdrawalStrategy === 'blended') {
      // Withdraw according to blend percentages
      const totalPct = (withdrawalBlendPercentages.btc || 0) + 
                       (withdrawalBlendPercentages.stocks || 0) + 
                       (withdrawalBlendPercentages.bonds || 0) + 
                       (withdrawalBlendPercentages.cash || 0) + 
                       (withdrawalBlendPercentages.other || 0);
      
      if (totalPct > 0) {
        btcTarget = Math.min(acct.btc, actualWithdrawal * (withdrawalBlendPercentages.btc || 0) / totalPct);
        stocksTarget = Math.min(acct.stocks, actualWithdrawal * (withdrawalBlendPercentages.stocks || 0) / totalPct);
        bondsTarget = Math.min(acct.bonds, actualWithdrawal * (withdrawalBlendPercentages.bonds || 0) / totalPct);
        cashTarget = Math.min(acct.cash, actualWithdrawal * (withdrawalBlendPercentages.cash || 0) / totalPct);
        otherTarget = Math.min(acct.other, actualWithdrawal * (withdrawalBlendPercentages.other || 0) / totalPct);
        
        // If blend doesn't cover full amount (due to min constraints), take remainder proportionally
        const blendTotal = btcTarget + stocksTarget + bondsTarget + cashTarget + otherTarget;
        
        if (blendTotal < actualWithdrawal) {
          const shortfall = actualWithdrawal - blendTotal;
          const remainingTotal = (acct.btc - btcTarget) + (acct.stocks - stocksTarget) + 
                                  (acct.bonds - bondsTarget) + (acct.cash - cashTarget) + (acct.other - otherTarget);
          if (remainingTotal > 0) {
            const ratio = Math.min(1, shortfall / remainingTotal);
            btcTarget += (acct.btc - btcTarget) * ratio;
            stocksTarget += (acct.stocks - stocksTarget) * ratio;
            bondsTarget += (acct.bonds - bondsTarget) * ratio;
            cashTarget += (acct.cash - cashTarget) * ratio;
            otherTarget += (acct.other - otherTarget) * ratio;
          }
        }
      } else {
        // Fallback to proportional if no percentages set
        const ratio = actualWithdrawal / total;
        btcTarget = acct.btc * ratio;
        stocksTarget = acct.stocks * ratio;
        bondsTarget = acct.bonds * ratio;
        cashTarget = acct.cash * ratio;
        otherTarget = acct.other * ratio;
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
        acct.btc = Math.max(0, acct.btc - btcWithdrawn);
        
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
    const nonBtcWithdrawn = stocksTarget + bondsTarget + cashTarget + otherTarget;
    let otherLongTermGain = 0;
    if (nonBtcWithdrawn > 0) {
      const nonBtcTotal = acct.stocks + acct.bonds + acct.cash + acct.other;
      const basisRatio = (nonBtcTotal > 0 && runningTaxableBasis > 0) ? 
        ((runningTaxableBasis - btcCostBasis) / nonBtcTotal) : 0;
      
      otherCostBasis = nonBtcWithdrawn * Math.min(1, basisRatio);
      otherWithdrawn = nonBtcWithdrawn;
      otherLongTermGain = Math.max(0, otherWithdrawn - otherCostBasis); // Assume long-term for non-BTC
      
      acct.stocks = Math.max(0, acct.stocks - stocksTarget);
      acct.bonds = Math.max(0, acct.bonds - bondsTarget);
      acct.cash = Math.max(0, acct.cash - cashTarget);
      acct.other = Math.max(0, acct.other - otherTarget);
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

  let firstDepletionAge = null;
  const birthYear = currentYear - currentAge;
  const rmdStartAge = birthYear <= 1950 ? 72 : birthYear <= 1959 ? 73 : 75;
  const PENALTY_FREE_AGE = 59.5;
  let cumulativeBtcPrice = currentPrice;
  let cumulativeSavings = 0;
  const liquidationEvents = [];
  
  // Create a mutable copy of tax lots for tracking remaining quantities through projection
  // Always use original quantity for projections - remaining_quantity is only for tracking within this projection run
  let runningTaxLots = taxLots.map(lot => ({ 
    ...lot,
    remaining_quantity: lot.quantity ?? 0
  }));
  
  // Initialize debt tracking
  const tempRunningDebt = {};
  liabilities.forEach(liability => {
    tempRunningDebt[liability.id] = {
      ...liability,
      current_balance: liability.current_balance || 0,
      paid_off: false,
      entity_type: 'Liability',
    };
  });

  const tempRunningCollateralizedLoans = {};
  const pendingHypotheticalLoans = [];
  collateralizedLoans.forEach(loan => {
    tempRunningCollateralizedLoans[loan.id] = {
      ...loan,
      current_balance: loan.current_balance || 0,
      paid_off: false,
      entity_type: 'CollateralizedLoan',
      type: 'btc_collateralized',
      monthly_payment: loan.minimum_monthly_payment || 0,
    };
  });

  // Process hypothetical BTC loan if provided
  if (hypothetical_btc_loan?.enabled) {
    const loanStartAge = (hypothetical_btc_loan.start_age !== undefined && hypothetical_btc_loan.start_age !== null && hypothetical_btc_loan.start_age !== '')
      ? parseInt(hypothetical_btc_loan.start_age) 
      : currentAge;
    
    const hypotheticalLoanObj = {
      id: 'hypothetical_btc_loan_' + Date.now(),
      name: 'Hypothetical BTC Loan',
      type: 'btc_collateralized',
      current_balance: hypothetical_btc_loan.loan_amount || 0,
      interest_rate: hypothetical_btc_loan.interest_rate || 12,
      collateral_btc_amount: hypothetical_btc_loan.collateral_btc || 0,
      liquidation_ltv: 80,
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
      }
      const proceeds = hypotheticalLoanObj.current_balance;
      if (proceeds > 0) {
        if (hypotheticalLoanObj.use_of_proceeds === 'btc') {
          portfolio.taxable.btc += proceeds;
        } else if (hypotheticalLoanObj.use_of_proceeds === 'stocks') {
          portfolio.taxable.stocks += proceeds;
        } else {
          portfolio.taxable.cash += proceeds;
        }
        runningTaxableBasis += proceeds;
      }
    }
  }

  // Initialize BTC collateral tracking
  const encumberedBtc = {};
  let releasedBtc = {};

  liabilities.forEach(liability => {
    if (liability.type === 'btc_collateralized' && liability.collateral_btc_amount) {
      encumberedBtc[liability.id] = liability.collateral_btc_amount;
      releasedBtc[liability.id] = 0;
    }
  });

  collateralizedLoans.forEach(loan => {
    if (loan.collateral_btc_amount) {
      const loanKey = `loan_${loan.id}`;
      encumberedBtc[loanKey] = loan.collateral_btc_amount;
      releasedBtc[loanKey] = 0;
    }
  });

  // Track cost basis for taxable accounts BEFORE subtracting encumbered BTC
  const taxableHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'taxable');
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
  let encumberedBtcBasis = 0;
  if (initialTaxableValueBeforeEncumbered > 0 && initialEncumberedBtcValue > 0) {
    encumberedBtcBasis = runningTaxableBasis * (initialEncumberedBtcValue / initialTaxableValueBeforeEncumbered);
    runningTaxableBasis = Math.max(0, runningTaxableBasis - encumberedBtcBasis);
  }

  // Get standard deduction
  const taxConfigForYear = getTaxConfigForYear(currentYear);
  const standardDeductions = taxConfigForYear?.standardDeduction || { single: 15000, married: 30000 };
  const currentStandardDeduction = standardDeductions[filingStatus] || standardDeductions.single;

  // Track individual holding values for dividend calculations
  // We need to track values through the projection since dividends are based on current value
  const holdingValues = holdings.map(h => {
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

  // Main projection loop
  for (let i = 0; i <= lifeExpectancy - currentAge; i++) {
    const year = currentYear + i;
    const age = currentAge + i;
    const isRetired = age >= retirementAge;
    const yearsFromNow = i;

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
      
      if (i === 0) {
        console.log('RESULTS PUSH Year 0:', {
          totalDividendIncome: Math.round(totalDividendIncome),
          qualifiedDividends: Math.round(yearQualifiedDividends),
          nonQualifiedDividends: Math.round(yearNonQualifiedDividends)
        });
      }

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
    let year401k = 0;
    let yearRoth = 0;
    let yearTraditionalIRA = 0;
    let yearHSA = 0;
    let yearEmployerMatch = 0;
    let retirementNetCashFlow = 0;
    let preRetireNetCashFlow = 0;
    let yearQualifiedDividends = 0;
    let yearNonQualifiedDividends = 0;

    // BTC growth and price tracking - priority: Monte Carlo > Custom Periods > Power Law/model
    const customBtcRate = getCustomReturnForYear('btc', i, customReturnPeriods, null);
    const yearBtcGrowth = yearlyReturnOverrides?.btc?.[i] !== undefined 
      ? yearlyReturnOverrides.btc[i] 
      : customBtcRate !== null
        ? customBtcRate
        : getBtcGrowthRate(yearsFromNow, effectiveInflation);
    if (i > 0) {
      cumulativeBtcPrice = cumulativeBtcPrice * (1 + yearBtcGrowth / 100);
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
        const taxableTotal = getAccountTotal('taxable');
        if (taxableTotal > 0 && runningTaxableBasis > 0) {
          const basisToTransfer = runningTaxableBasis * (collateralValue / (taxableTotal + collateralValue));
          encumberedBtcBasis += basisToTransfer;
          runningTaxableBasis -= basisToTransfer;
        }
      }
      
      const proceeds = newLoan.current_balance;
      if (proceeds > 0) {
        if (newLoan.use_of_proceeds === 'btc') {
          portfolio.taxable.btc += proceeds;
        } else if (newLoan.use_of_proceeds === 'stocks') {
          portfolio.taxable.stocks += proceeds;
        } else {
          portfolio.taxable.cash += proceeds;
        }
        runningTaxableBasis += proceeds;
        
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

    // Process released collateral from PREVIOUS year
    const totalReleasedBtcThisYear = Object.values(releasedBtc).reduce((sum, btcAmount) => sum + btcAmount, 0);
    const totalReleasedBtcValueThisYear = totalReleasedBtcThisYear * cumulativeBtcPrice;
    if (totalReleasedBtcValueThisYear > 0) {
      portfolio.taxable.btc += totalReleasedBtcValueThisYear;

      // Restore proportional basis for released collateral
      // Calculate based on current encumbered BTC amount (more accurate than initial)
      const currentTotalEncumberedBtcBeforeRelease = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0) + totalReleasedBtcThisYear;
      if (currentTotalEncumberedBtcBeforeRelease > 0 && encumberedBtcBasis > 0) {
        const releaseRatio = Math.min(1, totalReleasedBtcThisYear / currentTotalEncumberedBtcBeforeRelease);
        const basisToRestore = encumberedBtcBasis * releaseRatio;
        runningTaxableBasis += basisToRestore;
        encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisToRestore);
      }
    }
    releasedBtc = {};

    // Life events: income/expense adjustments
    let activeIncomeAdjustment = 0;
    let activeExpenseAdjustment = 0;
    
    lifeEvents.forEach(event => {
      // Recurring income changes
      if (event.event_type === 'income_change') {
        const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
        if (year >= event.year && year < eventEndYear) activeIncomeAdjustment += event.amount;
      }
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

    lifeEvents.forEach(event => {
      if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
        // Handle assets-affecting events (inheritance, windfall, one-time inflows)
        if (event.affects === 'assets') {
          const eventAmount = event.amount;
          eventImpact += eventAmount;
          
          // Track positive life event income for tooltip display
          if (eventAmount > 0) {
            yearLifeEventIncome += eventAmount;
          }
          
          // Invest according to allocation
          if (eventAmount > 0 && event.allocation_method === 'custom') {
            portfolio.taxable.btc += eventAmount * ((event.btc_allocation || 0) / 100);
            portfolio.taxable.stocks += eventAmount * ((event.stocks_allocation || 0) / 100);
            portfolio.realEstate += eventAmount * ((event.real_estate_allocation || 0) / 100);
            portfolio.taxable.bonds += eventAmount * ((event.bonds_allocation || 0) / 100);
            portfolio.taxable.other += eventAmount * (((event.cash_allocation || 0) + (event.other_allocation || 0)) / 100);
          } else if (eventAmount > 0) {
            // Proportionate allocation to existing taxable portfolio
            const totalAllocation = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
            if (totalAllocation > 0) {
              portfolio.taxable.btc += eventAmount * (savingsAllocationBtc / totalAllocation);
              portfolio.taxable.stocks += eventAmount * (savingsAllocationStocks / totalAllocation);
              portfolio.taxable.bonds += eventAmount * (savingsAllocationBonds / totalAllocation);
              portfolio.taxable.cash += eventAmount * (savingsAllocationCash / totalAllocation);
              portfolio.taxable.other += eventAmount * (savingsAllocationOther / totalAllocation);
            } else {
              portfolio.taxable.cash += eventAmount;
            }
            // Track cost basis for positive inflows
            runningTaxableBasis += eventAmount;
          }
        }
        // Also track inheritance/windfall/gift event types that may not have affects='assets' set
        if (['inheritance', 'windfall', 'gift', 'asset_sale'].includes(event.event_type) && event.amount > 0 && event.affects !== 'assets') {
          yearLifeEventIncome += event.amount;
          // Add to portfolio proportionately
          const totalAllocation = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
          if (totalAllocation > 0) {
            portfolio.taxable.btc += event.amount * (savingsAllocationBtc / totalAllocation);
            portfolio.taxable.stocks += event.amount * (savingsAllocationStocks / totalAllocation);
            portfolio.taxable.bonds += event.amount * (savingsAllocationBonds / totalAllocation);
            portfolio.taxable.cash += event.amount * (savingsAllocationCash / totalAllocation);
            portfolio.taxable.other += event.amount * (savingsAllocationOther / totalAllocation);
          } else {
            portfolio.taxable.cash += event.amount;
          }
          runningTaxableBasis += event.amount;
        }
        // Handle one-time expenses (major_expense with negative amount or affects='assets' with negative)
        if ((event.event_type === 'major_expense' || (event.affects === 'assets' && event.amount < 0)) && event.year === year) {
          const expenseAmount = Math.abs(event.amount);
          yearGoalWithdrawal += expenseAmount; // Treat as withdrawal need
          yearLifeEventExpense += expenseAmount; // Track for tooltip display
        }
        // Home purchase down payment
        if (event.event_type === 'home_purchase' && event.year === year) {
          eventImpact -= (event.down_payment || 0);
          yearGoalWithdrawal += (event.down_payment || 0); // Down payment is a withdrawal
          yearLifeEventExpense += (event.down_payment || 0); // Track for tooltip
        }
      }
    });

    // Goals: withdrawal and debt payoff
    goals.forEach(goal => {
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

    Object.values(tempRunningDebt).forEach(liability => {
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
          const dailyRate = liability.interest_rate / 100 / 365;
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
              releasedBtc[liability.id] = (releasedBtc[liability.id] || 0) + remainingCollateralBtc;
              encumberedBtc[liability.id] = 0;
            }
          }
        }
        // Release at 30% LTV
        else if (postTopUpLTV <= releaseLTV) {
          if (liability.current_balance <= 0) {
            if (!releasedBtc[liability.id]) {
              releasedBtc[liability.id] = encumberedBtc[liability.id];
              encumberedBtc[liability.id] = 0;
              liquidationEvents.push({
                year,
                age,
                type: 'release',
                liabilityName: liability.name || liability.lender || 'BTC Loan',
                message: `Released ${releasedBtc[liability.id].toFixed(4)} BTC (debt fully paid)`
              });
            }
          } else {
            const currentCollateral = encumberedBtc[liability.id];
            const targetCollateralForLoan = liability.current_balance / (releaseTargetLTV / 100) / cumulativeBtcPrice;
            const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
            if (excessCollateral > 0) {
              releasedBtc[liability.id] = excessCollateral;
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
    Object.values(tempRunningCollateralizedLoans).forEach(loan => {
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
          const dailyRate = loan.interest_rate / 100 / 365;
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
              releasedBtc[loanKey] = (releasedBtc[loanKey] || 0) + remainingCollateralBtc;
              encumberedBtc[loanKey] = 0;
            }
          }
        }
        // Release
        else if (postTopUpLTV <= releaseLTV) {
          if (loan.current_balance <= 0) {
            if (!releasedBtc[loanKey]) {
              releasedBtc[loanKey] = encumberedBtc[loanKey];
              encumberedBtc[loanKey] = 0;
              liquidationEvents.push({
                year,
                age,
                type: 'release',
                liabilityName: loan.name || loan.lender || 'BTC Loan',
                message: `Released ${releasedBtc[loanKey].toFixed(4)} BTC (debt fully paid)`
              });
            }
          } else {
            const currentCollateral = encumberedBtc[loanKey];
            const targetCollateralForLoan = loan.current_balance / (releaseTargetLTV / 100) / cumulativeBtcPrice;
            const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
            if (excessCollateral > 0) {
              releasedBtc[loanKey] = excessCollateral;
              encumberedBtc[loanKey] = targetCollateralForLoan;
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
      
      if (portfolio.realEstate >= GROWTH_DUST_THRESHOLD && yearRealEstateGrowth !== 0) portfolio.realEstate *= (1 + yearRealEstateGrowth / 100);
      else if (portfolio.realEstate < GROWTH_DUST_THRESHOLD) portfolio.realEstate = 0;
      
      // Update tracked holding values for dividend calculations
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
            growthRate = effectiveStocksGrowthThisYear;
          } else if (hv.assetCategory === 'bonds') {
            growthRate = yearBondsGrowth;
          } else if (hv.assetCategory === 'cash') {
            growthRate = yearCashGrowth;
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
        realloc.currentValue *= (1 + (realloc.buy_cagr || effectiveStocksGrowthThisYear) / 100);
      });
    }

    // Debug dividend calculation for Year 0
    if (i === 0) {
      console.log('YEAR 0 DIVIDEND DEBUG:', holdingValues.map(hv => ({
        ticker: hv.ticker,
        dividendYield: hv.dividendYield,
        currentValue: Math.round(hv.currentValue),
        taxTreatment: hv.taxTreatment,
        qualifies: hv.dividendYield > 0 && hv.currentValue > 0 && hv.taxTreatment === 'taxable'
      })));
    }

    // Calculate dividend income from holdings (only taxable accounts generate taxable dividends)
    // Tax-deferred and tax-free accounts reinvest dividends without immediate tax
    // Real estate income (rental/REITs) is included and treated as non-qualified (ordinary income)
    holdingValues.forEach(hv => {
      if (hv.dividendYield > 0 && hv.currentValue > 0 && (hv.taxTreatment === 'taxable' || hv.taxTreatment === 'real_estate')) {
        const annualDividend = hv.currentValue * (hv.dividendYield / 100);
        // Real estate income (rental/REITs) is typically non-qualified (taxed as ordinary income)
        const isQualified = hv.taxTreatment === 'real_estate' ? false : hv.dividendQualified;
        if (isQualified) {
          yearQualifiedDividends += annualDividend;
        } else {
          yearNonQualifiedDividends += annualDividend;
        }
      }
    });
    
    // Calculate dividend income from executed asset reallocations
    executedReallocations.forEach(realloc => {
      if (realloc.buy_dividend_yield > 0 && realloc.currentValue > 0) {
        const annualDividend = realloc.currentValue * (realloc.buy_dividend_yield / 100);
        if (realloc.buy_dividend_qualified !== false) {
          yearQualifiedDividends += annualDividend;
        } else {
          yearNonQualifiedDividends += annualDividend;
        }
      }
    });
    
    const totalDividendIncome = yearQualifiedDividends + yearNonQualifiedDividends;

    if (i === 0) {
      console.log('DIVIDEND CALC RESULT:', { yearQualifiedDividends, yearNonQualifiedDividends, totalDividendIncome });
    }



    // Roth contributions for accessible funds
    const totalRothContributions = accounts
      .filter(a => ['401k_roth', 'ira_roth', 'hsa'].includes(a.account_type))
      .reduce((sum, a) => sum + (a.roth_contributions || 0), 0);

    let ranOutOfMoneyThisYear = false;

    // PRE-RETIREMENT
    if (!isRetired) {
      const baseGrossIncome = grossAnnualIncome * Math.pow(1 + incomeGrowth / 100, i);
      yearGrossIncome = baseGrossIncome + activeIncomeAdjustment;
      
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
      
      const yearTaxableIncome = Math.max(0, yearGrossIncome - year401k - yearTraditionalIRA - yearHSA - currentStandardDeduction);
      const yearFederalTax = calculateProgressiveIncomeTax(yearTaxableIncome, filingStatus, year);
      const yearStateTax = calculateStateIncomeTax({ income: yearGrossIncome - year401k - yearTraditionalIRA - yearHSA, filingStatus, state: stateOfResidence, year });
      
      federalTaxPaid = yearFederalTax;
      stateTaxPaid = yearStateTax;
      taxesPaid = yearFederalTax + yearStateTax;
      // Net income = gross - taxes - pre-tax contributions (401k, Traditional IRA, HSA come from paycheck)
      // Add dividend income (dividends are received as cash, taxed separately)
      const yearNetIncome = yearGrossIncome - taxesPaid - year401k - yearTraditionalIRA - yearHSA + totalDividendIncome;

      const baseYearSpending = (currentAnnualSpending * Math.pow(1 + effectiveInflation / 100, i)) + activeExpenseAdjustment;
      yearSpending = i === 0 ? baseYearSpending * currentYearProRataFactor : baseYearSpending;
      
      const proRatedNetIncome = i === 0 ? yearNetIncome * currentYearProRataFactor : yearNetIncome;
      const proRatedYearRoth = i === 0 ? yearRoth * currentYearProRataFactor : yearRoth;
      yearSavings = proRatedNetIncome - yearSpending - proRatedYearRoth - yearGoalWithdrawal;

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

        const preRetireStateTax = calculateStateTaxOnRetirement({
          state: stateOfResidence,
          age: age,
          filingStatus: filingStatus,
          totalAGI: deficit,
          socialSecurityIncome: 0,
          taxDeferredWithdrawal: taxEstimate.fromTaxDeferred || 0,
          taxableWithdrawal: prelimTaxableWithdraw.withdrawn,
          taxableGainPortion: prelimTaxableWithdraw.shortTermGain + prelimTaxableWithdraw.longTermGain,
          pensionIncome: 0,
          year: year,
        });

        federalTaxPaid += (taxEstimate.totalTax || 0);
        stateTaxPaid += preRetireStateTax;
        taxesPaid += (taxEstimate.totalTax || 0) + preRetireStateTax;
        penaltyPaid = taxEstimate.totalPenalty || 0;

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
              
              // Calculate actual cost basis percentage from encumbered BTC
              const totalEncumberedBtcValue = Object.values(encumberedBtc).reduce((sum, btc) => sum + (btc * cumulativeBtcPrice), 0);
              const actualCostBasisPercent = totalEncumberedBtcValue > 0 
                ? Math.min(1, encumberedBtcBasis / totalEncumberedBtcValue) 
                : 0.5; // fallback to 50% if no data

              // Calculate gain based on actual cost basis
              const saleProceeds = btcToSellForDebt * cumulativeBtcPrice;
              const costBasisForSale = saleProceeds * actualCostBasisPercent;
              const gainOnSale = Math.max(0, saleProceeds - costBasisForSale);
              
              // Reduce encumberedBtcBasis proportionally for sold BTC
              const totalEncumberedBtcAmount = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
              if (totalEncumberedBtcAmount > 0 && encumberedBtcBasis > 0) {
                const basisReduction = encumberedBtcBasis * (btcToSellForDebt / totalEncumberedBtcAmount);
                encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisReduction);
              }
              
              const taxableIncomeBase = withdrawFromTaxable + withdrawFromTaxDeferred;
              const taxOnSale = gainOnSale * getLTCGRate(taxableIncomeBase, filingStatus, year);
              
              const netEquityAvailable = equityReleasedGross - taxOnSale;
              const appliedToDeficit = Math.min(netEquityAvailable, remainingShortfall);
              
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
              
              portfolio.taxable.btc += btcReleased * cumulativeBtcPrice;
              encumberedBtc[loan.loanKey] = 0;
              taxesPaid += taxOnSale;
              
              yearLoanPayoffs.push({ loanName: loan.name || loan.lender || 'BTC Loan', debtPaid: debtToPay, btcSold: btcToSellForDebt, btcReleased: btcReleased, equityReleased: equityReleasedGross, taxOnSale: taxOnSale, netEquity: netEquityAvailable, appliedToDeficit: appliedToDeficit });
            }
          }
          
          // Last resort: Real Estate
          if (remainingShortfall > 0 && portfolio.realEstate > 0) {
            realEstateSaleProceeds = portfolio.realEstate;
            portfolio.realEstate = 0;
            withdrawFromRealEstate = Math.min(remainingShortfall, realEstateSaleProceeds);
            const excessProceeds = realEstateSaleProceeds - withdrawFromRealEstate;
            if (excessProceeds > 0) portfolio.taxable.cash += excessProceeds;
            remainingShortfall -= withdrawFromRealEstate;
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
        
        const totalAllocation = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
        if (totalAllocation > 0) {
          portfolio.taxable.btc += yearSavings * (savingsAllocationBtc / totalAllocation);
          portfolio.taxable.stocks += yearSavings * (savingsAllocationStocks / totalAllocation);
          portfolio.taxable.bonds += yearSavings * (savingsAllocationBonds / totalAllocation);
          portfolio.taxable.cash += yearSavings * (savingsAllocationCash / totalAllocation);
          portfolio.taxable.other += yearSavings * (savingsAllocationOther / totalAllocation);
        } else {
          portfolio.taxable.btc += yearSavings;
        }
        runningTaxableBasis += yearSavings;
      } else {
        // yearSavings === 0, no deficit or surplus
        preRetireNetCashFlow = 0;
      }
    } else {
      // RETIREMENT
      const nominalSpendingAtRetirement = retirementAnnualSpending * Math.pow(1 + effectiveInflation / 100, Math.max(0, retirementAge - currentAge));
      const baseDesiredWithdrawal = nominalSpendingAtRetirement * Math.pow(1 + effectiveInflation / 100, age - retirementAge);
      desiredWithdrawal = i === 0 ? baseDesiredWithdrawal * currentYearProRataFactor : baseDesiredWithdrawal;
      yearSpending = desiredWithdrawal;

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
      const totalRetirementIncome = otherRetirementIncome + socialSecurityIncome + totalDividendIncome;
      const taxableSocialSecurity = calculateTaxableSocialSecurity(socialSecurityIncome, otherRetirementIncome + desiredWithdrawal, filingStatus);
      const totalOtherIncomeForTax = otherRetirementIncome + taxableSocialSecurity + rmdWithdrawn;

      const federalTaxOnOtherIncome = calculateProgressiveIncomeTax(Math.max(0, totalOtherIncomeForTax - currentStandardDeduction), filingStatus, year);
      
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

      // Simulate taxable withdrawal first to get accurate gain breakdown
      const prelimRetirementTaxable = withdrawFromTaxableWithLots(
        Math.min(cappedWithdrawal, taxableBalance),
        cumulativeBtcPrice,
        year
      );

      const taxEstimate = estimateRetirementWithdrawalTaxes({
        withdrawalNeeded: cappedWithdrawal,
        taxableBalance: prelimRetirementTaxable.withdrawn,
        taxDeferredBalance,
        taxFreeBalance,
        rothContributions: totalRothContributions,
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

      const stateTax = calculateStateTaxOnRetirement({
        state: stateOfResidence,
        age: age,
        filingStatus: filingStatus,
        totalAGI: totalOtherIncomeForTax + cappedWithdrawal,
        socialSecurityIncome: socialSecurityIncome,
        taxDeferredWithdrawal: taxEstimate.fromTaxDeferred || 0,
        taxableWithdrawal: prelimRetirementTaxable.withdrawn,
        taxableGainPortion: prelimRetirementTaxable.shortTermGain + prelimRetirementTaxable.longTermGain,
        pensionIncome: otherRetirementIncome,
        year: year,
      });

      federalTaxPaid = federalTaxOnOtherIncome + (taxEstimate.totalTax || 0);
      stateTaxPaid = stateTax;
      taxesPaid = federalTaxOnOtherIncome + (taxEstimate.totalTax || 0) + stateTax;
      penaltyPaid = taxEstimate.totalPenalty || 0;

      // Calculate retirement net cash flow: income - spending - goals - taxes
      // Positive = surplus, Negative = deficit
      retirementNetCashFlow = (totalRetirementIncome + rmdWithdrawn) - (desiredWithdrawal + taxesPaid + penaltyPaid + yearGoalWithdrawal);

      // Handle retirement income surplus - reinvest excess into taxable account per savings allocation
      // This allows income surplus to go into growth assets rather than just cash
      if (retirementNetCashFlow > 0) {
        const totalAllocation = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
        if (totalAllocation > 0) {
          portfolio.taxable.btc += retirementNetCashFlow * (savingsAllocationBtc / totalAllocation);
          portfolio.taxable.stocks += retirementNetCashFlow * (savingsAllocationStocks / totalAllocation);
          portfolio.taxable.bonds += retirementNetCashFlow * (savingsAllocationBonds / totalAllocation);
          portfolio.taxable.cash += retirementNetCashFlow * (savingsAllocationCash / totalAllocation);
          portfolio.taxable.other += retirementNetCashFlow * (savingsAllocationOther / totalAllocation);
        } else {
          portfolio.taxable.cash += retirementNetCashFlow;
        }
        runningTaxableBasis += retirementNetCashFlow;
      }

      // Only withdraw from portfolio if there's an actual deficit (not for taxes that income covers)
      const totalNeededFromAccounts = Math.max(0, -retirementNetCashFlow);
      
      // Only process withdrawals if there's actually a deficit
      if (totalNeededFromAccounts > 0) {
        // Use the preliminary withdrawal results we already calculated
        // (prelimRetirementTaxable already updated lots and portfolio)
        withdrawFromTaxable = prelimRetirementTaxable.withdrawn;
        runningTaxableBasis = Math.max(0, runningTaxableBasis - prelimRetirementTaxable.totalCostBasis);
        
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
              
              // Calculate actual cost basis percentage from encumbered BTC
              const totalEncumberedBtcValue = Object.values(encumberedBtc).reduce((sum, btc) => sum + (btc * cumulativeBtcPrice), 0);
              const actualCostBasisPercent = totalEncumberedBtcValue > 0 
                ? Math.min(1, encumberedBtcBasis / totalEncumberedBtcValue) 
                : 0.5; // fallback to 50% if no data

              // Calculate gain based on actual cost basis
              const saleProceeds = btcToSellForDebt * cumulativeBtcPrice;
              const costBasisForSale = saleProceeds * actualCostBasisPercent;
              const gainOnSale = Math.max(0, saleProceeds - costBasisForSale);
              
              // Reduce encumberedBtcBasis proportionally for sold BTC
              const totalEncumberedBtcAmount = Object.values(encumberedBtc).reduce((sum, btc) => sum + btc, 0);
              if (totalEncumberedBtcAmount > 0 && encumberedBtcBasis > 0) {
                const basisReduction = encumberedBtcBasis * (btcToSellForDebt / totalEncumberedBtcAmount);
                encumberedBtcBasis = Math.max(0, encumberedBtcBasis - basisReduction);
              }
              
              const taxableIncomeBase = (totalOtherIncomeForTax || 0) + withdrawFromTaxable + withdrawFromTaxDeferred;
              const taxOnSale = gainOnSale * getLTCGRate(taxableIncomeBase, filingStatus, year);
              
              const netEquityAvailable = equityReleasedGross - taxOnSale;
              const appliedToDeficit = Math.min(netEquityAvailable, remainingShortfall);
              
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
              
              portfolio.taxable.btc += btcReleased * cumulativeBtcPrice;
              encumberedBtc[loan.loanKey] = 0;
              taxesPaid += taxOnSale;
              
              yearLoanPayoffs.push({ loanName: loan.name || loan.lender || 'BTC Loan', debtPaid: debtToPay, btcSold: btcToSellForDebt, btcReleased: btcReleased, equityReleased: equityReleasedGross, taxOnSale: taxOnSale, netEquity: netEquityAvailable, appliedToDeficit: appliedToDeficit });
            }
          }
          
          // Last resort: Real Estate
          if (remainingShortfall > 0 && portfolio.realEstate > 0) {
            realEstateSaleProceeds = portfolio.realEstate;
            portfolio.realEstate = 0;
            withdrawFromRealEstate = Math.min(remainingShortfall, realEstateSaleProceeds);
            const excessProceeds = realEstateSaleProceeds - withdrawFromRealEstate;
            if (excessProceeds > 0) portfolio.taxable.cash += excessProceeds;
            remainingShortfall -= withdrawFromRealEstate;
          }
          
          if (remainingShortfall > desiredWithdrawal * 0.05) ranOutOfMoneyThisYear = true;
        }
      }

      if (getTotalPortfolio() <= 0) ranOutOfMoneyThisYear = true;
    }

    // Calculate totals
    const currentTotalEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
    const encumberedBtcValueThisYear = currentTotalEncumberedBtc * cumulativeBtcPrice;
    
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
    
    // BTC Loan Details
    const btcLoanDetails = Object.values(tempRunningDebt)
      .filter(l => l.type === 'btc_collateralized' && !l.paid_off)
      .map(loan => {
        const collateralBtc = encumberedBtc[loan.id] || loan.collateral_btc_amount || 0;
        const collateralValue = collateralBtc * cumulativeBtcPrice;
        const ltv = collateralValue > 0 ? (loan.current_balance / collateralValue) * 100 : 0;
        return {
          name: loan.name,
          balance: Math.round(loan.current_balance),
          collateralBtc: collateralBtc,
          collateralValue: Math.round(collateralValue),
          ltv: Math.round(ltv),
          status: ltv < 40 ? 'healthy' : ltv < 60 ? 'moderate' : 'elevated'
        };
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
      
      // Tax breakdown for tooltip (taxEstimate may not exist in depleted years)
      shortTermGainsTax: 0,
      longTermGainsTax: 0,
      encumberedBtc: currentTotalEncumberedBtc,
      liquidBtc: Math.max(0, getAssetTotal('btc') / cumulativeBtcPrice),
      
      // BTC Loan details
      btcLoanDetails: btcLoanDetails,
      totalBtcLoanDebt: Math.round(Object.values(tempRunningDebt)
        .filter(l => l.type === 'btc_collateralized' && !l.paid_off)
        .reduce((sum, l) => sum + l.current_balance, 0)),
      totalBtcCollateralValue: Math.round(Object.values(tempRunningDebt)
        .filter(l => l.type === 'btc_collateralized' && !l.paid_off)
        .reduce((sum, l) => {
          const collateralBtc = encumberedBtc[l.id] || l.collateral_btc_amount || 0;
          return sum + (collateralBtc * cumulativeBtcPrice);
        }, 0)),
      totalRegularDebt: Math.round(Object.values(tempRunningDebt)
        .filter(l => l.type !== 'btc_collateralized' && !l.paid_off)
        .reduce((sum, l) => sum + l.current_balance, 0)),
      
      // Event markers
      hasEvent: lifeEvents.some(e => e.year === year) ||
        goals.some(g => g.withdraw_from_portfolio && g.target_date && new Date(g.target_date).getFullYear() === year),
      hasGoalWithdrawal: yearGoalWithdrawal > 0,
      goalNames: [],
      goalFunding: Math.round(yearGoalWithdrawal),
      lifeEventIncome: Math.round(yearLifeEventIncome),
      lifeEventExpense: Math.round(yearLifeEventExpense),
      
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