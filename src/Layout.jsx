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
  Zap,
  RefreshCw
} from 'lucide-react';
import { cn } from "@/lib/utils";

const navItems = [
  { name: 'Summary', icon: LayoutDashboard, page: 'Dashboard', description: 'Your wealth at a glance' },
  { name: 'Performance', icon: TrendingUp, page: 'Performance', description: 'Growth & returns' },
  { name: 'Projections', icon: Target, page: 'FinancialPlan', description: 'Future wealth modeling' },
  { name: 'Income & Expenses', icon: Wallet, page: 'Budget', description: 'Cash flow management' },
  { name: 'Investing', icon: ArrowLeftRight, page: 'DCAStrategy', description: 'DCA & accumulation' },
  { name: 'Tax Strategy', icon: Receipt, page: 'TaxCenter', description: 'Optimize your taxes' },
  { name: 'Liabilities', icon: Scale, page: 'Liabilities', description: 'Debt management' },
  { name: 'Estate Planning', icon: Shield, page: 'EstateSecurity', description: 'Inheritance & security' },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [blockHeight, setBlockHeight] = useState(null);

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

    const fetchBlockHeight = async () => {
      try {
        const response = await fetch('https://mempool.space/api/blocks/tip/height');
        const height = await response.json();
        setBlockHeight(height);
      } catch (err) {
        setBlockHeight(null);
      }
    };

    fetchPrice();
    fetchBlockHeight();
    const priceInterval = setInterval(fetchPrice, 60000);
    const blockInterval = setInterval(fetchBlockHeight, 60000);
    return () => {
      clearInterval(priceInterval);
      clearInterval(blockInterval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100">
      <style>{`
        :root {
          --accent: 24 95% 53%;
          --accent-foreground: 0 0% 0%;
        }
        .brand-gradient {
          background: linear-gradient(135deg, #F7931A 0%, #FF6B00 50%, #F7931A 100%);
        }
        .brand-gradient-text {
          background: linear-gradient(135deg, #F7931A 0%, #FFB347 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .card-premium {
          background: linear-gradient(145deg, rgba(20, 20, 22, 0.9) 0%, rgba(15, 15, 17, 0.95) 100%);
          backdrop-filter: blur(40px);
          border: 1px solid rgba(247, 147, 26, 0.08);
        }
        .card-premium:hover {
          border-color: rgba(247, 147, 26, 0.15);
        }
        .glow-orange {
          box-shadow: 0 0 80px -20px rgba(247, 147, 26, 0.4);
        }
        .glow-subtle {
          box-shadow: 0 0 40px -10px rgba(247, 147, 26, 0.15);
        }
        .sidebar-item-active {
          background: linear-gradient(90deg, rgba(247, 147, 26, 0.12) 0%, rgba(247, 147, 26, 0.05) 100%);
          border-left: 2px solid #F7931A;
        }
        .glass-dark {
          background: rgba(10, 10, 11, 0.8);
          backdrop-filter: blur(20px);
        }
        .pulse-dot {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(16, 185, 129, 0.6); }
          50% { opacity: 0.7; box-shadow: 0 0 16px rgba(16, 185, 129, 0.8); }
        }
        
        /* Fix dark mode input text color */
        input, textarea, select {
          color: inherit !important;
        }
        input::placeholder, textarea::placeholder {
          color: rgb(113 113 122) !important;
        }
        input[type="date"], input[type="number"], input[type="text"] {
          color-scheme: dark;
        }

      `}</style>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-dark border-b border-zinc-800/30">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg brand-gradient flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight">Orange Plan</span>
            </div>
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
        "fixed top-0 left-0 z-40 h-full w-72 bg-[#0a0a0b] border-r border-zinc-800/30 transition-transform duration-300 lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="hidden lg:flex items-center gap-4 px-6 h-24 border-b border-zinc-800/30">
            <div className="w-12 h-12 rounded-xl brand-gradient flex items-center justify-center shadow-lg shadow-orange-500/30 glow-subtle">
              <Zap className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight">Orange Plan</span>
              <p className="text-xs text-zinc-500 mt-0.5">Sovereign Wealth Protocol</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto mt-16 lg:mt-0">
            <p className="px-4 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-4">Navigation</p>
            {navItems.map((item) => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200 group",
                    isActive 
                      ? "sidebar-item-active text-orange-400" 
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/30"
                  )}
                >
                  <item.icon className={cn(
                    "w-5 h-5 transition-colors",
                    isActive ? "text-orange-400" : "text-zinc-600 group-hover:text-zinc-400"
                  )} />
                  <div className="flex-1">
                    <span className="font-medium">{item.name}</span>
                    {isActive && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">{item.description}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Footer - Live Data */}
          <div className="p-4 border-t border-zinc-800/30 space-y-3">
            {/* BTC Price */}
            <div className="card-premium rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Bitcoin</p>
                <div className="flex items-center gap-1.5">
                  {priceLoading ? (
                    <RefreshCw className="w-3 h-3 text-zinc-600 animate-spin" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
                  )}
                  <span className="text-[10px] text-zinc-600">LIVE</span>
                </div>
              </div>
              <p className="text-2xl font-bold brand-gradient-text">
                ${btcPrice ? btcPrice.toLocaleString() : '---'}
              </p>
              {priceChange !== null && (
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn(
                    "text-xs font-semibold",
                    priceChange >= 0 ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {priceChange >= 0 ? '↑' : '↓'} {Math.abs(priceChange).toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-zinc-600">24h</span>
                </div>
              )}
            </div>

            {/* Block Height */}
            {blockHeight && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/50">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Block</span>
                <span className="text-xs font-mono text-orange-400/80">{blockHeight.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/80 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="lg:pl-72 pt-16 lg:pt-0 min-h-screen">
        <div className="p-5 lg:p-10 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}