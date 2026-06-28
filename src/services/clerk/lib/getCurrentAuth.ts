import { db } from "@/drizzle/db"
import { OrganizationTable, UserTable } from "@/drizzle/schema"
import { getOrganizationIdTag, revalidateOrganizationCache } from "@/features/organizations/db/cache/organizations"
import { getUserIdTag, revalidateUserCache } from "@/features/users/db/cache/users"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"

export async function getCurrentUser({ allData = false } = {}) {
  const { userId } = await auth()

  if (userId != null) {
    let user = await getUser(userId)
    
    if (user == null) {
      try {
        const client = await clerkClient()
        const clerkUser = await client.users.getUser(userId)
        
        if (clerkUser != null) {
          const email = clerkUser.emailAddresses.find(
            e => e.id === clerkUser.primaryEmailAddressId
          )?.emailAddress || ""
          
          await db.insert(UserTable).values({
            id: clerkUser.id,
            name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "User",
            imageUrl: clerkUser.imageUrl,
            email,
          }).onConflictDoNothing()
          
          setTimeout(() => {
            try {
               revalidateUserCache(clerkUser.id)
            } catch {}
          }, 0)
          
          user = await getUser(userId)
        }
      } catch (err) {
        console.error("Failed to sync user from Clerk:", err)
      }
    }
    
    return {
      userId,
      user: allData ? user : undefined,
    }
  }

  return {
    userId: null,
    user: undefined,
  }
}

export async function getCurrentOrganization({ allData = false } = {}) {
  const { orgId } = await auth()

  if (orgId != null) {
    let organization = await getOrganization(orgId)
    
    if (organization == null) {
      try {
        const client = await clerkClient()
        const clerkOrg = await client.organizations.getOrganization({ organizationId: orgId })
        
        if (clerkOrg != null) {
          await db.insert(OrganizationTable).values({
            id: clerkOrg.id,
            name: clerkOrg.name,
            imageUrl: clerkOrg.imageUrl,
          }).onConflictDoNothing()
          
          setTimeout(() => {
            try {
               revalidateOrganizationCache(clerkOrg.id)
            } catch {}
          }, 0)
          
          organization = await getOrganization(orgId)
        }
      } catch (err) {
        console.error("Failed to sync organization from Clerk:", err)
      }
    }
    
    return {
      orgId,
      organization: allData ? organization : undefined,
    }
  }

  return {
    orgId: null,
    organization: undefined,
  }
}

async function getUser(id: string) {
  "use cache"
  cacheTag(getUserIdTag(id))

  return db.query.UserTable.findFirst({
    where: eq(UserTable.id, id),
  })
}

async function getOrganization(id: string) {
  "use cache"
  cacheTag(getOrganizationIdTag(id))

  return db.query.OrganizationTable.findFirst({
    where: eq(OrganizationTable.id, id),
  })
}
