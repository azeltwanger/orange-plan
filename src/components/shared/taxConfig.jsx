// ===========================================
// TAX CONFIGURATION - UPDATE ANNUALLY
// Last updated: December 2024 (for 2025 tax year)
// Source: IRS.gov
// ===========================================

import {
  FEDERAL_INCOME_BRACKETS,
  FEDERAL_LTCG_BRACKETS,
  STANDARD_DEDUCTIONS as TAX_DATA_STANDARD_DEDUCTIONS,
  CONTRIBUTION_LIMITS,
  SOCIAL_SECURITY,
  getYearData,
  getStandardDeduction as getStandardDeductionFromTaxData,
  getFederalBrackets,
  getContributionLimit
} from './taxData';

export const TAX_CONFIG = {
  // ----- CONTRIBUTION LIMITS -----
  // Historical data only (2024+ comes from taxData.js)
  contributionLimits: {
    // No historical data - taxData.js starts at 2024
  },

  // ----- FEDERAL INCOME TAX BRACKETS -----
  // Historical data only (2024+ comes from taxData.js)
  federalBrackets: {
    2018: {
      single: [
        { min: 0, max: 9525, rate: 0.10, label: '10%' },
        { min: 9525, max: 38700, rate: 0.12, label: '12%' },
        { min: 38700, max: 82500, rate: 0.22, label: '22%' },
        { min: 82500, max: 157500, rate: 0.24, label: '24%' },
        { min: 157500, max: 200000, rate: 0.32, label: '32%' },
        { min: 200000, max: 500000, rate: 0.35, label: '35%' },
        { min: 500000, max: Infinity, rate: 0.37, label: '37%' },
      ],
      married: [
        { min: 0, max: 19050, rate: 0.10, label: '10%' },
        { min: 19050, max: 77400, rate: 0.12, label: '12%' },
        { min: 77400, max: 165000, rate: 0.22, label: '22%' },
        { min: 165000, max: 315000, rate: 0.24, label: '24%' },
        { min: 315000, max: 400000, rate: 0.32, label: '32%' },
        { min: 400000, max: 600000, rate: 0.35, label: '35%' },
        { min: 600000, max: Infinity, rate: 0.37, label: '37%' },
      ],
    },
    2019: {
      single: [
        { min: 0, max: 9700, rate: 0.10, label: '10%' },
        { min: 9700, max: 39475, rate: 0.12, label: '12%' },
        { min: 39475, max: 84200, rate: 0.22, label: '22%' },
        { min: 84200, max: 160725, rate: 0.24, label: '24%' },
        { min: 160725, max: 204100, rate: 0.32, label: '32%' },
        { min: 204100, max: 510300, rate: 0.35, label: '35%' },
        { min: 510300, max: Infinity, rate: 0.37, label: '37%' },
      ],
      married: [
        { min: 0, max: 19400, rate: 0.10, label: '10%' },
        { min: 19400, max: 78950, rate: 0.12, label: '12%' },
        { min: 78950, max: 168400, rate: 0.22, label: '22%' },
        { min: 168400, max: 321450, rate: 0.24, label: '24%' },
        { min: 321450, max: 408200, rate: 0.32, label: '32%' },
        { min: 408200, max: 612350, rate: 0.35, label: '35%' },
        { min: 612350, max: Infinity, rate: 0.37, label: '37%' },
      ],
    },
    2020: {
      single: [
        { min: 0, max: 9875, rate: 0.10, label: '10%' },
        { min: 9875, max: 40125, rate: 0.12, label: '12%' },
        { min: 40125, max: 85525, rate: 0.22, label: '22%' },
        { min: 85525, max: 163300, rate: 0.24, label: '24%' },
        { min: 163300, max: 207350, rate: 0.32, label: '32%' },
        { min: 207350, max: 518400, rate: 0.35, label: '35%' },
        { min: 518400, max: Infinity, rate: 0.37, label: '37%' },
      ],
      married: [
        { min: 0, max: 19750, rate: 0.10, label: '10%' },
        { min: 19750, max: 80250, rate: 0.12, label: '12%' },
        { min: 80250, max: 171050, rate: 0.22, label: '22%' },
        { min: 171050, max: 326600, rate: 0.24, label: '24%' },
        { min: 326600, max: 414700, rate: 0.32, label: '32%' },
        { min: 414700, max: 622050, rate: 0.35, label: '35%' },
        { min: 622050, max: Infinity, rate: 0.37, label: '37%' },
      ],
    },
    2021: {
      single: [
        { min: 0, max: 9950, rate: 0.10, label: '10%' },
        { min: 9950, max: 40525, rate: 0.12, label: '12%' },
        { min: 40525, max: 86375, rate: 0.22, label: '22%' },
        { min: 86375, max: 164925, rate: 0.24, label: '24%' },
        { min: 164925, max: 209425, rate: 0.32, label: '32%' },
        { min: 209425, max: 523600, rate: 0.35, label: '35%' },
        { min: 523600, max: Infinity, rate: 0.37, label: '37%' },
      ],
      married: [
        { min: 0, max: 19900, rate: 0.10, label: '10%' },
        { min: 19900, max: 81050, rate: 0.12, label: '12%' },
        { min: 81050, max: 172750, rate: 0.22, label: '22%' },
        { min: 172750, max: 329850, rate: 0.24, label: '24%' },
        { min: 329850, max: 418850, rate: 0.32, label: '32%' },
        { min: 418850, max: 628300, rate: 0.35, label: '35%' },
        { min: 628300, max: Infinity, rate: 0.37, label: '37%' },
      ],
    },
    2022: {
      single: [
        { min: 0, max: 10275, rate: 0.10, label: '10%' },
        { min: 10275, max: 41775, rate: 0.12, label: '12%' },
        { min: 41775, max: 89075, rate: 0.22, label: '22%' },
        { min: 89075, max: 170050, rate: 0.24, label: '24%' },
        { min: 170050, max: 215950, rate: 0.32, label: '32%' },
        { min: 215950, max: 539900, rate: 0.35, label: '35%' },
        { min: 539900, max: Infinity, rate: 0.37, label: '37%' },
      ],
      married: [
        { min: 0, max: 20550, rate: 0.10, label: '10%' },
        { min: 20550, max: 83550, rate: 0.12, label: '12%' },
        { min: 83550, max: 178150, rate: 0.22, label: '22%' },
        { min: 178150, max: 340100, rate: 0.24, label: '24%' },
        { min: 340100, max: 431900, rate: 0.32, label: '32%' },
        { min: 431900, max: 647850, rate: 0.35, label: '35%' },
        { min: 647850, max: Infinity, rate: 0.37, label: '37%' },
      ],
    },
    2023: {
      single: [
        { min: 0, max: 11000, rate: 0.10, label: '10%' },
        { min: 11000, max: 44725, rate: 0.12, label: '12%' },
        { min: 44725, max: 95375, rate: 0.22, label: '22%' },
        { min: 95375, max: 182100, rate: 0.24, label: '24%' },
        { min: 182100, max: 231250, rate: 0.32, label: '32%' },
        { min: 231250, max: 578125, rate: 0.35, label: '35%' },
        { min: 578125, max: Infinity, rate: 0.37, label: '37%' },
      ],
      married: [
        { min: 0, max: 22000, rate: 0.10, label: '10%' },
        { min: 22000, max: 89075, rate: 0.12, label: '12%' },
        { min: 89075, max: 190750, rate: 0.22, label: '22%' },
        { min: 190750, max: 364200, rate: 0.24, label: '24%' },
        { min: 364200, max: 462500, rate: 0.32, label: '32%' },
        { min: 462500, max: 693750, rate: 0.35, label: '35%' },
        { min: 693750, max: Infinity, rate: 0.37, label: '37%' },
      ],
    },
  },

  // ----- STANDARD DEDUCTION -----
  // Historical data only (2024+ comes from taxData.js)
  standardDeduction: {
    2018: { single: 12000, married: 24000 },
    2019: { single: 12200, married: 24400 },
    2020: { single: 12400, married: 24800 },
    2021: { single: 12550, married: 25100 },
    2022: { single: 12950, married: 25900 },
    2023: { single: 13850, married: 27700 },
  },

  // ----- CAPITAL GAINS TAX BRACKETS -----
  // Historical data only (2024+ comes from taxData.js)
  capitalGainsBrackets: {
    2018: {
      single: [
        { min: 0, max: 38600, rate: 0, label: '0%' },
        { min: 38600, max: 425800, rate: 0.15, label: '15%' },
        { min: 425800, max: Infinity, rate: 0.20, label: '20%' },
      ],
      married: [
        { min: 0, max: 77200, rate: 0, label: '0%' },
        { min: 77200, max: 479000, rate: 0.15, label: '15%' },
        { min: 479000, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    2019: {
      single: [
        { min: 0, max: 39375, rate: 0, label: '0%' },
        { min: 39375, max: 434550, rate: 0.15, label: '15%' },
        { min: 434550, max: Infinity, rate: 0.20, label: '20%' },
      ],
      married: [
        { min: 0, max: 78750, rate: 0, label: '0%' },
        { min: 78750, max: 488850, rate: 0.15, label: '15%' },
        { min: 488850, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    2020: {
      single: [
        { min: 0, max: 40000, rate: 0, label: '0%' },
        { min: 40000, max: 441450, rate: 0.15, label: '15%' },
        { min: 441450, max: Infinity, rate: 0.20, label: '20%' },
      ],
      married: [
        { min: 0, max: 80000, rate: 0, label: '0%' },
        { min: 80000, max: 496600, rate: 0.15, label: '15%' },
        { min: 496600, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    2021: {
      single: [
        { min: 0, max: 40400, rate: 0, label: '0%' },
        { min: 40400, max: 445850, rate: 0.15, label: '15%' },
        { min: 445850, max: Infinity, rate: 0.20, label: '20%' },
      ],
      married: [
        { min: 0, max: 80800, rate: 0, label: '0%' },
        { min: 80800, max: 501600, rate: 0.15, label: '15%' },
        { min: 501600, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    2022: {
      single: [
        { min: 0, max: 41675, rate: 0, label: '0%' },
        { min: 41675, max: 459750, rate: 0.15, label: '15%' },
        { min: 459750, max: Infinity, rate: 0.20, label: '20%' },
      ],
      married: [
        { min: 0, max: 83350, rate: 0, label: '0%' },
        { min: 83350, max: 517200, rate: 0.15, label: '15%' },
        { min: 517200, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
    2023: {
      single: [
        { min: 0, max: 44625, rate: 0, label: '0%' },
        { min: 44625, max: 492300, rate: 0.15, label: '15%' },
        { min: 492300, max: Infinity, rate: 0.20, label: '20%' },
      ],
      married: [
        { min: 0, max: 89250, rate: 0, label: '0%' },
        { min: 89250, max: 553850, rate: 0.15, label: '15%' },
        { min: 553850, max: Infinity, rate: 0.20, label: '20%' },
      ],
    },
  },

  // ----- NIIT (Net Investment Income Tax) -----
  niitThreshold: {
    single: 200000,
    married: 250000,
    rate: 0.038,
  },

  // ----- SOCIAL SECURITY -----
  // Historical data only (2024+ comes from taxData.js)
  socialSecurity: {
    // No historical data - taxData.js starts at 2024
  },

  // ----- MEDICARE -----
  medicare: {
    baseRate: 0.0145,
    additionalRate: 0.009, // Above threshold
    threshold: { single: 200000, married: 250000 },
  },
};

// Helper functions
export function getTaxConfigForYear(year) {
  // For 2024+ use taxData.js (supports inflation adjustment)
  if (year >= 2024) {
    const fedBrackets = getYearData(FEDERAL_INCOME_BRACKETS, year);
    const ltcgBrackets = getYearData(FEDERAL_LTCG_BRACKETS, year);
    const stdDeduction = getYearData(TAX_DATA_STANDARD_DEDUCTIONS, year);
    const contribLimits = getYearData(CONTRIBUTION_LIMITS, year);
    const socialSec = getYearData(SOCIAL_SECURITY, year);
    
    return {
      contributionLimits: {
        traditional401k: contribLimits.traditional_401k,
        traditional401k_catchUp: contribLimits.traditional_401k_catchup,
        rothIRA: contribLimits.roth_ira,
        rothIRA_catchUp: contribLimits.roth_ira_catchup,
        hsaIndividual: contribLimits.hsa_single,
        hsaFamily: contribLimits.hsa_family,
        hsa_catchUp: contribLimits.hsa_catchup,
      },
      federalBrackets: {
        single: fedBrackets.single?.map(b => ({ ...b, rate: b.rate / 100, label: `${b.rate}%` })) || [],
        married: (fedBrackets.married_filing_jointly || fedBrackets.married)?.map(b => ({ ...b, rate: b.rate / 100, label: `${b.rate}%` })) || [],
      },
      standardDeduction: {
        single: stdDeduction.single,
        married: stdDeduction.married_filing_jointly || stdDeduction.married,
      },
      capitalGainsBrackets: {
        single: [
          { min: 0, max: ltcgBrackets.single?.zeroMax || 48350, rate: 0, label: '0%' },
          { min: ltcgBrackets.single?.zeroMax || 48350, max: ltcgBrackets.single?.fifteenMax || 533400, rate: 0.15, label: '15%' },
          { min: ltcgBrackets.single?.fifteenMax || 533400, max: Infinity, rate: 0.20, label: '20%' },
        ],
        married: [
          { min: 0, max: (ltcgBrackets.married_filing_jointly || ltcgBrackets.married)?.zeroMax || 96700, rate: 0, label: '0%' },
          { min: (ltcgBrackets.married_filing_jointly || ltcgBrackets.married)?.zeroMax || 96700, max: (ltcgBrackets.married_filing_jointly || ltcgBrackets.married)?.fifteenMax || 600050, rate: 0.15, label: '15%' },
          { min: (ltcgBrackets.married_filing_jointly || ltcgBrackets.married)?.fifteenMax || 600050, max: Infinity, rate: 0.20, label: '20%' },
        ],
      },
      socialSecurity: {
        wageBase: socialSec.wageBase,
        taxRate: socialSec.taxRate / 100,
      },
      niit: TAX_CONFIG.niitThreshold,
      medicare: TAX_CONFIG.medicare,
    };
  }
  
  // For historical years (pre-2024), use local TAX_CONFIG data
  const getForYear = (configSection) => {
    if (configSection[year]) return configSection[year];
    const years = Object.keys(configSection).map(Number).sort((a, b) => b - a);
    return configSection[years[0]];
  };
  
  return {
    contributionLimits: getForYear(TAX_CONFIG.contributionLimits),
    federalBrackets: getForYear(TAX_CONFIG.federalBrackets),
    standardDeduction: getForYear(TAX_CONFIG.standardDeduction),
    capitalGainsBrackets: getForYear(TAX_CONFIG.capitalGainsBrackets),
    socialSecurity: getForYear(TAX_CONFIG.socialSecurity),
    niit: TAX_CONFIG.niitThreshold,
    medicare: TAX_CONFIG.medicare,
  };
}

// ----- CONTRIBUTION LIMIT HELPERS -----
export function get401kLimit(year, age) {
  const config = getTaxConfigForYear(year);
  const limits = config.contributionLimits;
  return age >= 50 
    ? limits.traditional401k + limits.traditional401k_catchUp 
    : limits.traditional401k;
}

export function getRothIRALimit(year, age) {
  const config = getTaxConfigForYear(year);
  const limits = config.contributionLimits;
  return age >= 50 
    ? limits.rothIRA + limits.rothIRA_catchUp 
    : limits.rothIRA;
}

export function getHSALimit(year, age, familyCoverage = false) {
  const config = getTaxConfigForYear(year);
  const limits = config.contributionLimits;
  const base = familyCoverage ? limits.hsaFamily : limits.hsaIndividual;
  return age >= 55 ? base + limits.hsa_catchUp : base;
}

// ----- TAX CALCULATION HELPERS -----
// Get marginal income tax rate for a given taxable income
export const getIncomeTaxRate = (taxableIncome, filingStatus = 'single', year = 2025) => {
  const config = getTaxConfigForYear(year);
  const brackets = config.federalBrackets[filingStatus] || config.federalBrackets.single;
  
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.max) return bracket.rate;
  }
  return 0.37;
};

// Get long-term capital gains rate for a given taxable income
export const getLTCGRate = (taxableIncome, filingStatus = 'single', year = 2025) => {
  const config = getTaxConfigForYear(year);
  const brackets = config.capitalGainsBrackets[filingStatus] || config.capitalGainsBrackets.single;
  
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.max) return bracket.rate;
  }
  return 0.20;
};

// Get short-term capital gains rate (same as ordinary income tax rate)
export const getSTCGRate = (taxableIncome, filingStatus = 'single', year = 2025) => {
  return getIncomeTaxRate(taxableIncome, filingStatus, year);
};

// Calculate progressive income tax on a given amount
export const calculateProgressiveIncomeTax = (taxableIncome, filingStatus = 'single', year = 2025) => {
  const config = getTaxConfigForYear(year);
  const brackets = config.federalBrackets[filingStatus] || config.federalBrackets.single;
  
  let totalTax = 0;
  let remainingIncome = taxableIncome;
  let previousMax = 0;

  for (const bracket of brackets) {
    if (remainingIncome <= 0) break;
    const taxableInBracket = Math.min(remainingIncome, bracket.max - previousMax);
    totalTax += taxableInBracket * bracket.rate;
    remainingIncome -= taxableInBracket;
    previousMax = bracket.max;
  }

  return totalTax;
};

// Get standard deduction for a given year
export const getStandardDeduction = (filingStatus = 'single', year = 2025) => {
  const config = getTaxConfigForYear(year);
  return config.standardDeduction[filingStatus] || config.standardDeduction.single;
};

// Backward compatibility exports
export const STANDARD_DEDUCTIONS = TAX_CONFIG.standardDeduction;
export const INCOME_TAX_BRACKETS = TAX_CONFIG.federalBrackets;
export const getTaxDataForYear = (year) => {
  const config = getTaxConfigForYear(year);
  return {
    year,
    standardDeductions: config.standardDeduction,
    brackets: {
      single: {
        income: config.federalBrackets.single,
        ltcg: config.capitalGainsBrackets.single,
      },
      married: {
        income: config.federalBrackets.married,
        ltcg: config.capitalGainsBrackets.married,
      },
    },
  };
};