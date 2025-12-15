
// TODO: Update limits annually when IRS announces new figures (usually October/November)
// Source: https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-401k-and-profit-sharing-plan-contribution-limits
// Last updated: 2025 limits

// IRS Contribution Limits - Update annually when IRS releases new limits
export const CONTRIBUTION_LIMITS = {
  2024: {
    traditional401k: 23000,
    traditional401k_catchUp: 7500,  // Additional if age 50+
    rothIRA: 7000,
    rothIRA_catchUp: 1000,  // Additional if age 50+
    hsaIndividual: 4150,
    hsaFamily: 8300,
    hsa_catchUp: 1000,  // Additional if age 55+
  },
  2025: {
    traditional401k: 23500,
    traditional401k_catchUp: 7500,
    rothIRA: 7000,
    rothIRA_catchUp: 1000,
    hsaIndividual: 4300,
    hsaFamily: 8550,
    hsa_catchUp: 1000,
  },
  // For future years not yet defined, use most recent known limits
  // The app should fall back to the most recent year's limits
};

// Helper function to get limits for a given year
export function getLimitsForYear(year) {
  if (CONTRIBUTION_LIMITS[year]) {
    return CONTRIBUTION_LIMITS[year];
  }
  // Fall back to most recent known year
  const knownYears = Object.keys(CONTRIBUTION_LIMITS).map(Number).sort((a, b) => b - a);
  return CONTRIBUTION_LIMITS[knownYears[0]];
}

// Re-export from centralized tax config for backward compatibility
export { 
  get401kLimit, 
  getRothIRALimit, 
  getHSALimit 
} from './taxConfig';
