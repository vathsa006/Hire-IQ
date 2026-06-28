"use server"

import { getCurrentUser } from "@/services/clerk/lib/getCurrentAuth"
import { upsertUserResume } from "../db/userResumes"
import { revalidateUserResumeCache } from "../db/cache/userResumes"
import { promises as fs } from "fs"
import path from "path"
import { db } from "@/drizzle/db"
import { UserTable } from "@/drizzle/schema"
import { eq } from "drizzle-orm"
import { generateResumeSummaryText } from "../lib/generateResumeSummary"

export async function uploadResumeLocal(formData: FormData) {
  const { userId } = await getCurrentUser()
  if (userId == null) {
    return { error: true, message: "Unauthorized" }
  }

  const file = formData.get("resume") as File
  if (!file) {
    return { error: true, message: "No file uploaded" }
  }

  if (file.type !== "application/pdf") {
    return { error: true, message: "Only PDF files are allowed" }
  }

  try {
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Ensure public/uploads directory exists
    const uploadDir = path.join(process.cwd(), "public", "uploads")
    await fs.mkdir(uploadDir, { recursive: true })

    const filename = `resume-${userId}.pdf`
    const filePath = path.join(uploadDir, filename)
    await fs.writeFile(filePath, buffer)

    const fileUrl = `/uploads/${filename}`



    const user = await db.query.UserTable.findFirst({
      where: eq(UserTable.id, userId),
    })
    const userName = user?.name || "Applicant"



    const isPlaceholderKey =
      !process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY === "your-gemini-key" ||
      process.env.GEMINI_API_KEY.includes("your-gemini-key")

    const aiSummary = await generateResumeSummaryText(buffer, userName, isPlaceholderKey)

    await upsertUserResume(userId, {
      resumeFileUrl: fileUrl,
      resumeFileKey: `local-${userId}`,
      aiSummary: aiSummary,
    })

    revalidateUserResumeCache(userId)

    return { error: false, message: "Resume uploaded successfully" }
  } catch (err: unknown) {
    console.error("Local resume upload failed:", err)
    return { error: true, message: "Failed to save resume file" }
  }
}
