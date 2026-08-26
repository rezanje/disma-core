"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { useAppStore } from "@/lib/store"

const buttonVariants = cva(
  // Radius 7px (--radius-md), tanpa active:translate-y-px, fokus selalu terlihat.
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:bg-input disabled:text-slate-400 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // aksi utama — hijau DISMA
        default: "bg-primary text-primary-foreground hover:bg-emerald-700",
        primary: "bg-primary text-primary-foreground hover:bg-emerald-700",
        // aksi baris/kartu — tinta
        dark: "bg-slate-900 text-white hover:bg-slate-800",
        // sekunder — putih bergaris
        outline: "border-input bg-card text-slate-700 hover:bg-background",
        secondary: "border-input bg-card text-slate-700 hover:bg-background",
        ghost: "text-slate-700 hover:bg-muted",
        // aksi merusak — teks merah tanah tanpa latar
        destructive: "text-destructive hover:bg-rose-50",
        "danger-ghost": "text-destructive hover:bg-rose-50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // sm: topbar & baris tabel · default(md): aksi kartu
        // lg: aksi utama HP · xl: aksi utama gudang & kurir (tangan basah)
        default: "h-10 gap-2 px-4 text-[13px]",
        xs: "h-[30px] gap-1.5 rounded-sm px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-[34px] gap-1.5 px-3 text-[12.5px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-4 text-[13.5px]",
        xl: "h-[52px] gap-2 px-5 text-[15px] font-semibold",
        icon: "size-10",
        "icon-xs": "size-[30px] rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-[34px]",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  children,
  onClick,
  disabled,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  const [isClicked, setIsClicked] = React.useState(false)
  const [isAwaitingPromise, setIsAwaitingPromise] = React.useState(false)
  const isSyncing = useAppStore(state => state.isSyncing)
  const mountedRef = React.useRef(true)

  React.useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  React.useEffect(() => {
    if (!isSyncing && isClicked && !isAwaitingPromise) {
      const timer = setTimeout(() => setIsClicked(false), 150)
      return () => clearTimeout(timer)
    }
  }, [isSyncing, isClicked, isAwaitingPromise])

  React.useEffect(() => {
    if (isClicked && !isSyncing && !isAwaitingPromise) {
      const timer = setTimeout(() => setIsClicked(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isClicked, isSyncing, isAwaitingPromise])

  React.useEffect(() => {
    if (isClicked) {
      const timer = setTimeout(() => setIsClicked(false), 15000)
      return () => clearTimeout(timer)
    }
  }, [isClicked])

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsClicked(true)
    if (!onClick) return
    let result: unknown
    try {
      result = onClick(e as any)
    } catch {
      return
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setIsAwaitingPromise(true)
      Promise.resolve(result).finally(() => {
        if (mountedRef.current) setIsAwaitingPromise(false)
      })
    }
  }

  const isLoading = isClicked && (isSyncing || isAwaitingPromise)

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={handleClick}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
