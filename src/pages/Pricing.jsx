import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { 
  Check, 
  Zap, 
  ArrowRight, 
  Shield,
  Lock,
  CreditCard
} from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('yearly');
  
  const monthlyPrice = 15;
  const yearlyPrice = 120;
  const yearlySavings = (monthlyPrice * 12) - yearlyPrice;

  const features = [
    'Everything in one place',
    'Real-time BTC price updates',
    'Save on taxes with cost basis tracking (FIFO, LIFO, HIFO, AVG)',
    'Reduce fees with exchange comparison',
    'Custody & asset organization',
    'Monte Carlo retirement simulations',
    'DCA planning & allocation tools',
    'Estate planning & recovery protocols',
    'Multi-account support (401k, IRA, taxable)',
    'Export tax reports (Form 8949)',
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
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
          <div className="flex items-center gap-4">
            <Link to={createPageUrl('Landing')} className="text-sm text-zinc-400 hover:text-white transition-colors">
              Home
            </Link>
            <Link to={createPageUrl('Dashboard')}>
              <Button size="sm" className="brand-gradient text-white font-medium hover:opacity-90">
                Open App
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            One plan with everything you need. No hidden fees, no feature gates.
          </p>
        </div>
      </section>

      {/* Billing Toggle */}
      <section className="px-6 mb-12">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-center gap-2 p-1 rounded-xl bg-zinc-900 border border-white/5">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                billingCycle === 'monthly' 
                  ? 'bg-white/10 text-white' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all relative ${
                billingCycle === 'yearly' 
                  ? 'bg-white/10 text-white' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Yearly
              <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                Save ${yearlySavings}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Card */}
      <section className="px-6 pb-24">
        <div className="max-w-lg mx-auto">
          <div className="relative">
            {/* Glow */}
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-orange-500/20 to-transparent blur-sm" />
            
            <div className="relative rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl overflow-hidden">
              <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl brand-gradient flex items-center justify-center">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Orange Plan Pro</h3>
                    <p className="text-sm text-zinc-500">Full access to everything</p>
                  </div>
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold">
                      ${billingCycle === 'yearly' ? Math.round(yearlyPrice / 12) : monthlyPrice}
                    </span>
                    <span className="text-zinc-500">/month</span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <p className="text-sm text-zinc-500 mt-1">
                      Billed annually (${yearlyPrice}/year)
                    </p>
                  )}
                </div>

                <Link to={createPageUrl('Dashboard')}>
                  <Button className="w-full brand-gradient text-white font-semibold h-12 text-base hover:opacity-90 shadow-lg shadow-orange-500/25 mb-8">
                    Start Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>

                <div className="space-y-3">
                  {features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-emerald-400" />
                      </div>
                      <span className="text-sm text-zinc-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="px-6 pb-24">
        <div className="max-w-2xl mx-auto">
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Privacy matters.</h3>
                <p className="text-zinc-400 leading-relaxed">
                  We never sell your data. Many free apps rely on ads or selling user data to make money. 
                  We don't. Your financial information stays private, just as it should.
                </p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <Lock className="w-5 h-5 text-orange-400" />
                <h4 className="font-medium">Bank-level encryption</h4>
              </div>
              <p className="text-sm text-zinc-500">Your data is encrypted at rest and in transit using AES-256.</p>
            </div>
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <CreditCard className="w-5 h-5 text-orange-400" />
                <h4 className="font-medium">Secure payments</h4>
              </div>
              <p className="text-sm text-zinc-500">Payments processed securely through Stripe. We never see your card.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 pb-24">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-4">
            {[
              {
                q: 'Can I try before I subscribe?',
                a: 'Yes! Start with a free trial and explore all features before committing.'
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Absolutely. Cancel your subscription at any time with no questions asked.'
              },
              {
                q: 'Is my financial data safe?',
                a: 'Your data is encrypted and never shared. We don\'t sell data or show ads.'
              },
              {
                q: 'Do you support assets other than Bitcoin?',
                a: 'Yes! Track stocks, real estate, bonds, retirement accounts, and more alongside your Bitcoin.'
              },
            ].map((faq, i) => (
              <div key={i} className="p-5 rounded-xl bg-white/[0.02] border border-white/5">
                <h4 className="font-medium mb-2">{faq.q}</h4>
                <p className="text-sm text-zinc-500">{faq.a}</p>
              </div>
            ))}
          </div>
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
            <Link to={createPageUrl('Pricing')} className="hover:text-zinc-300 transition-colors">Pricing</Link>
            <Link to={createPageUrl('Dashboard')} className="hover:text-zinc-300 transition-colors">Dashboard</Link>
          </div>
          <p className="text-xs text-zinc-600">© 2024 Orange Plan</p>
        </div>
      </footer>
    </div>
  );
}