import React, { useState } from 'react';
import { Message as MessageType } from '../types';
import ChartRenderer from './ChartRenderer';
import ExportButtons from './ExportButtons';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { cn } from '@/lib/utils';
import MarkdownRenderer from './MarkdownRenderer';
import { ThinkingIndicator } from './ui/thinking-indicator';
import { Pencil, Bot, User } from 'lucide-react';
import ExecutiveReportView from './reports/ExecutiveReportView';

interface MessageProps {
    message: MessageType;
    onEditMessage: (newText: string) => void;
    index?: number;
}

const LoadingIndicator: React.FC = () => (
    <ThinkingIndicator />
);

const Message: React.FC<MessageProps> = ({ message, onEditMessage, index }) => {
    const isUser = message.sender === 'user';
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(message.text);

    const renderMessageContent = () => {
        if (!message.text) return null;

        // Try to intercept ExecutivePresentation JSON
        try {
            let rawText = message.text.trim();
            let jsonStr = "";
            
            // Extract the JSON block if wrapped in text (e.g., "Iniciando coleta...\n```json\n{...}\n```")
            // If there are multiple blocks, we extract the LAST valid block.
            const jsonBlocks = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g);
            if (jsonBlocks && jsonBlocks.length > 0) {
                const lastBlock = jsonBlocks[jsonBlocks.length - 1];
                const innerMatch = lastBlock.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (innerMatch) {
                    jsonStr = innerMatch[1];
                }
            } else {
                const firstBrace = rawText.indexOf('{');
                const lastBrace = rawText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    jsonStr = rawText.substring(firstBrace, lastBrace + 1);
                }
            }
            
            if (jsonStr) {
                const parsed = JSON.parse(jsonStr);
                const pData = parsed.presentation || parsed;
                let normalizedData: any = {};
                
                // If the LLM returned an array of slides instead of strict Object properties
                if (pData.slides && Array.isArray(pData.slides)) {
                    pData.slides.forEach((s: any) => {
                        // Normalize keys that the LLM might hallucinate
                        const content = s.content || s;
                        const title = s.title || s.titulo || "";
                        
                        if (s.type === 'SlideAgenda' || s.slide_id === 1) {
                            normalizedData.slide_agenda = {
                                titulo: title,
                                subtitulo: content.sumario_critico || content.subtitulo || "",
                                itens: (content.topicos || content.itens || []).map((t: any) => ({
                                    titulo: t.tema || t.titulo || `Tópico ${t.ordem || ''}`,
                                    corpo: t.summary || t.destaque || t.corpo || ""
                                }))
                            };
                        }
                        else if (s.type === 'SlidePositives' || s.slide_id === 2) {
                            normalizedData.slide_positives = {
                                section_tag: "PONTOS POSITIVOS",
                                titulo: title,
                                subtitulo: content.bluf || "",
                                cards: (content.positives || content.cards || []).map((c: any) => ({
                                    titulo: c.cluster || c.metrica || c.titulo || "",
                                    corpo: `${c.variacao || ''} ${c.realizado ? `(${c.realizado})` : ''}`,
                                    destaque: c.destaque || c.corpo || ""
                                }))
                            };
                        }
                        else if (s.type === 'SlideResults' || s.slide_id === 3) {
                            // For comparative tables, we map tabelas into colunas
                            normalizedData.slide_results = {
                                section_tag: "RESULTADOS",
                                titulo: title,
                                colunas: [
                                    {
                                        titulo: "Métricas Gerais",
                                        subtitulo: content.bluf || "",
                                        clusters: (content.tabelas || []).map((t: any) => ({
                                            cluster: t.indicador || t.metrica,
                                            realizado: t.realizado_mtd || t.realizado || 0,
                                            meta: t.meta_okr || t.projetado_fechamento,
                                            variacao_ly: t.variacao_yoy || t.status || ""
                                        }))
                                    },
                                    {
                                        titulo: "LTV por Cluster",
                                        clusters: (content.ltv_por_cluster || []).map((t: any) => ({
                                            cluster: t.cluster,
                                            realizado: t.avg_ltv || 0,
                                            variacao_ly: t.vs_okr || t.participacao_base || ""
                                        }))
                                    }
                                ]
                            };
                        }
                        else if (s.type === 'SlideGaps' || s.slide_id === 4) {
                            normalizedData.slide_gaps = {
                                section_tag: "GAPS E ALERTAS",
                                titulo: title,
                                subtitulo: content.bluf || "",
                                cards: (content.gaps || content.cards || []).map((g: any) => ({
                                    titulo: g.indicador || g.titulo || "",
                                    corpo: g.gap_absoluto || g.gap_percentual || g.corpo || "",
                                    destaque: g.analise || g.destaque || ""
                                }))
                            };
                        }
                        else if (s.type === 'SlideInsights' || s.slide_id === 5) {
                            normalizedData.slide_insights = {
                                section_tag: "INSIGHTS (NBA)",
                                titulo: title,
                                subtitulo: content.bluf || "",
                                cards: (content.actions || content.cards || []).map((a: any) => ({
                                    titulo: a.acao || a.titulo || "",
                                    corpo: a.racional || a.corpo || "",
                                    destaque: a.urgencia || a.destaque || ""
                                }))
                            };
                        }
                    });
                } else {
                    // Directly strictly typed JSON from agent overriding hallucination
                    normalizedData = pData;
                }
                
                if (Object.keys(normalizedData).some(k => k.startsWith('slide_'))) {
                    return <ExecutiveReportView presentation={normalizedData} />;
                }
            }
        } catch (e) {
            // Fallback to Markdown
            console.error("Presentation parsing error:", e);
        }
        
        return <MarkdownRenderer content={message.text} isUser={isUser} />;
    };

    const handleSaveEdit = () => {
        if (editText.trim() && editText.trim() !== message.text) {
            onEditMessage(editText);
        }
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditText(message.text);
        setIsEditing(false);
    };

    return (
        <div
            data-msg-index={index}
            className={cn("flex gap-3 group", isUser ? "justify-end" : "justify-start")}
        >

            <div
                className={cn(
                    "overflow-hidden [overflow-wrap:anywhere] rounded-2xl px-4 py-3 text-[15px] leading-7 transition-colors",
                    isUser
                        ? "max-w-[82%] bg-user-bubble text-user-bubble-foreground md:max-w-[78%] xl:max-w-[74%]"
                        : "w-full max-w-[94%] rounded-bl-sm sm:px-5 md:px-6 lg:px-7",
                    message.isError && "bg-destructive/10 text-destructive border-destructive/30"
                )}
            >
                {message.isLoading && !message.text ? (
                    <LoadingIndicator />
                ) : isEditing ? (
                    <div className="space-y-2">
                        <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="min-h-[60px] bg-background text-foreground resize-none border-input"
                            rows={Math.max(3, Math.min(10, editText.split('\n').length))}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={handleCancelEdit}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={handleSaveEdit}>
                                Salvar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col w-full text-left">
                        {renderMessageContent()}

                        {message.isLoading && (
                            <LoadingIndicator />
                        )}
                        
                        {message.chartData && (
                            <div className="mt-4">
                                <div className="bg-background p-4 rounded-lg border border-border">
                                    <ChartRenderer chartData={message.chartData} />
                                </div>
                                <ExportButtons chartData={message.chartData} />
                            </div>
                        )}
                    </div>
                )}
            </div>

        </div>
    );
};

export default Message;
