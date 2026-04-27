import React from 'react';
import { Menu, Home } from 'lucide-react';
import { Button } from './ui/button';

interface HeaderProps {
  toggleSidebar: () => void;
  onGoHome?: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar, onGoHome }) => {
  return (
    <header className="flex items-center justify-between px-4 py-3 shrink-0">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="md:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold text-primary">
            D'Artagnan AI
          </h1>
        </div>
      </div>
      {onGoHome && (
        <div className="flex items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onGoHome}
            className="flex items-center gap-2 border-primary/20 hover:bg-primary/10 transition-colors"
            aria-label="Voltar para o Início"
          >
            <Home className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline text-primary font-medium">Voltar ao Início</span>
          </Button>
        </div>
      )}
    </header>
  );
};

export default Header;