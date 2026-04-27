/**
 * chatService.ts
 *
 * Client for the LangGraph orchestrator API endpoints.
 * Uses AuthService.fetchWithAuth so JWT tokens are automatically injected
 * and refreshed on 401 — same pattern as the rest of the app.
 */

import { AuthService } from './authService';

export interface ChatResponse {
    thread_id: string;
    response: string;
    cache_hit: boolean;
    next_action?: string;
}

export interface ChatHistoryMessage {
    role: 'human' | 'ai';
    content: string;
    timestamp: string;
    metadata: Record<string, unknown>;
}

export interface ConversationSummaryResponse {
    thread_id: string;
    title: string;
    ui_summary?: string;
    created_at: string;
    updated_at: string;
    message_count: number;
}

export interface ConversationDetailResponse {
    thread_id: string;
    title: string;
    created_at: string;
    updated_at: string;
    messages: ChatHistoryMessage[];
    totalMessages: number;
    hasMore: boolean;
}

export interface ResumeResponse {
    thread_id: string;
    response: string;
    cache_hit: boolean;
    next_action?: string;
}

/**
 * Send a message through the LangGraph orchestrator.
 *
 * @param message   The user's message text
 * @param thread_id Existing thread ID to continue a conversation, or undefined for a new one
 * @returns         ChatResponse with response text and the (possibly new) thread_id
 */
export async function sendMessage(
    message: string,
    thread_id?: string,
    intent_flag?: string,
    context_data?: Record<string, any>
): Promise<ChatResponse> {
    const res = await AuthService.fetchWithAuth('/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, thread_id, intent_flag, context_data }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status} ao chamar o backend.`);
    }

    return res.json();
}

/**
 * Send a message and consume the response as Server-Sent Events (SSE).
 *
 * @param message   The user's message text
 * @param thread_id Existing thread ID to continue a conversation, or undefined for a new one
 * @param onNext    Callback fired when a new token arrives
 * @param onError   Callback fired on stream error
 * @param onComplete Callback fired when the stream successfully finishes, with metadata
 */
export async function streamMessage(
    message: string,
    thread_id: string | undefined,
    intent_flag: string | undefined,
    context_data: Record<string, any> | undefined,
    onNext: (token: string) => void,
    onError: (error: Error) => void,
    onComplete: (metadata: { thread_id: string; next_action?: string }) => void
): Promise<void> {
    try {
        const res = await AuthService.fetchWithAuth('/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, thread_id, intent_flag, context_data }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Erro ${res.status} ao chamar o backend.`);
        }

        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");

        let pending = "";
        let finalThreadId = thread_id || "";
        let finalNextAction: string | undefined = undefined;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                pending += decoder.decode(value, { stream: true });
                const lines = pending.split('\n');
                pending = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const dataStr = line.slice(6).trim();
                        if (!dataStr) continue;

                        if (dataStr === "[DONE]") {
                            continue;
                        }

                        let parsed;
                        try {
                            parsed = JSON.parse(dataStr);
                            if (parsed.token !== undefined) {
                                onNext(parsed.token);
                            } else if (parsed.error) {
                                throw new Error(parsed.error);
                            } else if (parsed.event === 'metadata' && parsed.thread_id) {
                                finalThreadId = parsed.thread_id;
                                if (parsed.next_action) finalNextAction = parsed.next_action;
                            }
                        } catch (e) {
                            if (e instanceof Error && parsed && e.message === parsed.error) throw e;
                            console.warn("Failed to parse SSE line", dataStr);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        onComplete({ thread_id: finalThreadId, next_action: finalNextAction });

    } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
    }
}

export async function listConversations(): Promise<ConversationSummaryResponse[]> {
    const res = await AuthService.fetchWithAuth('/chat/conversations', {
        method: 'GET',
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status} ao listar conversas.`);
    }

    return res.json();
}

export async function getConversation(
    thread_id: string,
    limit: number = 20,
    skip: number = 0,
): Promise<ConversationDetailResponse> {
    const params = new URLSearchParams({
        limit: String(limit),
        skip: String(skip),
    });
    const res = await AuthService.fetchWithAuth(
        `/chat/conversations/${encodeURIComponent(thread_id)}?${params}`,
        { method: 'GET' },
    );

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status} ao carregar conversa.`);
    }

    return res.json();
}

export async function deleteConversation(thread_id: string): Promise<void> {
    const res = await AuthService.fetchWithAuth(`/chat/conversations/${encodeURIComponent(thread_id)}`, {
        method: 'DELETE',
    });

    if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status} ao apagar conversa.`);
    }
}

/**
 * Rename a specific conversation thread.
 */
export async function renameConversation(thread_id: string, title: string): Promise<void> {
    const res = await AuthService.fetchWithAuth(`/chat/conversations/${encodeURIComponent(thread_id)}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status} ao renomear conversa.`);
    }
}

export interface MessageSearchResult {
    thread_id: string;
    title: string;
    score: number;
    matched_content: string;
    message_index: number;
    thread_total: number;
}

export interface SearchResultsResponse {
    results: MessageSearchResult[];
    total: number;
    has_more: boolean;
}

export async function searchMessages(
    q: string,
    limit: number = 10,
    skip: number = 0,
): Promise<SearchResultsResponse> {
    const params = new URLSearchParams({
        q,
        limit: String(limit),
        skip: String(skip),
    });
    const res = await AuthService.fetchWithAuth(`/chat/search?${params}`, {
        method: 'GET',
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status} ao buscar mensagens.`);
    }

    return res.json();
}

export async function resumeGraph(
    thread_id: string,
    approved: boolean = true
): Promise<ResumeResponse> {
    const res = await AuthService.fetchWithAuth('/chat/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id, approved }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status} ao retomar conversa.`);
    }

    return res.json();
}

export const chatService = {
    sendMessage,
    streamMessage,
    resumeGraph,
    listConversations,
    getConversation,
    deleteConversation,
    renameConversation,
    searchMessages,
};