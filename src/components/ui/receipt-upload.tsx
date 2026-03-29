"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "./button"
import { Camera, FileText, X, Upload } from "lucide-react"
import { toast } from "sonner"

interface ReceiptUploadProps {
  onFileSelect: (url: string) => void
  currentFile?: string
  className?: string
  label?: string
}

export default function ReceiptUpload({ onFileSelect, currentFile, className, label }: ReceiptUploadProps) {
  const [preview, setPreview] = useState(currentFile || "")
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPreview(currentFile || "")
  }, [currentFile])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ukuran file terlalu besar (Max: 10MB)")
      return
    }

    setIsProcessing(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (data.success) {
        setPreview(file.type === "application/pdf" ? "pdf-placeholder" : data.url)
        onFileSelect(data.url)
        toast.success("File berhasil disimpan ke server lokal.")
      } else {
        throw new Error(data.message || "Upload failed")
      }
    } catch (err: any) {
      console.error(err)
      toast.error(`Gagal mengunggah file: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const MAX_WIDTH = 1200
          const MAX_HEIGHT = 1600
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height
              height = MAX_HEIGHT
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          ctx?.drawImage(img, 0, 0, width, height)
          
          // Compress to 0.7 quality
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7)
          resolve(dataUrl)
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = (error) => reject(error)
    })
  }

  const clear = () => {
    setPreview("")
    onFileSelect("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className={className}>
      {label && <label className="text-sm font-bold text-slate-700 block mb-2">{label}</label>}
      
      <div className="relative group">
        {!preview ? (
          <div 
            className="w-full h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full">
               <Camera className="w-5 h-5 text-slate-500" />
            </div>
            <p className="text-xs font-bold text-slate-400">Pilih Foto atau PDF Nota</p>
          </div>
        ) : (
          <div className="relative w-full h-40 rounded-2xl overflow-hidden border">
            {preview === "pdf-placeholder" ? (
              <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center">
                 <FileText className="w-12 h-12 text-rose-500 mb-2" />
                 <p className="text-[10px] font-black uppercase text-slate-400">PDF Dokument Terlampir</p>
              </div>
            ) : (
              <img src={preview} alt="Receipt Preview" className="w-full h-full object-cover" />
            )}
            
            <Button 
               size="icon" 
               variant="destructive" 
               className="absolute top-2 right-2 h-7 w-7 rounded-full shadow-lg"
               onClick={clear}
            >
               <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*,application/pdf"
          onChange={handleFileChange} 
        />
      </div>
      
      {isProcessing && (
         <p className="text-[10px] mt-2 text-indigo-500 animate-pulse font-bold italic text-center">🔄 Sedang membidik & memperkecil ukuran file...</p>
      )}
    </div>
  )
}
