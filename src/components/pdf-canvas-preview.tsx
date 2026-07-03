"use client"

import { useEffect, useRef, useState } from "react"

let pdfjsLibPromise: Promise<typeof import("pdfjs-dist")> | null = null

// Rendered to <canvas> via pdf.js instead of relying on the browser's native PDF
// viewer (<iframe>/<embed> + blob: URL) — that viewer silently no-ops whenever the
// user's Chrome has "Download PDFs" enabled instead of "open in Chrome", which we
// can't detect or override from the page.
function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString()
      return lib
    })
  }
  return pdfjsLibPromise
}

export function PdfCanvasPreview({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    if (containerRef.current) containerRef.current.innerHTML = ""

    loadPdfjs().then(async (pdfjsLib) => {
      try {
        const pdf = await pdfjsLib.getDocument({ url }).promise
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return
          const page = await pdf.getPage(pageNum)
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement("canvas")
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = "mx-auto mb-4 shadow-lg rounded-sm bg-white max-w-full h-auto"
          if (cancelled) return
          containerRef.current?.appendChild(canvas)
          await page.render({ canvas, viewport }).promise
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })

    return () => {
      cancelled = true
    }
  }, [url])

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-white/70 p-8 text-center">
        Gagal render preview PDF: {error}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto flex flex-col items-center py-4"
    />
  )
}
