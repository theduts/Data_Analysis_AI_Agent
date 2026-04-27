import React, { useState, useMemo } from 'react';
import { Conversation, User } from '../types';
import {
  Plus,
  MessageSquare,
  Trash2,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Settings,
  BarChart,
  Sparkles,
  User as UserIcon,
  MoreVertical,
  Pencil,
  CalendarClock
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from './ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import SearchChatModal from './SearchChatModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { TruncatedTitle } from './TruncatedTitle';
import MonthlyClosingModal from './modals/MonthlyClosingModal';

interface SidebarProps {
  user: User | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenChartHistory: () => void;
  onToggleRecorteSemana?: () => void;
  onToggleAdvancedCharts?: () => void;
  isAdvancedChartsOpen?: boolean;
  isRecorteSemanaOpen?: boolean;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onSearchResultClick: (threadId: string, messageIndex: number) => void;
}

const getDisplayName = (user: User | null): string => {
  if (!user) return '';
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  if (user.lastName) return user.lastName;

  // If username is not an email, return it
  if (user.username && !user.username.includes('@')) return user.username;

  // Extract name from email-like username or email
  const namePart = (user.username || user.email || '').split('@')[0];
  if (!namePart) return 'Usuário';

  // Capitalize words separated by dots, dashes or underscores
  return namePart.split(/[\.\-_]/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
};

const getInitials = (user: User | null): string => {
  if (!user) return '';
  if (user.firstName) return user.firstName.charAt(0).toUpperCase();
  const namePart = (user.username || user.email || '').split('@')[0];
  if (namePart) return namePart.charAt(0).toUpperCase();
  return '';
};

const SidebarContent: React.FC<{
  user: User | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenChartHistory: () => void;
  onToggleRecorteSemana?: () => void;
  onToggleAdvancedCharts?: () => void; // Added
  isAdvancedChartsOpen?: boolean; // Added
  isRecorteSemanaOpen?: boolean; // Added
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onOpenSearch: () => void;
  onOpenMonthlyClosing: () => void;
}> = ({
  user,
  conversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  isCollapsed,
  toggleCollapse,
  onLogout,
  onOpenSettings,
  onOpenChartHistory,
  onToggleRecorteSemana,
  onToggleAdvancedCharts,
  isAdvancedChartsOpen,
  isRecorteSemanaOpen,
  isDarkMode,
  toggleDarkMode,
  onOpenSearch,
  onOpenMonthlyClosing,
  onRenameConversation,
}) => {
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');
    const inputRef = React.useRef<HTMLInputElement>(null);
    const isCompact = isCollapsed;

    const handleDelete = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setPendingDeleteId(id);
    };

    const handleConfirmDelete = async () => {
      if (pendingDeleteId) {
        try {
          await onDeleteConversation(pendingDeleteId);
        } finally {
          setPendingDeleteId(null);
        }
      }
    };

    const startEditing = (id: string, currentTitle: string) => {
      setEditingConversationId(id);
      setEditingTitle(currentTitle);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    };

    const commitEditing = () => {
      if (editingConversationId && editingTitle.trim() !== '') {
        onRenameConversation(editingConversationId, editingTitle.trim());
      }
      setEditingConversationId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitEditing();
      } else if (e.key === 'Escape') {
        setEditingConversationId(null);
      }
    };

    return (
      <>
        <div className="px-2 pt-4 pb-2 flex flex-col gap-3">
          <div className="flex items-center justify-between px-2">
            {!isCompact && (
              <span className="font-semibold text-lg hidden md:block text-foreground">Menu</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapse}
              className="hidden md:flex h-8 w-8 transition-colors duration-100 ease-linear"
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>

          {isCompact ? (
            <div className="space-y-2 mt-4 flex flex-col items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-full h-9 rounded-full transition-colors duration-100 ease-linear"
                    onClick={onNewChat}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Nova Conversa</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "w-full h-9 rounded-full transition-colors duration-100 ease-linear",
                      isAdvancedChartsOpen && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                    onClick={onToggleAdvancedCharts}
                  >
                    <BarChart className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Gráficos</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "w-full h-9 rounded-full transition-colors duration-100 ease-linear",
                      isRecorteSemanaOpen && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                    onClick={onToggleRecorteSemana}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Recorte da Semana</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-full h-9 mt-1 rounded-full transition-colors duration-100 ease-linear"
                    onClick={onOpenSearch}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Buscar em chats</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-full h-9 rounded-full transition-colors duration-100 ease-linear"
                    onClick={onOpenMonthlyClosing}
                  >
                    <CalendarClock className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Fechamento Mensal</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="space-y-1 mt-4">
              <Button
                variant="ghost"
                onClick={onNewChat}
                className="w-full min-w-0 justify-start gap-3 h-9 font-normal overflow-hidden px-3 rounded-full transition-colors duration-100 ease-linear"
              >
                <Plus className="h-4 w-4" />
                <span className="truncate">Nova Conversa</span>
              </Button>
              <Button
                variant="ghost"
                onClick={onOpenSearch}
                className="w-full min-w-0 justify-start gap-3 h-9 font-normal overflow-hidden px-3 rounded-full transition-colors duration-100 ease-linear"
              >
                <Search className="h-4 w-4" />
                <span className="truncate">Buscar em chats</span>
              </Button>
              <Button
                variant="ghost"
                onClick={onToggleAdvancedCharts}
                className={cn(
                  "w-full min-w-0 justify-start gap-3 h-9 font-normal overflow-hidden px-3 rounded-full transition-colors duration-100 ease-linear",
                  isAdvancedChartsOpen && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <BarChart className="h-4 w-4" />
                <span className="truncate">Gráficos</span>
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "w-full min-w-0 justify-start gap-3 h-9 font-normal overflow-hidden px-3 rounded-full transition-colors duration-100 ease-linear",
                  isRecorteSemanaOpen && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                onClick={onToggleRecorteSemana}
              >
                <Sparkles className="h-4 w-4" />
                <span className="truncate">Recorte da Semana</span>
              </Button>
              <Button
                variant="ghost"
                onClick={onOpenMonthlyClosing}
                className="w-full min-w-0 justify-start gap-3 h-9 font-normal overflow-hidden px-3 rounded-full transition-colors duration-100 ease-linear text-primary dark:text-white hover:text-primary hover:bg-primary/10 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <CalendarClock className="h-4 w-4" />
                <span className="truncate font-medium">Fechamento Mensal</span>
              </Button>
            </div>
          )}
        </div>

        <div className="px-4 pt-2 pb-2 overflow-hidden whitespace-nowrap text-ellipsis">
          {!isCompact && <span className="font-semibold text-lg text-foreground">Chats</span>}
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          <div className="space-y-1">
            {!isCompact && conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "relative group grid w-full grid-cols-[1fr_auto] items-center rounded-full border transition-colors duration-100 ease-linear",
                  (activeConversationId === conv.id && !isAdvancedChartsOpen && !isRecorteSemanaOpen)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-border/70 z-[10]"
                    : "text-sidebar-foreground border-transparent hover:bg-sidebar-accent hover:border-border/40 z-[1]"
                )}
              >
                {editingConversationId === conv.id ? (
                  <div className="w-full px-3 flex items-center h-9">
                    <Input
                      ref={inputRef}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={commitEditing}
                      onKeyDown={handleKeyDown}
                      className="h-7 w-full text-sm py-1 px-2 mb-[1px]"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => onSelectConversation(conv.id)}
                    className="min-w-0 w-full cursor-pointer px-3 py-2 text-sm overflow-hidden text-left bg-transparent flex items-center h-9"
                  >
                    {conv.title === 'Nova conversa' ? (
                      <div className="h-4 w-3/4 animate-pulse bg-muted-foreground/20 rounded"></div>
                    ) : (
                      <TruncatedTitle title={conv.title} />
                    )}
                  </button>
                )}

                {editingConversationId !== conv.id && (
                  <div className={cn(
                    "mr-1 h-7 w-7 shrink-0 transition-opacity duration-100 ease-linear flex items-center justify-center",
                    "opacity-0 pointer-events-none",
                    "group-hover:opacity-100 group-hover:pointer-events-auto",
                    "group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                  )}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground/80 hover:text-foreground"
                          aria-label="Opções da conversa"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40 z-[60]">
                        <DropdownMenuItem onClick={() => startEditing(conv.id, conv.title)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          <span>Renomear</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPendingDeleteId(conv.id)} className="text-destructive focus:text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Excluir</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {user && (
          <div className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full h-auto p-2 justify-start hover:bg-sidebar-accent transition-colors duration-100 ease-linear"
                >
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
                      {getInitials(user) ? <span className="text-sm font-medium">{getInitials(user)}</span> : <UserIcon className="h-4 w-4" />}
                    </div>
                    {!isCollapsed && (
                      <div className="flex flex-col flex-1 min-w-0 text-left justify-center">
                        <span className="text-sm font-medium leading-none truncate">{getDisplayName(user)}</span>
                      </div>
                    )}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-56"
              >
                <DropdownMenuItem onClick={onOpenSettings}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Configurações</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <ConfirmDeleteModal
          isOpen={!!pendingDeleteId}
          onClose={() => setPendingDeleteId(null)}
          onConfirm={handleConfirmDelete}
          title="Excluir Histórico"
          description="Tem certeza de que deseja excluir"
          itemName={conversations.find(c => c.id === pendingDeleteId)?.title ?? 'este histórico'}
        />
      </>
    );
  };

const Sidebar: React.FC<SidebarProps> = ({
  user,
  conversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  isOpen,
  setIsOpen,
  isCollapsed,
  toggleCollapse,
  onLogout,
  onOpenSettings,
  onOpenChartHistory,
  onToggleRecorteSemana,
  onToggleAdvancedCharts,
  isAdvancedChartsOpen,
  isRecorteSemanaOpen,
  isDarkMode,
  toggleDarkMode,
  onSearchResultClick,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMonthlyClosingOpen, setIsMonthlyClosingOpen] = useState(false);

  const contentProps = {
    user,
    conversations,
    activeConversationId,
    onNewChat,
    onSelectConversation,
    onDeleteConversation,
    onRenameConversation,
    isCollapsed,
    toggleCollapse,
    onLogout,
    onOpenSettings,
    onOpenChartHistory,
    onToggleRecorteSemana,
    onToggleAdvancedCharts,
    isAdvancedChartsOpen,
    isRecorteSemanaOpen,
    isDarkMode,
    toggleDarkMode,
    onOpenSearch: () => setIsSearchOpen(true),
    onOpenMonthlyClosing: () => setIsMonthlyClosingOpen(true),
  };

  return (
    <>
      {/* Mobile: Sheet overlay */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col border-border bg-sidebar text-sidebar-foreground md:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Chat navigation sidebar</SheetDescription>
          <SidebarContent {...contentProps} isCollapsed={false} />
        </SheetContent>
      </Sheet>

      {/* Desktop: Static sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col h-full overflow-hidden border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out will-change-[width]",
          isCollapsed ? "w-[72px]" : "w-64"
        )}
      >
        <SidebarContent {...contentProps} />
      </aside>

      <SearchChatModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNewChat={onNewChat}
        onSearchResultClick={onSearchResultClick}
      />

      <MonthlyClosingModal
        isOpen={isMonthlyClosingOpen}
        onClose={() => setIsMonthlyClosingOpen(false)}
      />
    </>
  );
};

export default Sidebar;
