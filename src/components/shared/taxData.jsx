// =============================================================================
// TAX DATA - Updated January 2026
// Sources: IRS Revenue Procedure 2025-32, One Big Beautiful Bill Act (OBBBA)
// Historical data preserved for tax lot reporting (2024-2025)
// Future years (2027+) inflate from 2026 base using FALLBACK_INFLATION (2.5%)
// =============================================================================
//
// UPDATE CHECKLIST (Every January):
// [ ] Federal income brackets
// [ ] Federal LTCG brackets  
// [ ] Standard deductions
// [ ] Contribution limits (401k, IRA, HSA)
// [ ] Roth income limits
// [ ] Social Security wage base & bend points
// [ ] Medicare IRMAA brackets
// [ ] Estate/gift limits
// [ ] State tax updates (check each state)
// =============================================================================

const CURRENT_YEAR = 2026;
const FALLBACK_INFLATION = 0.025; // 2.5% for projecting unknown years

// ===========================================
// FEDERAL INCOME TAX BRACKETS
// ===========================================
export const FEDERAL_INCOME_BRACKETS = {
  2024: {
    single: [
      { min: 0, max: 11600, rate: 10 },
      { min: 11600, max: 47150, rate: 12 },
      { min: 47150, max: 100525, rate: 22 },
      { min: 100525, max: 191950, rate: 24 },
      { min: 191950, max: 243725, rate: 32 },
      { min: 243725, max: 609350, rate: 35 },
      { min: 609350, max: Infinity, rate: 37 }
    ],
    married_filing_jointly: [
      { min: 0, max: 23200, rate: 10 },
      { min: 23200, max: 94300, rate: 12 },
      { min: 94300, max: 201050, rate: 22 },
      { min: 201050, max: 383900, rate: 24 },
      { min: 383900, max: 487450, rate: 32 },
      { min: 487450, max: 731200, rate: 35 },
      { min: 731200, max: Infinity, rate: 37 }
    ],
    married_filing_separately: [
      { min: 0, max: 11600, rate: 10 },
      { min: 11600, max: 47150, rate: 12 },
      { min: 47150, max: 100525, rate: 22 },
      { min: 100525, max: 191950, rate: 24 },
      { min: 191950, max: 243725, rate: 32 },
      { min: 243725, max: 365600, rate: 35 },
      { min: 365600, max: Infinity, rate: 37 }
    ],
    head_of_household: [
      { min: 0, max: 16550, rate: 10 },
      { min: 16550, max: 63100, rate: 12 },
      { min: 63100, max: 100500, rate: 22 },
      { min: 100500, max: 191950, rate: 24 },
      { min: 191950, max: 243700, rate: 32 },
      { min: 243700, max: 609350, rate: 35 },
      { min: 609350, max: Infinity, rate: 37 }
    ]
  },
  2025: {
    single: [
      { min: 0, max: 11925, rate: 10 },
      { min: 11925, max: 48475, rate: 12 },
      { min: 48475, max: 103350, rate: 22 },
      { min: 103350, max: 197300, rate: 24 },
      { min: 197300, max: 250525, rate: 32 },
      { min: 250525, max: 626350, rate: 35 },
      { min: 626350, max: Infinity, rate: 37 }
    ],
    married_filing_jointly: [
      { min: 0, max: 23850, rate: 10 },
      { min: 23850, max: 96950, rate: 12 },
      { min: 96950, max: 206700, rate: 22 },
      { min: 206700, max: 394600, rate: 24 },
      { min: 394600, max: 501050, rate: 32 },
      { min: 501050, max: 751600, rate: 35 },
      { min: 751600, max: Infinity, rate: 37 }
    ],
    married_filing_separately: [
      { min: 0, max: 11925, rate: 10 },
      { min: 11925, max: 48475, rate: 12 },
      { min: 48475, max: 103350, rate: 22 },
      { min: 103350, max: 197300, rate: 24 },
      { min: 197300, max: 250525, rate: 32 },
      { min: 250525, max: 375800, rate: 35 },
      { min: 375800, max: Infinity, rate: 37 }
    ],
    head_of_household: [
      { min: 0, max: 17000, rate: 10 },
      { min: 17000, max: 64850, rate: 12 },
      { min: 64850, max: 103350, rate: 22 },
      { min: 103350, max: 197300, rate: 24 },
      { min: 197300, max: 250500, rate: 32 },
      { min: 250500, max: 626350, rate: 35 },
      { min: 626350, max: Infinity, rate: 37 }
    ]
  },
  // 2026 brackets per IRS Revenue Procedure 2025-32
  2026: {
    single: [
      { min: 0, max: 12400, rate: 10 },
      { min: 12400, max: 50400, rate: 12 },
      { min: 50400, max: 105700, rate: 22 },
      { min: 105700, max: 201775, rate: 24 },
      { min: 201775, max: 256225, rate: 32 },
      { min: 256225, max: 640600, rate: 35 },
      { min: 640600, max: Infinity, rate: 37 }
    ],
    married_filing_jointly: [
      { min: 0, max: 24800, rate: 10 },
      { min: 24800, max: 100800, rate: 12 },
      { min: 100800, max: 211400, rate: 22 },
      { min: 211400, max: 403550, rate: 24 },
      { min: 403550, max: 512450, rate: 32 },
      { min: 512450, max: 768700, rate: 35 },
      { min: 768700, max: Infinity, rate: 37 }
    ],
    married_filing_separately: [
      { min: 0, max: 12400, rate: 10 },
      { min: 12400, max: 50400, rate: 12 },
      { min: 50400, max: 105700, rate: 22 },
      { min: 105700, max: 201775, rate: 24 },
      { min: 201775, max: 256225, rate: 32 },
      { min: 256225, max: 384350, rate: 35 },
      { min: 384350, max: Infinity, rate: 37 }
    ],
    head_of_household: [
      { min: 0, max: 17650, rate: 10 },
      { min: 17650, max: 67450, rate: 12 },
      { min: 67450, max: 108150, rate: 22 },
      { min: 108150, max: 201775, rate: 24 },
      { min: 201775, max: 256225, rate: 32 },
      { min: 256225, max: 640600, rate: 35 },
      { min: 640600, max: Infinity, rate: 37 }
    ]
  }
};

// ===========================================
// FEDERAL LONG-TERM CAPITAL GAINS BRACKETS
// ===========================================
export const FEDERAL_LTCG_BRACKETS = {
  2024: {
    single: { zeroMax: 47025, fifteenMax: 518900 },
    married_filing_jointly: { zeroMax: 94050, fifteenMax: 583750 },
    married_filing_separately: { zeroMax: 47025, fifteenMax: 291850 },
    head_of_household: { zeroMax: 63000, fifteenMax: 551350 }
  },
  2025: {
    single: { zeroMax: 48350, fifteenMax: 533400 },
    married_filing_jointly: { zeroMax: 96700, fifteenMax: 600050 },
    married_filing_separately: { zeroMax: 48350, fifteenMax: 300000 },
    head_of_household: { zeroMax: 64750, fifteenMax: 566700 }
  },
  // 2026 LTCG brackets per IRS Revenue Procedure 2025-32
  2026: {
    single: { zeroMax: 49650, fifteenMax: 547350 },
    married_filing_jointly: { zeroMax: 99300, fifteenMax: 615550 },
    married_filing_separately: { zeroMax: 49650, fifteenMax: 307775 },
    head_of_household: { zeroMax: 66450, fifteenMax: 580650 }
  }
};

// ===========================================
// STANDARD DEDUCTIONS
// ===========================================
export const STANDARD_DEDUCTIONS = {
  2024: {
    single: 14600,
    married_filing_jointly: 29200,
    married_filing_separately: 14600,
    head_of_household: 21900,
    // Additional for age 65+ or blind (per person)
    additional_single: 1950,
    additional_married: 1550
  },
  2025: {
    single: 15000,
    married_filing_jointly: 30000,
    married_filing_separately: 15000,
    head_of_household: 22500,
    additional_single: 2000,
    additional_married: 1600
  },
  // 2026 per IRS Revenue Procedure 2025-32
  2026: {
    single: 16100,
    married_filing_jointly: 32200,
    married_filing_separately: 16100,
    head_of_household: 24150,
    additional_single: 2050,
    additional_married: 1650
  }
};

// ===========================================
// RETIREMENT CONTRIBUTION LIMITS
// ===========================================
export const CONTRIBUTION_LIMITS = {
  2024: {
    // 401(k), 403(b), 457, TSP
    traditional_401k: 23000,
    traditional_401k_catchup: 7500, // Age 50+
    total_401k_limit: 69000, // Employee + employer combined

    // IRA
    traditional_ira: 7000,
    traditional_ira_catchup: 1000, // Age 50+

    // Roth IRA (same limits, different income thresholds)
    roth_ira: 7000,
    roth_ira_catchup: 1000,

    // HSA
    hsa_single: 4150,
    hsa_family: 8300,
    hsa_catchup: 1000, // Age 55+

    // SEP IRA
    sep_ira_percent: 25, // % of compensation
    sep_ira_max: 69000,

    // SIMPLE IRA
    simple_ira: 16000,
    simple_ira_catchup: 3500,

    // Solo 401k limits
    solo_401k_employee: 23000,
    solo_401k_employee_catchup: 7500,
    solo_401k_combined: 69000,
    solo_401k_combined_catchup: 76500
  },
  2025: {
    traditional_401k: 23500,
    traditional_401k_catchup: 7500,
    traditional_401k_super_catchup: 11250, // Ages 60-63 (new for 2025)
    total_401k_limit: 70000,

    traditional_ira: 7000,
    traditional_ira_catchup: 1000,

    roth_ira: 7000,
    roth_ira_catchup: 1000,

    hsa_single: 4300,
    hsa_family: 8550,
    hsa_catchup: 1000,

    sep_ira_percent: 25,
    sep_ira_max: 70000,

    simple_ira: 16500,
    simple_ira_catchup: 3500,

    // Solo 401k limits
    solo_401k_employee: 23500,
    solo_401k_employee_catchup: 7500,
    solo_401k_combined: 70000,
    solo_401k_combined_catchup: 77500
  },
  // 2026 contribution limits per IRS
  2026: {
    traditional_401k: 24000,
    traditional_401k_catchup: 7500,
    traditional_401k_super_catchup: 11250, // Ages 60-63
    total_401k_limit: 71500,

    traditional_ira: 7000,
    traditional_ira_catchup: 1000,

    roth_ira: 7000,
    roth_ira_catchup: 1000,

    hsa_single: 4400,
    hsa_family: 8750,
    hsa_catchup: 1000,

    sep_ira_percent: 25,
    sep_ira_max: 71500,

    simple_ira: 17000,
    simple_ira_catchup: 3500,

    // Solo 401k limits (self-employed)
    solo_401k_employee: 24000,
    solo_401k_employee_catchup: 7500,
    solo_401k_combined: 71500, // Employee + employer total
    solo_401k_combined_catchup: 79000 // 50+ total limit
  }
};

// ===========================================
// ROTH IRA INCOME LIMITS (MAGI Phase-outs)
// ===========================================
export const ROTH_INCOME_LIMITS = {
  2024: {
    single: { phaseoutStart: 146000, phaseoutEnd: 161000 },
    married_filing_jointly: { phaseoutStart: 230000, phaseoutEnd: 240000 },
    married_filing_separately: { phaseoutStart: 0, phaseoutEnd: 10000 }
  },
  2025: {
    single: { phaseoutStart: 150000, phaseoutEnd: 165000 },
    married_filing_jointly: { phaseoutStart: 236000, phaseoutEnd: 246000 },
    married_filing_separately: { phaseoutStart: 0, phaseoutEnd: 10000 }
  },
  // 2026 Roth IRA income limits
  2026: {
    single: { phaseoutStart: 154000, phaseoutEnd: 169000 },
    married_filing_jointly: { phaseoutStart: 242000, phaseoutEnd: 252000 },
    married_filing_separately: { phaseoutStart: 0, phaseoutEnd: 10000 }
  }
};

// ===========================================
// TRADITIONAL IRA DEDUCTION LIMITS (if covered by workplace plan)
// ===========================================
export const TRADITIONAL_IRA_DEDUCTION_LIMITS = {
  2024: {
    single: { phaseoutStart: 77000, phaseoutEnd: 87000 },
    married_filing_jointly: { phaseoutStart: 123000, phaseoutEnd: 143000 },
    married_filing_jointly_spouse_covered: { phaseoutStart: 230000, phaseoutEnd: 240000 },
    married_filing_separately: { phaseoutStart: 0, phaseoutEnd: 10000 }
  },
  2025: {
    single: { phaseoutStart: 79000, phaseoutEnd: 89000 },
    married_filing_jointly: { phaseoutStart: 126000, phaseoutEnd: 146000 },
    married_filing_jointly_spouse_covered: { phaseoutStart: 236000, phaseoutEnd: 246000 },
    married_filing_separately: { phaseoutStart: 0, phaseoutEnd: 10000 }
  },
  // 2026 Traditional IRA deduction limits
  2026: {
    single: { phaseoutStart: 81000, phaseoutEnd: 91000 },
    married_filing_jointly: { phaseoutStart: 129000, phaseoutEnd: 149000 },
    married_filing_jointly_spouse_covered: { phaseoutStart: 242000, phaseoutEnd: 252000 },
    married_filing_separately: { phaseoutStart: 0, phaseoutEnd: 10000 }
  }
};

// ===========================================
// SOCIAL SECURITY
// ===========================================
export const SOCIAL_SECURITY = {
  2024: {
    wageBase: 168600, // Maximum earnings subject to SS tax
    taxRate: 6.2, // Employee portion (employer matches)
    maxBenefit: 4873, // Maximum monthly benefit at FRA
    
    // Earnings test (before FRA)
    earningsTestUnderFRA: 22320, // $1 withheld per $2 over this
    earningsTestYearOfFRA: 59520, // $1 withheld per $3 over this (only counts months before FRA)
    
    // Bend points for PIA calculation
    bendPoint1: 1174,
    bendPoint2: 7078,
    
    // COLA (Cost of Living Adjustment) applied
    cola: 3.2
  },
  2025: {
    wageBase: 176100,
    taxRate: 6.2,
    maxBenefit: 5108,
    
    earningsTestUnderFRA: 23400,
    earningsTestYearOfFRA: 62160,
    
    bendPoint1: 1226,
    bendPoint2: 7391,
    
    cola: 2.5
  },
  // 2026 Social Security limits
  2026: {
    wageBase: 180600,
    taxRate: 6.2,
    maxBenefit: 5236,
    
    earningsTestUnderFRA: 24000,
    earningsTestYearOfFRA: 63600,
    
    bendPoint1: 1256,
    bendPoint2: 7572,
    
    cola: 2.3 // Estimated COLA for 2026
  }
};

// Full Retirement Age by birth year (doesn't change annually)
export const FULL_RETIREMENT_AGE = {
  1943: { years: 66, months: 0 },
  1944: { years: 66, months: 0 },
  1945: { years: 66, months: 0 },
  1946: { years: 66, months: 0 },
  1947: { years: 66, months: 0 },
  1948: { years: 66, months: 0 },
  1949: { years: 66, months: 0 },
  1950: { years: 66, months: 0 },
  1951: { years: 66, months: 0 },
  1952: { years: 66, months: 0 },
  1953: { years: 66, months: 0 },
  1954: { years: 66, months: 0 },
  1955: { years: 66, months: 2 },
  1956: { years: 66, months: 4 },
  1957: { years: 66, months: 6 },
  1958: { years: 66, months: 8 },
  1959: { years: 66, months: 10 },
  1960: { years: 67, months: 0 }, // 1960 and later
};

// ===========================================
// REQUIRED MINIMUM DISTRIBUTIONS (RMD)
// ===========================================
/**
 * RMD (Required Minimum Distribution) rules for tax-deferred accounts.
 * 
 * Starting age depends on birth year:
 * - Born before 1951: Age 70.5
 * - Born 1951-1959: Age 73
 * - Born 1960+: Age 75
 * 
 * Uniform Lifetime Table: IRS actuarial table for RMD divisor by age.
 * RMD Amount = Account Balance / Distribution Period
 * 
 * Example: Age 75 with $1M in Traditional IRA
 * - Distribution period: 24.6
 * - RMD: $1,000,000 / 24.6 = $40,650
 */
export const RMD_RULES = {
  // Starting age for RMDs
  startingAge: {
    bornBefore1951: 70.5,
    born1951to1959: 73,
    born1960orLater: 75
  },
  
  // Uniform Lifetime Table (for most people)
  // Age: Distribution Period (divisor)
  uniformLifetimeTable: {
    72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
    81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
    90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8,
    100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9,
    109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7,
    118: 2.5, 119: 2.3, 120: 2.0
  }
};

// ===========================================
// MEDICARE IRMAA BRACKETS
// (Income-Related Monthly Adjustment Amount)
// ===========================================
export const MEDICARE_IRMAA = {
  2024: {
    partB_base: 174.70, // Base monthly premium
    partD_base: 0, // Varies by plan, this is just the surcharge
    brackets: {
      single: [
        { maxIncome: 103000, partB_surcharge: 0, partD_surcharge: 0 },
        { maxIncome: 129000, partB_surcharge: 69.90, partD_surcharge: 12.90 },
        { maxIncome: 161000, partB_surcharge: 174.70, partD_surcharge: 33.30 },
        { maxIncome: 193000, partB_surcharge: 279.50, partD_surcharge: 53.80 },
        { maxIncome: 500000, partB_surcharge: 384.30, partD_surcharge: 74.20 },
        { maxIncome: Infinity, partB_surcharge: 419.30, partD_surcharge: 81.00 }
      ],
      married_filing_jointly: [
        { maxIncome: 206000, partB_surcharge: 0, partD_surcharge: 0 },
        { maxIncome: 258000, partB_surcharge: 69.90, partD_surcharge: 12.90 },
        { maxIncome: 322000, partB_surcharge: 174.70, partD_surcharge: 33.30 },
        { maxIncome: 386000, partB_surcharge: 279.50, partD_surcharge: 53.80 },
        { maxIncome: 750000, partB_surcharge: 384.30, partD_surcharge: 74.20 },
        { maxIncome: Infinity, partB_surcharge: 419.30, partD_surcharge: 81.00 }
      ]
    }
  },
  2025: {
    partB_base: 185.00,
    partD_base: 0,
    brackets: {
      single: [
        { maxIncome: 106000, partB_surcharge: 0, partD_surcharge: 0 },
        { maxIncome: 133000, partB_surcharge: 74.00, partD_surcharge: 13.70 },
        { maxIncome: 167000, partB_surcharge: 185.00, partD_surcharge: 35.30 },
        { maxIncome: 200000, partB_surcharge: 296.00, partD_surcharge: 57.00 },
        { maxIncome: 500000, partB_surcharge: 407.00, partD_surcharge: 78.60 },
        { maxIncome: Infinity, partB_surcharge: 443.90, partD_surcharge: 85.80 }
      ],
      married_filing_jointly: [
        { maxIncome: 212000, partB_surcharge: 0, partD_surcharge: 0 },
        { maxIncome: 266000, partB_surcharge: 74.00, partD_surcharge: 13.70 },
        { maxIncome: 334000, partB_surcharge: 185.00, partD_surcharge: 35.30 },
        { maxIncome: 400000, partB_surcharge: 296.00, partD_surcharge: 57.00 },
        { maxIncome: 750000, partB_surcharge: 407.00, partD_surcharge: 78.60 },
        { maxIncome: Infinity, partB_surcharge: 443.90, partD_surcharge: 85.80 }
      ]
    }
  },
  // 2026 Medicare IRMAA brackets (estimated)
  2026: {
    partB_base: 190.00,
    partD_base: 0,
    brackets: {
      single: [
        { maxIncome: 109000, partB_surcharge: 0, partD_surcharge: 0 },
        { maxIncome: 136000, partB_surcharge: 76.00, partD_surcharge: 14.00 },
        { maxIncome: 171000, partB_surcharge: 190.00, partD_surcharge: 36.20 },
        { maxIncome: 205000, partB_surcharge: 304.00, partD_surcharge: 58.40 },
        { maxIncome: 500000, partB_surcharge: 418.00, partD_surcharge: 80.60 },
        { maxIncome: Infinity, partB_surcharge: 456.00, partD_surcharge: 88.00 }
      ],
      married_filing_jointly: [
        { maxIncome: 218000, partB_surcharge: 0, partD_surcharge: 0 },
        { maxIncome: 272000, partB_surcharge: 76.00, partD_surcharge: 14.00 },
        { maxIncome: 342000, partB_surcharge: 190.00, partD_surcharge: 36.20 },
        { maxIncome: 410000, partB_surcharge: 304.00, partD_surcharge: 58.40 },
        { maxIncome: 750000, partB_surcharge: 418.00, partD_surcharge: 80.60 },
        { maxIncome: Infinity, partB_surcharge: 456.00, partD_surcharge: 88.00 }
      ]
    }
  }
};

// ===========================================
// ESTATE AND GIFT TAX
// ===========================================
export const ESTATE_GIFT_TAX = {
  2024: {
    annualGiftExclusion: 18000, // Per recipient
    lifetimeExemption: 13610000, // Combined estate/gift
    topRate: 40
  },
  2025: {
    annualGiftExclusion: 19000,
    lifetimeExemption: 13990000,
    topRate: 40
  },
  // 2026: OBBBA made TCJA permanent and increased exemption
  2026: {
    annualGiftExclusion: 19000,
    lifetimeExemption: 15000000, // OBBBA set at $15M (TCJA made permanent)
    topRate: 40
  }
};

// ===========================================
// NET INVESTMENT INCOME TAX (NIIT)
// ===========================================
export const NIIT = {
  rate: 3.8,
  // These thresholds are NOT inflation-adjusted
  thresholds: {
    single: 200000,
    married_filing_jointly: 250000,
    married_filing_separately: 125000,
    head_of_household: 200000
  }
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Get tax data for a specific year with inflation adjustment for future projections.
 * 
 * If exact year exists in data: Returns actual values
 * If year is in future: Projects from most recent data using inflation rate
 * 
 * Inflation projection example:
 * - 2025 bracket max: $48,475
 * - 2030 projection (2.5% inflation): $48,475 × 1.025^5 = $54,848
 * 
 * @param {Object} dataObject - Tax data object (e.g., FEDERAL_INCOME_BRACKETS)
 * @param {number} year - Target year
 * @param {number} customInflationRate - Inflation rate override (default 2.5%)
 * @returns {Object} - Tax data for that year (actual or inflated)
 */
export function getYearData(dataObject, year, customInflationRate = null) {
  if (dataObject[year]) {
    return dataObject[year];
  }
  
  // Find most recent year available
  const availableYears = Object.keys(dataObject).map(Number).sort((a, b) => b - a);
  const mostRecentYear = availableYears.find(y => y <= year) || availableYears[0];
  const yearDiff = year - mostRecentYear;
  
  if (yearDiff === 0) {
    return dataObject[mostRecentYear];
  }
  
  // Use custom rate or fallback
  const inflationRate = customInflationRate !== null ? customInflationRate : FALLBACK_INFLATION;
  
  // Inflate values for future years
  const baseData = dataObject[mostRecentYear];
  return inflateDataWithRate(baseData, yearDiff, inflationRate);
}

// Recursively inflate numeric values with custom rate
function inflateDataWithRate(data, years, rate) {
  if (typeof data === 'number') {
    return Math.round(data * Math.pow(1 + rate, years));
  }
  if (Array.isArray(data)) {
    return data.map(item => inflateDataWithRate(item, years, rate));
  }
  if (typeof data === 'object' && data !== null) {
    const inflated = {};
    for (const key in data) {
      inflated[key] = inflateDataWithRate(data[key], years, rate);
    }
    return inflated;
  }
  return data;
}

// Get federal income tax brackets for a year
export function getFederalBrackets(year, filingStatus = 'single', inflationRate = null) {
  const yearData = getYearData(FEDERAL_INCOME_BRACKETS, year, inflationRate);
  const normalizedStatus = filingStatus === 'married' ? 'married_filing_jointly' : filingStatus;
  return yearData[normalizedStatus] || yearData.single;
}

// Get LTCG brackets for a year
export function getLTCGBrackets(year, filingStatus = 'single', inflationRate = null) {
  const yearData = getYearData(FEDERAL_LTCG_BRACKETS, year, inflationRate);
  const normalizedStatus = filingStatus === 'married' ? 'married_filing_jointly' : filingStatus;
  return yearData[normalizedStatus] || yearData.single;
}

// Get standard deduction for a year
// Includes additional deduction for seniors (65+) and blind taxpayers
export function getStandardDeduction(year, filingStatus = 'single', age = 0, isBlind = false, inflationRate = null) {
  const yearData = getYearData(STANDARD_DEDUCTIONS, year, inflationRate);
  const normalizedStatus = filingStatus === 'married' ? 'married_filing_jointly' : filingStatus;
  const isMarried = normalizedStatus === 'married_filing_jointly';
  
  let deduction = yearData[normalizedStatus] || yearData.single;
  
  // Add additional deduction for 65+ or blind
  if (age >= 65 || isBlind) {
    const additional = isMarried 
      ? yearData.additional_married 
      : yearData.additional_single;
    if (additional) {
      deduction += additional;
      if (age >= 65 && isBlind) {
        deduction += additional; // Double if both
      }
    }
  }
  
  return deduction;
}

// Get contribution limit for a year
export function getContributionLimit(year, type, age = 0) {
  const yearData = getYearData(CONTRIBUTION_LIMITS, year);
  let limit = yearData[type] || 0;
  
  // Add catch-up if applicable
  if (age >= 50) {
    if (type === 'traditional_401k' && age >= 60 && age <= 63 && yearData.traditional_401k_super_catchup) {
      limit += yearData.traditional_401k_super_catchup;
    } else if (type === 'traditional_401k' && yearData.traditional_401k_catchup) {
      limit += yearData.traditional_401k_catchup;
    } else if (type === 'traditional_ira' && yearData.traditional_ira_catchup) {
      limit += yearData.traditional_ira_catchup;
    } else if (type === 'roth_ira' && yearData.roth_ira_catchup) {
      limit += yearData.roth_ira_catchup;
    } else if ((type === 'hsa_single' || type === 'hsa_family') && age >= 55 && yearData.hsa_catchup) {
      limit += yearData.hsa_catchup;
    }
  }
  
  return limit;
}

/**
 * Get Required Minimum Distribution divisor for a given age.
 * 
 * Uses IRS Uniform Lifetime Table. RMD = Account Balance / Factor
 * 
 * @param {number} age - Age of account owner
 * @returns {number|null} - Distribution period divisor, or null if under 72
 */
export function getRMDFactor(age) {
  const table = RMD_RULES.uniformLifetimeTable;
  if (age < 72) return null; // No RMD required yet
  if (age > 120) return table[120];
  return table[age] || table[120];
}

// Get RMD starting age based on birth year
export function getRMDStartAge(birthYear) {
  if (birthYear < 1951) return 70.5;
  if (birthYear <= 1959) return 73;
  return 75;
}

// Get Full Retirement Age for Social Security
export function getFullRetirementAge(birthYear) {
  if (birthYear <= 1954) return { years: 66, months: 0 };
  if (birthYear >= 1960) return { years: 67, months: 0 };
  return FULL_RETIREMENT_AGE[birthYear] || { years: 67, months: 0 };
}

// Calculate Medicare IRMAA surcharge
export function getMedicareIRMAA(year, income, filingStatus = 'single') {
  const yearData = getYearData(MEDICARE_IRMAA, year);
  const normalizedStatus = filingStatus === 'married' ? 'married_filing_jointly' : filingStatus;
  const brackets = yearData.brackets[normalizedStatus] || yearData.brackets.single;
  
  for (const bracket of brackets) {
    if (income <= bracket.maxIncome) {
      return {
        partB_monthly: yearData.partB_base + bracket.partB_surcharge,
        partD_surcharge: bracket.partD_surcharge,
        annual_total: (yearData.partB_base + bracket.partB_surcharge + bracket.partD_surcharge) * 12
      };
    }
  }
  
  // Should never reach here, but return highest bracket
  const lastBracket = brackets[brackets.length - 1];
  return {
    partB_monthly: yearData.partB_base + lastBracket.partB_surcharge,
    partD_surcharge: lastBracket.partD_surcharge,
    annual_total: (yearData.partB_base + lastBracket.partB_surcharge + lastBracket.partD_surcharge) * 12
  };
}

// Check if Roth IRA contribution is allowed
export function getRothContributionLimit(year, magi, filingStatus = 'single', age = 0) {
  const yearData = getYearData(ROTH_INCOME_LIMITS, year);
  const limits = getYearData(CONTRIBUTION_LIMITS, year);
  const normalizedStatus = filingStatus === 'married' ? 'married_filing_jointly' : filingStatus;
  const phaseout = yearData[normalizedStatus] || yearData.single;
  
  const baseLimit = limits.roth_ira + (age >= 50 ? limits.roth_ira_catchup : 0);
  
  if (magi <= phaseout.phaseoutStart) {
    return baseLimit; // Full contribution allowed
  }
  if (magi >= phaseout.phaseoutEnd) {
    return 0; // No contribution allowed
  }
  
  // Partial contribution
  const phaseoutRange = phaseout.phaseoutEnd - phaseout.phaseoutStart;
  const overLimit = magi - phaseout.phaseoutStart;
  const reduction = (overLimit / phaseoutRange) * baseLimit;
  return Math.max(0, Math.round(baseLimit - reduction));
}

// Export current year constant
export { CURRENT_YEAR, FALLBACK_INFLATION };