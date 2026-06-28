import { JobListingApplicationTable, JobListingTable } from "@/drizzle/schema"
import {
  DeletedObjectJSON,
  OrganizationJSON,
  OrganizationMembershipJSON,
  UserJSON,
} from "@clerk/nextjs/server"
import { EventSchemas, Inngest } from "inngest"

type ClerkWebhookData<T> = {
  data: {
    data: T
    raw: string
    headers: Record<string, string>
  }
}

type Events = {
  "clerk/user.created": ClerkWebhookData<UserJSON>
  "clerk/user.updated": ClerkWebhookData<UserJSON>
  "clerk/user.deleted": ClerkWebhookData<DeletedObjectJSON>
  "clerk/organization.created": ClerkWebhookData<OrganizationJSON>
  "clerk/organization.updated": ClerkWebhookData<OrganizationJSON>
  "clerk/organization.deleted": ClerkWebhookData<DeletedObjectJSON>
  "clerk/organizationMembership.created": ClerkWebhookData<OrganizationMembershipJSON>
  "clerk/organizationMembership.deleted": ClerkWebhookData<OrganizationMembershipJSON>
  "app/jobListingApplication.created": {
    data: {
      jobListingId: string
      userId: string
    }
  }
  "app/resume.uploaded": {
    user: {
      id: string
    }
  }
  "app/email.daily-user-job-listings": {
    data: {
      aiPrompt?: string
      jobListings: (Omit<
        typeof JobListingTable.$inferSelect,
        "createdAt" | "postedAt" | "updatedAt" | "status" | "organizationId"
      > & { organizationName: string })[]
    }
    user: {
      email: string
      name: string
    }
  }
  "app/email.daily-organization-user-applications": {
    data: {
      applications: (Pick<
        typeof JobListingApplicationTable.$inferSelect,
        "rating"
      > & {
        userName: string
        organizationId: string
        organizationName: string
        jobListingId: string
        jobListingTitle: string
      })[]
    }
    user: {
      email: string
      name: string
    }
  }
}

const baseInngest = new Inngest({
  id: "job-board-wds",
  schemas: new EventSchemas().fromRecord<Events>(),
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const originalSend = baseInngest.send.bind(baseInngest)
;(baseInngest as any).send = async function (...args: any[]) {
  try {
    return await (originalSend as any)(...args)
  } catch (err: unknown) {
    if (process.env.NODE_ENV === "development") {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.warn(
        "Inngest event failed to send in development mode. Bypassing error to prevent application crash:",
        errorMsg
      )
      return { ids: [] }
    }
    throw err
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const inngest = baseInngest
