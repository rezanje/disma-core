import { NextRequest, NextResponse } from "next/server"
import { supabase, UPLOAD_BUCKET } from "@/lib/supabase"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData()
    const file: File | null = data.get("file") as unknown as File

    if (!file) {
      return NextResponse.json({ success: false, message: "No file uploaded" }, { status: 400 })
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: "File too large (max 10MB)" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const extension = file.name.split(".").pop() || 'jpg'
    const uniqueName = `${uuidv4()}.${extension}`
    const filePath = `receipts/${uniqueName}`

    // Upload to Supabase Storage
    const { data: uploadData, error } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error("Supabase Storage Error:", error)
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(UPLOAD_BUCKET)
      .getPublicUrl(filePath)

    return NextResponse.json({ success: true, url: urlData.publicUrl })

  } catch (error: any) {
    console.error("Upload error:", error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
