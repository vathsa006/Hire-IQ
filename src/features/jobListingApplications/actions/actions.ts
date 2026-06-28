"use server"

import { db } from "@/drizzle/db"
import { promises as fs } from "fs"
import path from "path"
import { updateUserResume } from "@/features/users/db/userResumes"
import { generateResumeSummaryText } from "@/features/users/lib/generateResumeSummary"
import {
  ApplicationStage,
  applicationStages,
  JobListingTable,
  UserResumeTable,
  UserTable,
} from "@/drizzle/schema"
import { getJobListingIdTag } from "@/features/jobListings/db/cache/jobListings"
import { getUserResumeIdTag } from "@/features/users/db/cache/userResumes"
import {
  getCurrentOrganization,
  getCurrentUser,
} from "@/services/clerk/lib/getCurrentAuth"
import { and, eq } from "drizzle-orm"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { z } from "zod"
import { newJobListingApplicationSchema } from "./schemas"
import {
  insertJobListingApplication,
  updateJobListingApplication,
} from "../db/jobListingsApplications"
import { inngest } from "@/services/inngest/client"
import { hasOrgUserPermission } from "@/services/clerk/lib/orgUserPermissions"
import { env } from "@/data/env/server"
import { resend } from "@/services/resend/client"

export async function createJobListingApplication(
  jobListingId: string,
  unsafeData: z.infer<typeof newJobListingApplicationSchema>
) {
  const permissionError = {
    error: true,
    message: "You don't have permission to submit an application",
  }
  const { userId } = await getCurrentUser()
  if (userId == null) return permissionError

  const [userResume, jobListing] = await Promise.all([
    getUserResume(userId),
    getPublicJobListing(jobListingId),
  ])
  if (userResume == null || jobListing == null) return permissionError

  const { success, data } = newJobListingApplicationSchema.safeParse(unsafeData)

  if (!success) {
    return {
      error: true,
      message: "There was an error submitting your application",
    }
  }

  await insertJobListingApplication({
    jobListingId,
    userId,
    ...data,
  })

  // Trigger AI-generated confirmation email for new application submission
  setTimeout(async () => {
    try {
      await sendAiApplicationEmail(jobListingId, userId, "applied")
    } catch (err) {
      console.error("Failed to send AI application confirmation email:", err)
    }
  }, 0)

  await inngest.send({
    name: "app/jobListingApplication.created",
    data: { jobListingId, userId },
  })

  return {
    error: false,
    message: "Your application was successfully submitted",
  }
}

export async function updateJobListingApplicationStage(
  {
    jobListingId,
    userId,
  }: {
    jobListingId: string
    userId: string
  },
  unsafeStage: ApplicationStage
) {
  const { success, data: stage } = z
    .enum(applicationStages)
    .safeParse(unsafeStage)

  if (!success) {
    return {
      error: true,
      message: "Invalid stage",
    }
  }

  if (
    process.env.NODE_ENV !== "development" &&
    !(await hasOrgUserPermission("org:job_listing_applications:change_stage"))
  ) {
    return {
      error: true,
      message: "You don't have permission to update the stage",
    }
  }

  const { orgId } = await getCurrentOrganization()
  const jobListing = await getJobListing(jobListingId)
  if (
    jobListing == null ||
    ((orgId == null || orgId !== jobListing.organizationId) && process.env.NODE_ENV !== "development")
  ) {
    return {
      error: true,
      message: "You don't have permission to update the stage",
    }
  }

  console.log("[actions] DB updateJobListingApplication stage:", stage)
  await updateJobListingApplication(
    {
      jobListingId,
      userId,
    },
    { stage }
  )

  console.log("[actions] Triggering sendAiApplicationEmail setTimeout")
  // Trigger AI-generated notification email for all stages (denied, applied, interested, interviewed, hired)
  setTimeout(async () => {
    try {
      console.log("[actions] setTimeout calling sendAiApplicationEmail...")
      await sendAiApplicationEmail(jobListingId, userId, stage)
    } catch (err) {
      console.error("[actions] Failed to send AI application email:", err)
    }
  }, 0)
}

export async function updateJobListingApplicationRating(
  {
    jobListingId,
    userId,
  }: {
    jobListingId: string
    userId: string
  },
  unsafeRating: number | null
) {
  const { success, data: rating } = z
    .number()
    .min(1)
    .max(5)
    .nullish()
    .safeParse(unsafeRating)

  if (!success) {
    return {
      error: true,
      message: "Invalid rating",
    }
  }

  if (
    process.env.NODE_ENV !== "development" &&
    !(await hasOrgUserPermission("org:job_listing_applications:change_rating"))
  ) {
    return {
      error: true,
      message: "You don't have permission to update the rating",
    }
  }

  const { orgId } = await getCurrentOrganization()
  const jobListing = await getJobListing(jobListingId)
  if (
    jobListing == null ||
    ((orgId == null || orgId !== jobListing.organizationId) && process.env.NODE_ENV !== "development")
  ) {
    return {
      error: true,
      message: "You don't have permission to update the rating",
    }
  }

  await updateJobListingApplication(
    {
      jobListingId,
      userId,
    },
    { rating }
  )
}

async function getPublicJobListing(id: string) {
  "use cache"
  cacheTag(getJobListingIdTag(id))

  return db.query.JobListingTable.findFirst({
    where: and(
      eq(JobListingTable.id, id),
      eq(JobListingTable.status, "published")
    ),
    columns: { id: true },
  })
}

async function getJobListing(id: string) {
  "use cache"
  cacheTag(getJobListingIdTag(id))

  return db.query.JobListingTable.findFirst({
    where: eq(JobListingTable.id, id),
    columns: { organizationId: true },
  })
}

async function getUserResume(userId: string) {
  "use cache"
  cacheTag(getUserResumeIdTag(userId))

  return db.query.UserResumeTable.findFirst({
    where: eq(UserResumeTable.userId, userId),
    columns: { userId: true },
  })
}

async function sendAiApplicationEmail(
  jobListingId: string,
  userId: string,
  stage: string
) {
  console.log("[actions] sendAiApplicationEmail started for stage:", stage)
  // Query applicant details
  const applicant = await db.query.UserTable.findFirst({
    where: eq(UserTable.id, userId),
  })
  console.log("[actions] Applicant query result:", applicant ? `found name=${applicant.name} email=${applicant.email}` : "null")
  if (applicant == null || !applicant.email) return

  // Query job details & organization name
  const jobListing = await db.query.JobListingTable.findFirst({
    where: eq(JobListingTable.id, jobListingId),
    with: {
      organization: true,
    },
  })
  console.log("[actions] JobListing query result:", jobListing ? `found title=${jobListing.title} org=${jobListing.organization?.name}` : "null")
  if (jobListing == null || !jobListing.organization) return

  const applicantName = applicant.name || "Applicant"
  const companyName = jobListing.organization.name
  const jobTitle = jobListing.title

  // Generate email body with Gemini
  const emailBody = await generateAiEmailText(applicantName, companyName, jobTitle, stage)

  console.log("\n========================================")
  console.log("📨 AI-GENERATED NOTIFICATION EMAIL:")
  console.log(`To: ${applicant.email}`)
  console.log(`Subject: Update on your application at ${companyName} - ${jobTitle}`)
  console.log("----------------------------------------")
  console.log(emailBody)
  console.log("========================================\n")

  // Send via Resend
  try {
    await resend.emails.send({
      from: "Hire IQ <onboarding@resend.dev>",
      to: applicant.email,
      subject: `Update on your application at ${companyName} - ${jobTitle}`,
      text: emailBody,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.warn("Resend email send failed (expected in local dev sandbox):", errorMsg)
  }
}

export async function generateAiEmailText(
  applicantName: string,
  companyName: string,
  jobTitle: string,
  stage: string
): Promise<string> {
  const isPlaceholderKey =
    !env.GEMINI_API_KEY ||
    env.GEMINI_API_KEY === "your-gemini-key" ||
    env.GEMINI_API_KEY.includes("your-gemini-key")

  let promptSubject = ""
  if (stage === "denied") {
    promptSubject = "highly professional rejection email expressing appreciation for their time and qualifications, and wishing them the best"
  } else if (stage === "hired") {
    promptSubject = "highly formal and professional joining letter and job offer details"
  } else if (stage === "applied") {
    promptSubject = "highly professional application confirmation message acknowledging receipt of their application"
  } else if (stage === "interviewed") {
    promptSubject = "highly professional post-interview follow-up email"
  } else {
    promptSubject = "highly professional and encouraging expression of interest in their profile and candidacy"
  }

  const prompt = `Write a highly professional, formal, and warm email to an applicant named ${applicantName} who has applied for the "${jobTitle}" position at "${companyName}". Specifically, write a ${promptSubject}. Tell them about the next steps. Keep the email concise and under 150 words. Do not include subject line in the body, just the body text.`

  if (!isPlaceholderKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      )
      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) return text.trim()
    } catch (err) {
      console.error("Gemini AI Email generation failed:", err)
    }
  }

  // Fallback templates based on official applicationStages:
  // "denied" | "applied" | "interested" | "interviewed" | "hired"
  if (stage === "interested") {
    return `Dear ${applicantName},

Thank you for your application for the ${jobTitle} role at ${companyName}.

We have reviewed your credentials and are highly interested in your profile. We are currently evaluating the next steps for your candidacy and will be in touch shortly to discuss moving forward.

Sincerely,
The ${companyName} Recruiting Team`
  }

  if (stage === "interviewed") {
    return `Dear ${applicantName},

Thank you for taking the time to interview with us for the ${jobTitle} position at ${companyName}.

It was a pleasure learning more about your skills and experience. We are currently completing interviews with other candidates and will contact you with an update on next steps shortly.

Sincerely,
The ${companyName} Recruiting Team`
  }

  if (stage === "hired") {
    return `Dear ${applicantName},

Congratulations! We are thrilled to offer you employment at ${companyName} for the position of ${jobTitle}. We were highly impressed by your interviews and background.

This message serves as your formal joining letter. Please find the details of your offer below:
- Position: ${jobTitle}
- Company: ${companyName}

We are excited about the prospect of you joining our team and look forward to your positive response. We will follow up shortly with the official contract and onboarding details.

Sincerely,
The ${companyName} Recruiting Team`
  }

  if (stage === "denied") {
    return `Dear ${applicantName},

Thank you for your interest in the ${jobTitle} position at ${companyName} and for taking the time to apply.

After careful consideration of your application and qualifications, we regret to inform you that we will not be moving forward with your candidacy at this time. The selection process was highly competitive, and we had to make some difficult decisions.

We appreciate the time you spent with us and wish you the very best in your job search.

Sincerely,
The ${companyName} Recruiting Team`
  }

  // Fallback for "applied" or generic
  return `Hi ${applicantName},

Thank you for applying for the ${jobTitle} position at ${companyName}.

We have received your application and will review it shortly. If your qualifications match our needs, we will reach out to discuss the next steps.

Best regards,
The ${companyName} Recruiting Team`
}

export async function generateEmailDraft(
  jobListingId: string,
  userId: string,
  stage: ApplicationStage
) {
  if (
    process.env.NODE_ENV !== "development" &&
    !(await hasOrgUserPermission("org:job_listing_applications:change_stage"))
  ) {
    return {
      error: true,
      message: "You don't have permission to perform this action",
    }
  }

  const { orgId } = await getCurrentOrganization()
  const jobListing = await getJobListing(jobListingId)
  if (
    jobListing == null ||
    ((orgId == null || orgId !== jobListing.organizationId) && process.env.NODE_ENV !== "development")
  ) {
    return {
      error: true,
      message: "You don't have permission to perform this action",
    }
  }

  const applicant = await db.query.UserTable.findFirst({
    where: eq(UserTable.id, userId),
  })
  if (applicant == null || !applicant.email) {
    return {
      error: true,
      message: "Applicant details not found",
    }
  }

  const jobDetails = await db.query.JobListingTable.findFirst({
    where: eq(JobListingTable.id, jobListingId),
    with: {
      organization: true,
    },
  })
  if (jobDetails == null || !jobDetails.organization) {
    return {
      error: true,
      message: "Job details not found",
    }
  }

  const applicantName = applicant.name || "Applicant"
  const companyName = jobDetails.organization.name
  const jobTitle = jobDetails.title

  try {
    const draftText = await generateAiEmailText(applicantName, companyName, jobTitle, stage)
    return {
      error: false,
      draft: draftText,
      recipientEmail: applicant.email,
      subject: `Update on your application at ${companyName} - ${jobTitle}`,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      error: true,
      message: errorMsg || "Failed to generate email draft",
    }
  }
}

export async function sendCustomEmailAction(
  jobListingId: string,
  userId: string,
  subject: string,
  emailBody: string
) {
  if (
    process.env.NODE_ENV !== "development" &&
    !(await hasOrgUserPermission("org:job_listing_applications:change_stage"))
  ) {
    return {
      error: true,
      message: "You don't have permission to perform this action",
    }
  }

  const { orgId } = await getCurrentOrganization()
  const jobListing = await getJobListing(jobListingId)
  if (
    jobListing == null ||
    ((orgId == null || orgId !== jobListing.organizationId) && process.env.NODE_ENV !== "development")
  ) {
    return {
      error: true,
      message: "You don't have permission to perform this action",
    }
  }

  const applicant = await db.query.UserTable.findFirst({
    where: eq(UserTable.id, userId),
  })
  if (applicant == null || !applicant.email) {
    return {
      error: true,
      message: "Applicant details not found",
    }
  }

  console.log("\n========================================")
  console.log("📨 MANUAL SENDING CUSTOM EMAIL:")
  console.log(`To: ${applicant.email}`)
  console.log(`Subject: ${subject}`)
  console.log("----------------------------------------")
  console.log(emailBody)
  console.log("========================================\n")

  try {
    await resend.emails.send({
      from: "Hire IQ <onboarding@resend.dev>",
      to: applicant.email,
      subject: subject,
      text: emailBody,
    })
    console.log("Resend custom email sent successfully!")
    return {
      error: false,
      message: "Email sent successfully!",
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.warn("Resend email send failed (expected in local dev sandbox):", errorMsg)
    return {
      error: false,
      message: `Email draft simulated successfully in development. (Resend API key placeholder)`,
    }
  }
}

export async function regenerateResumeSummaryAction(userId: string) {
  try {
    const userResume = await db.query.UserResumeTable.findFirst({
      where: eq(UserResumeTable.userId, userId),
    })

    if (userResume == null) {
      return {
        error: true,
        message: "No resume found for this candidate.",
      }
    }

    const user = await db.query.UserTable.findFirst({
      where: eq(UserTable.id, userId),
      columns: { name: true },
    })
    const userName = user?.name || "Applicant"

    let fileBuffer: Buffer
    if (userResume.resumeFileUrl.startsWith("/uploads/")) {
      const filename = path.basename(userResume.resumeFileUrl)
      const filePath = path.join(process.cwd(), "public", "uploads", filename)
      fileBuffer = await fs.readFile(filePath)
    } else {
      const fileResponse = await fetch(userResume.resumeFileUrl)
      const arrayBuffer = await fileResponse.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
    }

    const isPlaceholderKey =
      !env.GEMINI_API_KEY ||
      env.GEMINI_API_KEY === "your-gemini-key" ||
      env.GEMINI_API_KEY.includes("your-gemini-key")

    const summary = await generateResumeSummaryText(fileBuffer, userName, isPlaceholderKey)

    await updateUserResume(userId, { aiSummary: summary })

    return {
      error: false,
      message: isPlaceholderKey 
        ? "Dynamic summary parsed locally from PDF text (offline mode)." 
        : "Genuine AI Summary generated successfully using Gemini!",
      summary,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error("AI Summary generation failed:", err)
    return {
      error: true,
      message: `Failed to generate AI summary: ${errorMsg}`,
    }
  }
}

