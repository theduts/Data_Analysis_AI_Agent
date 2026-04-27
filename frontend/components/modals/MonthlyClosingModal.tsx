import React, { useState, useEffect, useRef } from 'react';
import { X, CalendarClock, AlertCircle, FileText, Download, Loader2 } from 'lucide-react';
import { reportService } from '../../services/reportService';
import MarkdownRenderer from '../MarkdownRenderer';

interface MonthlyClosingModalProps {
    isOpen: boolean;
    onClose: () => void;
    // We remove onConfirm since the logic is now encapsulated here.
}

type ModalState = 'idle' | 'generating' | 'finished' | 'error';

const MonthlyClosingModal: React.FC<MonthlyClosingModalProps> = ({
    isOpen,
    onClose,
}) => {
    const [modalState, setModalState] = useState<ModalState>('idle');
    const [streamedText, setStreamedText] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    
    const viewportRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Reset state when modal is closed
    useEffect(() => {
        if (!isOpen) {
            setModalState('idle');
            setStreamedText('');
            setErrorMsg('');
            setIsDownloading(false);
        }
    }, [isOpen]);

    // Auto-scroll handler
    useEffect(() => {
        if (modalState === 'generating' && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [streamedText, modalState]);

    if (!isOpen) return null;

    const handleStartGeneration = async () => {
        setModalState('generating');
        setStreamedText('');
        setErrorMsg('');

        try {
            await reportService.streamExecutiveSummary(
                (token) => {
                    setStreamedText((prev) => prev + token);
                },
                (error) => {
                    setModalState('error');
                    setErrorMsg(error.message || "Erro desconhecido ao gerar relatório.");
                },
                () => {
                    setModalState('finished');
                }
            );
        } catch (error: any) {
            setModalState('error');
            setErrorMsg(error.message || "Falha ao iniciar o processo.");
        }
    };

    const handleDownloadPDF = async () => {
        setIsDownloading(true);
        try {
            const blob = await reportService.downloadExecutivePDF(streamedText);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'RetailCo_Conselho_Fechamento.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Falha ao baixar PDF", error);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleForceClose = () => {
        // If the user closes, React unmounts/resets via the useEffect
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={handleForceClose}>
            <div
                className="bg-card text-card-foreground w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. STICKY HEADER */}
                <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border bg-card/95 backdrop-blur z-10 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/10 rounded-xl text-primary shadow-inner">
                            <FileText size={22} className="stroke-[2.5px]" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-foreground">RetailCo | Fechamento Diretoria</h3>
                            <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mt-0.5">Visão Executiva (Privado)</p>
                        </div>
                    </div>
                    <button
                        onClick={handleForceClose}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors p-2 rounded-xl"
                        title="Fechar (Descarta o Relatório)"
                    >
                        <X size={22} className="stroke-[2.5px]" />
                    </button>
                </div>

                {/* 2. SCROLLABLE CONTENT BODY */}
                <div 
                    ref={viewportRef}
                    className="flex-1 overflow-y-auto p-6 md:p-8 bg-background relative scroll-smooth"
                >
                    {modalState === 'idle' && (
                        <div className="max-w-xl mx-auto text-center py-12">
                            <div className="inline-flex justify-center items-center p-6 bg-muted/30 rounded-full mb-6 ring-1 ring-border shadow-sm">
                                <CalendarClock size={48} className="text-primary/70" />
                            </div>
                            <h4 className="text-2xl font-bold mb-3">Sintetizar Fechamento Mensal?</h4>
                            <p className="text-muted-foreground text-[15px] leading-relaxed mb-8">
                                Esta ação irá cruzar os indicadores de Base, Churn, LTV e Omnichannel no Databricks.
                                A IA formulará um relatório executivo exclusivo baseado nos dados mais recentes.
                            </p>
                            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3 text-left">
                                <AlertCircle size={18} className="text-primary mt-0.5 shrink-0" />
                                <p className="text-sm font-medium text-primary/90 leading-snug">
                                    Segurança Ativa: Esta síntese é efêmera. O relatório será construído ao vivo e não ficará salvo no histórico de conversas do banco de dados após você fechar esta tela.
                                </p>
                            </div>
                        </div>
                    )}

                    {modalState !== 'idle' && (
                        <div className="w-full max-w-3xl mx-auto">
                            {/* Onde a mágica acontece (efeito typing) */}
                            <div className="relative text-[15px] leading-relaxed prose prose-neutral dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b prose-h2:pb-2 prose-a:text-primary">
                                <MarkdownRenderer content={streamedText} isUser={false} />
                            </div>
                            
                            {modalState === 'generating' && (
                                <div className="flex items-center gap-3 mt-6 text-muted-foreground animate-pulse">
                                    <Loader2 size={18} className="animate-spin" />
                                    <span className="text-sm font-medium">A Inteligência Artificial está escrevendo e formatando os resultados...</span>
                                </div>
                            )}

                            {modalState === 'error' && (
                                <div className="mt-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-3">
                                    <AlertCircle size={20} className="text-destructive shrink-0" />
                                    <p className="text-sm font-medium text-destructive">{errorMsg}</p>
                                </div>
                            )}
                            
                            {/* div invisível para o auto-scroll repousar perfeitamente no final */}
                            <div ref={bottomRef} className="h-6 w-full" />
                        </div>
                    )}
                </div>

                {/* 3. STICKY FOOTER */}
                <div className="flex-none bg-muted/20 p-5 flex items-center justify-end gap-3 border-t border-border shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]">
                    {modalState === 'idle' ? (
                        <>
                            <button
                                onClick={handleForceClose}
                                className="px-5 py-2.5 text-sm font-semibold rounded-xl text-foreground hover:bg-muted transition-all"
                            >
                                CANCELAR
                            </button>
                            <button
                                onClick={handleStartGeneration}
                                className="px-5 py-2.5 text-sm font-bold rounded-xl text-primary-foreground bg-primary hover:bg-primary/90 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                            >
                                <span>INICIAR SÍNTESE</span>
                            </button>
                        </>
                    ) : (
                        <div className="flex items-center justify-between w-full">
                            <p className="text-xs text-muted-foreground font-medium px-2">
                                {modalState === 'generating' && "O documento não poderá ser baixado até que a geração conclua."}
                                {modalState === 'finished' && "Análise concluída com sucesso. O arquivo em PDF já está disponível."}
                            </p>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleForceClose}
                                    className="px-5 py-2.5 text-sm font-semibold rounded-xl text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
                                >
                                    {modalState === 'finished' ? 'FECHAR E DESCARTAR' : 'FECHAR'}
                                </button>
                                
                                <button
                                    onClick={handleDownloadPDF}
                                    disabled={modalState !== 'finished' || isDownloading}
                                    className="px-5 py-2.5 text-sm font-bold rounded-xl text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center gap-2 min-w-[170px] justify-center"
                                >
                                    {isDownloading ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>GERANDO...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Download size={16} className="stroke-[2.5px]" />
                                            <span>BAIXAR RELATÓRIO PDF</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MonthlyClosingModal;
