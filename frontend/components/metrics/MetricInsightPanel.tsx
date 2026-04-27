import React, { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { metricService } from '../../services/metricService';

interface Message {
    role: 'ai' | 'user';
    content: string;
}

interface MetricInsightPanelProps {
    metricId: string;
    metricTitle: string;
    contextData: any;
    initialInsight?: string;
}

const MetricInsightPanel: React.FC<MetricInsightPanelProps> = ({
    metricId,
    metricTitle,
    contextData,
    initialInsight
}) => {
    const [messages, setMessages] = useState<Message[]>(
        initialInsight ? [{ role: 'ai', content: initialInsight }] : []
    );
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMessage = inputValue.trim();
        setInputValue('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            const response = await metricService.askMetricQuestion(
                metricId,
                userMessage,
                contextData,
                'growth_fast_path' // Pass intent_flag directly
            );
            setMessages(prev => [...prev, { role: 'ai', content: response.answer }]);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, {
                role: 'ai',
                content: 'Desculpe, ocorreu um erro ao tentar processar sua pergunta. Tente novamente.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    Insights: {metricTitle}
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {messages.length === 0 && !isLoading && (
                    <div className="text-center text-muted-foreground mt-10">
                        Pergunte algo sobre os dados deste gráfico.
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-3 ${msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-muted text-foreground border border-border rounded-tl-sm'
                            }`}>
                            <div className="flex items-start gap-2">
                                <div className="text-sm prose prose-sm dark:prose-invert max-w-none w-full">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-muted text-foreground border border-border rounded-2xl rounded-tl-sm p-3">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                    </div>
                )}
            </div>

            <div className="p-3 border-t border-border bg-background">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`Pergunte sobre ${metricTitle}...`}
                        className="flex-1 bg-muted/50 border border-border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                        className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MetricInsightPanel;
