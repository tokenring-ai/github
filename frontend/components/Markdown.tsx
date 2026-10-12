import { markdownLinkComponents } from "@tokenring-ai/one-frontend/components/chat/MarkdownLink.tsx";
import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Rendered markdown for issue and pull request bodies, comments and reviews. */
export default function Markdown({ children, className }: { children: string; className?: string | undefined }) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words prose-headings:text-primary prose-headings:mt-3 prose-headings:mb-1.5 prose-p:my-1.5 prose-p:text-secondary prose-li:my-0.5 prose-code:text-primary prose-a:text-accent prose-strong:text-primary prose-code:bg-tertiary prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-tertiary prose-pre:text-primary prose-pre:border prose-pre:border-primary",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownLinkComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
