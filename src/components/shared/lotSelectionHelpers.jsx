/**
 * Selects tax lots to sell based on the specified method
 * @param {Array} lots - Array of tax lot objects with: asset_ticker, quantity, remaining_quantity, price_per_unit, date, cost_basis
 * @param {string} ticker - The asset ticker to sell (e.g., 'BTC')
 * @param {number} quantityToSell - How much of the asset to sell
 * @param {string} method - 'FIFO', 'LIFO', or 'HIFO'
 * @returns {Object} { selectedLots: [{lot, quantityFromLot, costBasis, proceeds}], totalCostBasis, totalQuantitySold, remainingLots }
 */
export function selectLots(lots, ticker, quantityToSell, method = 'HIFO') {
  // Filter lots for this ticker with remaining quantity
  const availableLots = lots
    .filter(lot => lot.asset_ticker === ticker)
    .map(lot => ({
      ...lot,
      availableQty: lot.remaining_quantity ?? lot.quantity ?? 0,
      costPerUnit: lot.price_per_unit || (lot.cost_basis / lot.quantity) || 0,
      purchaseDate: lot.date ? new Date(lot.date) : new Date(0),
    }))
    .filter(lot => lot.availableQty > 0);

  // Sort based on method
  let sortedLots;
  switch (method) {
    case 'FIFO':
      // First In, First Out - oldest lots first (earliest date)
      sortedLots = [...availableLots].sort((a, b) => a.purchaseDate - b.purchaseDate);
      break;
    case 'LIFO':
      // Last In, First Out - newest lots first (latest date)
      sortedLots = [...availableLots].sort((a, b) => b.purchaseDate - a.purchaseDate);
      break;
    case 'HIFO':
    default:
      // Highest In, First Out - highest cost basis first (minimizes gains)
      sortedLots = [...availableLots].sort((a, b) => b.costPerUnit - a.costPerUnit);
      break;
  }

  // Select lots until we have enough quantity
  const selectedLots = [];
  let remainingToSell = quantityToSell;
  let totalCostBasis = 0;
  let totalQuantitySold = 0;

  for (const lot of sortedLots) {
    if (remainingToSell <= 0) break;

    const quantityFromLot = Math.min(lot.availableQty, remainingToSell);
    const costBasisForSale = quantityFromLot * lot.costPerUnit;

    selectedLots.push({
      lot: lot,
      quantityFromLot,
      costBasis: costBasisForSale,
      costPerUnit: lot.costPerUnit,
      purchaseDate: lot.purchaseDate,
    });

    totalCostBasis += costBasisForSale;
    totalQuantitySold += quantityFromLot;
    remainingToSell -= quantityFromLot;
  }

  // Calculate remaining lots (not selected or partially selected)
  const remainingLots = sortedLots.map(lot => {
    const selected = selectedLots.find(s => s.lot === lot);
    if (!selected) return lot;
    return {
      ...lot,
      availableQty: lot.availableQty - selected.quantityFromLot,
    };
  }).filter(lot => lot.availableQty > 0);

  return {
    selectedLots,
    totalCostBasis,
    totalQuantitySold,
    remainingToSell: Math.max(0, remainingToSell),
    remainingLots,
  };
}

/**
 * Gets the total available quantity for a ticker from lots
 */
export function getAvailableQuantity(lots, ticker) {
  return lots
    .filter(lot => lot.asset_ticker === ticker)
    .reduce((sum, lot) => sum + (lot.remaining_quantity ?? lot.quantity ?? 0), 0);
}

/**
 * Gets the weighted average cost basis for a ticker
 */
export function getWeightedAverageCostBasis(lots, ticker) {
  const tickerLots = lots.filter(lot => lot.asset_ticker === ticker);
  let totalQty = 0;
  let totalCost = 0;
  
  tickerLots.forEach(lot => {
    const qty = lot.remaining_quantity ?? lot.quantity ?? 0;
    const costPerUnit = lot.price_per_unit || (lot.cost_basis / lot.quantity) || 0;
    totalQty += qty;
    totalCost += qty * costPerUnit;
  });
  
  return totalQty > 0 ? totalCost / totalQty : 0;
}