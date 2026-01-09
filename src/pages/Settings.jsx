import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, User, Lock, Sparkles, ExternalLink, CheckCircle2, MessageCircle, Trash2, Database, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '' });
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
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

    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = (e) => {
    e.preventDefault();
    updateProfile.mutate(profileForm);
  };

  const handleLinkDiscord = async () => {
    try {
      setDiscordLoading(true);
      const { data } = await base44.functions.invoke('discordAuth', {});
      if (data.url) {
        window.top.location.href = data.url;
      }
    } catch (error) {
      console.error('Discord link error:', error);
    } finally {
      setDiscordLoading(false);
    }
  };

  const subscriptionStatus = user?.subscriptionStatus || 'none';
  const hasAccess = user?.hasAccess === true;

  const handleCleanupData = async () => {
    try {
      setCleanupLoading(true);
      setCleanupResult(null);
      
      // Fetch all transactions
      const allTransactions = await base44.entities.Transaction.list();
      
      // Find soft-deleted transactions
      const softDeleted = allTransactions.filter(t => 
        t.is_deleted === true || t.data?.is_deleted === true
      );
      
      if (softDeleted.length === 0) {
        setCleanupResult({ count: 0, success: true });
        return;
      }
      
      // Delete in batches
      const batchSize = 10;
      for (let i = 0; i < softDeleted.length; i += batchSize) {
        const batch = softDeleted.slice(i, i + batchSize);
        await Promise.all(batch.map(t => base44.entities.Transaction.delete(t.id)));
        if (i + batchSize < softDeleted.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      setCleanupResult({ count: softDeleted.length, success: true });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (error) {
      setCleanupResult({ error: error.message, success: false });
    } finally {
      setCleanupLoading(false);
    }
  };

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
                  className="bg-zinc-900 border-zinc-800 focus-visible:ring-2 focus-visible:ring-orange-500/50"
                  placeholder="Enter your full name"
                  aria-label="Full name"
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
                className="brand-gradient text-white transition-transform active:scale-[0.98] hover:shadow-lg"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </div>

          {/* Discord Section */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-orange-400" />
              Discord Community
            </h3>
            
            {user?.discordUserId ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-200">Discord Linked</p>
                  <p className="text-xs text-zinc-400">@{user.discordUsername}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  Link your Discord account to join our exclusive community and get access to member-only channels.
                </p>
                <Button 
                  onClick={handleLinkDiscord}
                  disabled={discordLoading}
                  variant="outline"
                  className="bg-transparent border-zinc-700 transition-all duration-200 active:scale-95"
                >
                  {discordLoading ? 'Connecting...' : 'Link Discord'}
                </Button>
              </div>
            )}
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
              className="bg-transparent border-zinc-700 transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-orange-500/50"
              onClick={() => base44.auth.logout()}
            >
              Sign Out
            </Button>
          </div>

          {/* Data Management Section */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-orange-400" />
              Data Management
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              Clean up orphaned data and optimize your database. This removes any soft-deleted 
              transactions that may be affecting calculations.
            </p>
            <Button 
              variant="outline" 
              className="bg-transparent border-zinc-700 transition-all duration-200 active:scale-95"
              onClick={() => setCleanupDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clean Up Deleted Data
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
                subscriptionStatus === 'active' ? "bg-emerald-500/20 text-emerald-400" :
                subscriptionStatus === 'cancelling' ? "bg-amber-500/20 text-amber-400" :
                "bg-zinc-700 text-zinc-300"
              )}>
                {subscriptionStatus === 'active' && 'Active'}
                {subscriptionStatus === 'cancelling' && 'Cancelling'}
                {(subscriptionStatus === 'cancelled' || subscriptionStatus === 'none' || !hasAccess) && 'No Subscription'}
              </div>
            </div>

            {/* Active Subscription */}
            {subscriptionStatus === 'active' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <p className="font-medium text-zinc-200">Orange Plan Monthly</p>
                  <p className="text-sm text-zinc-400 mt-1">
                    Your subscription is active and all features are available.
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

            {/* Cancelling Subscription */}
            {subscriptionStatus === 'cancelling' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="font-medium text-zinc-200">Orange Plan Monthly</p>
                  <p className="text-sm text-amber-400 mt-1">
                    Your subscription is cancelled but you have access until the end of your billing period.
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
                  Resubscribe or update payment method
                </p>
              </div>
            )}

            {/* No Subscription */}
            {(subscriptionStatus === 'cancelled' || subscriptionStatus === 'none' || (!hasAccess && subscriptionStatus !== 'active' && subscriptionStatus !== 'cancelling')) && (
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
                  className="brand-gradient text-white w-full transition-transform active:scale-[0.98] hover:shadow-lg"
                >
                  {loading ? 'Loading...' : 'Start Free Trial'}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Cleanup Confirmation Dialog */}
      <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-orange-400" />
              Clean Up Deleted Data
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {cleanupResult ? (
              cleanupResult.success ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <p className="font-medium text-emerald-400">Cleanup Complete</p>
                  </div>
                  <p className="text-sm text-zinc-400">
                    {cleanupResult.count === 0 
                      ? "No soft-deleted transactions found. Your data is already clean!"
                      : `Successfully removed ${cleanupResult.count} soft-deleted transaction${cleanupResult.count === 1 ? '' : 's'}.`
                    }
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <p className="font-medium text-rose-400">Cleanup Failed</p>
                  </div>
                  <p className="text-sm text-zinc-400">{cleanupResult.error}</p>
                </div>
              )
            ) : (
              <>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    <p className="font-medium text-amber-400">Permanent Action</p>
                  </div>
                  <p className="text-sm text-zinc-400">
                    This will permanently delete all soft-deleted transactions from your database. 
                    These are transactions that were previously marked as deleted but not fully removed.
                  </p>
                </div>
                <p className="text-sm text-zinc-500">
                  This action cannot be undone. The deleted data will be permanently removed.
                </p>
              </>
            )}
            
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setCleanupDialogOpen(false);
                  setCleanupResult(null);
                }}
                className="flex-1 bg-transparent border-zinc-700"
              >
                {cleanupResult ? 'Close' : 'Cancel'}
              </Button>
              {!cleanupResult && (
                <Button 
                  onClick={handleCleanupData}
                  disabled={cleanupLoading}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {cleanupLoading ? 'Cleaning...' : 'Clean Up Data'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}