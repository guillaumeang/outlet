import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MarkdownBody } from "../types";

type MarkdownRendererProps = {
  body: MarkdownBody;
};

export const MarkdownRenderer = ({ body }: MarkdownRendererProps) => {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="agent-markdown mx-auto max-w-[72ch] text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body.content}</ReactMarkdown>
      </div>
    </div>
  );
};
