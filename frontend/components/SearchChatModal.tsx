import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, PenSquare, MessageCircle, SearchX } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { chatService, MessageSearchResult } from '../services/chatService';

interface SearchChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNewChat: () => void;
    onSearchResultClick: (threadId: string, messageIndex: number, threadTotal: number) => void;
}

// ---------------------------------------------------------------------------
// Utility — normalise a string (lowercase + strip diacritics + remove special chars)
// Mirrors the Python _normalize_query logic so highlight positions align with
// what the backend returned.
// ---------------------------------------------------------------------------
function normalizeStr(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---------------------------------------------------------------------------
// Utility — highlight the matched term inside a snippet string
// ---------------------------------------------------------------------------
function HighlightedSnippet({ text, query }: { text: string; query: string }) {
    if (!query) return <span>{text}</span>;

    try {
        const normQuery = normalizeStr(query);
        const normText = normalizeStr(text);
        const idx = normText.indexOf(normQuery);

        if (idx === -1) return <span>{text}</span>;

        // Boundaries are the same in the original text because normalisation
        // doesn't change character count for plain Latin+diacritics strings.
        const before = text.slice(0, idx);
        const match = text.slice(idx, idx + normQuery.length);
        const after = text.slice(idx + normQuery.length);

        return (
            <span>
                {before}
                <mark className="bg-transparent text-neutral-100 font-bold not-italic">
                    {match}
                </mark>
                {after}
            </span>
        );
    } catch {
        return <span>{text}</span>;
    }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

const SearchChatModal: React.FC<SearchChatModalProps> = ({
    isOpen,
    onClose,
    onNewChat,
    onSearchResultClick,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<MessageSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const inputRef = useRef<HTMLInputElement>(null);
    const bottomSentinelRef = useRef<HTMLDivElement>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeQueryRef = useRef<string>('');

    // ── Reset when modal closes / opens ──────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setResults([]);
            setHasMore(false);
            setPage(0);
            setError(null);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // ── Fetch a page of results ───────────────────────────────────────────────
    const fetchResults = useCallback(async (query: string, skip: number, replace: boolean) => {
        if (!query.trim() || query.trim().length < 2) {
            if (replace) {
                setResults([]);
                setHasMore(false);
            }
            return;
        }

        setIsLoading(true);
        setError(null);
        activeQueryRef.current = query;

        try {
            const data = await chatService.searchMessages(query.trim(), PAGE_SIZE, skip);

            // Guard: discard stale responses if the user has already typed something else
            if (activeQueryRef.current !== query) return;

            setResults(prev => replace ? data.results : [...prev, ...data.results]);
            setHasMore(data.has_more);
        } catch (err) {
            if (activeQueryRef.current !== query) return;
            console.error('Search error:', err);
            setError('Erro ao buscar. Tente novamente.');
        } finally {
            if (activeQueryRef.current === query) {
                setIsLoading(false);
            }
        }
    }, []);

    // ── Debounced input handler ───────────────────────────────────────────────
    useEffect(() => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        if (!searchQuery.trim() || searchQuery.trim().length < 2) {
            setResults([]);
            setHasMore(false);
            setPage(0);
            setIsLoading(false);
            return;
        }

        debounceTimerRef.current = setTimeout(() => {
            setPage(0);
            void fetchResults(searchQuery, 0, true);
        }, DEBOUNCE_MS);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [searchQuery, fetchResults]);

    // ── Infinite scroll: load next page when sentinel enters the viewport ─────
    useEffect(() => {
        const sentinel = bottomSentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoading) {
                    const nextPage = page + 1;
                    setPage(nextPage);
                    void fetchResults(searchQuery, nextPage * PAGE_SIZE, false);
                }
            },
            { root: scrollAreaRef.current, threshold: 0.1 }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, isLoading, page, searchQuery, fetchResults]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSelect = (result: MessageSearchResult) => {
        onSearchResultClick(result.thread_id, result.message_index, result.thread_total);
        onClose();
    };

    const handleNewChat = () => {
        onNewChat();
        onClose();
    };

    const isQueryActive = searchQuery.trim().length >= 2;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="sm:max-w-[600px] p-0 gap-0 bg-sidebar border-border text-sidebar-foreground shadow-2xl overflow-hidden [&>button]:hidden flex flex-col"
                aria-describedby="search-chat-description"
            >
                <DialogTitle className="sr-only">Busca de chats</DialogTitle>
                <span id="search-chat-description" className="sr-only">
                    Busque conversas pelo conteúdo das mensagens
                </span>

                {/* ── Header ── */}
                <div className="flex items-center px-4 py-3 border-b border-neutral-700/50 shrink-0">
                    <Input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar em mensagens..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none shadow-none focus-visible:ring-0 text-base h-auto py-1 px-1 text-sidebar-foreground placeholder:text-muted-foreground"
                    />
                    {isLoading && (
                        <Spinner className="h-4 w-4 text-neutral-400 mr-2 shrink-0" label="Buscando" />
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0 rounded-md"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* ── Scrollable content ── */}
                <div
                    ref={scrollAreaRef}
                    className="overflow-y-auto max-h-[60vh] min-h-0"
                >
                    <div className="p-2 space-y-0.5">
                        {/* New Chat button — always visible */}
                        <button
                            onClick={handleNewChat}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-md hover:bg-sidebar-accent transition-colors text-left text-sidebar-foreground group"
                        >
                            <PenSquare className="h-5 w-5 text-neutral-400 group-hover:text-neutral-200" />
                            <span className="font-medium">Novo chat</span>
                        </button>

                        {/* ── Results ── */}
                        {isQueryActive && results.length > 0 && (
                            <div className="mt-1 text-sm">
                                <p className="px-3 pb-1 text-xs text-neutral-500 uppercase tracking-wide">
                                    Resultados
                                </p>
                                {results.map((result, idx) => (
                                    <button
                                        key={`${result.thread_id}-${idx}`}
                                        onClick={() => handleSelect(result)}
                                        className="w-full flex items-start gap-3 px-3 py-3 rounded-md hover:bg-sidebar-accent transition-colors text-left group"
                                    >
                                        <MessageCircle className="h-5 w-5 text-neutral-400 shrink-0 group-hover:text-neutral-200 mt-0.5" />
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className="truncate text-sidebar-foreground font-normal">
                                                {result.title || 'Nova conversa'}
                                            </span>
                                            <span className="text-xs text-muted-foreground mt-0.5 line-clamp-2 group-hover:text-sidebar-foreground">
                                                <HighlightedSnippet
                                                    text={result.matched_content}
                                                    query={searchQuery.trim()}
                                                />
                                            </span>
                                        </div>
                                    </button>
                                ))}

                                {/* Bottom sentinel for infinite scroll */}
                                <div ref={bottomSentinelRef} className="h-px" />

                                {!hasMore && results.length > 0 && (
                                    <p className="text-center text-xs text-neutral-600 py-2">
                                        Todos os resultados exibidos
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ── Empty state ── */}
                        {isQueryActive && !isLoading && results.length === 0 && !error && (
                            <div className="py-10 flex flex-col items-center gap-2 text-neutral-500">
                                <SearchX className="h-8 w-8 opacity-50" />
                                <p className="text-sm">
                                    Nenhuma mensagem encontrada para &ldquo;{searchQuery}&rdquo;
                                </p>
                            </div>
                        )}

                        {/* ── Error state ── */}
                        {error && (
                            <div className="py-6 text-center text-sm text-red-400">
                                {error}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SearchChatModal;
