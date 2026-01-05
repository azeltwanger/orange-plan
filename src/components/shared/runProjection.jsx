import { getRMDFactor } from '@/components/shared/taxData';

/**
 * Unified projection engine used by both:
 * 1. The Wealth Projection chart (projections useMemo)
 * 2. runProjectionForRetirementAge for earliest retirement age calculation
 * 
 * This ensures both calculations produce IDENTICAL results.
 */
export function runUnifiedProjection({
  // Portfolio state
  holdings,
  accounts,
  liabilities,
  collateralizedLoans,
  currentPrice,
  
  // User settings
  currentAge,
  retirementAge,
  lifeExpectancy,
  retirementAnnualSpending,
  effectiveSocialSecurity,
  socialSecurityStartAge,
  otherRetirementIncome,
  annualSavings,
  incomeGrowth,
  
  // Growth rates
  getBtcGrowthRate,
  effectiveInflation,
  effectiveStocksCagr,
  bondsCagr,
  realEstateCagr,
  cashCagr,
  otherCagr,
  
  // Savings allocation
  savingsAllocationBtc,
  savingsAllocationStocks,
  savingsAllocationBonds,
  savingsAllocationCash,
  savingsAllocationOther,
  
  // BTC collateral settings
  autoTopUpBtcCollateral,
  btcTopUpTriggerLtv,
  btcTopUpTargetLtv,
  btcReleaseTargetLtv,
  
  // Goals and life events
  goals = [],
  lifeEvents = [],
  
  // Helper function to determine tax treatment
  getTaxTreatmentFromHolding,
  
  // Debug mode
  DEBUG = false,
}) {
  const results = [];
  const currentYear = new Date().getFullYear();
  
  // Initialize portfolio structure from current holdings
  const portfolio = {
    taxable: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
    taxDeferred: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
    taxFree: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
    realEstate: 0,
  };
  
  // Helper to categorize asset type
  const getAssetCategory = (assetType, ticker) => {
    const tickerUpper = ticker?.toUpperCase() || '';
    const assetTypeLower = assetType?.toLowerCase() || '';
    
    if (tickerUpper === 'BTC' || assetTypeLower === 'btc' || assetTypeLower === 'crypto') return 'btc';
    if (assetTypeLower === 'stocks') return 'stocks';
    if (assetTypeLower === 'bonds') return 'bonds';
    if (assetTypeLower === 'cash') return 'cash';
    return 'other';
  };
  
  // Initialize from holdings
  holdings.forEach(h => {
    const value = h.ticker === 'BTC' ? h.quantity * currentPrice : h.quantity * (h.current_price || 0);
    const taxTreatment = getTaxTreatmentFromHolding(h);
    const assetCategory = getAssetCategory(h.asset_type, h.ticker);
    
    if (taxTreatment === 'real_estate') {
      portfolio.realEstate += value;
    } else {
      const accountKey = taxTreatment === 'tax_deferred' ? 'taxDeferred' : 
                        taxTreatment === 'tax_free' ? 'taxFree' : 'taxable';
      portfolio[accountKey][assetCategory] += value;
    }
  });
  
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
  
  // Track debt balances
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
  
  // Track encumbered BTC
  const encumberedBtc = {};
  let releasedBtc = {};
  
  liabilities.forEach(liability => {
    if (liability.type === 'btc_collateralized' && liability.collateral_btc_amount) {
      encumberedBtc[liability.id] = liability.collateral_btc_amount;
    }
  });
  
  collateralizedLoans.forEach(loan => {
    if (loan.collateral_btc_amount) {
      const loanKey = `loan_${loan.id}`;
      encumberedBtc[loanKey] = loan.collateral_btc_amount;
    }
  });
  
  // Subtract encumbered BTC from taxable portfolio
  const totalInitialEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
  const initialEncumberedBtcValue = totalInitialEncumberedBtc * currentPrice;
  portfolio.taxable.btc = Math.max(0, portfolio.taxable.btc - initialEncumberedBtcValue);
  
  const birthYear = currentYear - currentAge;
  const rmdStartAge = birthYear <= 1950 ? 72 : birthYear <= 1959 ? 73 : 75;
  
  let cumulativeBtcPrice = currentPrice;
  let firstDepletionAge = null;
  const years = lifeExpectancy - currentAge;
  
  // Main projection loop
  for (let i = 0; i <= years; i++) {
    const year = currentYear + i;
    const age = currentAge + i;
    const isRetired = age >= retirementAge;
    const yearsFromNow = i;
    
    // Get BTC growth rate for this year
    const yearBtcGrowth = getBtcGrowthRate(yearsFromNow, effectiveInflation);
    
    // Apply growth (after year 0)
    if (i > 0) {
      cumulativeBtcPrice = cumulativeBtcPrice * (1 + yearBtcGrowth / 100);
      
      ['taxable', 'taxDeferred', 'taxFree'].forEach(accountKey => {
        portfolio[accountKey].btc *= (1 + yearBtcGrowth / 100);
        portfolio[accountKey].stocks *= (1 + effectiveStocksCagr / 100);
        portfolio[accountKey].bonds *= (1 + bondsCagr / 100);
        portfolio[accountKey].cash *= (1 + cashCagr / 100);
        portfolio[accountKey].other *= (1 + otherCagr / 100);
      });
      portfolio.realEstate *= (1 + realEstateCagr / 100);
    }
    
    // Process released collateral from previous year
    const totalReleasedBtcValueThisYear = Object.values(releasedBtc).reduce((sum, btcAmount) => {
      return sum + (btcAmount * cumulativeBtcPrice);
    }, 0);
    if (totalReleasedBtcValueThisYear > 0) {
      portfolio.taxable.btc += totalReleasedBtcValueThisYear;
    }
    releasedBtc = {};
    
    // Calculate active income/expense adjustments for THIS year
    let activeIncomeAdjustment = 0;
    let activeExpenseAdjustment = 0;
    
    lifeEvents.forEach(event => {
      if (event.event_type === 'income_change') {
        const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
        const isActive = year >= event.year && year < eventEndYear;
        if (isActive) activeIncomeAdjustment += event.amount;
      }
      
      if (event.event_type === 'expense_change') {
        const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
        const isActive = year >= event.year && year < eventEndYear;
        if (isActive) activeExpenseAdjustment += event.amount;
      }
      
      if (event.event_type === 'home_purchase' && event.year <= year && event.monthly_expense_impact > 0) {
        activeExpenseAdjustment += event.monthly_expense_impact * 12;
      }
    });
    
    // Process debt payments and BTC collateral management
    const processLoanCollateral = (loan, loanKey, isCollateralizedLoan = false) => {
      if (loan.paid_off) return;
      
      const hasInterest = loan.interest_rate && loan.interest_rate > 0;
      const isBtcLoan = loan.type === 'btc_collateralized' || isCollateralizedLoan;
      
      // Accrue interest (daily compounding for BTC loans, annual for regular)
      if (hasInterest && i > 0) {
        if (isBtcLoan) {
          const dailyRate = loan.interest_rate / 100 / 365;
          const daysInYear = 365;
          loan.current_balance = loan.current_balance * Math.pow(1 + dailyRate, daysInYear);
        } else {
          const annualInterest = loan.current_balance * (loan.interest_rate / 100);
          loan.current_balance += annualInterest;
        }
      }
      
      // BTC collateral management
      if (isBtcLoan && encumberedBtc[loanKey] > 0) {
        const yearBtcPrice = cumulativeBtcPrice;
        const collateralValue = encumberedBtc[loanKey] * yearBtcPrice;
        let currentLTV = (loan.current_balance / collateralValue) * 100;
        
        const liquidationLTV = loan.liquidation_ltv || 80;
        const releaseLTV = loan.collateral_release_ltv || 30;
        const triggerLTV = btcTopUpTriggerLtv || 70;
        const targetLTV = btcTopUpTargetLtv || 65;
        const releaseTargetLTV = btcReleaseTargetLtv || 40;
        
        // Auto Top-up
        if (autoTopUpBtcCollateral && currentLTV >= triggerLTV && currentLTV < liquidationLTV) {
          const targetCollateralValue = loan.current_balance / (targetLTV / 100);
          const additionalBtcNeeded = (targetCollateralValue / yearBtcPrice) - encumberedBtc[loanKey];
          const liquidBtcAvailable = portfolio.taxable.btc / yearBtcPrice;
          
          if (additionalBtcNeeded > 0 && liquidBtcAvailable >= additionalBtcNeeded) {
            encumberedBtc[loanKey] += additionalBtcNeeded;
            portfolio.taxable.btc -= additionalBtcNeeded * yearBtcPrice;
          }
        }
        
        // Recalculate LTV after potential top-up
        const postTopUpCollateralValue = encumberedBtc[loanKey] * yearBtcPrice;
        const postTopUpLTV = (loan.current_balance / postTopUpCollateralValue) * 100;
        
        // Liquidation at 80% LTV
        if (postTopUpLTV >= liquidationLTV) {
          const totalCollateralBtc = encumberedBtc[loanKey];
          const debtBalance = loan.current_balance;
          const btcNeededToPayOff = debtBalance / yearBtcPrice;
          
          const btcToSell = Math.min(btcNeededToPayOff, totalCollateralBtc);
          const proceedsFromSale = btcToSell * yearBtcPrice;
          const newDebtBalance = Math.max(0, debtBalance - proceedsFromSale);
          const remainingCollateralBtc = totalCollateralBtc - btcToSell;
          
          loan.current_balance = newDebtBalance;
          encumberedBtc[loanKey] = remainingCollateralBtc;
          
          if (newDebtBalance <= 0.01) {
            loan.paid_off = true;
            if (remainingCollateralBtc > 0) {
              releasedBtc[loanKey] = (releasedBtc[loanKey] || 0) + remainingCollateralBtc;
              encumberedBtc[loanKey] = 0;
            }
          }
        }
        // Release excess collateral when LTV drops below 30%
        else if (postTopUpLTV <= releaseLTV) {
          if (loan.current_balance <= 0) {
            if (!releasedBtc[loanKey]) {
              releasedBtc[loanKey] = encumberedBtc[loanKey];
              encumberedBtc[loanKey] = 0;
            }
          } else {
            const currentCollateral = encumberedBtc[loanKey];
            const targetCollateralForLoan = loan.current_balance / (releaseTargetLTV / 100) / yearBtcPrice;
            const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
            
            if (excessCollateral > 0) {
              releasedBtc[loanKey] = excessCollateral;
              encumberedBtc[loanKey] = targetCollateralForLoan;
            }
          }
        }
      }
    };
    
    // Process regular liabilities
    Object.values(tempRunningDebt).forEach(liability => {
      processLoanCollateral(liability, liability.id, false);
    });
    
    // Process collateralized loans
    Object.values(tempRunningCollateralizedLoans).forEach(loan => {
      processLoanCollateral(loan, `loan_${loan.id}`, true);
    });
    
    // Process goals that withdraw from portfolio
    let yearGoalWithdrawal = 0;
    goals.forEach(goal => {
      if (goal.withdraw_from_portfolio || goal.will_be_spent) {
        if (goal.target_date) {
          const goalYear = new Date(goal.target_date).getFullYear();
          if (goalYear === year) {
            yearGoalWithdrawal += goal.target_amount || 0;
          }
        }
      }
      
      // Debt payoff goals
      if (goal.type === 'debt_payoff' && goal.linked_liability_id) {
        const payoffStrategy = goal.payoff_strategy || 'minimum';
        
        if (payoffStrategy === 'extra' && goal.extra_monthly_payment > 0) {
          // Extra monthly payments
          const targetYear = goal.target_date ? new Date(goal.target_date).getFullYear() : currentYear;
          if (year >= targetYear) {
            yearGoalWithdrawal += goal.extra_monthly_payment * 12;
          }
        } else if (payoffStrategy === 'lump_sum' && goal.lump_sum_date) {
          const lumpSumYear = new Date(goal.lump_sum_date).getFullYear();
          if (year === lumpSumYear) {
            yearGoalWithdrawal += goal.target_amount || 0;
          }
        }
      }
    });
    
    let yearWithdrawal = 0;
    let ranOutOfMoneyThisYear = false;
    
    if (isRetired) {
      // Calculate spending need (inflation-adjusted from retirement age)
      const yearsIntoRetirement = age - retirementAge;
      const nominalSpendingAtRetirement = retirementAnnualSpending * Math.pow(1 + effectiveInflation / 100, Math.max(0, retirementAge - currentAge));
      const inflatedSpending = nominalSpendingAtRetirement * Math.pow(1 + effectiveInflation / 100, yearsIntoRetirement);
      
      // Calculate Social Security income
      let ssIncome = 0;
      if (age >= socialSecurityStartAge && effectiveSocialSecurity > 0) {
        const yearsToSSStart = Math.max(0, socialSecurityStartAge - currentAge);
        const yearsReceivingSS = age - socialSecurityStartAge;
        ssIncome = effectiveSocialSecurity * 
          Math.pow(1 + effectiveInflation / 100, yearsToSSStart) * 
          Math.pow(1 + effectiveInflation / 100, yearsReceivingSS);
      }
      
      // Inflate other retirement income from today
      const inflatedOtherIncome = (otherRetirementIncome || 0) * Math.pow(1 + effectiveInflation / 100, yearsFromNow);
      
      // Calculate RMD if applicable
      let rmdAmount = 0;
      let rmdWithdrawn = 0;
      const taxDeferredBalance = getAccountTotal('taxDeferred');
      if (age >= rmdStartAge && taxDeferredBalance > 0) {
        const rmdFactor = getRMDFactor(age);
        if (rmdFactor > 0) {
          rmdAmount = taxDeferredBalance / rmdFactor;
        }
      }
      
      // Withdraw RMD from tax-deferred first
      if (rmdAmount > 0) {
        rmdWithdrawn = withdrawFromAccount('taxDeferred', rmdAmount);
      }
      
      // Net spending need after SS, other income, and RMD
      const netSpendingNeed = Math.max(0, inflatedSpending - ssIncome - rmdWithdrawn - inflatedOtherIncome);
      
      // Add goal withdrawals
      const totalWithdrawalNeed = netSpendingNeed + yearGoalWithdrawal;
      
      // Estimate tax on withdrawal
      const estimatedTaxRate = 0.20;
      const grossWithdrawalNeeded = totalWithdrawalNeed > 0 ? totalWithdrawalNeed / (1 - estimatedTaxRate) : 0;
      
      yearWithdrawal = grossWithdrawalNeeded;
      
      if (DEBUG && (age % 5 === 0 || age === retirementAge || getTotalLiquid() < 500000)) {
        console.log(`Age ${age}: Liquid=$${Math.round(getTotalLiquid())}, RE=$${Math.round(portfolio.realEstate)}, Spending=$${Math.round(inflatedSpending)}, SS=$${Math.round(ssIncome)}, OtherInc=$${Math.round(inflatedOtherIncome)}, RMD=$${Math.round(rmdWithdrawn)}, GrossWithdraw=$${Math.round(grossWithdrawalNeeded)}`);
      }
      
      if (grossWithdrawalNeeded > 0) {
        let remaining = grossWithdrawalNeeded;
        
        // Withdrawal priority: Taxable -> Tax-Deferred -> Tax-Free -> Real Estate
        remaining -= withdrawFromAccount('taxable', remaining);
        if (remaining > 0) remaining -= withdrawFromAccount('taxDeferred', remaining);
        if (remaining > 0) remaining -= withdrawFromAccount('taxFree', remaining);
        
        // Real Estate (last resort)
        if (remaining > 0 && portfolio.realEstate > 0) {
          const fromRE = Math.min(remaining, portfolio.realEstate);
          portfolio.realEstate -= fromRE;
          remaining -= fromRE;
        }
        
        // Check if we couldn't meet spending need (>5% shortfall = failure)
        if (remaining > grossWithdrawalNeeded * 0.05) {
          ranOutOfMoneyThisYear = true;
          if (firstDepletionAge === null) {
            firstDepletionAge = age;
          }
        }
      }
    } else {
      // Pre-retirement: add savings
      const adjustedAnnualSavings = annualSavings + activeIncomeAdjustment - activeExpenseAdjustment;
      const inflatedSavings = adjustedAnnualSavings * Math.pow(1 + incomeGrowth / 100, yearsFromNow);
      
      if (inflatedSavings > 0) {
        const totalAlloc = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
        if (totalAlloc > 0) {
          portfolio.taxable.btc += inflatedSavings * (savingsAllocationBtc / totalAlloc);
          portfolio.taxable.stocks += inflatedSavings * (savingsAllocationStocks / totalAlloc);
          portfolio.taxable.bonds += inflatedSavings * (savingsAllocationBonds / totalAlloc);
          portfolio.taxable.cash += inflatedSavings * (savingsAllocationCash / totalAlloc);
          portfolio.taxable.other += inflatedSavings * (savingsAllocationOther / totalAlloc);
        } else {
          portfolio.taxable.btc += inflatedSavings;
        }
      } else if (inflatedSavings < 0) {
        // Negative savings = withdrawing pre-retirement
        let deficit = Math.abs(inflatedSavings);
        deficit -= withdrawFromAccount('taxable', deficit);
        if (deficit > 0) deficit -= withdrawFromAccount('taxDeferred', deficit);
        if (deficit > 0) deficit -= withdrawFromAccount('taxFree', deficit);
        
        if (deficit > 0 && portfolio.realEstate > 0) {
          const fromRE = Math.min(deficit, portfolio.realEstate);
          portfolio.realEstate -= fromRE;
          deficit -= fromRE;
        }
        
        if (deficit > Math.abs(inflatedSavings) * 0.05) {
          ranOutOfMoneyThisYear = true;
          if (firstDepletionAge === null) {
            firstDepletionAge = age;
          }
        }
      }
    }
    
    // Calculate encumbered BTC value
    const currentTotalEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
    const encumberedBtcValueThisYear = currentTotalEncumberedBtc * cumulativeBtcPrice;
    
    // Check for depletion
    const liquidAssetsAfterYear = getTotalLiquid() + portfolio.realEstate;
    if (liquidAssetsAfterYear <= 0 && firstDepletionAge === null) {
      firstDepletionAge = age;
      ranOutOfMoneyThisYear = true;
    }
    
    results.push({
      year,
      age,
      isRetired,
      total: getTotalPortfolio(encumberedBtcValueThisYear),
      liquid: getTotalLiquid(),
      realEstate: portfolio.realEstate,
      taxable: getAccountTotal('taxable'),
      taxDeferred: getAccountTotal('taxDeferred'),
      taxFree: getAccountTotal('taxFree'),
      encumberedBtcValue: encumberedBtcValueThisYear,
      yearWithdrawal,
      depleted: ranOutOfMoneyThisYear,
      btcPrice: cumulativeBtcPrice,
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