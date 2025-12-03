import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Target, 
  Wallet, 
  ArrowLeftRight,
  Receipt,
  Scale,
  Shield,
  Menu,
  X,
  Bitcoin,
  RefreshCw
} from 'lucide-react';
import { cn } from "@/lib/utils";

const navItems = [
  { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
  { name: 'Performance', icon: TrendingUp, page: 'Performance' },
  { name: 'Financial Plan', icon: Target, page: 'FinancialPlan' },
  { name: 'Budget', icon: Wallet, page: 'Budget' },
  { name: 'DCA Strategy', icon: ArrowLeftRight, page: 'DCAStrategy' },
  { name: 'Tax Center', icon: Receipt, page: 'TaxCenter' },
  { name: 'Liabilities', icon: Scale, page: 'Liabilities' },
  { name: 'Estate & Security', icon: Shield, page: 'EstateSecurity' },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        const data = await response.json();
        setBtcPrice(data.bitcoin.usd);
        setPriceChange(data.bitcoin.usd_24h_change);
        setPriceLoading(false);
      } catch (err) {
        setBtcPrice(97000);
        setPriceChange(0);
        setPriceLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <style>{`
        :root {
          --accent: 45 93% 47%;
          --accent-foreground: 0 0% 0%;
        }
        .accent-gradient {
          background: linear-gradient(135deg, #F7931A 0%, #FFAB40 100%);
        }
        .card-glass {
          background: rgba(24, 24, 27, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .glow-amber {
          box-shadow: 0 0 60px -15px rgba(247, 147, 26, 0.3);
        }
      `}</style>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl accent-gradient flex items-center justify-center">
              <Bitcoin className="w-5 h-5 text-zinc-950" />
            </div>
            <span className="font-semibold text-lg tracking-tight">Satoshi Vault</span>
          </div>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-40 h-full w-64 bg-zinc-950 border-r border-zinc-800/50 transition-transform duration-300 lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="hidden lg:flex items-center gap-3 px-6 h-20 border-b border-zinc-800/50">
            <div className="w-10 h-10 rounded-xl accent-gradient flex items-center justify-center glow-amber">
              <Bitcoin className="w-6 h-6 text-zinc-950" />
            </div>
            <div>
              <span className="font-semibold text-lg tracking-tight">Satoshi Vault</span>
              <p className="text-xs text-zinc-500">Bitcoin Finance Hub</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto mt-16 lg:mt-0">
            {navItems.map((item) => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-amber-500/10 text-amber-400" 
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive && "text-amber-400")} />
                  {item.name}
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Footer - Live BTC Price */}
          <div className="p-4 border-t border-zinc-800/50">
            <div className="card-glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">BTC Price</p>
                {priceLoading ? (
                  <RefreshCw className="w-3 h-3 text-zinc-500 animate-spin" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
              <p className="text-xl font-bold text-amber-400">
                ${btcPrice ? btcPrice.toLocaleString() : '---'}
              </p>
              {priceChange !== null && (
                <p className={cn(
                  "text-xs font-medium mt-1",
                  priceChange >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {priceChange >= 0 ? '↑' : '↓'} {Math.abs(priceChange).toFixed(2)}% (24h)
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}