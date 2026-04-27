import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DropdownMenuContextType {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    triggerRef: React.RefObject<HTMLDivElement>;
    contentRef: React.RefObject<HTMLDivElement>;
}

const DropdownMenuContext = createContext<DropdownMenuContextType | undefined>(undefined);

export const DropdownMenu: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Close on click outside and scroll
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (!isOpen) return;
            const target = event.target as Node;
            const isOutsideTrigger = triggerRef.current && !triggerRef.current.contains(target);
            const isOutsideContent = contentRef.current && !contentRef.current.contains(target);

            if (isOutsideTrigger && isOutsideContent) {
                setIsOpen(false);
            }
        };

        const handleScroll = (event: Event) => {
            if (!isOpen) return;
            const target = event.target as Node;
            const isDropdownScroll = contentRef.current && contentRef.current.contains(target);
            if (!isDropdownScroll) {
                setIsOpen(false);
            }
        };

        const handleResize = () => {
            if (isOpen) setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
            window.addEventListener('resize', handleResize);
            document.addEventListener('scroll', handleScroll, true); // true to capture scroll on any element
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('scroll', handleScroll, true);
        };
    }, [isOpen]);

    return (
        <DropdownMenuContext.Provider value={{ isOpen, setIsOpen, triggerRef, contentRef }}>
            <div className="relative inline-block" ref={triggerRef}>
                {children}
            </div>
        </DropdownMenuContext.Provider>
    );
};

export const DropdownMenuTrigger: React.FC<{ children: React.ReactElement, asChild?: boolean }> = ({ children, asChild }) => {
    const context = useContext(DropdownMenuContext);
    if (!context) throw new Error('DropdownMenuTrigger must be used within a DropdownMenu');

    const { isOpen, setIsOpen } = context;

    if (asChild) {
        const child = children as React.ReactElement<{ onClick?: React.MouseEventHandler }>;
        return React.cloneElement(child, {
            onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
                if (child.props.onClick) child.props.onClick(e);
            },
            'data-state': isOpen ? 'open' : 'closed',
        } as any);
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
            }}
            data-state={isOpen ? 'open' : 'closed'}
            className="cursor-pointer select-none"
        >
            {children}
        </div>
    );
};

export const DropdownMenuContent: React.FC<{
    children: React.ReactNode;
    align?: 'end' | 'start';
    side?: 'top' | 'bottom';
    className?: string;
}> = ({ children, align = 'start', side = 'bottom', className }) => {
    const context = useContext(DropdownMenuContext);
    if (!context) throw new Error('DropdownMenuContent must be used within a DropdownMenu');

    const { isOpen, triggerRef, contentRef } = context;
    const [mounted, setMounted] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number; right: number; bottom: number; width: number } | null>(null);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setCoords({
                top: rect.top,
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width
            });
        }
    }, [isOpen, triggerRef]);

    if (!isOpen || !mounted || !coords) return null;

    const style: React.CSSProperties = {
        position: 'fixed',
        zIndex: 9999,
    };

    if (side === 'bottom') {
        style.top = `${coords.bottom + 4}px`; // 4px margin below the trigger
    } else {
        style.bottom = `${window.innerHeight - coords.top + 4}px`; // 4px margin above the trigger
    }

    if (align === 'start') {
        style.left = `${coords.left}px`;
    } else {
        style.right = `${window.innerWidth - coords.right}px`;
    }

    const content = (
        <div
            ref={contentRef}
            style={style}
            className={cn(
                "min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
                className
            )}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>
    );

    return createPortal(content, document.body);
};

export const DropdownMenuItem: React.FC<{
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
}> = ({ children, onClick, className }) => {
    const context = useContext(DropdownMenuContext);
    if (!context) throw new Error('DropdownMenuItem must be used within a DropdownMenu');

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
                context.setIsOpen(false);
            }}
            className={cn(
                "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                className
            )}
        >
            {children}
        </div>
    );
};

export const DropdownMenuLabel: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <div className={cn("px-2 py-1.5 text-sm font-semibold", className)}>
        {children}
    </div>
);

export const DropdownMenuSeparator: React.FC = () => (
    <div className="-mx-1 my-1 h-px bg-muted" />
);
