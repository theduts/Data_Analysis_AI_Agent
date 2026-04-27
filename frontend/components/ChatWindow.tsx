import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Message as MessageType } from '../types';
import Message from './Message';
import { Spinner } from './ui/spinner';

interface ChatWindowProps {
  conversationId?: string | null;
  messages: MessageType[];
  onEditMessage: (messageId: string, newText: string) => void;
  contentPaddingBottom?: number;
  /** Called when the top sentinel enters the viewport (i.e. user scrolled up). */
  onLoadMore?: () => void;
  /** Whether there are older messages available to fetch. */
  hasMore?: boolean;
  /** Whether an older-messages fetch is currently in progress. */
  isLoadingMore?: boolean;
  /** 0-based index of the message to scroll to and highlight (from search). */
  highlightMessageIndex?: number | null;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationId = null,
  messages,
  onEditMessage,
  contentPaddingBottom = 20,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  highlightMessageIndex = null,
}) => {
  const scrollContainerRef = useRef<HTMLElement>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const previousLastMessageTextRef = useRef<string>('');

  // Sentinel div placed at the TOP of the message list.
  // When it intersects the viewport, older messages are loaded.
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // Scroll-lock: remember scroll height BEFORE React inserts new nodes at the top.
  // This ref is set in the render phase (sync), so useLayoutEffect can use it.
  const prevScrollHeightRef = useRef<number | null>(null);

  // ── Scroll to highlighted message (from search) ──────────────────────────

  useEffect(() => {
    if (highlightMessageIndex == null) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    // Allow React to finish rendering the messages before querying the DOM
    const rafId = requestAnimationFrame(() => {
      const target = container.querySelector<HTMLElement>(
        `[data-msg-index="${highlightMessageIndex}"]`
      );
      if (!target) return;

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('msg-highlight-pulse');

      const timer = setTimeout(() => {
        target.classList.remove('msg-highlight-pulse');
      }, 2200);

      return () => clearTimeout(timer);
    });

    return () => cancelAnimationFrame(rafId);
  }, [highlightMessageIndex]);

  // ── Scroll to bottom on new messages / conversation switch ──────────────────

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const previousConversationId = previousConversationIdRef.current;
    const previousMessageCount = previousMessageCountRef.current;
    const previousLastMessageText = previousLastMessageTextRef.current;

    const hasConversationChanged = previousConversationId !== conversationId;
    const hasNewMessages = messages.length > previousMessageCount;
    const lastMessage = messages[messages.length - 1];
    const hasLastMessageChanged = !hasNewMessages && lastMessage && lastMessage.text !== previousLastMessageText;

    if (hasNewMessages || hasLastMessageChanged) {
      if (prevScrollHeightRef.current !== null) {
        // New messages were prepended (scroll-lock): restore relative position.
        const delta = container.scrollHeight - prevScrollHeightRef.current;
        container.scrollTop = container.scrollTop + delta;
        prevScrollHeightRef.current = null;
      } else {
        // Messages were appended (user sent/received) or stream updated: scroll to bottom.
        const shouldJumpInstantly = hasConversationChanged || previousMessageCount === 0;
        if (shouldJumpInstantly) {
          container.scrollTop = container.scrollHeight;
        } else {
          // If streaming, only auto-scroll if user is near bottom. For new messages, always scroll.
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
          if (hasNewMessages || isNearBottom) {
            // Use 'auto' behavior for streaming so it tracks nicely without jank, and 'smooth' for new messages
            container.scrollTo({ top: container.scrollHeight, behavior: hasLastMessageChanged ? 'auto' : 'smooth' });
          }
        }
      }
    }

    previousConversationIdRef.current = conversationId;
    previousMessageCountRef.current = messages.length;
    previousLastMessageTextRef.current = lastMessage?.text || '';
  }, [conversationId, messages]);

  // ── IntersectionObserver: fire onLoadMore when sentinel enters viewport ─────

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || !onLoadMore) return;
    // Capture current scrollHeight BEFORE state update inserts new nodes.
    if (scrollContainerRef.current) {
      prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight;
    }
    onLoadMore();
  }, [hasMore, isLoadingMore, onLoadMore]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      {
        // Use the scroll container as the root so the sentinel is observed
        // relative to the scrollable area, not the viewport.
        root: scrollContainerRef.current,
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  return (
    <main
      ref={scrollContainerRef}
      className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-2 py-4 sm:px-3 md:px-4 md:py-5"
    >
      <div className="mx-auto w-full max-w-[56rem] space-y-6" style={{ paddingBottom: contentPaddingBottom }}>

        {/* Top sentinel — triggers load-more when it comes into view */}
        <div ref={topSentinelRef} aria-hidden="true" />

        {/* Spinner shown while older messages are being fetched */}
        {isLoadingMore && (
          <div className="flex justify-center py-2" aria-label="Carregando mensagens anteriores">
            <Spinner className="h-5 w-5 text-muted-foreground" label="Carregando mensagens anteriores" />
          </div>
        )}

        {messages.map((msg, idx) => (
          <Message
            key={msg.id}
            message={msg}
            index={msg.absoluteIndex ?? idx}
            onEditMessage={(newText) => onEditMessage(msg.id, newText)}
          />
        ))}
      </div>
    </main>
  );
};

export default ChatWindow;
