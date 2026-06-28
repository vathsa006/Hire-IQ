import { getGlobalTag, getIdTag } from "@/lib/dataCache"
import { revalidateTag } from "next/cache"

export function getUserResumeGlobalTag() {
  return getGlobalTag("userResumes")
}

export function getUserResumeIdTag(userId: string) {
  return getIdTag("userResumes", userId)
}

export function revalidateUserResumeCache(userId: string) {
  try {
    revalidateTag(getUserResumeGlobalTag())
    revalidateTag(getUserResumeIdTag(userId))
  } catch (err) {
    console.warn("revalidateTag failed in revalidateUserResumeCache (expected during direct script execution or outside request context):", err)
  }
}
