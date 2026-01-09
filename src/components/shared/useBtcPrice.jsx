import { useState, useEffect } from 'react';

// Cache key for sessionStorage
const CACHE_KEY = 'btc_price_cache';
const FALLBACK_PRICE = 100000; // Reasonable fallback if all APIs fail

export function useBtcPrice() {
  const [btcPrice, setBtcPrice] = useState(() => {
    // Initialize from cache if available (use even if stale as fallback)
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { price } = JSON.parse(cached);
        if (price) return price;
      }
    } catch (e) {}
    return null;
  });
  const [priceChange, setPriceChange] = useState(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { change } = JSON.parse(cached);
        return change || null;
      }
    } catch (e) {}
    return null;
  });
  const [loading, setLoading] = useState(btcPrice === null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPrice = async () => {
      // Check cache freshness first
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { price, change, timestamp } = JSON.parse(cached);
          // Use cached value if less than 2 minutes old (reduce API calls)
          if (Date.now() - timestamp < 2 * 60 * 1000 && price) {
            setBtcPrice(price);
            setPriceChange(change);
            setLoading(false);
            return;
          }
        }
      } catch (e) {}

      // Try CoinGecko first
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.bitcoin?.usd) {
            setBtcPrice(data.bitcoin.usd);
            setPriceChange(data.bitcoin.usd_24h_change);
            setError(null);
            try {
              sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                price: data.bitcoin.usd,
                change: data.bitcoin.usd_24h_change,
                timestamp: Date.now()
              }));
            } catch (e) {}
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        // CoinGecko failed, try backup
      }

      // Try Blockchain.info as backup
      try {
        const response = await fetch('https://blockchain.info/ticker', {
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.USD?.last) {
            setBtcPrice(data.USD.last);
            setError(null);
            try {
              sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                price: data.USD.last,
                change: priceChange, // Keep existing change
                timestamp: Date.now()
              }));
            } catch (e) {}
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        // Backup also failed
      }

      // If we have a cached price (even stale), use it
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { price, change } = JSON.parse(cached);
          if (price) {
            setBtcPrice(price);
            setPriceChange(change);
            setLoading(false);
            return;
          }
        }
      } catch (e) {}

      // Last resort: use fallback price
      if (!btcPrice) {
        setBtcPrice(FALLBACK_PRICE);
      }
      setLoading(false);
    };

    fetchPrice();
    // Refresh every 2 minutes (reduced frequency to avoid rate limits)
    const interval = setInterval(fetchPrice, 120000);
    return () => clearInterval(interval);
  }, []);

  return { btcPrice, priceChange, loading, error };
}