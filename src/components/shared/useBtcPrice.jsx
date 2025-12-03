import { useState, useEffect } from 'react';

export function useBtcPrice() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        const data = await response.json();
        setBtcPrice({
          price: data.bitcoin.usd,
          change24h: data.bitcoin.usd_24h_change
        });
        setLoading(false);
      } catch (err) {
        setError(err);
        setLoading(false);
        // Fallback price
        setBtcPrice({ price: 97000, change24h: 0 });
      }
    };

    fetchPrice();
    // Refresh every 60 seconds
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  return { btcPrice: btcPrice?.price || 97000, change24h: btcPrice?.change24h || 0, loading, error };
}