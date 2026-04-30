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
import { MOCK_USERS } from "@/lib/constants"
import { toast } from "sonner"

const formSchema = zodSchema.object({
  pin: zodSchema.string().min(4, "PIN must be at least 4 digits").max(6, "PIN can be up to 6 digits"),
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

  // Self-Healing Cache Mechanism: Force overwrite old users from localStorage with the latest MOCK_USERS when they visit the login page.
  React.useEffect(() => {
    useAppStore.setState({ users: MOCK_USERS })
  }, [])

  async function onSubmit(values: zodSchema.infer<typeof formSchema>) {
    setIsLoading(true)

    // Simulate network latency for realism
    await new Promise((resolve) => setTimeout(resolve, 800))
    
    // Authenticate based on the latest MOCK_USERS, not the cached ones.
    const matchedUser = MOCK_USERS.find(u => u.pin === values.pin)
    
    if (matchedUser) {
      // Force update the users list in store to the latest one so storage syncs back to normal
      useAppStore.setState({ users: MOCK_USERS })
      
      setCurrentUser(matchedUser)
      toast.success(`Welcome back, ${matchedUser.name}!`)
      
      // Role-based redirect
      switch(matchedUser.role) {
        case 'admin_po':
          router.push('/admin')
          break
        case 'sourcing':
          router.push('/sourcing')
          break
        case 'gudang':
          router.push('/warehouse')
          break
        case 'kurir':
          router.push('/courier')
          break
        case 'finance':
          router.push('/finance')
          break
        case 'ceo':
        case 'super_admin':
        case 'cmo':
          router.push('/admin')
          break
        default:
          router.push('/dashboard')
      }
    } else {
      toast.error("Invalid PIN code. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        {/* PIN Code Input */}
        <div className="space-y-4">
          <div className="flex flex-col items-center space-y-2">
            <Label htmlFor="pin" className="text-sm font-bold text-slate-500 tracking-wider uppercase">Enter Security PIN</Label>
            <p className="text-xs text-slate-400">Please enter your secure access code</p>
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
              className="pl-16 h-20 rounded-3xl border-slate-200 bg-white shadow-xl text-4xl text-center tracking-[1em] font-black text-slate-800 focus-visible:ring-emerald-500 transition-all hover:border-emerald-200"
              {...form.register("pin")} 
            />
          </div>
          {form.formState.errors.pin && (
            <p className="text-xs text-rose-500 font-medium text-center">{form.formState.errors.pin.message}</p>
          )}
        </div>

        {/* Submit Button */}
        <Button 
          className="w-full h-16 rounded-3xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xl tracking-wide shadow-lg shadow-emerald-200 transition-all hover:scale-[1.02] active:scale-95 mt-8 border-none" 
          type="submit" 
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              Verifying...
            </>
          ) : (
             "Access Dashboard"
          )}
        </Button>

        <div className="flex flex-col items-center pt-4">
          <p className="text-center text-xs font-semibold text-slate-400 italic">
             Contact admin if you forgot your access PIN
          </p>
        </div>

      </form>
    </div>
  )
}
