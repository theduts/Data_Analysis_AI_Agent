import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
    content: string;
    className?: string;
    isUser?: boolean;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className, isUser }) => {
    // Check if user is in dark mode based on the document class or a standard context.
    // Assuming 'dark' class on html/body is used for dark mode in this project.
    const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    return (
        <ReactMarkdown
            className={cn(
                "prose prose-base max-w-none break-words",
                isUser ? "text-current prose-p:text-current prose-headings:text-current prose-strong:text-current prose-em:text-current prose-a:text-current prose-li:text-current prose-code:text-current prose-blockquote:text-current" : "dark:prose-invert",
                "prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0",
                "prose-a:underline-offset-2 hover:prose-a:text-primary",
                !isUser && "prose-a:text-primary",
                isUser ? "prose-li:marker:text-current" : "prose-li:marker:text-foreground/50",
                className
            )}
            remarkPlugins={[remarkGfm]}
            components={{
                code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : '';

                    if (!inline && match) {
                        return (
                            <div className="relative group rounded-md overflow-hidden bg-zinc-950 dark:bg-zinc-900 border border-border my-4">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 dark:bg-zinc-800 border-b border-border/50 select-none">
                                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                        {language}
                                    </span>
                                    <button
                                        className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors bg-transparent border-none cursor-pointer"
                                        onClick={() => {
                                            navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
                                        }}
                                        title="Copy code"
                                    >
                                        Copy
                                    </button>
                                </div>
                                <div className="text-sm">
                                    <SyntaxHighlighter
                                        {...props}
                                        children={String(children).replace(/\n$/, '')}
                                        style={vscDarkPlus}
                                        language={language}
                                        PreTag="div"
                                        className="!m-0 !bg-transparent !p-4"
                                    />
                                </div>
                            </div>
                        );
                    }

                    return (
                        <code className={cn(
                            "px-1.5 py-0.5 rounded-md text-sm font-mono font-semibold",
                            isUser ? "bg-background/20 text-current" : "bg-muted text-foreground"
                        )} {...props}>
                            {children}
                        </code>
                    );
                },
                table({ children, ...props }) {
                    return (
                        <div className="overflow-x-auto my-4 border border-border rounded-lg">
                            <table className="w-full text-sm text-left m-0" {...props}>
                                {children}
                            </table>
                        </div>
                    );
                },
                th({ children, ...props }) {
                    return (
                        <th className="px-4 py-3 bg-muted text-foreground font-semibold border-b border-border" {...props}>
                            {children}
                        </th>
                    );
                },
                td({ children, ...props }) {
                    return (
                        <td className="px-4 py-3 border-b border-border last:border-0" {...props}>
                            {children}
                        </td>
                    );
                }
            }}
        >
            {content}
        </ReactMarkdown>
    );
};

export default MarkdownRenderer;
