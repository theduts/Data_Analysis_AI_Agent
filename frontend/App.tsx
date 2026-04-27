import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Message, Conversation, HistoricChart, User } from './types';
import { chatService, ChatHistoryMessage } from './services/chatService';
import { AuthService } from './services/authService';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import Sidebar from './components/Sidebar';
import ChartsModal from './components/modals/ChartsModal';
import AuthScreen from './components/AuthScreen';
import SettingsModal from './components/SettingsModal';
import Dashboard from './components/Dashboard';
import AdvancedChartsView from './components/AdvancedChartsView';
import { TooltipProvider } from './components/ui/tooltip';
import { buildConversationTitleFromMessage } from './utils/conversationTitle';

const NEW_CHAT_ID = 'new';
const TEMP_CHAT_PREFIX = 'temp-';

const getConversationIdFromPath = (): string | null => {
  const match = window.location.pathname.match(/^\/chat\/([^/]+)$/);
  if (!match) return null;

  const conversationId = decodeURIComponent(match[1]);
  return conversationId || null;
};

const isRealThreadId = (conversationId: string | null): conversationId is string => {
  return Boolean(
    conversationId &&
    conversationId !== NEW_CHAT_ID &&
    !conversationId.startsWith(TEMP_CHAT_PREFIX)
  );
};

const updateBrowserPath = (conversationId: string | null) => {
  let nextPath = '/';

  if (
    conversationId === NEW_CHAT_ID ||
    (conversationId !== null && conversationId.startsWith(TEMP_CHAT_PREFIX))
  ) {
    nextPath = '/chat/new';
  } else if (isRealThreadId(conversationId)) {
    nextPath = `/chat/${encodeURIComponent(conversationId)}`;
  }

  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, '', nextPath);
  }
};

const mapHistoryMessagesToUi = (
  threadId: string,
  historyMessages: ChatHistoryMessage[],
  offset: number = 0
): Message[] => {
  return historyMessages.map((message, index) => ({
    id: `${threadId}-msg-${offset + index}-${message.timestamp}`,
    sender: message.role === 'human' ? 'user' : 'ai',
    text: message.content,
  }));
};

const applyThemeInstantly = (nextIsDark: boolean) => {
  const root = document.documentElement;
  root.classList.add('theme-switching');

  if (nextIsDark) {
    root.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  } else {
    root.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      root.classList.remove('theme-switching');
    });
  });
};

const App: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isChartsModalOpen, setIsChartsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecorteSemanaOpen, setIsRecorteSemanaOpen] = useState(false);
  const [isAdvancedChartsOpen, setIsAdvancedChartsOpen] = useState(false);
  const [promptToResubmit, setPromptToResubmit] = useState<string | null>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const isCurrentChatLoading = activeConversation?.messages.some(m => m.isLoading) || false;
  const inFlightConversationLoads = useRef<Set<string>>(new Set());
  const latestSummariesRequestId = useRef(0);
  const pendingTitleConversationIds = useMemo(
    () => conversations
      .filter(conversation => conversation.isAutoTitlePending && isRealThreadId(conversation.id))
      .map(conversation => conversation.id)
      .sort(),
    [conversations]
  );
  const pendingTitleKey = pendingTitleConversationIds.join('|');

  // Target message to scroll-to + highlight after a search result click
  const [highlightTarget, setHighlightTarget] = useState<{
    threadId: string;
    messageIndex: number;
    key: number; // monotonically increasing so the same index can re-trigger
  } | null>(null);

  const loadConversationDetail = useCallback(async (threadId: string) => {
    if (inFlightConversationLoads.current.has(threadId)) return;
    inFlightConversationLoads.current.add(threadId);

    try {
      const INITIAL_LIMIT = 20;
      const detail = await chatService.getConversation(threadId, INITIAL_LIMIT, 0);
      const messages = mapHistoryMessagesToUi(detail.thread_id, detail.messages, 0);

      setConversations(prev => {
        const existingIndex = prev.findIndex(c => c.id === threadId || c.thread_id === threadId);
        const existingConversation = existingIndex >= 0 ? prev[existingIndex] : undefined;

        const hydratedConversation: Conversation = {
          id: detail.thread_id,
          thread_id: detail.thread_id,
          title: detail.title || existingConversation?.title || 'Nova conversa',
          isAutoTitlePending: existingConversation?.isAutoTitlePending ?? false,
          messages,
          isLoaded: true,
          createdAt: detail.created_at,
          updatedAt: detail.updated_at,
          totalMessages: detail.totalMessages,
          hasMore: detail.hasMore,
          isLoadingMore: false,
        };

        if (existingIndex < 0) {
          return [hydratedConversation, ...prev];
        }

        const next = [...prev];
        next[existingIndex] = hydratedConversation;
        return next;
      });
    } catch (error) {
      console.error('Failed to load conversation detail', error);

      if (error instanceof Error && (error.message.includes('404') || error.message.toLowerCase().includes('not found'))) {
        setConversations(prev => prev.filter(c => c.id !== threadId));
        setActiveConversationId(current => current === threadId ? null : current);
      }
    } finally {
      inFlightConversationLoads.current.delete(threadId);
    }
  }, []);

  const loadConversationSummaries = useCallback(async (preferredConversationId?: string | null) => {
    const requestId = ++latestSummariesRequestId.current;

    try {
      const summaries = await chatService.listConversations();
      if (requestId !== latestSummariesRequestId.current) return;

      const summaryIds = summaries.map(summary => summary.thread_id);

      setConversations(prev => {
        const previousByThreadId = new Map(
          prev.map(conversation => [conversation.thread_id ?? conversation.id, conversation])
        );

        return summaries.map(summary => {
          const existingConversation = previousByThreadId.get(summary.thread_id);
          const nextTitle = summary.title || existingConversation?.title || 'Nova conversa';
          const isAutoTitlePending = Boolean(
            existingConversation?.isAutoTitlePending &&
            (!summary.title || summary.title === existingConversation.title)
          );

          return {
            id: summary.thread_id,
            thread_id: summary.thread_id,
            title: nextTitle,
            isAutoTitlePending,
            ui_summary: summary.ui_summary || existingConversation?.ui_summary,
            messages: existingConversation?.messages || [],
            isLoaded: existingConversation?.isLoaded || false,
            createdAt: summary.created_at,
            updatedAt: summary.updated_at,
            totalMessages: existingConversation?.totalMessages,
            hasMore: existingConversation?.hasMore,
            isLoadingMore: false,
          };
        });
      });

      const routeConversationId = preferredConversationId ?? getConversationIdFromPath();

      setActiveConversationId(current => {
        // Avoid stale "/chat/new" responses overriding a real conversation
        // that was just created and already selected.
        if (
          routeConversationId === NEW_CHAT_ID &&
          isRealThreadId(current) &&
          summaryIds.includes(current)
        ) {
          return current;
        }

        if (routeConversationId) return routeConversationId;

        if (current && (current === NEW_CHAT_ID || summaryIds.includes(current))) {
          return current;
        }

        // Mandatory home-first UX: do not auto-enter any existing conversation.
        return null;
      });
    } catch (error) {
      if (requestId !== latestSummariesRequestId.current) return;

      console.warn(
        'Failed to load conversation summaries from server — keeping cached list.',
        error
      );
      // Do NOT clear conversations: preserve whatever is already in state so
      // the sidebar does not go blank when the backend is temporarily unreachable.
    }
  }, []);

  const LOAD_MORE_LIMIT = 20;

  const loadMoreMessages = useCallback(async (threadId: string) => {
    setConversations(prev => prev.map(c =>
      c.id === threadId ? { ...c, isLoadingMore: true } : c
    ));

    try {
      const conv = conversations.find(c => c.id === threadId);
      const currentlyLoaded = conv?.messages.length ?? 0;

      const detail = await chatService.getConversation(threadId, LOAD_MORE_LIMIT, currentlyLoaded);

      // Compute offset so stable message IDs do not collide with already-loaded ones.
      const olderMessages = mapHistoryMessagesToUi(
        detail.thread_id,
        detail.messages,
        detail.totalMessages - currentlyLoaded - detail.messages.length
      );

      setConversations(prev => prev.map(c => {
        if (c.id !== threadId) return c;

        // Deduplicate: keep existing messages, prepend only truly new ones.
        const existingIds = new Set(c.messages.map(m => m.id));
        const newMessages = olderMessages.filter(m => !existingIds.has(m.id));

        return {
          ...c,
          messages: [...newMessages, ...c.messages],
          hasMore: detail.hasMore,
          totalMessages: detail.totalMessages,
          isLoadingMore: false,
        };
      }));
    } catch (error) {
      console.error('Failed to load more messages', error);
      setConversations(prev => prev.map(c =>
        c.id === threadId ? { ...c, isLoadingMore: false } : c
      ));
    }
  }, [conversations]);

  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      try {
        const restoredUser = await AuthService.restoreSession();
        if (!isMounted) return;

        if (restoredUser) {
          setCurrentUser(restoredUser);
          setIsLoggedIn(true);
        }
      } finally {
        if (isMounted) {
          setIsBootstrappingSession(false);
        }
      }
    };

    void bootstrapSession();

    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    const shouldUseDark = savedTheme === 'dark' || (!savedTheme && prefersDarkMode);
    applyThemeInstantly(shouldUseDark);
    setIsDarkMode(shouldUseDark);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    const routeConversationId = getConversationIdFromPath();
    void loadConversationSummaries(routeConversationId);
  }, [isLoggedIn, loadConversationSummaries]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsLoggedIn(false);
      setCurrentUser(null);
      setConversations([]);
      setActiveConversationId(null);
      setInput('');
      updateBrowserPath(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (!isLoggedIn) return;
      setActiveConversationId(getConversationIdFromPath());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;

    updateBrowserPath(activeConversationId);

    if (!isRealThreadId(activeConversationId)) return;

    const targetConversation = conversations.find(c => c.id === activeConversationId);
    if (!targetConversation?.isLoaded) {
      void loadConversationDetail(activeConversationId);
    }
  }, [activeConversationId, conversations, isLoggedIn, loadConversationDetail]);

  useEffect(() => {
    if (pendingTitleConversationIds.length === 0) return;

    let pollCount = 0;
    const maxPolls = 40; // 120 seconds polling maximum

    const interval = setInterval(() => {
      pollCount++;
      if (pollCount >= maxPolls) {
        clearInterval(interval);
        return;
      }
      void loadConversationSummaries(
        activeConversationId && pendingTitleConversationIds.includes(activeConversationId)
          ? activeConversationId
          : null
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [activeConversationId, loadConversationSummaries, pendingTitleConversationIds, pendingTitleKey]);

  const handleSend = useCallback(async (overridePrompt?: string, intentFlag?: string, contextData?: any) => {
    const currentInput = (overridePrompt ?? input).trim();
    const activeConv = conversations.find(c => c.id === activeConversationId);
    const isCurrentlyLoading = activeConv?.messages.some(m => m.isLoading) || false;
    if (currentInput.trim() === '' || isCurrentlyLoading) return;

    const userMessage: Message = { id: Date.now().toString(), sender: 'user', text: currentInput };
    setInput('');

    const aiPlaceholderId = (Date.now() + 1).toString();
    const loadingMessage: Message = { id: aiPlaceholderId, sender: 'ai', text: '', isLoading: true };

    let conversationId = activeConversationId;
    let currentThreadId: string | undefined = activeConv?.thread_id;
    const provisionalTitle = buildConversationTitleFromMessage(currentInput);

    if (!conversationId || conversationId === NEW_CHAT_ID) {
      conversationId = `${TEMP_CHAT_PREFIX}${Date.now()}`;

      const newConversation: Conversation = {
        id: conversationId,
        title: provisionalTitle,
        isAutoTitlePending: true,
        thread_id: undefined,
        messages: [userMessage, loadingMessage],
        isLoaded: true,
      };

      setConversations(prev => [newConversation, ...prev]);
      setActiveConversationId(conversationId);
    } else {
      setConversations(prev =>
        prev.map(c => {
          if (c.id === conversationId) {
            return {
              ...c,
              messages: [...c.messages, userMessage, loadingMessage],
              updatedAt: new Date().toISOString(),
            };
          }
          return c;
        })
      );
    }

    if (!conversationId) return;

    try {
      let isValidationPending = false;

      await chatService.streamMessage(
        currentInput,
        currentThreadId,
        intentFlag,
        contextData,
        (token) => {
          setConversations(prev =>
            prev.map(c => {
              if (c.id === conversationId) {
                return {
                  ...c,
                  messages: c.messages.map(m => {
                    if (m.id === aiPlaceholderId) {
                      return { ...m, text: m.text + token, isLoading: true };
                    }
                    return m;
                  })
                };
              }
              return c;
            })
          );
        },
        (error) => {
          console.error('Error generating response:', error);
          setConversations(prev =>
            prev.map(c => {
              if (c.id === conversationId && c.messages.some(m => m.id === aiPlaceholderId)) {
                return {
                  ...c,
                  messages: c.messages.map(m => {
                    if (m.id === aiPlaceholderId) {
                      const baseText = m.text.trim();
                      const newText = baseText
                        ? `${baseText}\n\n[Erro na conexão: o stream foi interrompido.]`
                        : 'Desculpa, parece que encontrei um erro ao consultar o servidor. Por favor, tente novamente.';
                      return { ...m, text: newText, isError: true, isLoading: false };
                    }
                    return m;
                  })
                };
              }
              return c;
            })
          );
        },
        ({ thread_id, next_action }) => {
          isValidationPending = next_action === 'validation_needed';

          setConversations(prev =>
            prev
              .map(c => {
                if (c.id === conversationId && c.messages.some(m => m.id === aiPlaceholderId)) {
                  return {
                    ...c,
                    id: thread_id,
                    thread_id,
                    isAutoTitlePending: c.isAutoTitlePending ?? true,
                    messages: c.messages.map(m => {
                      if (m.id === aiPlaceholderId) {
                        return { ...m, isError: isValidationPending, isLoading: false };
                      }
                      return m;
                    }),
                    isLoaded: true,
                    updatedAt: new Date().toISOString(),
                  };
                }
                return c;
              })
              .filter((conversation, index, arr) => {
                return index === arr.findIndex(item => item.id === conversation.id);
              })
          );

          setActiveConversationId(thread_id);
          void loadConversationSummaries(thread_id);
        }
      );

    } catch (error) {
      console.error('General error starting stream:', error);
    }
  }, [input, conversations, activeConversationId]);

  useEffect(() => {
    if (promptToResubmit) {
      handleSend(promptToResubmit);
      setPromptToResubmit(null);
    }
  }, [promptToResubmit, handleSend]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const newIsDark = !prev;
      applyThemeInstantly(newIsDark);
      return newIsDark;
    });
  };

  const handleNewChat = () => {
    setActiveConversationId(NEW_CHAT_ID);
    setInput('');
    setIsSidebarOpen(false);
    setIsRecorteSemanaOpen(false);
    setIsAdvancedChartsOpen(false);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setIsSidebarOpen(false);
    setIsRecorteSemanaOpen(false);
    setIsAdvancedChartsOpen(false);
  };

  const handleSearchResultClick = (threadId: string, messageIndex: number) => {
    setHighlightTarget({ threadId, messageIndex, key: Date.now() });

    const isAlreadyLoaded = conversations.some(c => (c.id === threadId || c.thread_id === threadId) && c.isLoaded);

    // Even if loaded, we might need a different page/slice if the message is old
    loadConversationDetail(threadId);

    setActiveConversationId(threadId);
    setIsSidebarOpen(false);
    setIsRecorteSemanaOpen(false);
    setIsAdvancedChartsOpen(false);
  };

  const handleDeleteConversation = async (idToDelete: string) => {
    if (isRealThreadId(idToDelete)) {
      try {
        await chatService.deleteConversation(idToDelete);

        // Only update local state if server deletion succeeded
        setConversations(prev => prev.filter(c => c.id !== idToDelete));

        if (activeConversationId === idToDelete) {
          setActiveConversationId(null);
          updateBrowserPath(null);
        }
      } catch (error) {
        console.error('Failed to delete conversation on server', error);
        alert('Não foi possível apagar a conversa. Por favor, tente novamente.');
      }
    } else {
      // Local/temp chats can be deleted immediately
      setConversations(prev => prev.filter(c => c.id !== idToDelete));
      if (activeConversationId === idToDelete) {
        setActiveConversationId(null);
        updateBrowserPath(null);
      }
    }
  };

  const handleRenameConversation = async (idToRename: string, newTitle: string) => {
    if (!newTitle.trim()) return;

    // Optimistic UI update
    setConversations(prev => prev.map(c =>
      c.id === idToRename ? { ...c, title: newTitle, isAutoTitlePending: false } : c
    ));

    if (isRealThreadId(idToRename)) {
      try {
        await chatService.renameConversation(idToRename, newTitle);
      } catch (error) {
        console.error('Failed to rename conversation on server', error);
        // We could revert the optimistic update here if needed.
      }
    }
  };

  const handleEditMessage = (messageId: string, newText: string) => {
    if (!activeConversationId) return;

    setConversations(prev => prev.map(c => {
      if (c.id === activeConversationId) {
        const messageIndex = c.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return c;
        const truncatedMessages = c.messages.slice(0, messageIndex);
        return { ...c, messages: truncatedMessages };
      }
      return c;
    }));

    setPromptToResubmit(newText);
  };

  const handleInterrupt = () => {
    setConversations(prev => prev.map(c => {
      if (c.id === activeConversationId) {
        return { ...c, messages: c.messages.filter(m => !m.isLoading) };
      }
      return c;
    }));
  };

  const allCharts = useMemo(() => {
    const charts: HistoricChart[] = [];
    conversations.forEach(conv => {
      conv.messages.forEach(msg => {
        if (msg.chartData) {
          charts.push({
            chartData: msg.chartData,
            conversationId: conv.id,
            messageId: msg.id
          });
        }
      });
    });
    return charts;
  }, [conversations]);

  const handleGoToConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setIsChartsModalOpen(false);
    setIsSidebarOpen(false);
    setIsAdvancedChartsOpen(false);
  };

  const handleChatWithMetric = useCallback(async (metric: any) => {
    // 1. Close charts view
    setIsAdvancedChartsOpen(false);

    // 2. Clear input and focus chat (or start new one)
    const prompt = `Gostaria de analisar os dados da métrica: ${metric.title}. Pode me ajudar a entender melhor esse gráfico?`;

    // 3. Initiate the message
    handleSend(prompt, 'advanced_chart', {
      chart_id: metric.id,
      metric_title: metric.title,
      narrative: metric.insight?.narrative
    });
  }, [handleSend]);

  const displayMessages = activeConversation ? activeConversation.messages : [];

  if (isBootstrappingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Restaurando sessão...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <AuthScreen onLogin={(user) => {
      setConversations([]);
      setActiveConversationId(getConversationIdFromPath());
      setIsLoggedIn(true);
      setCurrentUser(user);
    }} />;
  }

  const handleLogout = async () => {
    await AuthService.logout();
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveConversationId(null);
    setInput('');
    setIsSidebarOpen(false);
    setIsRecorteSemanaOpen(false);
    setIsAdvancedChartsOpen(false);
    setConversations([]);
    updateBrowserPath(null);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen font-sans bg-background text-foreground transition-colors duration-300">
        <Sidebar
          user={currentUser}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          isCollapsed={isSidebarCollapsed}
          toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onLogout={handleLogout}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenChartHistory={() => setIsChartsModalOpen(true)}
          onToggleRecorteSemana={() => {
            setIsRecorteSemanaOpen(!isRecorteSemanaOpen);
            setIsAdvancedChartsOpen(false);
          }}
          onToggleAdvancedCharts={() => {
            setIsAdvancedChartsOpen(!isAdvancedChartsOpen);
            setIsRecorteSemanaOpen(false);
          }}
          isAdvancedChartsOpen={isAdvancedChartsOpen}
          isRecorteSemanaOpen={isRecorteSemanaOpen}
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          onSearchResultClick={handleSearchResultClick}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          {isAdvancedChartsOpen ? (
            <div className="flex-1 overflow-y-auto w-full relative">
              <AdvancedChartsView
                onChatWithAI={handleChatWithMetric}
                onClose={() => setIsAdvancedChartsOpen(false)}
              />
            </div>
          ) : isRecorteSemanaOpen ? (
            <div className="flex-1 overflow-y-auto w-full relative">
              <Dashboard onClose={() => setIsRecorteSemanaOpen(false)} />
            </div>
          ) : activeConversationId && activeConversationId !== NEW_CHAT_ID ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
              <ChatWindow
                conversationId={activeConversationId}
                messages={displayMessages}
                onEditMessage={handleEditMessage}
                contentPaddingBottom={12}
                onLoadMore={() => loadMoreMessages(activeConversationId!)}
                hasMore={activeConversation?.hasMore ?? false}
                isLoadingMore={activeConversation?.isLoadingMore ?? false}
                highlightMessageIndex={
                  highlightTarget?.threadId === activeConversationId
                    ? highlightTarget.messageIndex
                    : null
                }
              />
              <div className="shrink-0 px-2 pb-4 sm:px-3 md:px-4 md:pb-5">
                <div className="mx-auto w-full max-w-[64rem]">
                  <InputBar
                    input={input}
                    setInput={setInput}
                    handleSend={() => handleSend()}
                    handleInterrupt={handleInterrupt}
                    isLoading={isCurrentChatLoading}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background">
              <div className="w-full max-w-[64rem] flex flex-col items-center gap-8">
                <div className="text-center">
                  <h1 className="text-4xl font-semibold text-foreground">
                    Bonjour! O que vamos fazer hoje?
                  </h1>
                </div>
                <div className="w-full">
                  <InputBar
                    input={input}
                    setInput={setInput}
                    handleSend={() => handleSend()}
                    handleInterrupt={() => { }}
                    isLoading={false}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <ChartsModal
          isOpen={isChartsModalOpen}
          onClose={() => setIsChartsModalOpen(false)}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
        />
      </div>
    </TooltipProvider>
  );
};

export default App;
