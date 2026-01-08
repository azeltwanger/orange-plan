import { useState, useEffect } from 'react';

// Cache key for sessionStorage
const CACHE_KEY = 'btc_price_cache';

export function useBtcPrice() {
  const [btcPrice, setBtcPrice] = useState(() => {
    // Initialize from cache if available
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { price, timestamp } = JSON.parse(cached);
        // Use cached value if less than 5 minutes old
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          return price;
        }
      }
    } catch (e) {}
    return null;
  });
  const [priceChange, setPriceChange] = useState(null);
  const [loading, setLoading] = useState(btcPrice === null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        
        // Check for rate limiting or error responses
        if (!response.ok) {
          console.warn('CoinGecko API error:', response.status);
          setLoading(false);
          return;
        }
        
        const data = await response.json();
        if (data.bitcoin?.usd) {
          setBtcPrice(data.bitcoin.usd);
          setPriceChange(data.bitcoin.usd_24h_change);
          setError(null);
          // Cache the price
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
              price: data.bitcoin.usd,
              change: data.bitcoin.usd_24h_change,
              timestamp: Date.now()
            }));
          } catch (e) {}
        }
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch BTC price:', err);
        setError(err);
        setLoading(false);
      }
    };

    fetchPrice();
    // Refresh every 60 seconds
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  return { btcPrice, priceChange, loading, error };
}