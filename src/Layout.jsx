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
        RefreshCw,
        DollarSign
      } from 'lucide-react';
import { cn } from "@/lib/utils";

const navItems = [
  { name: 'Summary', icon: LayoutDashboard, page: 'Dashboard', description: 'Your wealth at a glance' },
  { name: 'Performance', icon: TrendingUp, page: 'Performance', description: 'Growth & returns' },
  { name: 'Projections', icon: Target, page: 'FinancialPlan', description: 'Future wealth modeling' },
  { name: 'Goals', icon: Target, page: 'Goals', description: '3-bucket savings strategy' },
  { name: 'Income & Expenses', icon: Wallet, page: 'Budget', description: 'Cash flow management' },
  { name: 'Investing', icon: ArrowLeftRight, page: 'DCAStrategy', description: 'DCA & accumulation' },
  { name: 'Fee Analysis', icon: DollarSign, page: 'FeeAnalysis', description: 'Track & reduce costs' },
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
  const darkMode = true;



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
    <div className={cn("min-h-screen transition-colors duration-300", darkMode ? "bg-[#0a0a0b] text-zinc-100" : "bg-gray-50 text-gray-900")}>
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
          color-scheme: ${darkMode ? 'dark' : 'light'};
        }
        
        /* Light mode overrides */
        .light-mode .card-premium {
          background: white;
          border: 1px solid rgb(229 231 235);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        .light-mode .card-premium:hover {
          border-color: rgba(247, 147, 26, 0.4);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        /* Light mode text fixes */
        .light-mode .text-zinc-100,
        .light-mode .text-zinc-200,
        .light-mode .text-zinc-300 {
          color: rgb(24 24 27) !important;
        }
        .light-mode .text-zinc-400 {
          color: rgb(82 82 91) !important;
        }
        .light-mode .text-zinc-500,
        .light-mode .text-zinc-600 {
          color: rgb(113 113 122) !important;
        }

        /* Light mode backgrounds */
        .light-mode .bg-zinc-800\/30,
        .light-mode .bg-zinc-800\/50 {
          background-color: rgb(249 250 251) !important;
        }
        .light-mode .bg-zinc-900,
        .light-mode .bg-zinc-900\/50 {
          background-color: rgb(243 244 246) !important;
        }
        .light-mode .bg-\[\#0f0f10\],
        .light-mode .bg-\[\#0a0a0b\] {
          background-color: white !important;
        }

        /* Light mode borders */
        .light-mode .border-zinc-800,
        .light-mode .border-zinc-800\/50,
        .light-mode .border-zinc-800\/30,
        .light-mode .border-zinc-700,
        .light-mode .border-zinc-700\/50 {
          border-color: rgb(229 231 235) !important;
        }

        /* Light mode hover states */
        .light-mode .hover\:bg-zinc-700:hover,
        .light-mode .hover\:bg-zinc-800:hover,
        .light-mode .hover\:bg-zinc-800\/50:hover {
          background-color: rgb(243 244 246) !important;
        }

        /* Light mode tabs */
        .light-mode [data-state=active] {
          background-color: white !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .light-mode .bg-zinc-800\/50 {
          background-color: rgb(243 244 246) !important;
        }

        /* Light mode inputs */
        .light-mode input,
        .light-mode textarea,
        .light-mode select,
        .light-mode [role="combobox"] {
          background-color: white !important;
          border-color: rgb(209 213 219) !important;
          color: rgb(17 24 39) !important;
        }
        .light-mode input::placeholder,
        .light-mode textarea::placeholder {
          color: rgb(156 163 175) !important;
        }

        /* Light mode dialogs */
        .light-mode [role="dialog"] {
          background-color: white !important;
          border-color: rgb(229 231 235) !important;
        }

        /* Light mode select dropdowns */
        .light-mode [role="listbox"] {
          background-color: white !important;
          border-color: rgb(229 231 235) !important;
        }
        .light-mode [role="option"] {
          color: rgb(17 24 39) !important;
        }
        .light-mode [role="option"]:hover,
        .light-mode [role="option"][data-highlighted] {
          background-color: rgb(249 250 251) !important;
        }

        /* Light mode progress bars */
        .light-mode .bg-zinc-700,
        .light-mode .bg-zinc-800 {
          background-color: rgb(229 231 235) !important;
        }

        /* Light mode badges */
        .light-mode .border-zinc-600 {
          border-color: rgb(209 213 219) !important;
        }

        /* Brand gradient text stays visible */
        .light-mode .brand-gradient-text {
          background: linear-gradient(135deg, #F7931A 0%, #c76c0f 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Light mode specific component fixes */
        .light-mode .bg-gray-100 {
          background-color: rgb(243 244 246) !important;
        }
        .light-mode .bg-white\/50 {
          background-color: rgba(255, 255, 255, 0.8) !important;
        }
        .light-mode .border-gray-200 {
          border-color: rgb(229 231 235) !important;
        }
        .light-mode .text-gray-900 {
          color: rgb(17 24 39) !important;
        }
        .light-mode .text-gray-500 {
          color: rgb(107 114 128) !important;
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
        "fixed top-0 left-0 z-40 h-full w-72 border-r transition-all duration-300 lg:translate-x-0",
        darkMode ? "bg-[#0a0a0b] border-zinc-800/30" : "bg-white border-gray-200",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={cn("hidden lg:flex items-center gap-4 px-6 h-24 border-b", darkMode ? "border-zinc-800/30" : "border-gray-200")}>
            <div className="w-12 h-12 rounded-xl brand-gradient flex items-center justify-center shadow-lg shadow-orange-500/30 glow-subtle">
              <Zap className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight">Orange Plan</span>
              <p className="text-xs text-zinc-500 mt-0.5">Financial Planning Dashboard</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto mt-16 lg:mt-0">
            <p className={cn("px-4 text-[10px] font-semibold uppercase tracking-widest mb-4", darkMode ? "text-zinc-600" : "text-gray-400")}>Navigation</p>
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
                      ? darkMode ? "sidebar-item-active text-orange-400" : "bg-orange-50 text-orange-600 border-l-2 border-orange-500"
                      : darkMode 
                        ? "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/30"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                >
                  <item.icon className={cn(
                    "w-5 h-5 transition-colors",
                    isActive 
                      ? darkMode ? "text-orange-400" : "text-orange-600" 
                      : darkMode ? "text-zinc-600 group-hover:text-zinc-400" : "text-gray-500 group-hover:text-gray-700"
                  )} />
                  <div className="flex-1">
                    <span className="font-medium">{item.name}</span>
                    {isActive && (
                      <p className={cn("text-[10px] mt-0.5", darkMode ? "text-zinc-500" : "text-gray-400")}>{item.description}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Footer - Live Data */}
          <div className={cn("p-4 border-t space-y-3", darkMode ? "border-zinc-800/30" : "border-gray-200")}>

            
            {/* BTC Price */}
            <div className={cn("rounded-xl p-4", darkMode ? "card-premium" : "bg-white border border-gray-200 shadow-sm")}>
              <div className="flex items-center justify-between mb-2">
                <p className={cn("text-[10px] font-semibold uppercase tracking-widest", darkMode ? "text-zinc-600" : "text-gray-400")}>Bitcoin</p>
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
              <div className={cn("flex items-center justify-between px-3 py-2 rounded-lg", darkMode ? "bg-zinc-900/50" : "bg-gray-100")}>
                <span className={cn("text-[10px] uppercase tracking-wider", darkMode ? "text-zinc-600" : "text-gray-400")}>Block</span>
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
      <main className={cn("lg:pl-72 pt-16 lg:pt-0 min-h-screen", !darkMode && "light-mode")}>
        <div className="p-5 lg:p-10 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}