"use client"

import { UploadDropzone } from "@/services/uploadthing/components/UploadThing"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { uploadResumeLocal } from "@/features/users/actions/uploadResumeLocal"

export function DropzoneClient() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [isPending, startTransition] = useTransition()

  // Use local fallback in development mode
  const isDev = process.env.NODE_ENV === "development"

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      toast.error("Please select a file to upload.")
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.append("resume", file)

      const result = await uploadResumeLocal(formData)
      if (result.error) {
        toast.error(result.message)
      } else {
        toast.success(result.message)
        router.refresh()
      }
    })
  }

  if (isDev) {
    return (
      <form onSubmit={handleUpload} className="space-y-4 py-4 flex flex-col items-center border border-dashed border-muted rounded-lg p-6 bg-card">
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">Upload Resume (Local Dev Mode)</p>
          <p className="text-xs text-muted-foreground">Select a PDF file to upload locally (bypassing Uploadthing)</p>
        </div>
        
        <Input
          type="file"
          accept="application/pdf"
          disabled={isPending}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="max-w-xs cursor-pointer"
        />
        
        <Button type="submit" disabled={!file || isPending} className="w-full max-w-xs">
          {isPending ? "Uploading..." : "Upload PDF"}
        </Button>
      </form>
    )
  }

  return (
    <UploadDropzone
      endpoint="resumeUploader"
      onClientUploadComplete={() => router.refresh()}
    />
  )
}
