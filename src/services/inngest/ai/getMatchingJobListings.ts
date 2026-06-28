import { env } from "@/data/env/server"
import {
  experienceLevels,
  jobListingTypes,
  locationRequirements,
  wageIntervals,
} from "@/drizzle/schema"
import { createAgent, gemini } from "@inngest/agent-kit"
import { z } from "zod"
import { getLastOutputMessage } from "./getLastOutputMessage"

const listingSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  wage: z.number().nullable(),
  wageInterval: z.enum(wageIntervals).nullable(),
  stateAbbreviation: z.string().nullable(),
  city: z.string().nullable(),
  experienceLevel: z.enum(experienceLevels),
  type: z.enum(jobListingTypes),
  locationRequirement: z.enum(locationRequirements),
})

export async function getMatchingJobListings(
  prompt: string,
  jobListings: z.infer<typeof listingSchema>[],
  { maxNumberOfJobs }: { maxNumberOfJobs?: number } = {}
) {
  const NO_JOBS = "NO_JOBS"

  const isPlaceholderKey = 
    !env.GEMINI_API_KEY || 
    env.GEMINI_API_KEY === "your-gemini-key" ||
    env.GEMINI_API_KEY.includes("your-gemini-key");

  if (isPlaceholderKey) {
    console.warn("Using keyword fallback search because GEMINI_API_KEY is not configured.");
    return getKeywordMatchingJobs(prompt, jobListings, maxNumberOfJobs);
  }

  try {
    const agent = createAgent({
      name: "Job Matching Agent",
      description: "Agent for matching users with job listings",
      system: `You are an expert at matching people with jobs based on their specific experience, and requirements. The provided user prompt will be a description that can include information about themselves as well what they are looking for in a job. ${
        maxNumberOfJobs
          ? `You are to return up to ${maxNumberOfJobs} jobs.`
          : `Return all jobs that match their requirements.`
      } Return the jobs as a comma separated list of jobIds. If you cannot find any jobs that match the user prompt, return the text "${NO_JOBS}". Here is the JSON array of available job listings: ${JSON.stringify(
        jobListings.map(listing =>
          listingSchema
            .transform(listing => ({
              ...listing,
              wage: listing.wage ?? undefined,
              wageInterval: listing.wageInterval ?? undefined,
              city: listing.city ?? undefined,
              stateAbbreviation: listing.stateAbbreviation ?? undefined,
              locationRequirement: listing.locationRequirement ?? undefined,
            }))
            .parse(listing)
        )
      )}`,
      model: gemini({
        model: "gemini-2.0-flash",
        apiKey: env.GEMINI_API_KEY,
      }),
    })

    const result = await agent.run(prompt)
    const lastMessage = getLastOutputMessage(result)

    if (lastMessage == null || lastMessage === NO_JOBS) return []

    return lastMessage
      .split(",")
      .map(jobId => jobId.trim())
      .filter(Boolean)
  } catch (error) {
    console.error("AI Search failed, falling back to keyword search:", error);
    return getKeywordMatchingJobs(prompt, jobListings, maxNumberOfJobs);
  }
}

function getKeywordMatchingJobs(
  prompt: string,
  jobListings: z.infer<typeof listingSchema>[],
  maxNumberOfJobs?: number
): string[] {
  const words = prompt
    .toLowerCase()
    .split(/[\s,.\-\/]+/)
    .filter(w => w.length > 2);
  
  if (words.length === 0) return jobListings.map(j => j.id);

  const scored = jobListings.map(job => {
    let score = 0;
    const textToSearch = `${job.title} ${job.description} ${job.city || ""} ${job.stateAbbreviation || ""} ${job.experienceLevel} ${job.type} ${job.locationRequirement}`.toLowerCase();
    
    for (const word of words) {
      if (textToSearch.includes(word)) {
        score++;
        if (job.title.toLowerCase().includes(word)) {
          score += 2;
        }
      }
    }
    return { id: job.id, score };
  });

  const matches = scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.id);

  if (maxNumberOfJobs) {
    return matches.slice(0, maxNumberOfJobs);
  }
  return matches;
}
