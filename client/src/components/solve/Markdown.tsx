import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Note: @tailwindcss/typography is installed but not imported in index.css (@plugin),
// so prose classes are not available. Using simple space-y-2 text-sm container instead.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm text-foreground [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-0.5 [&_p]:leading-relaxed [&_strong]:font-semibold [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-auto [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
