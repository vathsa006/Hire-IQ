"use client"

import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export const markdownClassNames =
  "max-w-none prose prose-neutral dark:prose-invert font-sans"

export function MarkdownRendererClient({
  className,
  source,
}: {
  className?: string
  source: string
}) {
  return (
    <div className={cn(markdownClassNames, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
