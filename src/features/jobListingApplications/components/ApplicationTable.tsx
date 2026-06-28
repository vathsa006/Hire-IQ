"use client"

import { DataTable } from "@/components/dataTable/DataTable"
import { DataTableSortableColumnHeader } from "@/components/dataTable/DataTableSortableColumnHeader"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  ApplicationStage,
  applicationStages,
  JobListingApplicationTable,
  UserResumeTable,
  UserTable,
} from "@/drizzle/schema"
import { ColumnDef, Table } from "@tanstack/react-table"
import { ReactNode, useOptimistic, useState, useTransition } from "react"
import { sortApplicationsByStage } from "../lib/utils"
import { StageIcon } from "./StageIcon"
import { formatJobListingApplicationStage } from "../lib/formatters"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChevronDownIcon, MoreHorizontalIcon } from "lucide-react"
import { toast } from "sonner"
import {
  updateJobListingApplicationRating,
  updateJobListingApplicationStage,
  generateEmailDraft,
  sendCustomEmailAction,
  regenerateResumeSummaryAction,
} from "../actions/actions"
import { RatingIcons } from "./RatingIcons"
import { MarkdownRendererClient } from "@/components/markdown/MarkdownRendererClient"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RATING_OPTIONS } from "../data/constants"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import Link from "next/link"
import { LoadingSpinner } from "@/components/LoadingSpinner"
import { DataTableFacetedFilter } from "@/components/dataTable/DataTableFacetedFilter"
import { Badge } from "@/components/ui/badge"

type Application = Pick<
  typeof JobListingApplicationTable.$inferSelect,
  "createdAt" | "stage" | "rating" | "jobListingId" | "atsScore" | "atsFeedback"
> & {
  coverLetterMarkdown: ReactNode | null
  user: Pick<typeof UserTable.$inferSelect, "id" | "name" | "imageUrl"> & {
    resume:
      | (Pick<typeof UserResumeTable.$inferSelect, "resumeFileUrl" | "aiSummary"> & {
          markdownSummary: ReactNode | null
        })
      | null
  }
}

function getColumns(
  canUpdateRating: boolean,
  canUpdateStage: boolean
): ColumnDef<Application>[] {
  return [
    {
      accessorFn: row => row.user.name,
      header: "Name",
      cell: ({ row }) => {
        const user = row.original.user

        const nameInitials = user.name
          .split(" ")
          .slice(0, 2)
          .map(name => name.charAt(0).toUpperCase())
          .join("")

        return (
          <div className="flex items-center gap-2">
            <Avatar className="rounded-full size-6">
              <AvatarImage src={user.imageUrl ?? undefined} alt={user.name} />
              <AvatarFallback className="uppercase bg-primary text-primary-foreground text-xs">
                {nameInitials}
              </AvatarFallback>
            </Avatar>
            <span>{user.name}</span>
          </div>
        )
      },
    },
    {
      accessorKey: "stage",
      header: ({ column }) => (
        <DataTableSortableColumnHeader title="Stage" column={column} />
      ),
      sortingFn: ({ original: a }, { original: b }) => {
        return sortApplicationsByStage(a.stage, b.stage)
      },
      filterFn: ({ original }, _, value) => {
        return value.includes(original.stage)
      },
      cell: ({ row }) => (
        <StageCell
          canUpdate={canUpdateStage}
          stage={row.original.stage}
          jobListingId={row.original.jobListingId}
          userId={row.original.user.id}
        />
      ),
    },
    {
      accessorKey: "atsScore",
      header: ({ column }) => (
        <DataTableSortableColumnHeader title="ATS Match" column={column} />
      ),
      cell: ({ row }) => {
        const score = row.original.atsScore
        if (score == null) return <span className="text-muted-foreground text-sm">-</span>

        let badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200"
        if (score < 50) {
          badgeClass = "bg-rose-50 text-rose-700 border-rose-200"
        } else if (score < 80) {
          badgeClass = "bg-amber-50 text-amber-700 border-amber-200"
        }

        return (
          <Badge variant="outline" className={cn("font-semibold border", badgeClass)}>
            {score}% Match
          </Badge>
        )
      },
    },
    {
      accessorKey: "rating",
      header: ({ column }) => (
        <DataTableSortableColumnHeader title="Rating" column={column} />
      ),
      filterFn: ({ original }, _, value) => {
        return value.includes(original.rating)
      },
      cell: ({ row }) => (
        <RatingCell
          canUpdate={canUpdateRating}
          rating={row.original.rating}
          jobListingId={row.original.jobListingId}
          userId={row.original.user.id}
        />
      ),
    },
    {
      accessorKey: "createdAt",
      accessorFn: row => row.createdAt,
      header: ({ column }) => (
        <DataTableSortableColumnHeader title="Applied On" column={column} />
      ),
      cell: ({ row }) => {
        const date = row.original.createdAt
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const jobListing = row.original
        const resume = jobListing.user.resume

        return (
          <ActionCell
            jobListingId={jobListing.jobListingId}
            userId={jobListing.user.id}
            stage={jobListing.stage}
            coverLetterMarkdown={jobListing.coverLetterMarkdown}
            resumeMarkdown={resume?.markdownSummary}
            resumeSummaryText={resume?.aiSummary}
            resumeUrl={resume?.resumeFileUrl}
            userName={jobListing.user.name}
            atsScore={jobListing.atsScore}
            atsFeedback={jobListing.atsFeedback}
          />
        )
      },
    },
  ]
}

export function SkeletonApplicationTable() {
  return (
    <ApplicationTable
      applications={[]}
      canUpdateRating={false}
      canUpdateStage={false}
      disableToolbar
      noResultsMessage={<LoadingSpinner className="size-12" />}
    />
  )
}

export function ApplicationTable({
  applications,
  canUpdateRating,
  canUpdateStage,
  noResultsMessage = "No applications",
  disableToolbar = false,
}: {
  applications: Application[]
  canUpdateRating: boolean
  canUpdateStage: boolean
  noResultsMessage?: ReactNode
  disableToolbar?: boolean
}) {
  return (
    <DataTable
      data={applications}
      columns={getColumns(canUpdateRating, canUpdateStage)}
      noResultsMessage={noResultsMessage}
      ToolbarComponent={disableToolbar ? DisabledToolbar : Toolbar}
      initialFilters={[
        {
          id: "stage",
          value: applicationStages.filter(stage => stage !== "denied"),
        },
      ]}
    />
  )
}

function DisabledToolbar<T>({ table }: { table: Table<T> }) {
  return <Toolbar table={table} disabled />
}

function Toolbar<T>({
  table,
  disabled,
}: {
  table: Table<T>
  disabled?: boolean
}) {
  const hiddenRows = table.getCoreRowModel().rows.length - table.getRowCount()

  return (
    <div className="flex items-center gap-2">
      {table.getColumn("stage") && (
        <DataTableFacetedFilter
          disabled={disabled}
          column={table.getColumn("stage")}
          title="Stage"
          options={applicationStages
            .toSorted(sortApplicationsByStage)
            .map(stage => ({
              label: <StageDetails stage={stage} />,
              value: stage,
              key: stage,
            }))}
        />
      )}
      {table.getColumn("rating") && (
        <DataTableFacetedFilter
          disabled={disabled}
          column={table.getColumn("rating")}
          title="Rating"
          options={RATING_OPTIONS.map((rating, i) => ({
            label: <RatingIcons rating={rating} />,
            value: rating,
            key: i,
          }))}
        />
      )}
      {hiddenRows > 0 && (
        <div className="text-sm text-muted-foreground ml-2">
          {hiddenRows} {hiddenRows > 1 ? "rows" : "row"} hidden
        </div>
      )}
    </div>
  )
}

function StageCell({
  stage,
  jobListingId,
  userId,
  canUpdate,
}: {
  stage: ApplicationStage
  jobListingId: string
  userId: string
  canUpdate: boolean
}) {
  const [optimisticStage, setOptimisticStage] = useOptimistic(stage)
  const [isPending, startTransition] = useTransition()

  if (!canUpdate) {
    return <StageDetails stage={optimisticStage} />
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("-ml-3", isPending && "opacity-50")}
        >
          <StageDetails stage={optimisticStage} />
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {applicationStages.toSorted(sortApplicationsByStage).map(stageValue => (
          <DropdownMenuItem
            key={stageValue}
            onClick={() => {
              startTransition(async () => {
                setOptimisticStage(stageValue)
                const res = await updateJobListingApplicationStage(
                  {
                    jobListingId,
                    userId,
                  },
                  stageValue
                )

                if (res?.error) {
                  toast.error(res.message)
                }
              })
            }}
          >
            <StageDetails stage={stageValue} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RatingCell({
  rating,
  jobListingId,
  userId,
  canUpdate,
}: {
  rating: number | null
  jobListingId: string
  userId: string
  canUpdate: boolean
}) {
  const [optimisticRating, setOptimisticRating] = useOptimistic(rating)
  const [isPending, startTransition] = useTransition()

  if (!canUpdate) {
    return <RatingIcons rating={optimisticRating} />
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("-ml-3", isPending && "opacity-50")}
        >
          <RatingIcons rating={optimisticRating} />
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {RATING_OPTIONS.map(ratingValue => (
          <DropdownMenuItem
            key={ratingValue ?? "none"}
            onClick={() => {
              startTransition(async () => {
                setOptimisticRating(ratingValue)
                const res = await updateJobListingApplicationRating(
                  {
                    jobListingId,
                    userId,
                  },
                  ratingValue
                )

                if (res?.error) {
                  toast.error(res.message)
                }
              })
            }}
          >
            <RatingIcons rating={ratingValue} className="text-inherit" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ActionCell({
  jobListingId,
  userId,
  stage,
  resumeUrl,
  userName,
  resumeMarkdown,
  resumeSummaryText,
  coverLetterMarkdown,
  atsScore,
  atsFeedback,
}: {
  jobListingId: string
  userId: string
  stage: ApplicationStage
  resumeUrl: string | null | undefined
  userName: string
  resumeMarkdown: ReactNode | null
  resumeSummaryText: string | null | undefined
  coverLetterMarkdown: ReactNode | null
  atsScore: number | null
  atsFeedback: string | null
}) {
  const [openModal, setOpenModal] = useState<"resume" | "coverLetter" | "email" | null>(
    null
  )
  const [currentSummaryText, setCurrentSummaryText] = useState<string | null>(resumeSummaryText || null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [emailDraft, setEmailDraft] = useState("")
  const [emailSubject, setEmailSubject] = useState("")
  const [emailRecipient, setEmailRecipient] = useState("")
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [activeTab, setActiveTab] = useState<"summary" | "ats">("summary")

  const handleOpenEmailModal = async () => {
    setOpenModal("email")
    setLoadingDraft(true)
    try {
      const res = await generateEmailDraft(jobListingId, userId, stage)
      if (res.error) {
        toast.error(res.message || "Failed to generate draft")
        setOpenModal(null)
      } else {
        setEmailDraft(res.draft || "")
        setEmailSubject(res.subject || "")
        setEmailRecipient(res.recipientEmail || "")
      }
    } catch {
      toast.error("Failed to generate draft")
      setOpenModal(null)
    } finally {
      setLoadingDraft(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <span className="sr-only">Open Menu</span>
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {resumeUrl != null || resumeMarkdown != null ? (
            <DropdownMenuItem onClick={() => setOpenModal("resume")}>
              View Resume
            </DropdownMenuItem>
          ) : (
            <DropdownMenuLabel className="text-muted-foreground">
              No Resume
            </DropdownMenuLabel>
          )}
          {coverLetterMarkdown ? (
            <DropdownMenuItem onClick={() => setOpenModal("coverLetter")}>
              View Cover Letter
            </DropdownMenuItem>
          ) : (
            <DropdownMenuLabel className="text-muted-foreground">
              No Cover Letter
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem onClick={handleOpenEmailModal}>
            Send AI Email
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {coverLetterMarkdown && (
        <Dialog
          open={openModal === "coverLetter"}
          onOpenChange={o => setOpenModal(o ? "coverLetter" : null)}
        >
          <DialogContent className="lg:max-w-5xl md:max-w-3xl max-h-[calc(100%-2rem)] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Cover Letter</DialogTitle>
              <DialogDescription>{userName}</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">{coverLetterMarkdown}</div>
          </DialogContent>
        </Dialog>
      )}
      {(resumeMarkdown || resumeUrl || currentSummaryText) && (
        <Dialog
          open={openModal === "resume"}
          onOpenChange={o => setOpenModal(o ? "resume" : null)}
        >
          <DialogContent className="lg:max-w-5xl md:max-w-3xl max-h-[calc(100%-2rem)] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between pr-6">
                <span>Resume Details & AI Summary</span>
                <Button
                  onClick={async () => {
                    setGeneratingSummary(true)
                    const toastId = toast.loading("Generating genuine AI resume summary...")
                    try {
                      const res = await regenerateResumeSummaryAction(userId)
                      if (res.error) {
                        toast.error(res.message, { id: toastId })
                      } else {
                        toast.success(res.message, { id: toastId })
                        setCurrentSummaryText(res.summary || "")
                      }
                    } catch {
                      toast.error("Failed to generate summary", { id: toastId })
                    } finally {
                      setGeneratingSummary(false)
                    }
                  }}
                  disabled={generatingSummary}
                  variant="outline"
                  size="sm"
                  className="bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 font-semibold gap-1.5 flex items-center"
                >
                  {generatingSummary ? (
                    <>
                      <LoadingSpinner className="size-4 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>✨ Generate Genuine AI Summary</>
                  )}
                </Button>
              </DialogTitle>
              <DialogDescription>{userName}</DialogDescription>
              {resumeUrl && (
                <Button asChild className="self-start">
                  <Link
                    href={resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    Original Resume
                  </Link>
                </Button>
              )}
              <DialogDescription className="mt-2 text-sm text-muted-foreground">
                Review the AI-generated summary and ATS match analysis of the applicant below.
              </DialogDescription>
            </DialogHeader>

            <div className="flex border-b border-muted my-2 gap-2">
              <button
                onClick={() => setActiveTab("summary")}
                className={cn(
                  "px-4 py-2 text-sm font-semibold border-b-2 transition-all",
                  activeTab === "summary"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                AI Resume Summary
              </button>
              <button
                onClick={() => setActiveTab("ats")}
                className={cn(
                  "px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5",
                  activeTab === "ats"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                ✨ ATS Match Analysis
                {atsScore != null && (
                  <Badge variant="secondary" className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-700">
                    {atsScore}%
                  </Badge>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border-t pt-4">
              {activeTab === "summary" ? (
                currentSummaryText ? (
                  <MarkdownRendererClient source={currentSummaryText} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No summary available. Click &quot;Generate Genuine AI Summary&quot; to create one.
                  </div>
                )
              ) : (
                atsFeedback ? (
                  <div className="space-y-4">
                    {atsScore != null && (
                      <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-lg border">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Overall Match Score</span>
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="text-3xl font-black text-indigo-600">{atsScore}%</span>
                            <span className="text-sm text-muted-foreground">compatibility</span>
                          </div>
                        </div>
                        <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden border">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              atsScore >= 80 ? "bg-emerald-500" : atsScore >= 50 ? "bg-amber-500" : "bg-rose-500"
                            )}
                            style={{ width: `${atsScore}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <MarkdownRendererClient source={atsFeedback} />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No ATS feedback report available yet. This will be automatically generated when the candidate applies.
                  </div>
                )
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {openModal === "email" && (
        <Dialog
          open={openModal === "email"}
          onOpenChange={o => setOpenModal(o ? "email" : null)}
        >
          <DialogContent className="lg:max-w-3xl md:max-w-2xl max-h-[calc(100%-2rem)] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
                ✨ Compose AI Email
              </DialogTitle>
              <DialogDescription>
                Review and customize the AI-generated email to {userName} before sending.
              </DialogDescription>
            </DialogHeader>

            {loadingDraft ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
                <LoadingSpinner className="size-10 text-primary" />
                <span className="text-sm text-muted-foreground animate-pulse">Generating tailored email draft...</span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 py-1">
                <div className="space-y-1.5">
                  <Label htmlFor="recipient">To</Label>
                  <Input
                    id="recipient"
                    value={emailRecipient}
                    disabled
                    className="bg-muted text-muted-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Subject line"
                  />
                </div>
                <div className="flex-1 min-h-[250px] flex flex-col space-y-1.5">
                  <Label htmlFor="body">Message Body</Label>
                  <Textarea
                    id="body"
                    value={emailDraft}
                    onChange={e => setEmailDraft(e.target.value)}
                    className="flex-1 font-sans text-sm resize-none"
                    placeholder="Email body..."
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpenModal(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      setSendingEmail(true)
                      try {
                        const res = await sendCustomEmailAction(
                          jobListingId,
                          userId,
                          emailSubject,
                          emailDraft
                        )
                        if (res.error) {
                          toast.error(res.message)
                        } else {
                          toast.success(res.message)
                          setOpenModal(null)
                        }
                      } catch {
                        toast.error("Failed to send email")
                      } finally {
                        setSendingEmail(false)
                      }
                    }}
                    disabled={sendingEmail}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium shadow-md transition-all flex items-center gap-2"
                  >
                    {sendingEmail ? (
                      <>
                        <LoadingSpinner className="size-4 animate-spin" /> Sending...
                      </>
                    ) : (
                      "Send Email"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function StageDetails({ stage }: { stage: ApplicationStage }) {
  return (
    <div className="flex gap-2 items-center">
      <StageIcon stage={stage} className="size-5 text-inherit" />
      <div>{formatJobListingApplicationStage(stage)}</div>
    </div>
  )
}
