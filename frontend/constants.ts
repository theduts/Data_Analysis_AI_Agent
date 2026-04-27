import { Type } from '@google/genai';

export const CHART_COLORS = [
  '#2563eb',
  '#3b82f6',
  '#60a5fa',
  '#93c5fd',
  '#10b981',
  '#ef4444',
];

export const SYSTEM_INSTRUCTION = `You are D'Artagnan, an advanced AI assistant. Your goal is to provide insightful ideas, explanations, and analyses. 

If the user's request can be visualized with a bar, line, or pie chart, you MUST provide the chart data in the exact JSON format specified by the schema. The JSON output should be the only content in your response. 

If a chart is not relevant or possible, provide a detailed text-based answer. 

If you cannot answer the question due to lack of data or context, do not apologize. Instead, clearly explain what information or steps the user needs to provide or take to get a valid answer.`;

export const CHART_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      description: 'The type of chart to display. Can be "bar", "line", or "pie".',
      enum: ['bar', 'line', 'pie'],
    },
    title: {
      type: Type.STRING,
      description: 'The title of the chart.',
    },
    data: {
      type: Type.ARRAY,
      description: 'The data for the chart. For bar/line charts, each item should be an object with name/value pairs. For pie charts, each item should have a name and a value key.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: 'The label for the data point (e.g., x-axis label or pie slice name).',
          },
          value: {
            type: Type.NUMBER,
            description: 'The numerical value for the data point.',
          },
        },
        required: ['name', 'value'],
      },
    },
  },
  required: ['type', 'title', 'data'],
};
