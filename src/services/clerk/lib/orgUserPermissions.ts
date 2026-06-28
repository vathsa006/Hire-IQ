import { auth } from "@clerk/nextjs/server"

type UserPermission =
  | "org:job_listings:create"
  | "org:job_listings:update"
  | "org:job_listings:delete"
  | "org:job_listings:change_status"
  | "org:job_listing_applications:change_rating"
  | "org:job_listing_applications:change_stage"

export async function hasOrgUserPermission(permission: UserPermission) {
  const { has } = await auth()
  
  if (process.env.NODE_ENV === "development") {
    // During local development, allow if the user is an admin or member of the organization
    return has({ role: "org:admin" }) || has({ role: "org:member" }) || has({ permission })
  }
  
  return has({ permission }) || has({ role: "org:admin" })
}
