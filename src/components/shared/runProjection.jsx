import { getRMDFactor } from '@/components/shared/taxData';
import { 
  estimateRetirementWithdrawalTaxes, 
  calculateTaxableSocialSecurity,
  calculateProgressiveIncomeTax,
  getLTCGRate
} from '@/components/tax/taxCalculations';
import { calculateStateTaxOnRetirement, calculateStateIncomeTax } from '@/components/shared/stateTaxConfig';
import { getTaxConfigForYear, get401kLimit, getRothIRALimit, getHSALimit } from '@/components/shared/taxConfig';

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
  btcReleaseTargetLtv,
  goals = [],
  lifeEvents = [],
  getTaxTreatmentFromHolding,
  DEBUG = false,
}) {
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
  let cumulativeBtcPrice = currentPrice;

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

    let socialSecurityIncome = 0;
    let rmdAmount = 0;
    let rmdWithdrawn = 0;
    let excessRmd = 0;
    let taxesPaid = 0;
    let penaltyPaid = 0;
    let withdrawFromTaxable = 0;
    let withdrawFromTaxDeferred = 0;
    let withdrawFromTaxFree = 0;
    let withdrawFromRealEstate = 0;
    let realEstateSaleProceeds = 0;
    let fromLoanPayoff = 0;
    const yearLoanPayoffs = [];

    // BTC growth and price tracking
    const yearBtcGrowth = getBtcGrowthRate(yearsFromNow, effectiveInflation);
    if (i > 0) {
      cumulativeBtcPrice = cumulativeBtcPrice * (1 + yearBtcGrowth / 100);
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
              liability.paid_off = true;
              break;
            }

            const monthlyInterest = hasInterest ? remainingBalance * (liability.interest_rate / 100 / 12) : 0;
            const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
            const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);
            
            remainingBalance = Math.max(0, remainingBalance - principalPayment);
            actualAnnualDebtPayments += paymentThisMonth;
          }
          liability.current_balance = remainingBalance;
          if (remainingBalance <= 0.01) liability.paid_off = true;
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
        const releaseLTV = liability.collateral_release_ltv || 30;
        const triggerLTV = btcTopUpTriggerLtv || 70;
        const targetLTV = btcTopUpTargetLtv || 65;
        const releaseTargetLTV = btcReleaseTargetLtv || 40;

        // Auto Top-up
        if (autoTopUpBtcCollateral && currentLTV >= triggerLTV && currentLTV < liquidationLTV) {
          const targetCollateralValue = liability.current_balance / (targetLTV / 100);
          const additionalBtcNeeded = (targetCollateralValue / cumulativeBtcPrice) - encumberedBtc[liability.id];
          const liquidBtcAvailable = portfolio.taxable.btc / cumulativeBtcPrice;
          
          if (additionalBtcNeeded > 0 && liquidBtcAvailable >= additionalBtcNeeded) {
            encumberedBtc[liability.id] += additionalBtcNeeded;
            portfolio.taxable.btc -= additionalBtcNeeded * cumulativeBtcPrice;
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
            }
          } else {
            const currentCollateral = encumberedBtc[liability.id];
            const targetCollateralForLoan = liability.current_balance / (releaseTargetLTV / 100) / cumulativeBtcPrice;
            const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
            if (excessCollateral > 0) {
              releasedBtc[liability.id] = excessCollateral;
              encumberedBtc[liability.id] = targetCollateralForLoan;
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
              loan.paid_off = true;
              break;
            }
            const monthlyInterest = hasInterest ? remainingBalance * (loan.interest_rate / 100 / 12) : 0;
            const principalPayment = Math.max(0, loan.minimum_monthly_payment - monthlyInterest);
            const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, loan.minimum_monthly_payment);
            remainingBalance = Math.max(0, remainingBalance - principalPayment);
            actualAnnualDebtPayments += paymentThisMonth;
          }
          loan.current_balance = remainingBalance;
          if (remainingBalance <= 0.01) loan.paid_off = true;
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
        const releaseLTV = loan.collateral_release_ltv || 30;
        const triggerLTV = btcTopUpTriggerLtv || 70;
        const targetLTV = btcTopUpTargetLtv || 65;
        const releaseTargetLTV = btcReleaseTargetLtv || 40;

        // Auto Top-up
        if (autoTopUpBtcCollateral && currentLTV >= triggerLTV && currentLTV < liquidationLTV) {
          const targetCollateralValue = loan.current_balance / (targetLTV / 100);
          const additionalBtcNeeded = (targetCollateralValue / cumulativeBtcPrice) - encumberedBtc[loanKey];
          const liquidBtcAvailable = portfolio.taxable.btc / cumulativeBtcPrice;
          
          if (additionalBtcNeeded > 0 && liquidBtcAvailable >= additionalBtcNeeded) {
            encumberedBtc[loanKey] += additionalBtcNeeded;
            portfolio.taxable.btc -= additionalBtcNeeded * cumulativeBtcPrice;
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
            }
          } else {
            const currentCollateral = encumberedBtc[loanKey];
            const targetCollateralForLoan = loan.current_balance / (releaseTargetLTV / 100) / cumulativeBtcPrice;
            const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
            if (excessCollateral > 0) {
              releasedBtc[loanKey] = excessCollateral;
              encumberedBtc[loanKey] = targetCollateralForLoan;
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
      const yearGrossIncome = baseGrossIncome + activeIncomeAdjustment;
      
      const yearLimit401k = get401kLimit(year, age);
      const yearLimitRoth = getRothIRALimit(year, age);
      const yearLimitHSA = getHSALimit(year, age, hsaFamilyCoverage);
      
      const year401k = Math.min((contribution401k || 0) * Math.pow(1 + incomeGrowth / 100, i), yearLimit401k);
      const yearRoth = Math.min((contributionRothIRA || 0) * Math.pow(1 + incomeGrowth / 100, i), yearLimitRoth);
      const yearHSA = Math.min((contributionHSA || 0) * Math.pow(1 + incomeGrowth / 100, i), yearLimitHSA);
      const yearEmployerMatch = (employer401kMatch || 0) * Math.pow(1 + incomeGrowth / 100, i);
      
      const yearTaxableIncome = Math.max(0, yearGrossIncome - year401k - yearHSA - currentStandardDeduction);
      const yearFederalTax = calculateProgressiveIncomeTax(yearTaxableIncome, filingStatus, year);
      const yearStateTax = calculateStateIncomeTax({ income: yearGrossIncome - year401k - yearHSA, filingStatus, state: stateOfResidence, year });
      
      taxesPaid = yearFederalTax + yearStateTax;
      const yearNetIncome = yearGrossIncome - taxesPaid;

      const baseYearSpending = (currentAnnualSpending * Math.pow(1 + effectiveInflation / 100, i)) + activeExpenseAdjustment;
      const yearSpending = i === 0 ? baseYearSpending * currentYearProRataFactor : baseYearSpending;
      
      const proRatedNetIncome = i === 0 ? yearNetIncome * currentYearProRataFactor : yearNetIncome;
      const proRatedYearRoth = i === 0 ? yearRoth * currentYearProRataFactor : yearRoth;
      const yearSavings = proRatedNetIncome - yearSpending - proRatedYearRoth;
      
      addToAccount('taxDeferred', year401k + yearEmployerMatch);
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
        
        taxesPaid += (taxEstimate.totalTax || 0) + preRetireStateTax;
        penaltyPaid = taxEstimate.totalPenalty || 0;

        if (taxEstimate.fromTaxable > 0 && taxableBalance > 0) {
          const basisRatio = runningTaxableBasis / taxableBalance;
          runningTaxableBasis = Math.max(0, runningTaxableBasis - (taxEstimate.fromTaxable * basisRatio));
        }

        withdrawFromTaxable = withdrawFromAccount('taxable', taxEstimate.fromTaxable || 0);
        withdrawFromTaxDeferred = withdrawFromAccount('taxDeferred', taxEstimate.fromTaxDeferred || 0);
        withdrawFromTaxFree = withdrawFromAccount('taxFree', taxEstimate.fromTaxFree || 0);

        if (getTotalPortfolio() <= 0) ranOutOfMoneyThisYear = true;
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
      const desiredWithdrawal = i === 0 ? baseDesiredWithdrawal * currentYearProRataFactor : baseDesiredWithdrawal;

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

      // Social Security
      if (age >= socialSecurityStartAge && effectiveSocialSecurity > 0) {
        const yearsToSSStart = Math.max(0, socialSecurityStartAge - currentAge);
        const yearsReceivingSS = age - socialSecurityStartAge;
        socialSecurityIncome = effectiveSocialSecurity * 
          Math.pow(1 + effectiveInflation / 100, yearsToSSStart) * 
          Math.pow(1 + effectiveInflation / 100, yearsReceivingSS);
      }

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
      
      // CRITICAL: Calculate shortfall against FULL need (spending + taxes), not capped amount
      // This ensures we tap real estate when liquid assets aren't enough
      const fullWithdrawalNeed = totalWithdrawalForTaxCalculation + (taxEstimate.totalTax || 0) + stateTax + penaltyPaid;
      let remainingShortfall = fullWithdrawalNeed - totalWithdrawnFromAccounts;
      
      if (DEBUG || remainingShortfall > 1000) {
        console.log("SHORTFALL_CALC", {
          age,
          fullNeed: fullWithdrawalNeed,
          totalWithdrawn: totalWithdrawnFromAccounts,
          remainingShortfall,
          liquidAvailable: getTotalLiquid(),
          realEstate: portfolio.realEstate,
          willTriggerRE: remainingShortfall > 0 && portfolio.realEstate > 0
        });
      }
      
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

    results.push({
      year,
      age,
      isRetired,
      total: getTotalPortfolio(encumberedBtcValueThisYear),
      liquid: getTotalLiquid(),
      depleted: ranOutOfMoneyThisYear,
    });
  }
  
  const survives = firstDepletionAge === null;
  const finalYear = results[results.length - 1];
  
  console.log("UNIFIED_V2", { age: retirementAge, survives, depletionAge: firstDepletionAge });
  
  return {
    survives,
    finalPortfolio: finalYear?.total || 0,
    depleteAge: firstDepletionAge,
    yearByYear: results,
  };
}