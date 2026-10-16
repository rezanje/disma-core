"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Mail, Lock } from "lucide-react"
import { z as zodSchema } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAppStore } from "@/lib/store"
import { PENDING_WELCOME_KEY } from "@/lib/onboarding/state"
import { toast } from "sonner"

const formSchema = zodSchema.object({
  pin: zodSchema.string().min(4, "PIN minimal 4 angka").max(6, "PIN maksimal 6 angka"),
})

export default function LoginForm() {
  const router = useRouter()
  const setCurrentUser = useAppStore((state) => state.setCurrentUser)
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<zodSchema.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pin: "",
    },
  })

  async function onSubmit(values: zodSchema.infer<typeof formSchema>) {
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({pin:values.pin}), credentials:'same-origin',
      })
      const result = await response.json()
      if (!response.ok || !result.user) throw new Error(result.error || 'Gagal masuk')
      setCurrentUser(result.user)
      try { sessionStorage.setItem(PENDING_WELCOME_KEY, "1") } catch {}
      toast.success(`Welcome back, ${result.user.name}!`)
      router.push(result.user.role === 'admin_po' ? '/admin/hari-ini' : result.user.role === 'finance' ? '/finance' : '/admin')
    } catch(error) {
      toast.error(error instanceof Error ? error.message : 'Gagal masuk')
    } finally { setIsLoading(false) }
  }

  return (
    <div className="w-full">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        {/* PIN Code Input */}
        <div className="space-y-4">
          <div className="flex flex-col items-center space-y-2">
            <Label htmlFor="pin" className="text-[13px] font-medium text-slate-500">PIN kamu</Label>
            <p className="text-xs text-slate-400">4–6 angka</p>
          </div>
          
          <div className="relative text-slate-400 focus-within:text-emerald-600 transition-colors">
            <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
              <Lock className="h-6 w-6" />
            </div>
            <Input 
              id="pin" 
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••" 
              className="h-16 rounded-lg border-input bg-card pl-16 text-center text-[26px] font-semibold tracking-[0.6em] text-slate-900"
              {...form.register("pin")} 
            />
          </div>
          {form.formState.errors.pin && (
            <p className="text-xs text-rose-500 font-medium text-center">{form.formState.errors.pin.message}</p>
          )}
        </div>

        {/* Submit Button */}
        <Button 
          className="mt-8 h-[52px] w-full text-[15px]" 
          type="submit" 
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              Memeriksa...
            </>
          ) : (
             "Masuk"
          )}
        </Button>

        <div className="flex flex-col items-center pt-4">
          <p className="text-center text-xs text-slate-400">
             Lupa PIN? Minta admin sistem yang reset.
          </p>
        </div>

      </form>
    </div>
  )
}
