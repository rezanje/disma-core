"use client"

import WarehouseDashboard from "@/components/dashboard/WarehouseDashboard"

export default function WarehousePage() {
  return (
    <div className=" duration-150">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Gudang & Logistik</h2>
        <p className="text-xs font-bold text-slate-400  mt-1">
          Operational summary • {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      <WarehouseDashboard />
    </div>
  )
}
