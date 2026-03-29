"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function RedirectToFinanceHub() {
  const router = useRouter()
  
  useEffect(() => {
    router.replace('/finance/approvals')
  }, [router])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
      <p className="animate-pulse font-bold uppercase tracking-widest text-xs">Redirecting to Finance Hub...</p>
    </div>
  )
}
