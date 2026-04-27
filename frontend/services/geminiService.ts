
// FIX: Removed deprecated `GenerateContentResult` from import.
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { Message, ChartData } from '../types';
import { SYSTEM_INSTRUCTION, CHART_RESPONSE_SCHEMA } from '../constants';

const API_KEY = import.meta.env.VITE_API_KEY || 'PLACEHOLDER_API_KEY';

// Initialize AI conditionally or catch its failures later
let ai: GoogleGenAI | null = null;
try {
  if (API_KEY && API_KEY !== 'PLACEHOLDER_API_KEY') {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  }
} catch (e) {
  console.warn("Could not initialize Google Gen AI. Mock responses will be used.");
}

const generateResponse = async (
  prompt: string,
  history: Message[]
): Promise<{ text: string; chartData?: ChartData }> => {
  let responseText = "";

  try {
    if (ai) {
      const model = 'gemini-2.0-flash';

      const contents = history.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      const config: {
        systemInstruction: string;
        responseMimeType?: string;
        responseSchema?: typeof CHART_RESPONSE_SCHEMA;
      } = {
        systemInstruction: SYSTEM_INSTRUCTION,
      };

      const response: GenerateContentResponse = await ai.models.generateContent({
        model,
        contents,
        config,
      });

      responseText = response.text || "";
    } else {
      console.warn("Generating mock response because Gemini AI is not initialized.");
      // Se não tem chave, força o texto a refletir o prompt para tentarmos achar um gráfico
      responseText = `(Mock) Você disse: ${prompt}. ${prompt.toLowerCase().includes('gráfico') ? 'Vou gerar um gráfico.' : 'Aqui está uma resposta de texto.'}`;
    }
  } catch (apiError) {
    console.warn("Gemini API call failed, falling back to mock behavior.", apiError);
    responseText = `(Mock Erro) Não foi possível conectar ao Gemini. Mas vi que você pediu: ${prompt}`;
  }

  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('gráfico') || lowerPrompt.includes('grafico') || lowerPrompt.includes('chart')) {
    const isPie = lowerPrompt.includes('pizza') || lowerPrompt.includes('pie');
    const isLine = lowerPrompt.includes('linha') || lowerPrompt.includes('line');
    const type = isPie ? 'pie' : isLine ? 'line' : 'bar';

    let mockChartData: ChartData;

    if (type === 'pie') {
      mockChartData = {
        type,
        title: 'Distribuição de Usuários por Região',
        data: [
          { name: 'Sudeste', value: 45 },
          { name: 'Sul', value: 25 },
          { name: 'Nordeste', value: 15 },
          { name: 'Centro-Oeste', value: 10 },
          { name: 'Norte', value: 5 }
        ]
      };
    } else if (type === 'line') {
      mockChartData = {
        type,
        title: 'Crescimento de Receita (Últimos 6 meses)',
        data: [
          { name: 'Jan', value: 12000 },
          { name: 'Fev', value: 15000 },
          { name: 'Mar', value: 14500 },
          { name: 'Abr', value: 18000 },
          { name: 'Mai', value: 22000 },
          { name: 'Jun', value: 25000 }
        ]
      };
    } else {
      mockChartData = {
        type,
        title: 'Novos Usuários por Canal de Aquisição',
        data: [
          { name: 'Orgânico', value: 850 },
          { name: 'Tráfego Pago', value: 1200 },
          { name: 'Redes Sociais', value: 640 },
          { name: 'Indicações', value: 320 },
          { name: 'Email', value: 410 }
        ]
      };
    }

    return { text: responseText || "Aqui estão os dados organizados conforme solicitado:", chartData: mockChartData };
  }

  if (responseText) {
    try {
      // Attempt to parse JSON significantly if it looks like JSON
      const potentialJson = responseText.trim();
      if (potentialJson.startsWith('{') && potentialJson.endsWith('}')) {
        const chartData: ChartData = JSON.parse(potentialJson);

        // Basic validation
        if (chartData.type && chartData.title && Array.isArray(chartData.data)) {
          return { text: `Here is a chart for: ${chartData.title}`, chartData };
        }
      }
    } catch (e) {
      // Not a valid JSON chart response, treat as text
      // Fall through to return text
    }
  }

  return { text: responseText || "I'm sorry, I couldn't generate a response." };
};

export const geminiService = {
  generateResponse,
};
