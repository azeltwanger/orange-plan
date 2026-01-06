import { getRMDFactor } from '@/components/shared/taxData';
import { 
  estimateRetirementWithdrawalTaxes, 
  calculateTaxableSocialSecurity,
  calculateProgressiveIncomeTax,
  getLTCGRate
} from '@/components/tax/taxCalculations';
import { calculateStateTaxOnRetirement, calculateStateIncomeTax } from '@/components/shared/stateTaxConfig';
import { getTaxConfigForYear, get401kLimit, getRothIRALimit, getTraditionalIRALimit, getHSALimit, getRothIRAIncomeLimit } from '@/components/shared/taxConfig';

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
  DEBUG = false,
}) {
  // DEBUG: Log holdings passed to projection
  console.log("=== HOLDINGS PASSED TO PROJECTION ===");
  console.log("Holdings count:", holdings.length);
  holdings.forEach(h => {
    const value = h.ticker === 'BTC' ? h.quantity * currentPrice : h.quantity * (h.current_price || 0);
    console.log(`- ${h.asset_name || h.name}: ${h.ticker} qty=${h.quantity} price=${h.current_price || currentPrice} value=${value} account_id=${h.account_id}`);
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

  // DEBUG: Log portfolio after initialization
  console.log("=== PORTFOLIO AFTER INIT (before encumbered subtraction) ===");
  console.log("Taxable:", JSON.stringify(portfolio.taxable));
  console.log("TaxDeferred:", JSON.stringify(portfolio.taxDeferred));
  console.log("TaxFree:", JSON.stringify(portfolio.taxFree));
  console.log("RealEstate:", portfolio.realEstate);

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
    
    return actualWithdrawal;
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

  // Subtract encumbered BTC from taxable
  const totalInitialEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
  const initialEncumberedBtcValue = totalInitialEncumberedBtc * currentPrice;
  portfolio.taxable.btc = Math.max(0, portfolio.taxable.btc - initialEncumberedBtcValue);

  // DEBUG: Log after encumbered subtraction
  console.log("=== AFTER ENCUMBERED SUBTRACTION ===");
  console.log("Encumbered BTC:", totalInitialEncumberedBtc);
  console.log("Encumbered Value:", initialEncumberedBtcValue);
  console.log("Taxable BTC now:", portfolio.taxable.btc);

  // Track cost basis for taxable accounts
  const taxableHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'taxable');
  const initialTaxableCostBasis = taxableHoldings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
  let runningTaxableBasis = initialTaxableCostBasis;

  // Get standard deduction
  const taxConfigForYear = getTaxConfigForYear(currentYear);
  const standardDeductions = taxConfigForYear?.standardDeduction || { single: 15000, married: 30000 };
  const currentStandardDeduction = standardDeductions[filingStatus] || standardDeductions.single;

  // Main projection loop
  for (let i = 0; i <= lifeExpectancy - currentAge; i++) {
    const year = currentYear + i;
    const age = currentAge + i;
    const isRetired = age >= retirementAge;
    const yearsFromNow = i;

    // If already depleted, skip all calculations and just record zero values
    if (firstDepletionAge !== null && age > firstDepletionAge) {
      // Update BTC price for tracking purposes
      const yearBtcGrowth = getBtcGrowthRate(yearsFromNow, effectiveInflation);
      if (i > 0) {
        cumulativeBtcPrice = cumulativeBtcPrice * (1 + yearBtcGrowth / 100);
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
        savings: Math.round(cumulativeSavings),
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
        btcPrice: Math.round(cumulativeBtcPrice),
        btcGrowthRate: yearBtcGrowth,
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
    let year401k = 0;
    let yearRoth = 0;
    let yearTraditionalIRA = 0;
    let yearHSA = 0;
    let yearEmployerMatch = 0;

    // BTC growth and price tracking
    const yearBtcGrowth = getBtcGrowthRate(yearsFromNow, effectiveInflation);
    if (i > 0) {
      cumulativeBtcPrice = cumulativeBtcPrice * (1 + yearBtcGrowth / 100);
    }

    // Social Security - calculate REGARDLESS of retirement status
    if (age >= socialSecurityStartAge && effectiveSocialSecurity > 0) {
      const yearsToSSStart = Math.max(0, socialSecurityStartAge - currentAge);
      const yearsReceivingSS = age - socialSecurityStartAge;
      socialSecurityIncome = effectiveSocialSecurity * 
        Math.pow(1 + effectiveInflation / 100, yearsToSSStart) * 
        Math.pow(1 + effectiveInflation / 100, yearsReceivingSS);
    }

    // Process released collateral from PREVIOUS year
    const totalReleasedBtcValueThisYear = Object.values(releasedBtc).reduce((sum, btcAmount) => {
      return sum + (btcAmount * cumulativeBtcPrice);
    }, 0);
    if (totalReleasedBtcValueThisYear > 0) {
      portfolio.taxable.btc += totalReleasedBtcValueThisYear;
    }
    releasedBtc = {};

    // Life events: income/expense adjustments
    let activeIncomeAdjustment = 0;
    let activeExpenseAdjustment = 0;
    
    lifeEvents.forEach(event => {
      if (event.event_type === 'income_change') {
        const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
        if (year >= event.year && year < eventEndYear) activeIncomeAdjustment += event.amount;
      }
      if (event.event_type === 'expense_change') {
        const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
        if (year >= event.year && year < eventEndYear) activeExpenseAdjustment += event.amount;
      }
      if (event.event_type === 'home_purchase' && event.year <= year && event.monthly_expense_impact > 0) {
        activeExpenseAdjustment += event.monthly_expense_impact * 12;
      }
    });

    // Life events & Goals: asset impacts and withdrawals
    let eventImpact = 0;
    let yearGoalWithdrawal = 0;
    const liabilitiesWithPayoffGoals = new Set();
    const loansWithPayoffGoals = new Set();

    lifeEvents.forEach(event => {
      if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
        if (event.affects === 'assets') {
          const eventAmount = event.amount;
          eventImpact += eventAmount;
          
          if (eventAmount > 0 && event.allocation_method === 'custom') {
            portfolio.taxable.btc += eventAmount * ((event.btc_allocation || 0) / 100);
            portfolio.taxable.stocks += eventAmount * ((event.stocks_allocation || 0) / 100);
            portfolio.realEstate += eventAmount * ((event.real_estate_allocation || 0) / 100);
            portfolio.taxable.bonds += eventAmount * ((event.bonds_allocation || 0) / 100);
            portfolio.taxable.other += eventAmount * (((event.cash_allocation || 0) + (event.other_allocation || 0)) / 100);
          }
        }
        if (event.event_type === 'home_purchase' && event.year === year) {
          eventImpact -= (event.down_payment || 0);
        }
      }
    });

    // Goals: withdrawal and debt payoff
    goals.forEach(goal => {
      if ((goal.withdraw_from_portfolio || goal.will_be_spent) && goal.target_date && goal.type !== 'debt_payoff') {
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
            encumberedBtc[liability.id] += additionalBtcNeeded;
            portfolio.taxable.btc -= additionalBtcNeeded * cumulativeBtcPrice;
            liquidationEvents.push({
              year,
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
          
          liability.current_balance = newDebtBalance;
          encumberedBtc[liability.id] = remainingCollateralBtc;
          
          liquidationEvents.push({
            year,
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
            encumberedBtc[loanKey] += additionalBtcNeeded;
            portfolio.taxable.btc -= additionalBtcNeeded * cumulativeBtcPrice;
            liquidationEvents.push({
              year,
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
          
          loan.current_balance = newDebtBalance;
          encumberedBtc[loanKey] = remainingCollateralBtc;
          if (tempRunningDebt[loan.id]) tempRunningDebt[loan.id].current_balance = newDebtBalance;
          
          liquidationEvents.push({
            year,
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
                type: 'release',
                liabilityName: loan.name || loan.lender || 'BTC Loan',
                message: `Released ${excessCollateral.toFixed(4)} BTC (LTV ${postTopUpLTV.toFixed(1)}% → ${releaseTargetLTV}%)`
              });
            }
          }
        }
      }
    });

    // Apply growth AFTER collateral management
    if (i > 0) {
      ['taxable', 'taxDeferred', 'taxFree'].forEach(accountKey => {
        portfolio[accountKey].btc *= (1 + yearBtcGrowth / 100);
        portfolio[accountKey].stocks *= (1 + effectiveStocksCagr / 100);
        portfolio[accountKey].bonds *= (1 + bondsCagr / 100);
        portfolio[accountKey].cash *= (1 + cashCagr / 100);
        portfolio[accountKey].other *= (1 + otherCagr / 100);
      });
      portfolio.realEstate *= (1 + realEstateCagr / 100);
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
      
      // Can't contribute more than earned income
      const availableForContributions = Math.max(0, yearGrossIncome);
      let remainingIncome = availableForContributions;
      
      // 401k (pre-tax, reduces taxable income)
      year401k = Math.min(
        (contribution401k || 0) * Math.pow(1 + incomeGrowth / 100, i),
        yearLimit401k,
        remainingIncome
      );
      remainingIncome -= year401k;
      
      // Roth IRA - apply income phase-out
      const rothIncomeLimit = getRothIRAIncomeLimit(year, filingStatus);
      let rothPhaseOutMultiplier = 1;
      const adjustedGrossIncome = yearGrossIncome - year401k; // AGI for Roth limit
      if (adjustedGrossIncome >= rothIncomeLimit.phaseOutEnd) {
        rothPhaseOutMultiplier = 0;
      } else if (adjustedGrossIncome > rothIncomeLimit.phaseOutStart) {
        rothPhaseOutMultiplier = (rothIncomeLimit.phaseOutEnd - adjustedGrossIncome) / 
          (rothIncomeLimit.phaseOutEnd - rothIncomeLimit.phaseOutStart);
      }
      yearRoth = Math.min(
        (contributionRothIRA || 0) * Math.pow(1 + incomeGrowth / 100, i) * rothPhaseOutMultiplier,
        yearLimitRoth,
        remainingIncome
      );
      remainingIncome -= yearRoth;
      
      // Traditional IRA (pre-tax, reduces taxable income)
      yearTraditionalIRA = Math.min(
        (contributionTraditionalIRA || 0) * Math.pow(1 + incomeGrowth / 100, i),
        yearLimitTraditionalIRA,
        remainingIncome
      );
      remainingIncome -= yearTraditionalIRA;
      
      // HSA (pre-tax)
      yearHSA = Math.min(
        (contributionHSA || 0) * Math.pow(1 + incomeGrowth / 100, i),
        yearLimitHSA,
        remainingIncome
      );
      
      yearEmployerMatch = (employer401kMatch || 0) * Math.pow(1 + incomeGrowth / 100, i);
      
      const yearTaxableIncome = Math.max(0, yearGrossIncome - year401k - yearTraditionalIRA - yearHSA - currentStandardDeduction);
      const yearFederalTax = calculateProgressiveIncomeTax(yearTaxableIncome, filingStatus, year);
      const yearStateTax = calculateStateIncomeTax({ income: yearGrossIncome - year401k - yearTraditionalIRA - yearHSA, filingStatus, state: stateOfResidence, year });
      
      federalTaxPaid = yearFederalTax;
      stateTaxPaid = yearStateTax;
      taxesPaid = yearFederalTax + yearStateTax;
      // Net income = gross - taxes - pre-tax contributions (401k, Traditional IRA, HSA come from paycheck)
      const yearNetIncome = yearGrossIncome - taxesPaid - year401k - yearTraditionalIRA - yearHSA;

      const baseYearSpending = (currentAnnualSpending * Math.pow(1 + effectiveInflation / 100, i)) + activeExpenseAdjustment;
      yearSpending = i === 0 ? baseYearSpending * currentYearProRataFactor : baseYearSpending;
      
      const proRatedNetIncome = i === 0 ? yearNetIncome * currentYearProRataFactor : yearNetIncome;
      const proRatedYearRoth = i === 0 ? yearRoth * currentYearProRataFactor : yearRoth;
      yearSavings = proRatedNetIncome - yearSpending - proRatedYearRoth;
      cumulativeSavings += yearSavings;
      
      addToAccount('taxDeferred', year401k + yearTraditionalIRA + yearEmployerMatch);
      addToAccount('taxFree', yearRoth + yearHSA);

      if (yearSavings < 0) {
        const deficit = Math.abs(yearSavings);
        const taxableBalance = getAccountTotal('taxable');
        const taxDeferredBalance = getAccountTotal('taxDeferred');
        const taxFreeBalance = getAccountTotal('taxFree');
        const effectiveRunningTaxableBasis = Math.min(taxableBalance, runningTaxableBasis);
        const estimatedCurrentGainRatio = taxableBalance > 0 ? Math.max(0, (taxableBalance - effectiveRunningTaxableBasis) / taxableBalance) : 0;

        const taxEstimate = estimateRetirementWithdrawalTaxes({
          withdrawalNeeded: deficit,
          taxableBalance,
          taxDeferredBalance,
          taxFreeBalance,
          rothContributions: totalRothContributions,
          taxableGainPercent: estimatedCurrentGainRatio,
          isLongTermGain: true,
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
          taxableWithdrawal: taxEstimate.fromTaxable || 0,
          taxableGainPortion: (taxEstimate.fromTaxable || 0) * estimatedCurrentGainRatio,
          pensionIncome: 0,
          year: year,
        });
        
        federalTaxPaid += (taxEstimate.totalTax || 0);
        stateTaxPaid += preRetireStateTax;
        taxesPaid += (taxEstimate.totalTax || 0) + preRetireStateTax;
        penaltyPaid = taxEstimate.totalPenalty || 0;

        if (taxEstimate.fromTaxable > 0 && taxableBalance > 0) {
          const basisRatio = runningTaxableBasis / taxableBalance;
          runningTaxableBasis = Math.max(0, runningTaxableBasis - (taxEstimate.fromTaxable * basisRatio));
        }

        withdrawFromTaxable = withdrawFromAccount('taxable', taxEstimate.fromTaxable || 0);
        withdrawFromTaxDeferred = withdrawFromAccount('taxDeferred', taxEstimate.fromTaxDeferred || 0);
        withdrawFromTaxFree = withdrawFromAccount('taxFree', taxEstimate.fromTaxFree || 0);

        // Calculate total actually withdrawn
        const totalActuallyWithdrawn = (withdrawFromTaxable || 0) + (withdrawFromTaxDeferred || 0) + (withdrawFromTaxFree || 0);

        // If we couldn't withdraw enough to cover the deficit, we've run out of money
        if (totalActuallyWithdrawn < deficit) {
          ranOutOfMoneyThisYear = true;
          // Mark this as the depletion year - can't cover required spending
          if (firstDepletionAge === null) {
            firstDepletionAge = age;
          }
          // ZERO OUT THE PORTFOLIO - can't recover from this
          portfolio.taxable = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
          portfolio.taxDeferred = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
          portfolio.taxFree = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
          portfolio.realEstate = 0;
        }

        if (getTotalPortfolio() <= 0) {
          ranOutOfMoneyThisYear = true;
          if (firstDepletionAge === null) {
            firstDepletionAge = age;
          }
        }
      } else if (yearSavings > 0) {
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
      const totalRetirementIncome = otherRetirementIncome + socialSecurityIncome;
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

      const taxEstimate = estimateRetirementWithdrawalTaxes({
        withdrawalNeeded: cappedWithdrawal,
        taxableBalance,
        taxDeferredBalance,
        taxFreeBalance,
        rothContributions: totalRothContributions,
        taxableGainPercent: estimatedCurrentGainRatio,
        isLongTermGain: true,
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
        taxableWithdrawal: taxEstimate.fromTaxable || 0,
        taxableGainPortion: (taxEstimate.fromTaxable || 0) * estimatedCurrentGainRatio,
        pensionIncome: otherRetirementIncome,
        year: year,
      });

      federalTaxPaid = federalTaxOnOtherIncome + (taxEstimate.totalTax || 0);
      stateTaxPaid = stateTax;
      taxesPaid = federalTaxOnOtherIncome + (taxEstimate.totalTax || 0) + stateTax;
      penaltyPaid = taxEstimate.totalPenalty || 0;

      const totalNeededFromAccounts = cappedWithdrawal + (taxEstimate.totalTax || 0) + stateTax + penaltyPaid;
      
      const totalTaxEstimate = estimateRetirementWithdrawalTaxes({
        withdrawalNeeded: totalNeededFromAccounts,
        taxableBalance: getAccountTotal('taxable'),
        taxDeferredBalance: getAccountTotal('taxDeferred'),
        taxFreeBalance: getAccountTotal('taxFree'),
        rothContributions: totalRothContributions,
        taxableGainPercent: estimatedCurrentGainRatio,
        isLongTermGain: true,
        filingStatus,
        age: age,
        otherIncome: totalOtherIncomeForTax,
        year: year,
        inflationRate: effectiveInflation / 100,
      });

      const requestedFromTaxable = totalTaxEstimate.fromTaxable || 0;
      const requestedFromTaxDeferred = totalTaxEstimate.fromTaxDeferred || 0;
      const requestedFromTaxFree = totalTaxEstimate.fromTaxFree || 0;

      if (requestedFromTaxable > 0 && getAccountTotal('taxable') > 0) {
        const basisRatio = runningTaxableBasis / getAccountTotal('taxable');
        runningTaxableBasis = Math.max(0, runningTaxableBasis - (requestedFromTaxable * basisRatio));
      }

      withdrawFromTaxable = withdrawFromAccount('taxable', requestedFromTaxable);
      const actualFromTaxDeferred = withdrawFromAccount('taxDeferred', requestedFromTaxDeferred);
      withdrawFromTaxFree = withdrawFromAccount('taxFree', requestedFromTaxFree);
      withdrawFromTaxDeferred = rmdWithdrawn + actualFromTaxDeferred;

      let totalWithdrawnFromAccounts = withdrawFromTaxable + withdrawFromTaxDeferred + withdrawFromTaxFree;
      
      const fullWithdrawalNeed = totalWithdrawalForTaxCalculation + (taxEstimate.totalTax || 0) + stateTax + penaltyPaid;
      let remainingShortfall = fullWithdrawalNeed - totalWithdrawnFromAccounts;
      
      // Force additional withdrawals if shortfall
      if (remainingShortfall > 0) {
        const taxableRemaining = getAccountTotal('taxable');
        if (taxableRemaining > 0) {
          const forceFromTaxable = Math.min(remainingShortfall, taxableRemaining);
          withdrawFromAccount('taxable', forceFromTaxable);
          withdrawFromTaxable += forceFromTaxable;
          totalWithdrawnFromAccounts += forceFromTaxable;
          remainingShortfall -= forceFromTaxable;
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
            
            const costBasisPercent = 0.5;
            const gainOnSale = debtToPay * (1 - costBasisPercent);
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

      if (getTotalPortfolio() <= 0) ranOutOfMoneyThisYear = true;
    }

    // Calculate totals
    const currentTotalEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
    const encumberedBtcValueThisYear = currentTotalEncumberedBtc * cumulativeBtcPrice;
    
    const liquidAssetsAfterYear = getTotalLiquid() + portfolio.realEstate;
    if (liquidAssetsAfterYear <= 0 && firstDepletionAge === null) {
      firstDepletionAge = age;
      ranOutOfMoneyThisYear = true;
    } else if (liquidAssetsAfterYear > 0 && firstDepletionAge !== null) {
      firstDepletionAge = null;
    }

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
      ? Math.round((desiredWithdrawal || 0) + (taxesPaid || 0) + (penaltyPaid || 0))
      : yearSavings < 0 
        ? Math.round(Math.abs(yearSavings) + (taxesPaid || 0) + (penaltyPaid || 0))
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
      netCashFlow: Math.round(yearSavings),
      yearGrossIncome: !isRetired ? Math.round(yearGrossIncome) : 0,
      yearSpending: !isRetired ? Math.round(yearSpending) : 0,
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
        goals.some(g => (g.withdraw_from_portfolio || g.will_be_spent) && g.target_date && new Date(g.target_date).getFullYear() === year),
      hasGoalWithdrawal: yearGoalWithdrawal > 0,
      goalNames: [],
      
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