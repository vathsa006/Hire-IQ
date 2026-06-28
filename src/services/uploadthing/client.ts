import { env } from "@/data/env/server"
import { UTApi } from "uploadthing/server"

function getUploadThingApi(): UTApi {
  const token = env.UPLOADTHING_TOKEN
  
  try {
    if (token && token !== "your_uploadthing_token" && !token.startsWith("your_")) {
      // Verify it's valid base64 JSON
      const decoded = Buffer.from(token, 'base64').toString('utf-8')
      const json = JSON.parse(decoded)
      if (json && json.apiKey && json.appId) {
        return new UTApi({ token })
      }
    }
  } catch {
    console.warn("Invalid Uploadthing token format. Falling back to mocked uploadthing client.")
  }

  console.warn("Uploadthing is running with a stubbed client because UPLOADTHING_TOKEN is not configured or invalid.")
  
  return {
    deleteFiles: async (fileKeys: string | string[]) => {
      console.log(`[Mock Uploadthing] deleteFiles called for:`, fileKeys)
      return { success: true }
    },
  } as unknown as UTApi
}

export const uploadthing = getUploadThingApi()
