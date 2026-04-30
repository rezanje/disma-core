"use client"

import { useAppStore } from "@/lib/store"
import CeoDashboard from "@/components/dashboard/CeoDashboard"
import AdminPoDashboard from "@/components/dashboard/AdminPoDashboard"
import SourcingDashboard from "@/components/dashboard/SourcingDashboard"
import WarehouseDashboard from "@/components/dashboard/WarehouseDashboard"
import CourierDashboard from "@/components/dashboard/CourierDashboard"
import FinanceDashboard from "@/components/dashboard/FinanceDashboard"

export default function AdminDashboard() {
  const currentUser = useAppStore(state => state.currentUser)
  
  if (!currentUser) return null

  const renderDashboard = () => {
    switch (currentUser.role) {
      case 'ceo':
      case 'super_admin':
      case 'cmo':
        return <CeoDashboard />
      case 'admin_po':
        return <AdminPoDashboard />
      case 'sourcing':
        return <SourcingDashboard />
      case 'gudang':
        return <WarehouseDashboard />
      case 'kurir':
        return <CourierDashboard />
      case 'finance':
        return <FinanceDashboard />
      default:
        return <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest bg-white rounded-[3rem] border border-dashed border-slate-200">Select a role to view dashboard summary</div>
    }
  }

  return (
    <div className="animate-in fade-in duration-700 slide-in-from-bottom-4">
      <div className="mb-8">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight capitalize">
          Welcome back, {currentUser.name.split(' ')[0]}!
        </h2>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
          {currentUser.role.replace('_', ' ')} Dashboard • {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      {renderDashboard()}
    </div>
  )
}
