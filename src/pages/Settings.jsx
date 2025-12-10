import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, User, Lock, Sparkles, ExternalLink, CheckCircle2 } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '' });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  React.useEffect(() => {
    if (user) {
      setProfileForm({ full_name: user.full_name || '' });
    }
  }, [user]);

  const updateProfile = useMutation({
    mutationFn: async (data) => {
      return base44.auth.updateMe(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });

  const handleStartTrial = async () => {
    try {
      setLoading(true);
      const { data } = await base44.functions.invoke('createCheckoutSession', {});
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      setLoading(true);
      const { data } = await base44.functions.invoke('manageBillingPortal', {});
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Billing portal error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = (e) => {
    e.preventDefault();
    updateProfile.mutate(profileForm);
  };

  const subscriptionStatus = user?.subscription_status || 'none';
  const isActive = ['active', 'trialing'].includes(subscriptionStatus);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-zinc-500 mt-1">Manage your account and subscription</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1">
          <TabsTrigger value="profile" className="data-[state=active]:bg-zinc-700">
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="subscription" className="data-[state=active]:bg-zinc-700">
            <CreditCard className="w-4 h-4 mr-2" />
            Subscription
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-orange-400" />
              Profile Information
            </h3>
            
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Full Name</Label>
                <Input
                  type="text"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  className="bg-zinc-900 border-zinc-800"
                  placeholder="Enter your full name"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-400">Email</Label>
                <Input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="bg-zinc-900 border-zinc-800 opacity-50"
                />
                <p className="text-xs text-zinc-500">Email cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-400">Role</Label>
                <Input
                  type="text"
                  value={user?.role || 'user'}
                  disabled
                  className="bg-zinc-900 border-zinc-800 opacity-50"
                />
              </div>

              <Button 
                type="submit" 
                className="brand-gradient text-white"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </div>

          {/* Password Section */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-orange-400" />
              Password & Security
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              Password management is handled by Base44's secure authentication system. 
              Use the "Forgot Password" link on the login page to reset your password.
            </p>
            <Button 
              variant="outline" 
              className="bg-transparent border-zinc-700"
              onClick={() => base44.auth.logout()}
            >
              Sign Out
            </Button>
          </div>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="space-y-6">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-orange-400" />
                  Subscription Status
                </h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Manage your Orange Plan subscription
                </p>
              </div>
              <div className={cn(
                "px-3 py-1 rounded-full text-xs font-medium",
                isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-700 text-zinc-300"
              )}>
                {subscriptionStatus === 'trialing' && 'Free Trial'}
                {subscriptionStatus === 'active' && 'Active'}
                {subscriptionStatus === 'canceled' && 'Canceled'}
                {subscriptionStatus === 'past_due' && 'Past Due'}
                {subscriptionStatus === 'none' && 'No Subscription'}
              </div>
            </div>

            {!isActive && subscriptionStatus !== 'past_due' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/30">
                  <div className="flex items-start gap-3 mb-4">
                    <Sparkles className="w-5 h-5 text-orange-400 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-zinc-200">Start Your 7-Day Free Trial</h4>
                      <p className="text-sm text-zinc-400 mt-1">
                        Get full access to all premium features. No charge until trial ends.
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-4">
                    {[
                      'Unlimited portfolio tracking',
                      'Advanced retirement projections',
                      'Tax optimization tools',
                      'Monte Carlo simulations',
                      'Estate planning features',
                    ].map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-zinc-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button 
                  onClick={handleStartTrial}
                  disabled={loading}
                  className="brand-gradient text-white w-full"
                >
                  {loading ? 'Loading...' : 'Start Free Trial'}
                </Button>
              </div>
            )}

            {isActive && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <p className="text-sm text-zinc-300">
                    {subscriptionStatus === 'trialing' 
                      ? 'You are currently on a free trial. You will not be charged until the trial period ends.'
                      : 'Your subscription is active and all features are available.'
                    }
                  </p>
                </div>
                <Button 
                  onClick={handleManageBilling}
                  disabled={loading}
                  variant="outline"
                  className="bg-transparent border-zinc-700 w-full"
                >
                  {loading ? 'Loading...' : (
                    <>
                      Manage Subscription
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
                <p className="text-xs text-zinc-500 text-center">
                  Update payment method, view invoices, or cancel subscription
                </p>
              </div>
            )}

            {subscriptionStatus === 'past_due' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
                  <p className="text-sm text-rose-400 font-medium">
                    Your payment has failed. Please update your payment method to continue using Orange Plan.
                  </p>
                </div>
                <Button 
                  onClick={handleManageBilling}
                  disabled={loading}
                  className="bg-rose-600 hover:bg-rose-700 text-white w-full"
                >
                  {loading ? 'Loading...' : 'Update Payment Method'}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}