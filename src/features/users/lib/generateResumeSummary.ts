import { PDFParse } from "pdf-parse"

export async function generateResumeSummaryText(
  pdfBuffer: Buffer,
  userName: string,
  isPlaceholderKey: boolean
): Promise<string> {
  let textContent = ""
  try {
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) })
    const textResult = await parser.getText()
    textContent = textResult.text || ""
    await parser.destroy()
  } catch (err) {
    console.error("Local PDF text extraction failed:", err)
  }

  if (!isPlaceholderKey && process.env.GEMINI_API_KEY) {
    try {
      const base64Pdf = pdfBuffer.toString("base64")
      const prompt = "Summarize the following resume and extract all key skills, experience, and qualifications. The summary should include all the information that a hiring manager would need to know about the candidate in order to determine if they are a good fit for a job. This summary should be formatted as markdown. Do not return any other text. If the file does not look like a resume return the text 'N/A'."

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: "application/pdf",
                      data: base64Pdf,
                    },
                  },
                  {
                    text: prompt,
                  },
                ],
              },
            ],
          }),
        }
      )

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) {
        return text.trim()
      }
    } catch (err) {
      console.error("Gemini API summary generation failed, falling back to local parsing:", err)
    }
  }

  // Fallback: Dynamic genuine summary parsed locally from PDF text
  if (!textContent || textContent.trim().length === 0) {
    return `### AI Resume Summary for **${userName}** (Mock)
No text content could be extracted from this PDF. Please set a valid \`GEMINI_API_KEY\` in your \`.env\` file for full AI summary generation.`
  }

  // Extract email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const emails = Array.from(new Set(textContent.match(emailRegex) || []))

  // Extract phone numbers (simple pattern matching)
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g
  const phones = Array.from(new Set(textContent.match(phoneRegex) || []))

  // Extract keywords / skills
  const skillsList = [
    "JavaScript", "TypeScript", "React", "Next.js", "NextJS", "Vue", "Angular",
    "Node.js", "NodeJS", "Express", "Python", "Django", "Flask", "Java", "Spring",
    "C#", "C++", "Go", "Golang", "Rust", "SQL", "PostgreSQL", "MySQL", "MongoDB",
    "Redis", "Docker", "Kubernetes", "AWS", "Azure", "GCP", "Git", "GitHub",
    "Tailwind", "CSS", "HTML", "GraphQL", "Prisma", "Drizzle", "REST API"
  ]
  const detectedSkills: string[] = []
  const lowerText = textContent.toLowerCase()
  skillsList.forEach(skill => {
    const safeSkill = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const regex = new RegExp(`\\b${safeSkill}\\b`, 'i')
    if (regex.test(lowerText) || lowerText.includes(skill.toLowerCase())) {
      detectedSkills.push(skill)
    }
  })

  // Format parsed summary
  let parsedSummary = `### 📝 Genuine PDF Summary (Local Offline Parser)
*This summary was dynamically parsed locally from the uploaded PDF text without using external AI APIs.*

#### 👤 Candidate Name
* **${userName}**

`

  if (emails.length > 0 || phones.length > 0) {
    parsedSummary += `#### 📞 Extracted Contact Details\n`
    if (emails.length > 0) parsedSummary += `* **Email:** ${emails.join(", ")}\n`
    if (phones.length > 0) parsedSummary += `* **Phone:** ${phones.join(", ")}\n`
    parsedSummary += `\n`
  }

  if (detectedSkills.length > 0) {
    parsedSummary += `#### 🛠️ Detected Technical Skills\n`
    parsedSummary += detectedSkills.map(skill => `* **${skill}**`).join("\n") + "\n\n"
  }

  // Get clean text snippet
  const cleanText = textContent.replace(/\s+/g, " ").trim()
  const snippet = cleanText.length > 600 ? cleanText.substring(0, 600) + "..." : cleanText

  parsedSummary += `#### 📖 Resume Content Preview\n${snippet}\n\n`
  parsedSummary += `> [!NOTE]\n> For a full, professionally polished AI-generated summary, please configure a valid \`GEMINI_API_KEY\` in your \`.env\` file.`

  return parsedSummary
}
