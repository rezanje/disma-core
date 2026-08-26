"use client"

import SourcingDashboard from "@/components/dashboard/SourcingDashboard"

export default function SourcingSummaryPage() {
  return (
    <div className=" duration-150">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">DISMA Sourcing</h2>
        <p className="text-[11px] font-bold text-slate-400  mt-1">
          Market operations summary • {new Date().toLocaleDateString()}
        </p>
      </div>
      <SourcingDashboard />
    </div>
  )
}
