import React, { useRef, useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';

interface TruncatedTitleProps {
    title: string;
    className?: string;
}

/**
 * TruncatedTitle component
 * 
 * Professionals displays a title with ellipsis if it overflows,
 * and shows the full title in a tooltip on hover.
 */
export const TruncatedTitle: React.FC<TruncatedTitleProps> = ({ title, className }) => {
    const [isTruncated, setIsTruncated] = useState(false);
    const textRef = useRef<HTMLSpanElement>(null);

    const checkTruncation = () => {
        if (textRef.current) {
            const { scrollWidth, clientWidth } = textRef.current;
            setIsTruncated(scrollWidth > clientWidth);
        }
    };

    useEffect(() => {
        checkTruncation();

        // Add resize listener to re-check truncation if window size changes
        window.addEventListener('resize', checkTruncation);
        return () => window.removeEventListener('resize', checkTruncation);
    }, [title]);

    const content = (
        <span
            ref={textRef}
            className={cn("block w-full min-w-0 truncate", className)}
        >
            {title}
        </span>
    );

    if (!isTruncated) {
        return content;
    }

    return (
        <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
                <div className="min-w-0 w-full cursor-pointer">
                    {content}
                </div>
            </TooltipTrigger>
            <TooltipContent
                side="right"
                className="max-w-[300px] break-words"
            >
                {title}
            </TooltipContent>
        </Tooltip>
    );
};
