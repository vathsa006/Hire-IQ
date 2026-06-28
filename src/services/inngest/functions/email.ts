import { db } from "@/drizzle/db"
import { inngest } from "../client"
import { and, eq, gte } from "drizzle-orm"
import {
  JobListingApplicationTable,
  JobListingTable,
  OrganizationUserSettingsTable,
  UserNotificationSettingsTable,
  UserTable,
  OrganizationTable,
} from "@/drizzle/schema"
import { subDays } from "date-fns"
import { GetEvents } from "inngest"
import { getMatchingJobListings } from "../ai/getMatchingJobListings"
import { resend } from "@/services/resend/client"
import DailyJobListingEmail from "@/services/resend/components/DailyJobListingEmail"
import { env } from "@/data/env/server"
import DailyApplicationEmail from "@/services/resend/components/DailyApplicationEmail"

// Type definitions for query results - must match client.ts schema
interface OrganizationJobListingData {
  id: string
  title: string
  description: string
  wage: number | null
  wageInterval: "hourly" | "yearly" | null
  stateAbbreviation: string | null
  city: string | null
  isFeatured: boolean
  locationRequirement: "in-office" | "hybrid" | "remote"
  experienceLevel: "junior" | "mid-level" | "senior"
  type: "internship" | "part-time" | "full-time"
  organizationName: string
}

export const prepareDailyUserJobListingNotifications = inngest.createFunction(
  {
    id: "prepare-daily-user-job-listing-notifications",
    name: "Prepare Daily User Job Listing Notifications",
  },
  {
    cron: "TZ=America/Chicago 0 7 * * *",
  },
  async ({ step, event }) => {
    const getUsers = step.run("get-users", async () => {
      return await db
        .select({
          userId: UserNotificationSettingsTable.userId,
          newJobEmailNotifications: UserNotificationSettingsTable.newJobEmailNotifications,
          aiPrompt: UserNotificationSettingsTable.aiPrompt,
          user: {
            email: UserTable.email,
            name: UserTable.name,
          },
        })
        .from(UserNotificationSettingsTable)
        .innerJoin(
          UserTable,
          eq(UserNotificationSettingsTable.userId, UserTable.id)
        )
        .where(eq(UserNotificationSettingsTable.newJobEmailNotifications, true))
    })

    const getJobListings = step.run("get-recent-job-listings", async () => {
      const rawResults = await db
        .select({
          id: JobListingTable.id,
          title: JobListingTable.title,
          description: JobListingTable.description,
          wage: JobListingTable.wage,
          wageInterval: JobListingTable.wageInterval,
          stateAbbreviation: JobListingTable.stateAbbreviation,
          city: JobListingTable.city,
          isFeatured: JobListingTable.isFeatured,
          locationRequirement: JobListingTable.locationRequirement,
          experienceLevel: JobListingTable.experienceLevel,
          type: JobListingTable.type,
          organizationName: OrganizationTable.name,
        })
        .from(JobListingTable)
        .innerJoin(
          OrganizationTable,
          eq(JobListingTable.organizationId, OrganizationTable.id)
        )
        .where(
          and(
            gte(
              JobListingTable.postedAt,
              subDays(new Date(event.ts ?? Date.now()), 1)
            ),
            eq(JobListingTable.status, "published")
          )
        )
      return rawResults.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        wage: r.wage,
        wageInterval: r.wageInterval,
        stateAbbreviation: r.stateAbbreviation,
        city: r.city,
        isFeatured: r.isFeatured,
        locationRequirement: r.locationRequirement,
        experienceLevel: r.experienceLevel,
        type: r.type,
        organizationName: r.organizationName as string,
      })) as unknown as Array<OrganizationJobListingData>
    })

    const [userNotifications, jobListings] = await Promise.all([
      getUsers,
      getJobListings,
    ])

    if (jobListings.length === 0 || userNotifications.length === 0) return

    const events = userNotifications.map(notification => {
      return {
        name: "app/email.daily-user-job-listings",
        user: {
          email: notification.user.email,
          name: notification.user.name,
        },
        data: {
          aiPrompt: notification.aiPrompt ?? undefined,
          jobListings: jobListings.map(listing => {
            return {
              id: listing.id,
              title: listing.title,
              description: listing.description,
              wage: listing.wage,
              wageInterval: listing.wageInterval,
              stateAbbreviation: listing.stateAbbreviation,
              city: listing.city,
              isFeatured: listing.isFeatured,
              locationRequirement: listing.locationRequirement,
              experienceLevel: listing.experienceLevel,
              type: listing.type,
              organizationName: listing.organizationName,
            } satisfies OrganizationJobListingData
          }),
        },
      } as const satisfies GetEvents<
        typeof inngest
      >["app/email.daily-user-job-listings"]
    })

    await step.sendEvent("send-emails", events)
  }
)

export const sendDailyUserJobListingEmail = inngest.createFunction(
  {
    id: "send-daily-user-job-listing-email",
    name: "Send Daily User Job Listing Email",
    throttle: {
      limit: 10,
      period: "1m",
    },
  },
  { event: "app/email.daily-user-job-listings" },
  async ({ event, step }) => {
    const { jobListings, aiPrompt } = event.data
    const user = event.user

    if (jobListings.length === 0) return

    let matchingJobListings: typeof jobListings = []
    if (aiPrompt == null || aiPrompt.trim() === "") {
      matchingJobListings = jobListings
    } else {
      const matchingIds = await getMatchingJobListings(aiPrompt, jobListings)
      matchingJobListings = jobListings.filter(listing =>
        matchingIds.includes(listing.id)
      )
    }

    if (matchingJobListings.length === 0) return

    await step.run("send-email", async () => {
      await resend.emails.send({
        from: "Job Board <onboarding@resend.dev>",
        to: user.email,
        subject: "Daily Job Listings",
        react: DailyJobListingEmail({
          jobListings,
          userName: user.name,
          serverUrl: env.SERVER_URL,
        }),
      })
    })
  }
)

export const prepareDailyOrganizationUserApplicationNotifications =
  inngest.createFunction(
    {
      id: "prepare-daily-organization-user-application-notifications",
      name: "Prepare Daily Organization User Application Notifications",
    },
    { cron: "TZ=America/Chicago 0 7 * * *" },
    async ({ step, event }) => {
      const getUsers = step.run("get-user-settings", async () => {
        return await db
          .select({
            userId: OrganizationUserSettingsTable.userId,
            organizationId: OrganizationUserSettingsTable.organizationId,
            newApplicationEmailNotifications: OrganizationUserSettingsTable.newApplicationEmailNotifications,
            minimumRating: OrganizationUserSettingsTable.minimumRating,
            user: {
              email: UserTable.email,
              name: UserTable.name,
            },
          })
          .from(OrganizationUserSettingsTable)
          .innerJoin(
            UserTable,
            eq(OrganizationUserSettingsTable.userId, UserTable.id)
          )
          .where(
            eq(OrganizationUserSettingsTable.newApplicationEmailNotifications, true)
          )
      })

      const getApplications = step.run("get-recent-applications", async () => {
        const rawResults = await db
          .select({
            rating: JobListingApplicationTable.rating,
            userName: UserTable.name,
            jobListingId: JobListingTable.id,
            jobListingTitle: JobListingTable.title,
            organizationId: OrganizationTable.id,
            organizationName: OrganizationTable.name,
          })
          .from(JobListingApplicationTable)
          .innerJoin(
            UserTable,
            eq(JobListingApplicationTable.userId, UserTable.id)
          )
          .innerJoin(
            JobListingTable,
            eq(JobListingApplicationTable.jobListingId, JobListingTable.id)
          )
          .innerJoin(
            OrganizationTable,
            eq(JobListingTable.organizationId, OrganizationTable.id)
          )
          .where(
            gte(
              JobListingApplicationTable.createdAt,
              subDays(new Date(event.ts ?? Date.now()), 1)
            )
          )
        return rawResults.map(r => ({
          rating: r.rating,
          user: { name: r.userName },
          jobListing: {
            id: r.jobListingId,
            title: r.jobListingTitle,
            organization: {
              id: r.organizationId,
              name: r.organizationName as string,
            },
          },
        })) as unknown as Array<{
          rating: number | null
          user: { name: string }
          jobListing: {
            id: string
            title: string
            organization: { id: string; name: string }
          }
        }>
      })

      const [userNotifications, applications] = await Promise.all([
        getUsers,
        getApplications,
      ])

      if (applications.length === 0 || userNotifications.length === 0) return

      const groupedNotifications = Object.groupBy(
        userNotifications,
        n => n.userId
      )

      interface ApplicationWithDetails {
        rating: number | null
        user: { name: string }
        jobListing: {
          id: string
          title: string
          organization: { id: string; name: string }
        }
      }

      const events = Object.entries(groupedNotifications)
        .map(([, settings]) => {
          if (settings == null || settings.length === 0) return null
          const userName = settings[0].user.name
          const userEmail = settings[0].user.email

          const filteredApplications = (applications as ApplicationWithDetails[])
            .filter(a => {
              return settings.find(
                s =>
                  s.organizationId === a.jobListing.organization.id &&
                  (s.minimumRating == null ||
                    (a.rating ?? 0) >= s.minimumRating)
              )
            })
            .map(a => ({
              organizationId: a.jobListing.organization.id,
              organizationName: a.jobListing.organization.name as string,
              jobListingId: a.jobListing.id,
              jobListingTitle: a.jobListing.title,
              userName: a.user.name,
              rating: a.rating,
            }))

          if (filteredApplications.length === 0) return null

          return {
            name: "app/email.daily-organization-user-applications",
            user: {
              name: userName,
              email: userEmail,
            },
            data: { applications: filteredApplications },
          } as const satisfies GetEvents<
            typeof inngest
          >["app/email.daily-organization-user-applications"]
        })
        .filter(v => v != null)

      await step.sendEvent("send-emails", events)
    }
  )

export const sendDailyOrganizationUserApplicationEmail = inngest.createFunction(
  {
    id: "send-daily-organization-user-application-email",
    name: "Send Daily Organization User Application Email",
    throttle: {
      limit: 1000,
      period: "1m",
    },
  },
  { event: "app/email.daily-organization-user-applications" },
  async ({ event, step }) => {
    const { applications } = event.data
    const user = event.user
    if (applications.length === 0) return

    await step.run("send-email", async () => {
      await resend.emails.send({
        from: "Job Board <onboarding@resend.dev>",
        to: user.email,
        subject: "Daily Job Listing Applications",
        react: DailyApplicationEmail({
          applications,
          userName: user.name,
        }),
      })
    })
  }
)
