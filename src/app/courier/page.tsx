"use client"

import CourierDashboard from "@/components/dashboard/CourierDashboard"

export default function CourierSummaryPage() {
  return (
    <div className=" duration-150">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Kurir & Antaran</h2>
        <p className="text-[11px] font-bold text-slate-400  mt-1">
          Delivery summary • {new Date().toLocaleDateString()}
        </p>
      </div>
      <CourierDashboard />
    </div>
  )
}
