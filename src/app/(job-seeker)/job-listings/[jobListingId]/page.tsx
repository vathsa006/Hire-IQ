import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { JobListingItems } from "../../_shared/JobListingItems"
import { IsBreakpoint } from "@/components/IsBreakpoint"
import { Suspense } from "react"
import { LoadingSpinner } from "@/components/LoadingSpinner"
import { SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ClientSheet } from "./_ClientSheet"
import { getJobListingIdTag } from "@/features/jobListings/db/cache/jobListings"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { and, eq } from "drizzle-orm"
import {
  JobListingApplicationTable,
  JobListingTable,
  OrganizationTable,
  UserResumeTable,
  UserTable,
} from "@/drizzle/schema"
import { db } from "@/drizzle/db"
import { getOrganizationIdTag } from "@/features/organizations/db/cache/organizations"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { convertSearchParamsToString } from "@/lib/convertSearchParamsToString"
import { XIcon } from "lucide-react"
import { JobListingBadges } from "@/features/jobListings/components/JobListingBadges"
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentAuth"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { SignUpButton } from "@/services/clerk/components/AuthButtons"
import { getJobListingApplicationIdTag } from "@/features/jobListingApplications/db/cache/jobListingApplications"
import { differenceInDays } from "date-fns"
import { connection } from "next/server"
import { getUserResumeIdTag } from "@/features/users/db/cache/userResumes"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DialogDescription, DialogTitle } from "@radix-ui/react-dialog"
import { NewJobListingApplicationForm } from "@/features/jobListingApplications/components/NewJobListingApplicationForm"

export default function JobListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobListingId: string }>
  searchParams: Promise<Record<string, string | string[]>>
}) {
  return (
    <>
      <ResizablePanelGroup autoSaveId="job-board-panel" direction="horizontal">
        <ResizablePanel id="left" order={1} defaultSize={60} minSize={30}>
          <div className="p-4 h-screen overflow-y-auto">
            <JobListingItems searchParams={searchParams} params={params} />
          </div>
        </ResizablePanel>
        <IsBreakpoint
          breakpoint="min-width: 1024px"
          otherwise={
            <ClientSheet>
              <SheetContent hideCloseButton className="p-4 overflow-y-auto">
                <SheetHeader className="sr-only">
                  <SheetTitle>Job Listing Details</SheetTitle>
                </SheetHeader>
                <Suspense fallback={<LoadingSpinner />}>
                  <JobListingDetails
                    searchParams={searchParams}
                    params={params}
                  />
                </Suspense>
              </SheetContent>
            </ClientSheet>
          }
        >
          <ResizableHandle withHandle className="mx-2" />
          <ResizablePanel id="right" order={2} defaultSize={40} minSize={30}>
            <div className="p-4 h-screen overflow-y-auto">
              <Suspense fallback={<LoadingSpinner />}>
                <JobListingDetails
                  params={params}
                  searchParams={searchParams}
                />
              </Suspense>
            </div>
          </ResizablePanel>
        </IsBreakpoint>
      </ResizablePanelGroup>
    </>
  )
}

async function JobListingDetails({
  params,
  searchParams,
}: {
  params: Promise<{ jobListingId: string }>
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const { jobListingId } = await params
  const jobListing = await getJobListing(jobListingId)
  if (jobListing == null) return notFound()

  const nameInitials = jobListing.organization.name
    .split(" ")
    .slice(0, 4)
    .map((word: string) => word[0])
    .join("")

  return (
    <div className="space-y-6 @container">
      <div className="space-y-4">
        <div className="flex gap-4 items-start">
          <Avatar className="size-14 @max-md:hidden">
            <AvatarImage
              src={jobListing.organization.imageUrl ?? undefined}
              alt={jobListing.organization.name}
            />
            <AvatarFallback className="uppercase bg-primary text-primary-foreground">
              {nameInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {jobListing.title}
            </h1>
            <div className="text-base text-muted-foreground">
              {jobListing.organization.name}
            </div>
            {jobListing.postedAt != null && (
              <div className="text-sm text-muted-foreground @min-lg:hidden">
                {`${jobListing.postedAt.getMonth() + 1}/${jobListing.postedAt.getDate()}/${jobListing.postedAt.getFullYear()}`}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-4">
            {jobListing.postedAt != null && (
              <div className="text-sm text-muted-foreground @max-lg:hidden">
                {`${jobListing.postedAt.getMonth() + 1}/${jobListing.postedAt.getDate()}/${jobListing.postedAt.getFullYear()}`}
              </div>
            )}
            <Button size="icon" variant="outline" asChild>
              <Link
                href={`/?${convertSearchParamsToString(await searchParams)}`}
              >
                <span className="sr-only">Close</span>
                <XIcon />
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <JobListingBadges jobListing={jobListing} />
        </div>
        <Suspense fallback={<Button disabled>Apply</Button>}>
          <ApplyButton jobListingId={jobListing.id} />
        </Suspense>
      </div>

      <MarkdownRenderer source={jobListing.description} />
    </div>
  )
}

async function ApplyButton({ jobListingId }: { jobListingId: string }) {
  const { userId } = await getCurrentUser()
  if (userId == null) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button>Apply</Button>
        </PopoverTrigger>
        <PopoverContent className="flex flex-col gap-2">
          You need to create an account before applying for a job.
          <SignUpButton />
        </PopoverContent>
      </Popover>
    )
  }

  const application = await getJobListingApplication({
    jobListingId,
    userId,
  })

  if (application != null) {
    const formatter = new Intl.RelativeTimeFormat(undefined, {
      style: "short",
      numeric: "always",
    })

    await connection()
    const difference = differenceInDays(application.createdAt, new Date())

    return (
      <div className="text-muted-foreground text-sm">
        You applied for this job{" "}
        {difference === 0 ? "today" : formatter.format(difference, "days")}
      </div>
    )
  }

  const userResume = await getUserResume(userId)
  if (userResume == null) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button>Apply</Button>
        </PopoverTrigger>
        <PopoverContent className="flex flex-col gap-2">
          You need to upload your resume before applying for a job.
          <Button asChild>
            <Link href="/user-settings/resume">Upload Resume</Link>
          </Button>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Apply</Button>
      </DialogTrigger>
      <DialogContent className="md:max-w-3xl max-h-[calc(100%-2rem)] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Application</DialogTitle>
          <DialogDescription>
            Applying for a job cannot be undone and is something you can only do
            once per job listing.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <NewJobListingApplicationForm jobListingId={jobListingId} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

async function getUserResume(userId: string) {
  "use cache"
  cacheTag(getUserResumeIdTag(userId))

  const resume = await db.query.UserResumeTable.findFirst({
    where: eq(UserResumeTable.userId, userId),
  })

  if (resume == null && process.env.NODE_ENV === "development") {
    try {
      const user = await db.query.UserTable.findFirst({
        where: eq(UserTable.id, userId),
        columns: { name: true },
      })
      const userName = user?.name || "Applicant"

      const mockAiSummary = `### AI Resume Summary for **${userName}**

#### 🧑‍💻 Professional Profile
Highly skilled and results-oriented Software Engineer with extensive experience in designing, building, and deploying robust web applications. Proven track record of collaborating with cross-functional teams to deliver scalable software solutions that improve user engagement and business efficiency.

#### 🛠️ Key Technical Skills
* **Languages:** JavaScript, TypeScript, HTML5, CSS3, Python, SQL, Go
* **Frontend Frameworks:** React, Next.js, Vue.js, TailwindCSS, Redux
* **Backend & Databases:** Node.js, Express, NestJS, PostgreSQL, MongoDB, Redis, Drizzle ORM, Prisma
* **DevOps & Tools:** Git, Docker, AWS (S3, EC2), Vercel, CI/CD Pipelines, Jest

#### 💼 Work Experience
**Senior Software Engineer** | *Initech Corp (2023 - Present)*
* Led the migration of a legacy frontend application to Next.js, improving page load speed by 40%.
* Designed and built scalable RESTful APIs and GraphQL endpoints handling 10k+ daily active users.
* Mentored junior developers and established code review best practices.

**Software Engineer** | *Hooli Inc (2021 - 2023)*
* Developed core features for the user dashboard using React and TailwindCSS.
* Integrated third-party payment gateways and authentication systems securely.

#### 🎓 Education
* **Bachelor of Science in Computer Science** | *State University*`

      await db.insert(UserResumeTable).values({
        userId,
        resumeFileUrl: "https://example.com/mock-resume.pdf",
        resumeFileKey: "mock-resume-key",
        aiSummary: mockAiSummary,
      }).onConflictDoNothing()
      return db.query.UserResumeTable.findFirst({
        where: eq(UserResumeTable.userId, userId),
      })
    } catch (err) {
      console.error("Failed to insert mock resume:", err)
    }
  }

  return resume
}

async function getJobListingApplication({
  jobListingId,
  userId,
}: {
  jobListingId: string
  userId: string
}) {
  "use cache"
  cacheTag(getJobListingApplicationIdTag({ jobListingId, userId }))

  return db.query.JobListingApplicationTable.findFirst({
    where: and(
      eq(JobListingApplicationTable.jobListingId, jobListingId),
      eq(JobListingApplicationTable.userId, userId)
    ),
  })
}

async function getJobListing(id: string) {
  "use cache"
  cacheTag(getJobListingIdTag(id))

  const [data] = await db
    .select({
      listing: JobListingTable,
      organization: {
        id: OrganizationTable.id,
        name: OrganizationTable.name,
        imageUrl: OrganizationTable.imageUrl,
      },
    })
    .from(JobListingTable)
    .leftJoin(
      OrganizationTable,
      eq(JobListingTable.organizationId, OrganizationTable.id)
    )
    .where(
      and(eq(JobListingTable.id, id), eq(JobListingTable.status, "published"))
    )
    .limit(1)

  if (data != null && data.organization != null) {
    cacheTag(getOrganizationIdTag(data.organization.id!))
    return {
      ...data.listing,
      organization: {
        id: data.organization.id!,
        name: data.organization.name || "",
        imageUrl: data.organization.imageUrl || null,
      },
    }
  }

  return undefined
}
