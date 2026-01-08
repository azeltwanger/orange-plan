import { useState, useEffect } from 'react';

export function useBtcPrice() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        const data = await response.json();
        if (data.bitcoin?.usd) {
          setBtcPrice(data.bitcoin.usd);
          setPriceChange(data.bitcoin.usd_24h_change);
          setError(null);
        }
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch BTC price:', err);
        setError(err);
        setLoading(false);
        // No fallback - keep btcPrice as null so UI can show "unavailable"
      }
    };

    fetchPrice();
    // Refresh every 60 seconds
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  return { btcPrice, priceChange, loading, error };
}