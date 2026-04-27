import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Spinner } from './ui/spinner';

interface ConfirmDeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void> | void;
    title?: string;
    description?: string;
    itemName?: string;
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Excluir Histórico",
    description = "Tem certeza de que deseja excluir",
    itemName = "este histórico",
}) => {
    const [isDeleting, setIsDeleting] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setIsDeleting(true);
        try {
            await onConfirm();
        } finally {
            setIsDeleting(false);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
                className="bg-card text-card-foreground w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-border animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-destructive/10 rounded-full text-destructive">
                            <AlertTriangle size={20} />
                        </div>
                        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted"
                        disabled={isDeleting}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        {description} <span className="font-semibold text-foreground">"{itemName}"</span>?
                    </p>
                    <p className="text-muted-foreground text-sm leading-relaxed mt-2">
                        Esta ação não pode ser desfeita e todos os dados serão perdidos.
                    </p>
                </div>

                <div className="bg-muted/30 p-5 flex items-center justify-end gap-3 border-t border-border">
                    <button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="px-4 py-2 text-sm font-medium rounded-lg text-foreground hover:bg-muted transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isDeleting}
                        className="px-4 py-2 text-sm font-medium rounded-lg text-destructive-foreground bg-destructive hover:bg-destructive/90 transition-colors flex items-center justify-center min-w-[100px] shadow-sm"
                    >
                        {isDeleting ? (
                            <span className="relative inline-flex items-center justify-center">
                                <span className="invisible">Excluir</span>
                                <Spinner className="absolute h-4 w-4" label="Excluindo" />
                            </span>
                        ) : (
                            "Excluir"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDeleteModal;
