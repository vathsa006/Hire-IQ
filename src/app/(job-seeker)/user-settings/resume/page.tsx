import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Suspense } from "react"
import { DropzoneClient } from "./_DropzoneClient"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentAuth"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getUserResumeIdTag } from "@/features/users/db/cache/userResumes"
import { db } from "@/drizzle/db"
import { UserResumeTable, UserTable } from "@/drizzle/schema"
import { eq } from "drizzle-orm"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer"

export default function UserResumePage() {
  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6 px-4">
      <h1 className="text-2xl font-bold">Upload Your Resume</h1>
      <Card>
        <CardContent>
          <DropzoneClient />
        </CardContent>
        <Suspense>
          <ResumeDetails />
        </Suspense>
      </Card>
      <Suspense>
        <AISummaryCard />
      </Suspense>
    </div>
  )
}

async function ResumeDetails() {
  const { userId } = await getCurrentUser()
  if (userId == null) return notFound()

  const userResume = await getUserResume(userId)
  if (userResume == null) return null

  return (
    <CardFooter>
      <Button asChild>
        <Link
          href={userResume.resumeFileUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View Resume
        </Link>
      </Button>
    </CardFooter>
  )
}

async function AISummaryCard() {
  const { userId } = await getCurrentUser()
  if (userId == null) return notFound()

  const userResume = await getUserResume(userId)
  if (userResume == null || userResume.aiSummary == null) return null

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>AI Summary</CardTitle>
        <CardDescription>
          This is an AI-generated summary of your resume. This is used by
          employers to quickly understand your qualifications and experience.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MarkdownRenderer source={userResume.aiSummary} />
      </CardContent>
    </Card>
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
