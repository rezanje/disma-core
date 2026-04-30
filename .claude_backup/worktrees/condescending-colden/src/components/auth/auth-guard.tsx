"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { Loader2 } from "lucide-react"
import { Role } from "@/types"

interface AuthGuardProps {
  children: React.ReactNode
  allowedRoles?: Role[]
}

export default function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const currentUser = useAppStore((state) => state.currentUser)
  const [isMounting, setIsMounting] = useState(true)

  useEffect(() => {
    // Prevent hydration errors by waiting for mount to check state
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounting(false)
  }, [])

  useEffect(() => {
    if (isMounting) return

    if (!currentUser && pathname !== "/login") {
      // Not logged in, redirect to login
      router.push("/login")
      return
    }

    if (currentUser && pathname === "/login") {
      // Already logged in, trying to access login, redirect to respective dashboard
      switch(currentUser.role) {
        case 'admin_po': router.push('/admin'); break;
        case 'sourcing': router.push('/sourcing'); break;
        case 'gudang': router.push('/warehouse'); break;
        case 'kurir': router.push('/courier'); break;
        case 'finance': router.push('/finance'); break;
        case 'ceo': 
        case 'super_admin':
        case 'cmo':
          router.push('/admin'); break;
        default: router.push('/');
      }
      return
    }

    // Role-based route protection
    if (currentUser && allowedRoles && !allowedRoles.includes(currentUser.role)) {
      // Logged in but not authorized for this route
      console.warn(`User role ${currentUser.role} not authorized for ${pathname}`)
      // Redirect to their own dashboard
      switch(currentUser.role) {
        case 'admin_po': router.push('/admin'); break;
        case 'sourcing': router.push('/sourcing'); break;
        case 'gudang': router.push('/warehouse'); break;
        case 'kurir': router.push('/courier'); break;
        case 'finance': router.push('/finance'); break;
        case 'ceo': 
        case 'super_admin':
        case 'cmo':
          router.push('/admin'); break;
        default: router.push('/login');
      }
      return
    }
  }, [currentUser, isMounting, pathname, router, allowedRoles])

  if (isMounting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  // If we're not mounted or we're in the middle of a redirect, render nothing/loading
  if (!currentUser && pathname !== "/login") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (currentUser && allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return null
  }

  return <>{children}</>
}
