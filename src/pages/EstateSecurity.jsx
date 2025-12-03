import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInDays, addMonths, addQuarters, addYears } from 'date-fns';
import { Plus, Pencil, Trash2, Shield, Key, Users, FileText, Bell, CheckCircle, AlertTriangle, Bitcoin, Lock, HardDrive, Building2, Wallet } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function EstateSecurity() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  // Fetch live BTC price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const data = await response.json();
        setBtcPrice(data.bitcoin.usd);
        setPriceLoading(false);
      } catch (err) {
        setBtcPrice(97000);
        setPriceLoading(false);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const currentPrice = btcPrice || 97000;
  const [editingItem, setEditingItem] = useState(null);
  const [activeTab, setActiveTab] = useState('custody');
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    item_type: 'custody_location',
    title: '',
    description: '',
    custody_type: 'hardware_wallet',
    btc_amount: '',
    security_score: '',
    beneficiary_name: '',
    beneficiary_allocation_percent: '',
    reminder_date: '',
    reminder_frequency: '',
    last_verified: '',
    notes: '',
  });

  const { data: estateItems = [] } = useQuery({
    queryKey: ['estateItems'],
    queryFn: () => base44.entities.EstateItem.list(),
  });

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const createItem = useMutation({
    mutationFn: (data) => base44.entities.EstateItem.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estateItems'] });
      setFormOpen(false);
      resetForm();
    },
  });

  const updateItem = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EstateItem.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estateItems'] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id) => base44.entities.EstateItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['estateItems'] }),
  });

  const resetForm = () => {
    setFormData({
      item_type: 'custody_location',
      title: '',
      description: '',
      custody_type: 'hardware_wallet',
      btc_amount: '',
      security_score: '',
      beneficiary_name: '',
      beneficiary_allocation_percent: '',
      reminder_date: '',
      reminder_frequency: '',
      last_verified: '',
      notes: '',
    });
  };

  useEffect(() => {
    if (editingItem) {
      setFormData({
        item_type: editingItem.item_type || 'custody_location',
        title: editingItem.title || '',
        description: editingItem.description || '',
        custody_type: editingItem.custody_type || 'hardware_wallet',
        btc_amount: editingItem.btc_amount || '',
        security_score: editingItem.security_score || '',
        beneficiary_name: editingItem.beneficiary_name || '',
        beneficiary_allocation_percent: editingItem.beneficiary_allocation_percent || '',
        reminder_date: editingItem.reminder_date || '',
        reminder_frequency: editingItem.reminder_frequency || '',
        last_verified: editingItem.last_verified || '',
        notes: editingItem.notes || '',
      });
    }
  }, [editingItem]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      btc_amount: parseFloat(formData.btc_amount) || 0,
      security_score: parseInt(formData.security_score) || 0,
      beneficiary_allocation_percent: parseFloat(formData.beneficiary_allocation_percent) || 0,
    };
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data });
    } else {
      createItem.mutate(data);
    }
  };

  // Filter by type
  const custodyLocations = estateItems.filter(i => i.item_type === 'custody_location');
  const beneficiaries = estateItems.filter(i => i.item_type === 'beneficiary');
  const documents = estateItems.filter(i => i.item_type === 'document');
  const reminders = estateItems.filter(i => i.item_type === 'reminder');
  const protocols = estateItems.filter(i => i.item_type === 'security_protocol');

  // Calculate security score
  const securityScores = custodyLocations.filter(c => c.security_score).map(c => c.security_score);
  const avgSecurityScore = securityScores.length > 0 
    ? securityScores.reduce((a, b) => a + b, 0) / securityScores.length 
    : 0;

  // Total BTC in custody
  const totalCustodyBtc = custodyLocations.reduce((sum, c) => sum + (c.btc_amount || 0), 0);
  const btcHoldings = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity, 0);

  // Beneficiary allocation
  const totalAllocation = beneficiaries.reduce((sum, b) => sum + (b.beneficiary_allocation_percent || 0), 0);

  // Upcoming reminders
  const upcomingReminders = reminders.filter(r => {
    if (!r.reminder_date) return false;
    const daysUntil = differenceInDays(new Date(r.reminder_date), new Date());
    return daysUntil >= 0 && daysUntil <= 30;
  });

  // Overdue verifications
  const overdueVerifications = custodyLocations.filter(c => {
    if (!c.last_verified) return true;
    const daysSince = differenceInDays(new Date(), new Date(c.last_verified));
    return daysSince > 90;
  });

  const custodyIcons = {
    hardware_wallet: HardDrive,
    exchange: Building2,
    multisig: Key,
    cold_storage: Lock,
    custodian: Building2,
    other: Wallet,
  };

  const custodyColors = {
    hardware_wallet: 'bg-emerald-400/10 text-emerald-400',
    exchange: 'bg-amber-400/10 text-amber-400',
    multisig: 'bg-purple-400/10 text-purple-400',
    cold_storage: 'bg-blue-400/10 text-blue-400',
    custodian: 'bg-rose-400/10 text-rose-400',
    other: 'bg-zinc-400/10 text-zinc-400',
  };

  const openAddForm = (type) => {
    resetForm();
    setFormData(prev => ({ ...prev, item_type: type }));
    setEditingItem(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Estate & Security</h1>
          <p className="text-zinc-500 mt-1">Custody tracking and inheritance planning</p>
        </div>
        <Button
          onClick={() => { setEditingItem(null); resetForm(); setFormOpen(true); }}
          className="accent-gradient text-zinc-950 font-semibold hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Security Score</span>
            <div className={cn(
              "p-1.5 rounded-lg",
              avgSecurityScore >= 7 ? "bg-emerald-400/10" : avgSecurityScore >= 4 ? "bg-amber-400/10" : "bg-rose-400/10"
            )}>
              <Shield className={cn(
                "w-4 h-4",
                avgSecurityScore >= 7 ? "text-emerald-400" : avgSecurityScore >= 4 ? "text-amber-400" : "text-rose-400"
              )} />
            </div>
          </div>
          <p className={cn(
            "text-2xl font-bold",
            avgSecurityScore >= 7 ? "text-emerald-400" : avgSecurityScore >= 4 ? "text-amber-400" : "text-rose-400"
          )}>
            {avgSecurityScore.toFixed(1)}/10
          </p>
          <Progress value={avgSecurityScore * 10} className="h-2 mt-3 bg-zinc-700" />
        </div>

        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Custody Locations</span>
            <div className="p-1.5 rounded-lg bg-amber-400/10">
              <Key className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-400">{custodyLocations.length}</p>
          <p className="text-xs text-zinc-500 mt-1">{totalCustodyBtc.toFixed(4)} BTC tracked</p>
        </div>

        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Beneficiaries</span>
            <div className="p-1.5 rounded-lg bg-purple-400/10">
              <Users className="w-4 h-4 text-purple-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-400">{beneficiaries.length}</p>
          <p className="text-xs text-zinc-500 mt-1">{totalAllocation}% allocated</p>
        </div>

        <div className="card-glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Pending Actions</span>
            <div className={cn(
              "p-1.5 rounded-lg",
              (upcomingReminders.length + overdueVerifications.length) > 0 ? "bg-amber-400/10" : "bg-emerald-400/10"
            )}>
              <Bell className={cn(
                "w-4 h-4",
                (upcomingReminders.length + overdueVerifications.length) > 0 ? "text-amber-400" : "text-emerald-400"
              )} />
            </div>
          </div>
          <p className={cn(
            "text-2xl font-bold",
            (upcomingReminders.length + overdueVerifications.length) > 0 ? "text-amber-400" : "text-emerald-400"
          )}>
            {upcomingReminders.length + overdueVerifications.length}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {overdueVerifications.length > 0 ? `${overdueVerifications.length} overdue` : 'All current'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1 flex-wrap">
          <TabsTrigger value="custody" className="data-[state=active]:bg-zinc-700">Custody</TabsTrigger>
          <TabsTrigger value="beneficiaries" className="data-[state=active]:bg-zinc-700">Beneficiaries</TabsTrigger>
          <TabsTrigger value="protocols" className="data-[state=active]:bg-zinc-700">Protocols</TabsTrigger>
          <TabsTrigger value="reminders" className="data-[state=active]:bg-zinc-700">Reminders</TabsTrigger>
        </TabsList>

        <TabsContent value="custody">
          <div className="card-glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold">Custody Locations</h3>
              <Button size="sm" variant="outline" onClick={() => openAddForm('custody_location')} className="bg-transparent border-zinc-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Location
              </Button>
            </div>
            {custodyLocations.length === 0 ? (
              <div className="text-center py-12">
                <Key className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No custody locations added yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {custodyLocations.map((location) => {
                  const Icon = custodyIcons[location.custody_type] || Wallet;
                  const colorClass = custodyColors[location.custody_type] || 'bg-zinc-400/10 text-zinc-400';
                  const daysSinceVerified = location.last_verified 
                    ? differenceInDays(new Date(), new Date(location.last_verified)) 
                    : null;
                  const needsVerification = daysSinceVerified === null || daysSinceVerified > 90;

                  return (
                    <div key={location.id} className="p-5 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", colorClass)}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-lg">{location.title}</h4>
                            <p className="text-sm text-zinc-500 capitalize">{location.custody_type?.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {needsVerification && (
                            <Badge variant="outline" className="border-amber-400/50 text-amber-400">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Verify
                            </Badge>
                          )}
                          <button
                            onClick={() => { setEditingItem(location); setFormOpen(true); }}
                            className="p-2 rounded-lg hover:bg-zinc-700 transition-colors"
                          >
                            <Pencil className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button
                            onClick={() => deleteItem.mutate(location.id)}
                            className="p-2 rounded-lg hover:bg-rose-600/50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-zinc-400" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {location.btc_amount > 0 && (
                          <div>
                            <p className="text-sm text-zinc-500">BTC Amount</p>
                            <p className="text-lg font-semibold text-amber-400">{location.btc_amount} BTC</p>
                          </div>
                        )}
                        {location.security_score > 0 && (
                          <div>
                            <p className="text-sm text-zinc-500">Security Score</p>
                            <p className={cn(
                              "text-lg font-semibold",
                              location.security_score >= 7 ? "text-emerald-400" : location.security_score >= 4 ? "text-amber-400" : "text-rose-400"
                            )}>
                              {location.security_score}/10
                            </p>
                          </div>
                        )}
                        {location.last_verified && (
                          <div>
                            <p className="text-sm text-zinc-500">Last Verified</p>
                            <p className="text-lg font-semibold">{format(new Date(location.last_verified), 'MMM d, yyyy')}</p>
                          </div>
                        )}
                      </div>

                      {location.description && (
                        <p className="text-sm text-zinc-400 mt-4">{location.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="beneficiaries">
          <div className="card-glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Beneficiaries</h3>
                <p className="text-sm text-zinc-500">Total allocated: {totalAllocation}%</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => openAddForm('beneficiary')} className="bg-transparent border-zinc-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Beneficiary
              </Button>
            </div>

            {totalAllocation !== 100 && beneficiaries.length > 0 && (
              <div className={cn(
                "p-4 rounded-xl mb-6 flex items-center gap-3",
                totalAllocation > 100 ? "bg-rose-400/10" : "bg-amber-400/10"
              )}>
                <AlertTriangle className={cn("w-5 h-5", totalAllocation > 100 ? "text-rose-400" : "text-amber-400")} />
                <p className={cn("text-sm", totalAllocation > 100 ? "text-rose-400" : "text-amber-400")}>
                  {totalAllocation > 100 
                    ? `Allocation exceeds 100% by ${totalAllocation - 100}%` 
                    : `${100 - totalAllocation}% of estate is unallocated`
                  }
                </p>
              </div>
            )}

            {beneficiaries.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No beneficiaries added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {beneficiaries.map((beneficiary) => (
                  <div key={beneficiary.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-purple-400/10 flex items-center justify-center">
                        <span className="text-purple-400 font-semibold">
                          {beneficiary.beneficiary_name?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{beneficiary.beneficiary_name || beneficiary.title}</p>
                        {beneficiary.description && (
                          <p className="text-sm text-zinc-500">{beneficiary.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xl font-bold text-purple-400">{beneficiary.beneficiary_allocation_percent || 0}%</p>
                        <p className="text-xs text-zinc-500">
                          ≈ ${(((beneficiary.beneficiary_allocation_percent || 0) / 100 * btcHoldings) * currentPrice).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditingItem(beneficiary); setFormOpen(true); }}
                          className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button
                          onClick={() => deleteItem.mutate(beneficiary.id)}
                          className="p-1.5 rounded-lg hover:bg-rose-600/50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="protocols">
          <div className="card-glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold">Security Protocols & Documents</h3>
              <Button size="sm" variant="outline" onClick={() => openAddForm('security_protocol')} className="bg-transparent border-zinc-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Protocol
              </Button>
            </div>
            {[...protocols, ...documents].length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No protocols or documents added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...protocols, ...documents].map((item) => (
                  <div key={item.id} className="flex items-start justify-between p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-400/10 flex items-center justify-center">
                        {item.item_type === 'document' ? (
                          <FileText className="w-5 h-5 text-blue-400" />
                        ) : (
                          <Shield className="w-5 h-5 text-blue-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{item.title}</p>
                        {item.description && (
                          <p className="text-sm text-zinc-500 mt-1">{item.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingItem(item); setFormOpen(true); }}
                        className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                      <button
                        onClick={() => deleteItem.mutate(item.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-600/50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="reminders">
          <div className="card-glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold">Protocol Reminders</h3>
              <Button size="sm" variant="outline" onClick={() => openAddForm('reminder')} className="bg-transparent border-zinc-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Reminder
              </Button>
            </div>
            {reminders.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No reminders set</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reminders.map((reminder) => {
                  const daysUntil = reminder.reminder_date 
                    ? differenceInDays(new Date(reminder.reminder_date), new Date()) 
                    : null;
                  const isOverdue = daysUntil !== null && daysUntil < 0;
                  const isUpcoming = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;

                  return (
                    <div key={reminder.id} className={cn(
                      "flex items-center justify-between p-4 rounded-xl transition-colors",
                      isOverdue ? "bg-rose-400/10" : isUpcoming ? "bg-amber-400/10" : "bg-zinc-800/30"
                    )}>
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          isOverdue ? "bg-rose-400/20" : isUpcoming ? "bg-amber-400/20" : "bg-blue-400/10"
                        )}>
                          <Bell className={cn(
                            "w-5 h-5",
                            isOverdue ? "text-rose-400" : isUpcoming ? "text-amber-400" : "text-blue-400"
                          )} />
                        </div>
                        <div>
                          <p className="font-medium">{reminder.title}</p>
                          <div className="flex items-center gap-2 text-sm text-zinc-500">
                            {reminder.reminder_date && (
                              <span>{format(new Date(reminder.reminder_date), 'MMM d, yyyy')}</span>
                            )}
                            {reminder.reminder_frequency && (
                              <>
                                <span>•</span>
                                <span className="capitalize">{reminder.reminder_frequency}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {daysUntil !== null && (
                          <Badge variant="outline" className={cn(
                            isOverdue ? "border-rose-400/50 text-rose-400" : 
                            isUpcoming ? "border-amber-400/50 text-amber-400" : 
                            "border-zinc-600 text-zinc-400"
                          )}>
                            {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `${daysUntil}d`}
                          </Badge>
                        )}
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setEditingItem(reminder); setFormOpen(true); }}
                            className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                          <button
                            onClick={() => deleteItem.mutate(reminder.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-600/50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Item Type</Label>
              <Select
                value={formData.item_type}
                onValueChange={(value) => setFormData({ ...formData, item_type: value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="custody_location">Custody Location</SelectItem>
                  <SelectItem value="beneficiary">Beneficiary</SelectItem>
                  <SelectItem value="security_protocol">Security Protocol</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="reminder">Reminder</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-zinc-800 border-zinc-700 resize-none"
                rows={2}
              />
            </div>

            {formData.item_type === 'custody_location' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Custody Type</Label>
                    <Select
                      value={formData.custody_type}
                      onValueChange={(value) => setFormData({ ...formData, custody_type: value })}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem value="hardware_wallet">Hardware Wallet</SelectItem>
                        <SelectItem value="exchange">Exchange</SelectItem>
                        <SelectItem value="multisig">Multisig</SelectItem>
                        <SelectItem value="cold_storage">Cold Storage</SelectItem>
                        <SelectItem value="custodian">Custodian</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">BTC Amount</Label>
                    <Input
                      type="number"
                      step="any"
                      value={formData.btc_amount}
                      onChange={(e) => setFormData({ ...formData, btc_amount: e.target.value })}
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Security Score (1-10)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.security_score}
                      onChange={(e) => setFormData({ ...formData, security_score: e.target.value })}
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Last Verified</Label>
                    <Input
                      type="date"
                      value={formData.last_verified}
                      onChange={(e) => setFormData({ ...formData, last_verified: e.target.value })}
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                </div>
              </>
            )}

            {formData.item_type === 'beneficiary' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Name</Label>
                  <Input
                    value={formData.beneficiary_name}
                    onChange={(e) => setFormData({ ...formData, beneficiary_name: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Allocation %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.beneficiary_allocation_percent}
                    onChange={(e) => setFormData({ ...formData, beneficiary_allocation_percent: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            )}

            {formData.item_type === 'reminder' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Reminder Date</Label>
                  <Input
                    type="date"
                    value={formData.reminder_date}
                    onChange={(e) => setFormData({ ...formData, reminder_date: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Frequency</Label>
                  <Select
                    value={formData.reminder_frequency}
                    onValueChange={(value) => setFormData({ ...formData, reminder_frequency: value })}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="One-time" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value={null}>One-time</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-zinc-400">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700 resize-none"
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1 bg-transparent border-zinc-700">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 accent-gradient text-zinc-950 font-semibold">
                {editingItem ? 'Update' : 'Add'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}