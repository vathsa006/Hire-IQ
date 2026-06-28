import { db } from "@/drizzle/db"
import { JobListingTable } from "@/drizzle/schema"
import { getJobListingOrganizationTag } from "@/features/jobListings/db/cache/jobListings"
import { getCurrentOrganization } from "@/services/clerk/lib/getCurrentAuth"
import { desc, eq } from "drizzle-orm"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export default function EmployerHomePage() {
  return (
    <Suspense>
      <SuspendedPage />
    </Suspense>
  )
}

async function SuspendedPage() {
  const { orgId } = await getCurrentOrganization()
  if (orgId == null) return null

  const jobListing = await getMostRecentJobListing(orgId)
  if (jobListing == null) {
    redirect("/employer/job-listings/new")
  } else {
    redirect(`/employer/job-listings/${jobListing.id}`)
  }
}

async function getMostRecentJobListing(orgId: string) {
  "use cache"
  cacheTag(getJobListingOrganizationTag(orgId))

  const listing = await db.query.JobListingTable.findFirst({
    where: eq(JobListingTable.organizationId, orgId),
    orderBy: desc(JobListingTable.createdAt),
    columns: { id: true },
  })

  if (listing == null && process.env.NODE_ENV === "development") {
    // Return any recent job listing so the user can test listing page details in dev
    return db.query.JobListingTable.findFirst({
      orderBy: desc(JobListingTable.createdAt),
      columns: { id: true },
    })
  }

  return listing
}
