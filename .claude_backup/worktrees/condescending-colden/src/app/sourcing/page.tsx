"use client"

import SourcingDashboard from "@/components/dashboard/SourcingDashboard"

export default function SourcingSummaryPage() {
  return (
    <div className="animate-in fade-in duration-700 slide-in-from-bottom-4">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">DISMA Sourcing</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
          Market operations summary • {new Date().toLocaleDateString()}
        </p>
      </div>
      <SourcingDashboard />
    </div>
  )
}
