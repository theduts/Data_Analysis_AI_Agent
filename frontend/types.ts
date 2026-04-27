export interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  username: string;
  email?: string;
  phone?: string;
  createdAt?: string;
}

export interface RegistrationData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password?: string;
}

export interface ChartData {
  type: 'bar' | 'line' | 'pie';
  title: string;
  data: any[];
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  chartData?: ChartData;
  isLoading?: boolean;
  isError?: boolean;
  absoluteIndex?: number; // 0-based index in the sequence of all messages in the thread
}

export interface Conversation {
  id: string;
  title: string;
  isAutoTitlePending?: boolean;
  ui_summary?: string;
  messages: Message[];
  thread_id?: string; // LangGraph checkpoint key (UUID from the backend)
  createdAt?: string;
  updatedAt?: string;
  isLoaded?: boolean;
  totalMessages?: number;  // Total messages stored in the backend for this thread
  hasMore?: boolean;       // Whether there are older messages not yet loaded
  isLoadingMore?: boolean; // Whether a paginated fetch is currently in progress
  sliceStart?: number;     // The absolute index of the first message currently in the 'messages' array
}

export interface HistoricChart {
  chartData: ChartData;
  conversationId: string;
  messageId: string;
}

export interface SlideCard {
  titulo: string;
  corpo: string;
  destaque?: string;
}

export interface ClusterMetric {
  cluster: string;
  realizado: number;
  meta?: number;
  atingimento_pct?: number;
  variacao_ly?: string;
}

export interface SlideColumn {
  titulo: string;
  subtitulo?: string;
  total?: string;
  variacao_ly?: string;
  clusters: ClusterMetric[];
}

export interface InsightCard {
  icone?: string;
  titulo: string;
  corpo: string;
  destaque?: string;
}

export interface SlideAgenda {
  titulo?: string;
  subtitulo: string;
  itens: SlideCard[];
}

export interface SlidePositives {
  section_tag: string;
  titulo: string;
  subtitulo?: string;
  cards: SlideCard[];
}

export interface SlideResults {
  section_tag: string;
  titulo: string;
  colunas: SlideColumn[];
}

export interface SlideGaps {
  section_tag: string;
  titulo: string;
  subtitulo?: string;
  cards: SlideCard[];
  detalhamento_regional?: SlideCard[];
  detalhamento_regional_titulo?: string;
}

export interface SlideInsights {
  section_tag: string;
  titulo: string;
  subtitulo?: string;
  cards: InsightCard[];
}

export interface ExecutivePresentation {
  slide_agenda?: SlideAgenda;
  slide_positives?: SlidePositives;
  slide_results?: SlideResults;
  slide_gaps?: SlideGaps;
  slide_insights?: SlideInsights;
  nota_governanca?: string;
}
