import React, { useState } from 'react';
import { 
  ExecutivePresentation, 
  SlideAgenda, 
  SlidePositives, 
  SlideResults, 
  SlideGaps, 
  SlideInsights,
  SlideCard,
  SlideColumn,
  ClusterMetric,
  InsightCard
} from '../../types';
import { ChevronLeft, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, Target, Building2, Lightbulb } from 'lucide-react';

// ── Shared UI Components ──────────────────────────────────────────────────────

const CardView: React.FC<{ card: SlideCard | InsightCard, icon?: React.ReactNode }> = ({ card, icon }) => (
  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start gap-4">
      {icon && <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-primary">{icon}</div>}
      <div className="flex-1 space-y-2">
        <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-100">{card.titulo}</h3>
        {/* Render markdown-like bold text directly if possible, or simple formatting */}
        <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed" 
           dangerouslySetInnerHTML={{__html: card.corpo.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}} />
        {card.destaque && (
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <p className="font-medium text-primary text-sm italic">{card.destaque}</p>
          </div>
        )}
      </div>
    </div>
  </div>
);

// ── Slide 1: Agenda ───────────────────────────────────────────────────────────

const AgendaSlide: React.FC<{ data: SlideAgenda }> = ({ data }) => (
  <div className="flex flex-col h-full animate-in fade-in zoom-in duration-300">
    <div className="mb-8">
      <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{data.titulo || "Agenda Executiva"}</h2>
      <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-lg">{data.subtitulo}</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.itens.map((item, idx) => (
        <CardView key={idx} card={item} icon={<span className="font-bold text-xl">{idx + 1}</span>} />
      ))}
    </div>
  </div>
);

// ── Slide 2: Positives ────────────────────────────────────────────────────────

const PositivesSlide: React.FC<{ data: SlidePositives }> = ({ data }) => (
  <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
    <div className="mb-8 border-l-4 border-emerald-500 pl-4">
      <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{data.section_tag}</span>
      <h2 className="text-2xl font-bold mt-1 text-zinc-900 dark:text-white">{data.titulo}</h2>
      {data.subtitulo && <p className="text-zinc-500 mt-1">{data.subtitulo}</p>}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.cards.map((card, idx) => (
        <CardView key={idx} card={card} icon={<TrendingUp className="text-emerald-500" />} />
      ))}
    </div>
  </div>
);

// ── Slide 3: Results ──────────────────────────────────────────────────────────

const ResultsSlide: React.FC<{ data: SlideResults }> = ({ data }) => (
  <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
    <div className="mb-6 border-l-4 border-primary pl-4">
      <span className="text-xs font-bold uppercase tracking-wider text-primary">{data.section_tag}</span>
      <h2 className="text-2xl font-bold mt-1 text-zinc-900 dark:text-white">{data.titulo}</h2>
    </div>
    <div className="flex flex-col lg:flex-row gap-4 flex-1 overflow-hidden">
      {data.colunas.map((col, idx) => (
        <div key={idx} className="flex-1 min-w-[300px] bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="font-bold text-lg">{col.titulo}</h3>
            {col.subtitulo && <p className="text-sm text-zinc-500">{col.subtitulo}</p>}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {col.clusters.map((c: ClusterMetric, cIdx: number) => (
              <div key={cIdx} className="flex justify-between items-center p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg group">
                <div>
                  <p className="font-medium text-sm group-hover:text-primary transition-colors">{c.cluster}</p>
                  {c.variacao_ly && (
                    <p className={`text-xs mt-1 ${c.variacao_ly.includes('-') && !c.variacao_ly.includes('Abaixo') ? 'text-destructive' : 'text-emerald-500'}`}>
                      {c.variacao_ly}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-bold text-zinc-900 dark:text-zinc-100">
                    {typeof c.realizado === 'number' ? c.realizado.toLocaleString('pt-BR') : c.realizado}
                  </p>
                  {c.meta && (
                    <p className="text-xs text-zinc-500 mt-1">Meta: {typeof c.meta === 'number' ? c.meta.toLocaleString('pt-BR') : c.meta}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {col.total && (
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 font-semibold text-center">
              {col.total}
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

// ── Slide 4: Gaps ─────────────────────────────────────────────────────────────

const GapsSlide: React.FC<{ data: SlideGaps }> = ({ data }) => (
  <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
    <div className="mb-6 border-l-4 border-destructive pl-4">
      <span className="text-xs font-bold uppercase tracking-wider text-destructive">{data.section_tag}</span>
      <h2 className="text-2xl font-bold mt-1 text-zinc-900 dark:text-white">{data.titulo}</h2>
      {data.subtitulo && <p className="text-zinc-500 mt-1">{data.subtitulo}</p>}
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {data.cards.map((card, idx) => (
        <CardView key={idx} card={card} icon={<TrendingDown className="text-destructive" />} />
      ))}
    </div>
    
    {data.detalhamento_regional && (
      <div className="mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800">
        <h3 className="text-lg font-semibold mb-4">{data.detalhamento_regional_titulo || "Detalhamento Adicional"}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.detalhamento_regional.map((card, idx) => (
            <CardView key={idx} card={card} icon={<Building2 className="text-amber-500" />} />
          ))}
        </div>
      </div>
    )}
  </div>
);

// ── Slide 5: Insights ─────────────────────────────────────────────────────────

const InsightsSlide: React.FC<{ data: SlideInsights }> = ({ data }) => (
  <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
    <div className="mb-8 border-l-4 border-violet-500 pl-4">
      <span className="text-xs font-bold uppercase tracking-wider text-violet-500">{data.section_tag}</span>
      <h2 className="text-2xl font-bold mt-1 text-zinc-900 dark:text-white">{data.titulo}</h2>
      {data.subtitulo && <p className="text-zinc-500 mt-1">{data.subtitulo}</p>}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.cards.map((card, idx) => (
        <CardView key={idx} card={card} icon={<Lightbulb className="text-violet-500" />} />
      ))}
    </div>
  </div>
);


// ── Main Carousel Controller ──────────────────────────────────────────────────

interface ExecutiveReportViewProps {
  presentation: ExecutivePresentation;
}

const ExecutiveReportView: React.FC<ExecutiveReportViewProps> = ({ presentation }) => {
  // Extract available slides sequentially
  const slides = [];
  if (presentation.slide_agenda) slides.push(<AgendaSlide data={presentation.slide_agenda} />);
  if (presentation.slide_positives) slides.push(<PositivesSlide data={presentation.slide_positives} />);
  if (presentation.slide_results) slides.push(<ResultsSlide data={presentation.slide_results} />);
  if (presentation.slide_gaps) slides.push(<GapsSlide data={presentation.slide_gaps} />);
  if (presentation.slide_insights) slides.push(<InsightsSlide data={presentation.slide_insights} />);

  const [currentIndex, setCurrentIndex] = useState(0);

  if (slides.length === 0) return null;

  return (
    <div className="w-full max-w-[1200px] bg-zinc-50/50 dark:bg-[#09090b] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden mt-6 flex flex-col h-[700px]">
      
      {/* Governance Banner */}
      {presentation.nota_governanca && (
        <div className="bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-4 py-3 flex items-center gap-2 text-sm font-medium border-b border-amber-200 dark:border-amber-900/50">
          <AlertTriangle className="w-4 h-4" />
          <span>{presentation.nota_governanca}</span>
        </div>
      )}
      
      {/* Slide Canvas */}
      <div className="flex-1 p-8 md:p-12 overflow-y-auto">
        {slides[currentIndex]}
      </div>

      {/* Presentation Controls Footer */}
      <div className="h-16 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          {slides.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-8 bg-primary' : 'w-2 bg-zinc-300 dark:bg-zinc-700'}`}
            />
          ))}
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setCurrentIndex(c => Math.max(0, c - 1))}
            disabled={currentIndex === 0}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-zinc-200 dark:border-zinc-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setCurrentIndex(c => Math.min(slides.length - 1, c + 1))}
            disabled={currentIndex === slides.length - 1}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-zinc-200 dark:border-zinc-700"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveReportView;
