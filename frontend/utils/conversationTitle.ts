const TITLE_MAX_LENGTH = 80;

export function buildConversationTitleFromMessage(message: string): string {
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (!normalized) return 'Nova conversa';
  if (normalized.length <= TITLE_MAX_LENGTH) return normalized;

  const clipped = normalized.slice(0, TITLE_MAX_LENGTH - 3).replace(/[\s,:;.-]+$/, '');
  return `${clipped}...`;
}
