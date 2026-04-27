import React from 'react';
import { Moon, Sun } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from './ui/dialog';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { Separator } from './ui/separator';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    toggleDarkMode: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    isDarkMode,
    toggleDarkMode
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Configurações</DialogTitle>
                    <DialogDescription>Personalize sua experiência</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {isDarkMode ? <Moon className="h-5 w-5 text-muted-foreground" /> : <Sun className="h-5 w-5 text-muted-foreground" />}
                            <div className="space-y-0.5">
                                <label className="text-sm font-medium leading-none cursor-pointer">
                                    Modo Escuro
                                </label>
                                <p className="text-xs text-muted-foreground">
                                    Mudar para modo escuro
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={isDarkMode}
                            onCheckedChange={toggleDarkMode}
                        />
                    </div>
                </div>

                <Separator />

                <DialogFooter>
                    <Button onClick={onClose}>
                        Fechar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SettingsModal;
