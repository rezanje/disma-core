"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pin the first column while horizontally scrolling. */
  stickyFirstCol?: boolean
  children: React.ReactNode
}

/**
 * Wraps a wide <Table> in a horizontal-scroll container so it never overflows
 * the viewport on mobile. Desktop is unaffected (table simply fits).
 *
 * Usage:
 *   <ResponsiveTable>
 *     <Table>...</Table>
 *   </ResponsiveTable>
 */
export function ResponsiveTable({
  stickyFirstCol = false,
  className,
  children,
  ...props
}: ResponsiveTableProps) {
  return (
    <div
      className={cn(
        "w-full max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] rounded-lg",
        stickyFirstCol &&
          "[&_table_thead_th:first-child]:sticky [&_table_tbody_td:first-child]:sticky [&_table_thead_th:first-child]:left-0 [&_table_tbody_td:first-child]:left-0 [&_table_thead_th:first-child]:z-10 [&_table_thead_th:first-child]:bg-white [&_table_tbody_td:first-child]:bg-white dark:[&_table_thead_th:first-child]:bg-slate-900 dark:[&_table_tbody_td:first-child]:bg-slate-900",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export default ResponsiveTable
