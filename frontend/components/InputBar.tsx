import React from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { ArrowUp, Square } from 'lucide-react';

interface InputBarProps {
  input: string;
  setInput: (value: string) => void;
  handleSend: () => void;
  handleInterrupt: () => void;
  isLoading: boolean;
  showHints?: boolean;
}

const InputBar: React.FC<InputBarProps> = ({
  input,
  setInput,
  handleSend,
  handleInterrupt,
  isLoading,
  showHints = false,
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  };

  React.useEffect(() => {
    adjustHeight();
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 rounded-[26px] overflow-hidden border border-input bg-background px-2.5 py-1.5 transition-colors focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/25">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte alguma coisa..."
          className="min-h-[40px] flex-1 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-4 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 py-2.5 break-all break-words"
          rows={1}
          disabled={isLoading}
          maxLength={8000}
        />
        <div className="flex items-center pb-0.5 pr-0.5">
          {isLoading ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={handleInterrupt}
                  className="h-9 w-9 shrink-0 rounded-full"
                  aria-label="Parar geração"
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Parar geração</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={input.trim() === ''}
                  className="h-9 w-9 shrink-0 rounded-full"
                  aria-label="Enviar mensagem"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Enviar mensagem (Enter)</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {showHints && (
        <div className="mt-2 text-center text-xs text-muted-foreground">
          Pressione <kbd className="font-mono bg-muted rounded px-1.5 py-0.5 text-[10px]">Enter</kbd> para enviar, <kbd className="font-mono bg-muted rounded px-1.5 py-0.5 text-[10px]">Ctrl/Shift + Enter</kbd> para uma nova linha
        </div>
      )}
    </div>
  );
};

export default InputBar;
