"use client"

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { BudgetPlan } from '@/types';
import BudgetDashboard from './components/BudgetDashboard';
import BudgetPlanForm from './components/BudgetPlanForm';
import BudgetHistory from './components/BudgetHistory';
import { Button } from '@/components/ui/button';
import { Plus, LayoutDashboard, History, ShieldAlert, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function BudgetPlanningPage() {
  const currentUser = useAppStore(state => state.currentUser);
  const plans = useAppStore(state => state.budgetPlans);
  const init = useAppStore(state => state.init);

  const [viewMode, setViewMode] = useState<'dashboard' | 'form' | 'history'>('dashboard');
  const [selectedPlan, setSelectedPlan] = useState<BudgetPlan | null>(null);

  // Access Control check
  const allowedRoles = ['finance', 'ceo', 'coo', 'super_admin'];
  const isAuthorized = currentUser && allowedRoles.includes(currentUser.role);

  // Find currently active budget plan
  const activePlan = plans.find(p => p.status === 'Active');

  // If no active plan exists, default view to history if there are plans, otherwise dashboard (empty state)
  useEffect(() => {
    if (plans.length > 0 && !activePlan && viewMode === 'dashboard' && !selectedPlan) {
      setViewMode('history');
    }
  }, [plans, activePlan, viewMode, selectedPlan]);

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
        <ShieldAlert className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Akses Ditolak</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md">
          Halaman perencanaan budget bulanan hanya dapat diakses oleh Super Admin, CEO, COO, dan tim Finance.
        </p>
      </div>
    );
  }

  const handleCreateNew = () => {
    setViewMode('form');
    setSelectedPlan(null);
  };

  const handleViewPlanDetail = (plan: BudgetPlan) => {
    setSelectedPlan(plan);
    setViewMode('dashboard');
  };

  const handleBackToHistory = () => {
    setSelectedPlan(null);
    setViewMode('history');
  };

  const handleSavePlan = () => {
    // Refresh store data
    init();
    setViewMode('dashboard');
  };

  return (
    <div className="space-y-6">
      {/* 1. Subheader with Page Switch Tabs */}
      {viewMode !== 'form' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl w-fit">
            <button
              onClick={() => {
                setSelectedPlan(null);
                setViewMode('dashboard');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-300 ${
                viewMode === 'dashboard' && !selectedPlan
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Monitoring Budget Aktif</span>
            </button>
            <button
              onClick={() => {
                setSelectedPlan(null);
                setViewMode('history');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-300 ${
                viewMode === 'history' || selectedPlan
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat & Arsip</span>
            </button>
          </div>

          <Button onClick={handleCreateNew} className="rounded-xl flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-50 dark:hover:bg-slate-100 dark:text-slate-900 shadow-sm h-10">
            <Plus className="w-4 h-4" />
            <span>Buat Budget Bulanan</span>
          </Button>
        </div>
      )}

      {/* 2. Main Switch Panel */}
      {viewMode === 'form' ? (
        <BudgetPlanForm 
          onCancel={() => setViewMode(activePlan ? 'dashboard' : 'history')} 
          onSave={handleSavePlan} 
        />
      ) : viewMode === 'history' ? (
        <BudgetHistory onViewPlan={handleViewPlanDetail} />
      ) : (
        // Dashboard mode (activePlan or selectedPlan from history)
        <div>
          {selectedPlan ? (
            <div className="space-y-4">
              <Button onClick={handleBackToHistory} variant="ghost" size="sm" className="rounded-xl gap-1 border border-slate-200 dark:border-slate-800 mb-2">
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali ke Riwayat</span>
              </Button>
              <BudgetDashboard plan={selectedPlan} />
            </div>
          ) : activePlan ? (
            <BudgetDashboard plan={activePlan} />
          ) : (
            // Empty State Dashboard
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <LayoutDashboard className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
              <h3 className="text-md font-bold text-slate-800 dark:text-slate-200">Tidak Ada Budget Aktif</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-sm">
                Belum ada perencanaan budget yang diaktifkan untuk bulan ini. Aktifkan budget baru atau buka kembali budget sebelumnya dari tab Riwayat.
              </p>
              <div className="flex gap-3 mt-6">
                <Button onClick={() => setViewMode('history')} variant="outline" className="rounded-xl border-slate-200 dark:border-slate-800">
                  Lihat Riwayat
                </Button>
                <Button onClick={handleCreateNew} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-50 dark:hover:bg-slate-100 dark:text-slate-900">
                  Buat Budget Baru
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
