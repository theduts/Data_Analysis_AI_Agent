import React from 'react';
import { cn } from '@/lib/utils';

interface ThinkingIndicatorProps {
    className?: string;
    text?: string;
}

/**
 * A professional, animated thinking indicator for the AI.
 * Includes a shimmer effect on the text and sequenced dots animation.
 */
export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
    className,
    text = "Pensando"
}) => {
    return (
        <div className={cn("flex items-center space-x-1 select-none py-1", className)}>
            <span className="animate-shimmer font-medium text-sm">
                {text}
            </span>
            <div className="flex space-x-0.5 mt-1">
                <span className="animate-dot animate-dot-1 h-1 w-1 bg-muted-foreground rounded-full" />
                <span className="animate-dot animate-dot-2 h-1 w-1 bg-muted-foreground rounded-full" />
                <span className="animate-dot animate-dot-3 h-1 w-1 bg-muted-foreground rounded-full" />
            </div>
        </div>
    );
};
