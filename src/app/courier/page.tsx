"use client"

import CourierDashboard from "@/components/dashboard/CourierDashboard"

export default function CourierSummaryPage() {
  return (
    <div className="animate-in fade-in duration-700 slide-in-from-bottom-4">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Kurir & Antaran</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
          Delivery summary • {new Date().toLocaleDateString()}
        </p>
      </div>
      <CourierDashboard />
    </div>
  )
}
