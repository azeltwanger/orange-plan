// US Federal Tax Data for 2018-2025 (Historical)

// Historical Standard Deductions
export const STANDARD_DEDUCTIONS = {
  2018: { single: 12000, married: 24000 },
  2019: { single: 12200, married: 24400 },
  2020: { single: 12400, married: 24800 },
  2021: { single: 12550, married: 25100 },
  2022: { single: 12950, married: 25900 },
  2023: { single: 13850, married: 27700 },
  2024: { single: 14600, married: 29200 },
  2025: { single: 15750, married: 31500 },
};

// Historical Income Tax Brackets
export const INCOME_TAX_BRACKETS = {
  2018: {
    single: {
      income: [
        { min: 0, max: 9525, rate: 0.10, label: '10%' },
        { min: 9525, max: 38700, rate: 0.12, label: '12%' },
        { min: 38700, max: 82500, rate: 0.22, label: '22%' },
        { min: 82500, max: 157500, rate: 0.24, label: '24%' },
        { min: 157500, max: 200000, rate: 0.32, label: '32%' },
        { min: 200000, max: 500000, rate: 0.35, label: '35%' },
        { min: 500000, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 38600, rate: 0, label: '0%' },
        { min: 38600, max: 425800, rate: 0.15, label: '15%' },
        { min: 425800, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    married: {
      income: [
        { min: 0, max: 19050, rate: 0.10, label: '10%' },
        { min: 19050, max: 77400, rate: 0.12, label: '12%' },
        { min: 77400, max: 165000, rate: 0.22, label: '22%' },
        { min: 165000, max: 315000, rate: 0.24, label: '24%' },
        { min: 315000, max: 400000, rate: 0.32, label: '32%' },
        { min: 400000, max: 600000, rate: 0.35, label: '35%' },
        { min: 600000, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 77200, rate: 0, label: '0%' },
        { min: 77200, max: 479000, rate: 0.15, label: '15%' },
        { min: 479000, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
  },
  2019: {
    single: {
      income: [
        { min: 0, max: 9700, rate: 0.10, label: '10%' },
        { min: 9700, max: 39475, rate: 0.12, label: '12%' },
        { min: 39475, max: 84200, rate: 0.22, label: '22%' },
        { min: 84200, max: 160725, rate: 0.24, label: '24%' },
        { min: 160725, max: 204100, rate: 0.32, label: '32%' },
        { min: 204100, max: 510300, rate: 0.35, label: '35%' },
        { min: 510300, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 39375, rate: 0, label: '0%' },
        { min: 39375, max: 434550, rate: 0.15, label: '15%' },
        { min: 434550, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    married: {
      income: [
        { min: 0, max: 19400, rate: 0.10, label: '10%' },
        { min: 19400, max: 78950, rate: 0.12, label: '12%' },
        { min: 78950, max: 168400, rate: 0.22, label: '22%' },
        { min: 168400, max: 321450, rate: 0.24, label: '24%' },
        { min: 321450, max: 408200, rate: 0.32, label: '32%' },
        { min: 408200, max: 612350, rate: 0.35, label: '35%' },
        { min: 612350, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 78750, rate: 0, label: '0%' },
        { min: 78750, max: 488850, rate: 0.15, label: '15%' },
        { min: 488850, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
  },
  2020: {
    single: {
      income: [
        { min: 0, max: 9875, rate: 0.10, label: '10%' },
        { min: 9875, max: 40125, rate: 0.12, label: '12%' },
        { min: 40125, max: 85525, rate: 0.22, label: '22%' },
        { min: 85525, max: 163300, rate: 0.24, label: '24%' },
        { min: 163300, max: 207350, rate: 0.32, label: '32%' },
        { min: 207350, max: 518400, rate: 0.35, label: '35%' },
        { min: 518400, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 40000, rate: 0, label: '0%' },
        { min: 40000, max: 441450, rate: 0.15, label: '15%' },
        { min: 441450, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    married: {
      income: [
        { min: 0, max: 19750, rate: 0.10, label: '10%' },
        { min: 19750, max: 80250, rate: 0.12, label: '12%' },
        { min: 80250, max: 171050, rate: 0.22, label: '22%' },
        { min: 171050, max: 326600, rate: 0.24, label: '24%' },
        { min: 326600, max: 414700, rate: 0.32, label: '32%' },
        { min: 414700, max: 622050, rate: 0.35, label: '35%' },
        { min: 622050, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 80000, rate: 0, label: '0%' },
        { min: 80000, max: 496600, rate: 0.15, label: '15%' },
        { min: 496600, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
  },
  2021: {
    single: {
      income: [
        { min: 0, max: 9950, rate: 0.10, label: '10%' },
        { min: 9950, max: 40525, rate: 0.12, label: '12%' },
        { min: 40525, max: 86375, rate: 0.22, label: '22%' },
        { min: 86375, max: 164925, rate: 0.24, label: '24%' },
        { min: 164925, max: 209425, rate: 0.32, label: '32%' },
        { min: 209425, max: 523600, rate: 0.35, label: '35%' },
        { min: 523600, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 40400, rate: 0, label: '0%' },
        { min: 40400, max: 445850, rate: 0.15, label: '15%' },
        { min: 445850, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    married: {
      income: [
        { min: 0, max: 19900, rate: 0.10, label: '10%' },
        { min: 19900, max: 81050, rate: 0.12, label: '12%' },
        { min: 81050, max: 172750, rate: 0.22, label: '22%' },
        { min: 172750, max: 329850, rate: 0.24, label: '24%' },
        { min: 329850, max: 418850, rate: 0.32, label: '32%' },
        { min: 418850, max: 628300, rate: 0.35, label: '35%' },
        { min: 628300, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 80800, rate: 0, label: '0%' },
        { min: 80800, max: 501600, rate: 0.15, label: '15%' },
        { min: 501600, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
  },
  2022: {
    single: {
      income: [
        { min: 0, max: 10275, rate: 0.10, label: '10%' },
        { min: 10275, max: 41775, rate: 0.12, label: '12%' },
        { min: 41775, max: 89075, rate: 0.22, label: '22%' },
        { min: 89075, max: 170050, rate: 0.24, label: '24%' },
        { min: 170050, max: 215950, rate: 0.32, label: '32%' },
        { min: 215950, max: 539900, rate: 0.35, label: '35%' },
        { min: 539900, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 41675, rate: 0, label: '0%' },
        { min: 41675, max: 459750, rate: 0.15, label: '15%' },
        { min: 459750, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    married: {
      income: [
        { min: 0, max: 20550, rate: 0.10, label: '10%' },
        { min: 20550, max: 83550, rate: 0.12, label: '12%' },
        { min: 83550, max: 178150, rate: 0.22, label: '22%' },
        { min: 178150, max: 340100, rate: 0.24, label: '24%' },
        { min: 340100, max: 431900, rate: 0.32, label: '32%' },
        { min: 431900, max: 647850, rate: 0.35, label: '35%' },
        { min: 647850, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 83350, rate: 0, label: '0%' },
        { min: 83350, max: 517200, rate: 0.15, label: '15%' },
        { min: 517200, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
  },
  2023: {
    single: {
      income: [
        { min: 0, max: 11000, rate: 0.10, label: '10%' },
        { min: 11000, max: 44725, rate: 0.12, label: '12%' },
        { min: 44725, max: 95375, rate: 0.22, label: '22%' },
        { min: 95375, max: 182100, rate: 0.24, label: '24%' },
        { min: 182100, max: 231250, rate: 0.32, label: '32%' },
        { min: 231250, max: 578125, rate: 0.35, label: '35%' },
        { min: 578125, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 44625, rate: 0, label: '0%' },
        { min: 44625, max: 492300, rate: 0.15, label: '15%' },
        { min: 492300, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    married: {
      income: [
        { min: 0, max: 22000, rate: 0.10, label: '10%' },
        { min: 22000, max: 89075, rate: 0.12, label: '12%' },
        { min: 89075, max: 190750, rate: 0.22, label: '22%' },
        { min: 190750, max: 364200, rate: 0.24, label: '24%' },
        { min: 364200, max: 462500, rate: 0.32, label: '32%' },
        { min: 462500, max: 693750, rate: 0.35, label: '35%' },
        { min: 693750, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 89250, rate: 0, label: '0%' },
        { min: 89250, max: 553850, rate: 0.15, label: '15%' },
        { min: 553850, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
  },
  2024: {
    single: {
      income: [
        { min: 0, max: 11600, rate: 0.10, label: '10%' },
        { min: 11600, max: 47150, rate: 0.12, label: '12%' },
        { min: 47150, max: 100525, rate: 0.22, label: '22%' },
        { min: 100525, max: 191950, rate: 0.24, label: '24%' },
        { min: 191950, max: 243725, rate: 0.32, label: '32%' },
        { min: 243725, max: 609350, rate: 0.35, label: '35%' },
        { min: 609350, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 47025, rate: 0, label: '0%' },
        { min: 47025, max: 518900, rate: 0.15, label: '15%' },
        { min: 518900, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    married: {
      income: [
        { min: 0, max: 23200, rate: 0.10, label: '10%' },
        { min: 23200, max: 94300, rate: 0.12, label: '12%' },
        { min: 94300, max: 201050, rate: 0.22, label: '22%' },
        { min: 201050, max: 383900, rate: 0.24, label: '24%' },
        { min: 383900, max: 487450, rate: 0.32, label: '32%' },
        { min: 487450, max: 731200, rate: 0.35, label: '35%' },
        { min: 731200, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 94050, rate: 0, label: '0%' },
        { min: 94050, max: 583750, rate: 0.15, label: '15%' },
        { min: 583750, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
  },
  2025: {
    single: {
      income: [
        { min: 0, max: 11925, rate: 0.10, label: '10%' },
        { min: 11925, max: 48475, rate: 0.12, label: '12%' },
        { min: 48475, max: 103350, rate: 0.22, label: '22%' },
        { min: 103350, max: 197300, rate: 0.24, label: '24%' },
        { min: 197300, max: 250525, rate: 0.32, label: '32%' },
        { min: 250525, max: 626350, rate: 0.35, label: '35%' },
        { min: 626350, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 48350, rate: 0, label: '0%' },
        { min: 48350, max: 533400, rate: 0.15, label: '15%' },
        { min: 533400, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    married: {
      income: [
        { min: 0, max: 23850, rate: 0.10, label: '10%' },
        { min: 23850, max: 96950, rate: 0.12, label: '12%' },
        { min: 96950, max: 206700, rate: 0.22, label: '22%' },
        { min: 206700, max: 394600, rate: 0.24, label: '24%' },
        { min: 394600, max: 501050, rate: 0.32, label: '32%' },
        { min: 501050, max: 751600, rate: 0.35, label: '35%' },
        { min: 751600, max: Infinity, rate: 0.37, label: '37%' },
      ],
      ltcg: [
        { min: 0, max: 96700, rate: 0, label: '0%' },
        { min: 96700, max: 600050, rate: 0.15, label: '15%' },
        { min: 600050, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
  },
};

// Backward compatibility - default to 2025
export const STANDARD_DEDUCTION_2024 = STANDARD_DEDUCTIONS[2025];
export const TAX_BRACKETS_2024 = INCOME_TAX_BRACKETS[2025];
export const STANDARD_DEDUCTION_2025 = STANDARD_DEDUCTIONS[2025];
export const TAX_BRACKETS_2025 = INCOME_TAX_BRACKETS[2025];

// Helper to get tax data for a specific year
export const getTaxDataForYear = (year) => {
  const availableYears = Object.keys(INCOME_TAX_BRACKETS).map(Number).sort((a, b) => b - a);
  const closestYear = availableYears.find(y => y <= year) || availableYears[availableYears.length - 1];
  
  return {
    year: closestYear,
    standardDeductions: STANDARD_DEDUCTIONS[closestYear],
    brackets: INCOME_TAX_BRACKETS[closestYear],
  };
};

// Get marginal income tax rate for a given taxable income
export const getIncomeTaxRate = (taxableIncome, filingStatus = 'single', year = 2025) => {
  const { brackets } = getTaxDataForYear(year);
  const incomeBrackets = brackets[filingStatus]?.income || brackets.single.income;
  
  for (const bracket of incomeBrackets) {
    if (taxableIncome <= bracket.max) return bracket.rate;
  }
  return 0.37;
};

// Get long-term capital gains rate for a given taxable income
export const getLTCGRate = (taxableIncome, filingStatus = 'single', year = 2025) => {
  const { brackets } = getTaxDataForYear(year);
  const ltcgBrackets = brackets[filingStatus]?.ltcg || brackets.single.ltcg;
  
  for (const bracket of ltcgBrackets) {
    if (taxableIncome <= bracket.max) return bracket.rate;
  }
  return 0.20;
};

// Get short-term capital gains rate (same as income tax)
export const getSTCGRate = (taxableIncome, filingStatus = 'single', year = 2025) => {
  return getIncomeTaxRate(taxableIncome, filingStatus, year);
};

// Calculate progressive income tax on a given amount
export const calculateProgressiveIncomeTax = (taxableIncome, filingStatus = 'single', year = 2025) => {
  const { brackets } = getTaxDataForYear(year);
  const incomeBrackets = brackets[filingStatus]?.income || brackets.single.income;
  
  let totalTax = 0;
  let remainingIncome = taxableIncome;
  let previousMax = 0;

  for (const bracket of incomeBrackets) {
    if (remainingIncome <= 0) break;
    const taxableInBracket = Math.min(remainingIncome, bracket.max - previousMax);
    totalTax += taxableInBracket * bracket.rate;
    remainingIncome -= taxableInBracket;
    previousMax = bracket.max;
  }

  return totalTax;
};

// Calculate capital gains tax (simplified - uses marginal rate)
export const calculateCapitalGainsTax = (gain, isLongTerm, taxableIncome, filingStatus = 'single', year = 2025) => {
  if (gain <= 0) return 0;
  
  const rate = isLongTerm 
    ? getLTCGRate(taxableIncome + gain, filingStatus, year)
    : getSTCGRate(taxableIncome + gain, filingStatus, year);
  
  return gain * rate;
};

// Calculate tax on withdrawal from different account types
export const calculateWithdrawalTax = ({
  withdrawalAmount,
  accountType, // 'taxable', 'tax_deferred', 'tax_free'
  capitalGainAmount = 0, // For taxable accounts - the gain portion
  isLongTermGain = true, // For taxable accounts
  otherIncome = 0,
  filingStatus = 'single',
  year = 2025,
}) => {
  const { standardDeductions } = getTaxDataForYear(year);
  const standardDeduction = standardDeductions[filingStatus] || standardDeductions.single;
  
  if (accountType === 'tax_free') {
    // Roth IRA, Roth 401k, HSA (qualified) - no tax
    return 0;
  }
  
  if (accountType === 'tax_deferred') {
    // Traditional IRA, Traditional 401k - taxed as ordinary income
    const taxableIncome = Math.max(0, otherIncome + withdrawalAmount - standardDeduction);
    return calculateProgressiveIncomeTax(taxableIncome, filingStatus, year) - 
           calculateProgressiveIncomeTax(Math.max(0, otherIncome - standardDeduction), filingStatus, year);
  }
  
  if (accountType === 'taxable') {
    // Taxable brokerage - only gains are taxed
    if (capitalGainAmount <= 0) return 0;
    
    const taxableIncome = Math.max(0, otherIncome - standardDeduction);
    return calculateCapitalGainsTax(capitalGainAmount, isLongTermGain, taxableIncome, filingStatus, year);
  }
  
  return 0;
};

// Estimate taxes for a retirement withdrawal scenario
export const estimateRetirementWithdrawalTaxes = ({
  withdrawalNeeded,
  taxableBalance,
  taxDeferredBalance,
  taxFreeBalance,
  taxableGainPercent = 0.5, // Portion of taxable account that is gains (dynamically calculated)
  isLongTermGain = true,
  filingStatus = 'single',
  age = 65,
  otherIncome = 0, // Social Security, pension, etc.
  year = 2025,
  rothContributions = 0, // Actual Roth contributions accessible penalty-free (defaults to 0)
}) => {
  const PENALTY_FREE_AGE = 59.5;
  const canAccessPenaltyFree = age >= PENALTY_FREE_AGE;
  const { standardDeductions, brackets } = getTaxDataForYear(year);
  const standardDeduction = standardDeductions[filingStatus] || standardDeductions.single;
  
  let totalTax = 0;
  let totalPenalty = 0;
  let remainingWithdrawal = withdrawalNeeded;
  
  const withdrawalBreakdown = {
    fromTaxable: 0,
    fromTaxDeferred: 0,
    fromTaxFree: 0,
    taxOnTaxable: 0,
    taxOnTaxDeferred: 0,
    penalty: 0,
  };
  
  // Track cumulative taxable income for accurate bracket calculation
  let cumulativeTaxableIncome = Math.max(0, otherIncome - standardDeduction);
  
  // Optimal withdrawal order depends on age and tax situation
  if (canAccessPenaltyFree) {
    // After 59.5: Withdraw from taxable first (lower tax on gains), then tax-deferred, then tax-free last
    
    // 1. Taxable first - capital gains taxed at preferential rates (0%, 15%, 20%)
    const fromTaxable = Math.min(remainingWithdrawal, taxableBalance);
    if (fromTaxable > 0) {
      const gainPortion = fromTaxable * taxableGainPercent;
      
      // Calculate LTCG tax considering 0% bracket
      const ltcgBrackets = brackets[filingStatus]?.ltcg || brackets.single.ltcg;
      let taxOnTaxable = 0;
      let remainingGain = gainPortion;
      
      for (const bracket of ltcgBrackets) {
        if (remainingGain <= 0) break;
        const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
        const gainInBracket = Math.min(remainingGain, roomInBracket);
        taxOnTaxable += gainInBracket * bracket.rate;
        cumulativeTaxableIncome += gainInBracket;
        remainingGain -= gainInBracket;
      }
      
      withdrawalBreakdown.fromTaxable = fromTaxable;
      withdrawalBreakdown.taxOnTaxable = taxOnTaxable;
      totalTax += taxOnTaxable;
      remainingWithdrawal -= fromTaxable;
    }
    
    // 2. Tax-deferred second - taxed as ordinary income
    const fromTaxDeferred = Math.min(remainingWithdrawal, taxDeferredBalance);
    if (fromTaxDeferred > 0) {
      // Calculate progressive income tax on the withdrawal
      const incomeBrackets = brackets[filingStatus]?.income || brackets.single.income;
      let taxOnTaxDeferred = 0;
      let remainingAmount = fromTaxDeferred;
      
      for (const bracket of incomeBrackets) {
        if (remainingAmount <= 0) break;
        const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
        const amountInBracket = Math.min(remainingAmount, roomInBracket);
        taxOnTaxDeferred += amountInBracket * bracket.rate;
        cumulativeTaxableIncome += amountInBracket;
        remainingAmount -= amountInBracket;
      }
      
      withdrawalBreakdown.fromTaxDeferred = fromTaxDeferred;
      withdrawalBreakdown.taxOnTaxDeferred = taxOnTaxDeferred;
      totalTax += taxOnTaxDeferred;
      remainingWithdrawal -= fromTaxDeferred;
    }
    
    // 3. Tax-free last
    const fromTaxFree = Math.min(remainingWithdrawal, taxFreeBalance);
    withdrawalBreakdown.fromTaxFree = fromTaxFree;
    remainingWithdrawal -= fromTaxFree;
    
  } else {
    // Before 59.5: Taxable first, then tax-free (Roth contributions), avoid tax-deferred (10% penalty)
    
    // 1. Taxable first
    const fromTaxable = Math.min(remainingWithdrawal, taxableBalance);
    if (fromTaxable > 0) {
      const gainPortion = fromTaxable * taxableGainPercent;
      
      // Calculate LTCG tax considering 0% bracket
      const ltcgBrackets = brackets[filingStatus]?.ltcg || brackets.single.ltcg;
      let taxOnTaxable = 0;
      let remainingGain = gainPortion;
      
      for (const bracket of ltcgBrackets) {
        if (remainingGain <= 0) break;
        const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
        const gainInBracket = Math.min(remainingGain, roomInBracket);
        taxOnTaxable += gainInBracket * bracket.rate;
        cumulativeTaxableIncome += gainInBracket;
        remainingGain -= gainInBracket;
      }
      
      withdrawalBreakdown.fromTaxable = fromTaxable;
      withdrawalBreakdown.taxOnTaxable = taxOnTaxable;
      totalTax += taxOnTaxable;
      remainingWithdrawal -= fromTaxable;
    }
    
    // 2. Tax-free (Roth contributions accessible)
    const taxFreeContributions = rothContributions; // Use actual contributions (defaults to 0)
    const fromTaxFree = Math.min(remainingWithdrawal, taxFreeContributions);
    withdrawalBreakdown.fromTaxFree = fromTaxFree;
    remainingWithdrawal -= fromTaxFree;
    
    // 3. Tax-deferred with penalty as last resort
    if (remainingWithdrawal > 0) {
      const fromTaxDeferred = Math.min(remainingWithdrawal, taxDeferredBalance);
      if (fromTaxDeferred > 0) {
        const penalty = fromTaxDeferred * 0.10;
        
        // Calculate progressive income tax
        const incomeBrackets = brackets[filingStatus]?.income || brackets.single.income;
        let taxOnTaxDeferred = 0;
        let remainingAmount = fromTaxDeferred;
        
        for (const bracket of incomeBrackets) {
          if (remainingAmount <= 0) break;
          const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
          const amountInBracket = Math.min(remainingAmount, roomInBracket);
          taxOnTaxDeferred += amountInBracket * bracket.rate;
          cumulativeTaxableIncome += amountInBracket;
          remainingAmount -= amountInBracket;
        }
        
        withdrawalBreakdown.fromTaxDeferred = fromTaxDeferred;
        withdrawalBreakdown.taxOnTaxDeferred = taxOnTaxDeferred;
        withdrawalBreakdown.penalty = penalty;
        totalTax += taxOnTaxDeferred;
        totalPenalty += penalty;
        remainingWithdrawal -= fromTaxDeferred;
      }
    }
  }
  
  return {
    ...withdrawalBreakdown,
    totalTax,
    totalPenalty,
    totalCost: totalTax + totalPenalty,
    netWithdrawal: withdrawalNeeded - totalTax - totalPenalty,
    effectiveTaxRate: withdrawalNeeded > 0 ? (totalTax + totalPenalty) / withdrawalNeeded : 0,
  };
};