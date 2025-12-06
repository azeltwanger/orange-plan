import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import {
  TrendingUp,
  Shield,
  Target,
  PieChart,
  ArrowRight,
  CheckCircle,
  Zap,
  BarChart3,
  Calculator,
  Wallet,
  Scale,
  RefreshCw,
  ArrowLeftRight,
  LayoutDashboard,
  Receipt
} from 'lucide-react';
import { Button } from "@/components/ui/button";

const detailedFeatures = [
  {
    title: "Net Worth Tracking",
    description: "Get a complete picture of your financial health. Track assets across crypto, stocks, real estate, and bank accounts in one unified dashboard. Monitor your progress towards financial independence with real-time updates.",
    icon: LayoutDashboard,
    color: "orange",
    image: (
      <div className="w-full h-full bg-zinc-900/50 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent" />
        <div className="relative z-10 text-center">
            <div className="text-4xl font-bold text-white mb-2">$1.2M</div>
            <div className="text-sm text-emerald-400">+12.5% YTD</div>
        </div>
        {/* Abstract chart lines */}
        <svg className="absolute bottom-0 left-0 right-0 h-16 text-orange-500/20" viewBox="0 0 100 20" preserveAspectRatio="none">
            <path d="M0 20 L0 10 Q 20 5 40 12 T 80 8 T 100 15 L 100 20 Z" fill="currentColor" />
        </svg>
      </div>
    )
  },
  {
    title: "Retirement Modeling",
    description: "Advanced Monte Carlo simulations help you visualize your retirement probability. Test different withdrawal strategies, market conditions, and life expectancy assumptions to build a robust plan.",
    icon: Target,
    color: "blue",
    image: (
      <div className="w-full h-full bg-zinc-900/50 flex items-center justify-center relative">
         <div className="space-y-2 w-3/4">
            <div className="flex justify-between text-xs text-zinc-400">
                <span>Success Rate</span>
                <span className="text-emerald-400">94%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full w-[94%] bg-emerald-500" />
            </div>
            <div className="flex justify-between text-xs text-zinc-400 mt-4">
                <span>Portfolio Survival</span>
                <span>35 Years</span>
            </div>
         </div>
      </div>
    )
  },
  {
    title: "Tax Optimization",
    description: "Don't pay more tax than necessary. Our tax center tracks cost basis for every transaction and suggests optimal lot selection (FIFO, LIFO, HIFO) to minimize your tax burden.",
    icon: Receipt,
    color: "purple",
    image: (
      <div className="w-full h-full bg-zinc-900/50 flex flex-col items-center justify-center relative p-6">
        <div className="w-full space-y-3">
            <div className="flex justify-between items-center p-2 rounded bg-zinc-800/50 border border-zinc-700/50">
                <span className="text-xs text-zinc-400">Short Term Cap Gains</span>
                <span className="text-xs text-rose-400">$4,200</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-zinc-800/50 border border-zinc-700/50">
                <span className="text-xs text-zinc-400">Harvestable Losses</span>
                <span className="text-xs text-emerald-400">-$1,500</span>
            </div>
            <div className="mt-2 text-center">
                <span className="text-xs font-medium text-purple-400">Potential Savings: $350</span>
            </div>
        </div>
      </div>
    )
  },
  {
    title: "DCA & Investment Plans",
    description: "Automate your wealth building. Create Dollar Cost Averaging (DCA) plans, compare them against lump sum investing, and visualize how your stack grows over time.",
    icon: BarChart3,
    color: "emerald",
    image: (
      <div className="w-full h-full bg-zinc-900/50 flex items-end justify-center relative px-8 pb-8 pt-12">
        <div className="flex items-end gap-2 w-full h-full">
            <div className="w-1/4 h-[30%] bg-zinc-700/50 rounded-t" />
            <div className="w-1/4 h-[50%] bg-zinc-700/50 rounded-t" />
            <div className="w-1/4 h-[70%] bg-emerald-500/30 rounded-t" />
            <div className="w-1/4 h-[90%] bg-emerald-500 rounded-t relative group">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-[10px] font-bold px-2 py-1 rounded opacity-100">
                    Goal
                </div>
            </div>
        </div>
      </div>
    )
  },
  {
    title: "Scenario Builder",
    description: "What if you retire early? What if Bitcoin hits $1M? Use the Scenario Builder to create and compare parallel financial universes to make better decisions today.",
    icon: RefreshCw,
    color: "indigo",
    image: (
      <div className="w-full h-full bg-zinc-900/50 flex items-center justify-center relative">
        <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded bg-zinc-800 border border-zinc-700 text-center">
                <div className="text-xs text-zinc-500">Base Case</div>
                <div className="text-sm font-bold text-white">$2.4M</div>
            </div>
            <div className="p-3 rounded bg-indigo-900/20 border border-indigo-500/30 text-center">
                <div className="text-xs text-indigo-300">Early Retire</div>
                <div className="text-sm font-bold text-indigo-400">$1.8M</div>
            </div>
        </div>
      </div>
    )
  },
  {
    title: "Estate & Inheritance Protocol",
    description: "Secure your legacy. Define clear protocols for your heirs to access your assets. Set up a Dead Man's Switch to automatically notify beneficiaries if you're inactive.",
    icon: Shield,
    color: "rose",
    image: (
      <div className="w-full h-full bg-zinc-900/50 flex items-center justify-center relative">
         <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-3">
                <Shield className="w-6 h-6 text-rose-500" />
            </div>
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-zinc-400">Protocol Active</span>
            </div>
         </div>
      </div>
    )
  }
];

export default function Features() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 overflow-hidden">
      <style>{`
        .brand-gradient {
          background: linear-gradient(135deg, #F7931A 0%, #FF6B00 100%);
        }
        .brand-gradient-text {
          background: linear-gradient(135deg, #F7931A 0%, #FFB347 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#09090b]/80 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to={createPageUrl('Landing')} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg brand-gradient flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-lg">Orange Plan</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to={createPageUrl('Features')} className="text-sm text-white font-medium transition-colors hidden sm:block">
              Features
            </Link>
            <Link to={createPageUrl('Pricing')} className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">
              Pricing
            </Link>
            <Link to={createPageUrl('Dashboard')}>
              <Button size="sm" className="brand-gradient text-white font-medium hover:opacity-90">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Powerful tools for your <br/>
            <span className="brand-gradient-text">financial future</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10">
            Explore the comprehensive suite of features designed to help you build, track, and protect your wealth.
        </p>
      </section>

      {/* Detailed Features Grid */}
      <section className="pb-24 px-6">
        <div className="max-w-6xl mx-auto space-y-24">
            {detailedFeatures.map((feature, i) => (
                <div key={i} className={`flex flex-col lg:flex-row items-center gap-12 ${i % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>
                    {/* Text Content */}
                    <div className="flex-1 space-y-6">
                        <div className={`w-12 h-12 rounded-xl bg-${feature.color}-500/10 flex items-center justify-center`}>
                            <feature.icon className={`w-6 h-6 text-${feature.color}-400`} />
                        </div>
                        <h2 className="text-3xl font-bold">{feature.title}</h2>
                        <p className="text-zinc-400 text-lg leading-relaxed">
                            {feature.description}
                        </p>
                        <ul className="space-y-3">
                            {['Real-time data', 'Secure & Private', 'Exportable reports'].map((item, j) => (
                                <li key={j} className="flex items-center gap-3 text-sm text-zinc-300">
                                    <CheckCircle className={`w-4 h-4 text-${feature.color}-400`} />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Visual/Image Placeholder */}
                    <div className="flex-1 w-full aspect-video lg:aspect-square max-h-[400px] rounded-2xl border border-white/10 bg-black/20 overflow-hidden relative group hover:border-white/20 transition-colors">
                        {feature.image}
                    </div>
                </div>
            ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">Ready to get started?</h2>
            <p className="text-zinc-400 mb-8">Join thousands of users taking control of their financial destiny.</p>
            <Link to={createPageUrl('Dashboard')}>
                <Button size="lg" className="brand-gradient text-white font-semibold hover:opacity-90 shadow-xl shadow-orange-500/30 px-8 h-12">
                    Create Free Account
                    <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
            </Link>
        </div>
      </section>

       {/* Footer */}
       <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md brand-gradient flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-medium text-zinc-400">Orange Plan</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-zinc-500">
            <Link to={createPageUrl('Landing')} className="hover:text-zinc-300 transition-colors">Home</Link>
            <Link to={createPageUrl('Features')} className="hover:text-zinc-300 transition-colors">Features</Link>
            <Link to={createPageUrl('Pricing')} className="hover:text-zinc-300 transition-colors">Pricing</Link>
            <Link to={createPageUrl('Dashboard')} className="hover:text-zinc-300 transition-colors">Dashboard</Link>
            </div>
            <p className="text-xs text-zinc-600">© 2024 Orange Plan</p>
        </div>
        </footer>
    </div>
  );
}