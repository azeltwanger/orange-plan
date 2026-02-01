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

/**
 * Get complete tax configuration for a specific year with inflation adjustments.
 * 
 * For 2024+: Uses taxData.js (supports inflation projection)
 * For pre-2024: Uses historical data from TAX_CONFIG
 * 
 * Returns all tax-related values for the year:
 * - Federal income brackets (10% to 37%)
 * - LTCG brackets (0%, 15%, 20%)
 * - Standard deductions (includes 65+ bonus)
 * - Contribution limits (401k, IRA, HSA with catch-up)
 * - Social Security wage base and tax rate
 * - NIIT and Medicare thresholds
 * 
 * @param {number} year - Tax year (e.g., 2025)
 * @returns {Object} - Complete tax config for that year
 */
export function getTaxConfigForYear(year) {
  // For 2024+ use taxData.js (supports inflation adjustment)
  if (year >= 2024) {
    const fedBrackets = getYearData(FEDERAL_INCOME_BRACKETS, year);
    const ltcgBrackets = getYearData(FEDERAL_LTCG_BRACKETS, year);
    const stdDeduction = getYearData(TAX_DATA_STANDARD_DEDUCTIONS, year);
    const contribLimits = getYearData(CONTRIBUTION_LIMITS, year);
    const socialSec = getYearData(SOCIAL_SECURITY, year);
    
    // Normalize filing status
    const normalizedFedBrackets = {
      single: fedBrackets.single || [],
      married: fedBrackets.married_filing_jointly || fedBrackets.married || [],
    };
    
    const normalizedLtcgBrackets = {
      single: ltcgBrackets.single || { zeroMax: 48350, fifteenMax: 533400 },
      married: ltcgBrackets.married_filing_jointly || ltcgBrackets.married || { zeroMax: 96700, fifteenMax: 600050 },
    };
    
    const normalizedStdDeduction = {
      single: stdDeduction.single || 15000,
      married: stdDeduction.married_filing_jointly || stdDeduction.married || 30000,
    };
    
    return {
      contributionLimits: {
        traditional401k: contribLimits.traditional_401k || 23500,
        traditional401k_catchUp: contribLimits.traditional_401k_catchup || 7500,
        rothIRA: contribLimits.roth_ira || 7000,
        rothIRA_catchUp: contribLimits.roth_ira_catchup || 1000,
        hsaIndividual: contribLimits.hsa_single || 4300,
        hsaFamily: contribLimits.hsa_family || 8550,
        hsa_catchUp: contribLimits.hsa_catchup || 1000,
      },
      federalBrackets: {
        single: normalizedFedBrackets.single.map(b => ({ ...b, rate: b.rate / 100, label: `${b.rate}%` })),
        married: normalizedFedBrackets.married.map(b => ({ ...b, rate: b.rate / 100, label: `${b.rate}%` })),
      },
      standardDeduction: normalizedStdDeduction,
      capitalGainsBrackets: {
        single: [
          { min: 0, max: normalizedLtcgBrackets.single.zeroMax, rate: 0, label: '0%' },
          { min: normalizedLtcgBrackets.single.zeroMax, max: normalizedLtcgBrackets.single.fifteenMax, rate: 0.15, label: '15%' },
          { min: normalizedLtcgBrackets.single.fifteenMax, max: Infinity, rate: 0.20, label: '20%' },
        ],
        married: [
          { min: 0, max: normalizedLtcgBrackets.married.zeroMax, rate: 0, label: '0%' },
          { min: normalizedLtcgBrackets.married.zeroMax, max: normalizedLtcgBrackets.married.fifteenMax, rate: 0.15, label: '15%' },
          { min: normalizedLtcgBrackets.married.fifteenMax, max: Infinity, rate: 0.20, label: '20%' },
        ],
      },
      socialSecurity: {
        wageBase: socialSec.wageBase || 176100,
        taxRate: (socialSec.taxRate || 6.2) / 100,
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

/**
 * Get 401(k) contribution limit for a specific year and age.
 * 
 * 2025 limits: $23,500 base + $7,500 catch-up (50+) = $31,000 max
 * NEW 2025: Ages 60-63 get super catch-up of $11,250 instead of $7,500
 * 
 * @param {number} year - Tax year
 * @param {number} age - Participant's age
 * @returns {number} - Maximum 401(k) employee contribution
 */
export function get401kLimit(year, age) {
  const config = getTaxConfigForYear(year);
  const limits = config.contributionLimits;
  return age >= 50 
    ? limits.traditional401k + limits.traditional401k_catchUp 
    : limits.traditional401k;
}

/**
 * Get Roth IRA contribution limit for a specific year and age.
 * 
 * 2025 limits: $7,000 base + $1,000 catch-up (50+) = $8,000 max
 * Note: Subject to income phase-outs (see ROTH_INCOME_LIMITS in taxData.js)
 * 
 * @param {number} year - Tax year
 * @param {number} age - Contributor's age
 * @returns {number} - Maximum Roth IRA contribution
 */
export function getRothIRALimit(year, age) {
  const config = getTaxConfigForYear(year);
  const limits = config.contributionLimits;
  return age >= 50 
    ? limits.rothIRA + limits.rothIRA_catchUp 
    : limits.rothIRA;
}

/**
 * Get Traditional IRA contribution limit for a specific year and age.
 * 
 * 2025/2026 limits: $7,000 base + $1,000 catch-up (50+) = $8,000 max
 * Note: Deductibility subject to income limits if covered by workplace plan
 * 
 * @param {number} year - Tax year
 * @param {number} age - Contributor's age
 * @returns {number} - Maximum Traditional IRA contribution
 */
export function getTraditionalIRALimit(year, age) {
  const baseLimit = 7000;
  const catchUp = age >= 50 ? 1000 : 0;
  return baseLimit + catchUp;
}

/**
 * Get Roth IRA income limits for eligibility/phase-out.
 * 
 * Above phaseOutEnd: Cannot contribute to Roth IRA directly
 * Between phaseOutStart and phaseOutEnd: Reduced contribution allowed
 * 
 * @param {number} year - Tax year
 * @param {string} filingStatus - 'single' or 'married'
 * @returns {Object} - { phaseOutStart, phaseOutEnd }
 */
export function getRothIRAIncomeLimit(year, filingStatus) {
  // 2024/2025/2026 limits (adjust for inflation in future)
  if (filingStatus === 'married' || filingStatus === 'married_filing_jointly') {
    return { phaseOutStart: 230000, phaseOutEnd: 240000 };
  } else {
    return { phaseOutStart: 146000, phaseOutEnd: 161000 };
  }
}

/**
 * Get Traditional IRA deductibility income limits (if covered by workplace plan).
 * 
 * If you have a 401k at work:
 * - Above phaseOutEnd: Contribution NOT deductible (but can still contribute)
 * - Between phaseOutStart and phaseOutEnd: Partially deductible
 * - Below phaseOutStart: Fully deductible
 * 
 * @param {number} year - Tax year
 * @param {string} filingStatus - 'single' or 'married'
 * @returns {Object} - { phaseOutStart, phaseOutEnd }
 */
export function getTraditionalIRADeductibilityLimit(year, filingStatus) {
  if (filingStatus === 'married' || filingStatus === 'married_filing_jointly') {
    return { phaseOutStart: 123000, phaseOutEnd: 143000 };
  } else {
    return { phaseOutStart: 77000, phaseOutEnd: 87000 };
  }
}

/**
 * Get HSA contribution limit for a specific year, age, and coverage type.
 * 
 * 2025 limits: 
 * - Individual: $4,300 + $1,000 catch-up (55+) = $5,300 max
 * - Family: $8,550 + $1,000 catch-up (55+) = $9,550 max
 * 
 * @param {number} year - Tax year
 * @param {number} age - Account holder's age
 * @param {boolean} familyCoverage - True for family, false for individual
 * @returns {number} - Maximum HSA contribution
 */
export function getHSALimit(year, age, familyCoverage = false) {
  const config = getTaxConfigForYear(year);
  const limits = config.contributionLimits;
  const base = familyCoverage ? limits.hsaFamily : limits.hsaIndividual;
  return age >= 55 ? base + limits.hsa_catchUp : base;
}

/**
 * Get marginal federal income tax rate for a given taxable income.
 * 
 * 2025 brackets (single): 10%, 12%, 22%, 24%, 32%, 35%, 37%
 * This is the rate on your NEXT dollar of income, not your effective rate.
 * 
 * @param {number} taxableIncome - Taxable income (after deductions)
 * @param {string} filingStatus - 'single' or 'married'
 * @param {number} year - Tax year
 * @returns {number} - Marginal tax rate (0.10 to 0.37)
 */
export const getIncomeTaxRate = (taxableIncome, filingStatus = 'single', year = 2025) => {
  const config = getTaxConfigForYear(year);
  const brackets = config.federalBrackets[filingStatus] || config.federalBrackets.single;
  
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.max) return bracket.rate;
  }
  return 0.37;
};

/**
 * Get long-term capital gains rate for a given taxable income level.
 * 
 * LTCG brackets stack on TOP of ordinary income:
 * - 0% bracket: Taxable income + LTCG ≤ threshold ($48,350 single, $96,700 married for 2025)
 * - 15% bracket: Up to $533,400 single, $600,050 married
 * - 20% bracket: Above 15% threshold
 * 
 * @param {number} taxableIncome - Taxable income (ordinary income fills brackets first)
 * @param {string} filingStatus - 'single' or 'married'
 * @param {number} year - Tax year
 * @returns {number} - LTCG rate (0, 0.15, or 0.20)
 */
export const getLTCGRate = (taxableIncome, filingStatus = 'single', year = 2025) => {
  const config = getTaxConfigForYear(year);
  const brackets = config.capitalGainsBrackets[filingStatus] || config.capitalGainsBrackets.single;
  
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.max) return bracket.rate;
  }
  return 0.20;
};

/**
 * Get short-term capital gains rate (same as ordinary income).
 * 
 * STCG (assets held ≤ 1 year) = ordinary income rate = your marginal bracket
 * 
 * @param {number} taxableIncome - Taxable income
 * @param {string} filingStatus - 'single' or 'married'
 * @param {number} year - Tax year
 * @returns {number} - STCG rate (same as income rate: 0.10 to 0.37)
 */
export const getSTCGRate = (taxableIncome, filingStatus = 'single', year = 2025) => {
  return getIncomeTaxRate(taxableIncome, filingStatus, year);
};

/**
 * Calculate federal income tax using progressive brackets.
 * 
 * Progressive taxation: Each bracket is taxed at its own rate, not all income at top rate.
 * 
 * Example (2025 single):
 * - Income: $60,000
 * - 10% on first $11,925 = $1,193
 * - 12% on next $36,550 ($11,925 to $48,475) = $4,386
 * - 22% on remaining $11,525 ($48,475 to $60,000) = $2,536
 * - Total tax: $8,115 (effective rate: 13.5%)
 * 
 * @param {number} taxableIncome - Taxable income (after deductions)
 * @param {string} filingStatus - 'single' or 'married'
 * @param {number} year - Tax year
 * @returns {number} - Total federal income tax owed
 */
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

/**
 * Get Solo 401k contribution limits for a specific year and age.
 * 
 * Solo 401k combines employee and employer contributions:
 * - Employee: Same as regular 401k ($24,000 + $7,500 catch-up for 2026)
 * - Employer: Up to 25% of net self-employment income
 * - Combined: $71,500 ($79,000 if 50+) for 2026
 * 
 * @param {number} year - Tax year
 * @param {number} age - Participant's age
 * @returns {Object} - { employeeLimit, maxEmployerLimit, combinedLimit }
 */
export function getSolo401kLimits(year, age) {
  const limits = getYearData(CONTRIBUTION_LIMITS, year);
  
  // Employee contribution limit (same as regular 401k)
  let employeeLimit = limits.solo_401k_employee || 24000;
  if (age >= 50) {
    employeeLimit += limits.solo_401k_employee_catchup || 7500;
  }
  
  // Combined limit (employee + employer)
  let combinedLimit = limits.solo_401k_combined || 71500;
  if (age >= 50) {
    combinedLimit = limits.solo_401k_combined_catchup || 79000;
  }
  
  // Employer limit is the remainder after employee contribution
  // Also capped at 25% of net self-employment income (handled in projection)
  const maxEmployerLimit = combinedLimit - employeeLimit;
  
  return {
    employeeLimit,
    maxEmployerLimit,
    combinedLimit
  };
}

/**
 * Calculate Traditional IRA deductible amount based on MAGI and employer plan coverage.
 * 
 * IRS rules:
 * - If NOT covered by employer plan: Fully deductible regardless of income
 * - If covered: Subject to MAGI phase-outs
 *   - Single (covered): $81K-$91K phase-out (2026)
 *   - MFJ (you covered): $129K-$149K phase-out
 *   - MFJ (spouse covered, you not): $242K-$252K phase-out
 *   - MFS: $0-$10K phase-out
 * 
 * @param {Object} params - Deductibility parameters
 * @param {number} params.contribution - Traditional IRA contribution amount
 * @param {number} params.magi - Modified Adjusted Gross Income
 * @param {string} params.filingStatus - 'single', 'married', 'married_filing_jointly', 'married_filing_separately'
 * @param {boolean} params.coveredByEmployerPlan - Whether taxpayer is covered by employer retirement plan
 * @param {boolean} params.spouseCoveredByEmployerPlan - Whether spouse is covered (for MFJ)
 * @param {number} params.year - Tax year
 * @returns {number} - Deductible amount (can be 0 to full contribution)
 */
export function getTraditionalIRADeductibleAmount({
  contribution,
  magi,
  filingStatus,
  coveredByEmployerPlan,
  spouseCoveredByEmployerPlan = false,
  year
}) {
  if (contribution <= 0) return 0;
  
  // If not covered by any employer plan, fully deductible
  if (!coveredByEmployerPlan && !spouseCoveredByEmployerPlan) {
    return contribution;
  }
  
  // Get phase-out limits for this year
  const limits = getYearData(TRADITIONAL_IRA_DEDUCTION_LIMITS, year);
  if (!limits) return contribution; // Fallback to fully deductible if no data
  
  let phaseOut;
  const normalizedStatus = filingStatus === 'married' ? 'married_filing_jointly' : filingStatus;
  
  if (normalizedStatus === 'married_filing_separately') {
    phaseOut = limits.married_filing_separately;
  } else if (normalizedStatus === 'married_filing_jointly') {
    if (coveredByEmployerPlan) {
      phaseOut = limits.married_filing_jointly;
    } else if (spouseCoveredByEmployerPlan) {
      phaseOut = limits.married_filing_jointly_spouse_covered;
    } else {
      return contribution; // Neither covered, fully deductible
    }
  } else {
    // Single, HoH
    if (coveredByEmployerPlan) {
      phaseOut = limits.single;
    } else {
      return contribution; // Not covered, fully deductible
    }
  }
  
  if (!phaseOut) return contribution;
  
  // Calculate deductible amount based on phase-out
  if (magi <= phaseOut.phaseoutStart) {
    return contribution; // Fully deductible
  }
  if (magi >= phaseOut.phaseoutEnd) {
    return 0; // Not deductible
  }
  
  // Partial deduction - linear phase-out
  const phaseOutRange = phaseOut.phaseoutEnd - phaseOut.phaseoutStart;
  const overStart = magi - phaseOut.phaseoutStart;
  const reductionRatio = overStart / phaseOutRange;
  const deductibleAmount = contribution * (1 - reductionRatio);
  
  // Round up to nearest $10 per IRS rules
  return Math.max(0, Math.ceil(deductibleAmount / 10) * 10);
}

// Re-export getFederalBrackets from taxData for use in other modules
export { getFederalBrackets };