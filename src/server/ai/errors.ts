/** Only this sanitized AI error may bypass the generic server secret redactor. */
export class AiProviderError extends Error {
  constructor(message: string) { super(safeAiError(message)); this.name = 'AiProviderError'; }
}

export function safeAiError(value: unknown, apiKey = ''): string {
  let message = typeof value === 'string' ? value.trim() : value instanceof Error ? value.message.trim() : '';
  if (!message) return 'The AI provider could not return an answer. Please try again.';
  if (apiKey) message = message.split(apiKey).join('[redacted]');
  return message.replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [redacted]').replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]').slice(0, 1200);
}
