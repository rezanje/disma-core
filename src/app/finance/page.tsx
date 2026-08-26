"use client"

import FinanceDashboard from "@/components/dashboard/FinanceDashboard"

export default function FinancePage() {
  return (
    <div className=" duration-150">
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Finance & Accounting</h2>
        <p className="text-xs font-bold text-slate-400  mt-1">
          Financial health summary • {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      <FinanceDashboard />
    </div>
  )
}
