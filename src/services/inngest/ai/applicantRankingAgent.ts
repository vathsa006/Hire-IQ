import { env } from "@/data/env/server"
import { updateJobListingApplication } from "@/features/jobListingApplications/db/jobListingsApplications"
import { createAgent, createTool, gemini } from "@inngest/agent-kit"
import { z } from "zod"

const saveApplicantRatingTool = createTool({
  name: "save-applicant-ranking",
  description:
    "Saves the applicant's ranking, ATS score, and detailed feedback for a specific job listing in the database",
  parameters: z.object({
    rating: z.number().int().max(5).min(1),
    atsScore: z.number().int().max(100).min(0),
    atsFeedback: z.string(),
    jobListingId: z.string(),
    userId: z.string(),
  }),
  handler: async ({ jobListingId, rating, atsScore, atsFeedback, userId }) => {
    await updateJobListingApplication(
      { jobListingId, userId },
      { rating, atsScore, atsFeedback }
    )

    return "Successfully saved applicant ranking score and ATS feedback."
  },
})

export const applicantRankingAgent = createAgent({
  name: "Applicant Ranking Agent",
  description:
    "Agent for ranking job applicants for specific job listings based on their resume and cover letter, generating an ATS match score and detailed feedback.",
  system:
    "You are an expert at ranking job applicants for specific jobs based on their resume and cover letter. You will be provided with a user prompt that includes a user's id, resume and cover letter as well as the job listing they are applying for in JSON. Your task is to compare the job listing with the applicant's resume and cover letter and provide: 1) a rating for the applicant (1 to 5, where 5 is a perfect/near perfect match, 3 barely meets requirements, and 1 does not meet requirements at all); 2) an ATS compatibility score between 0 and 100 representing the percentage match; 3) a detailed ATS feedback report in clean Markdown format containing sections for 'Match Summary', 'Match Strengths' (aligned skills & experience), 'Gaps / Missing Requirements' (missing skills, experience, or credentials), and 'Final Recommendation'. You must save this rating, ATS score, and ATS feedback in the database using the 'save-applicant-ranking' tool. Do not return any other text.",
  tools: [saveApplicantRatingTool],
  model: gemini({
    model: "gemini-2.0-flash",
    apiKey: env.GEMINI_API_KEY,
  }),
})
