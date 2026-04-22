// Token estimation utilities for Claude API
// Note: These are rough estimates. Actual token counts may vary.

// Rough conversion: ~4 characters per token for English, ~2 for Chinese
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Count Chinese characters
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // Count other characters
  const otherChars = text.length - chineseChars;

  // Chinese: ~1.5 tokens per character, Other: ~0.25 tokens per character
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.25);
}

// Cost per 1M tokens (in USD) - Updated for Claude pricing
export const PRICING = {
  'claude-3-opus': {
    input: 15.00,
    output: 75.00,
  },
  'claude-3-sonnet': {
    input: 3.00,
    output: 15.00,
  },
  'claude-3-haiku': {
    input: 0.25,
    output: 1.25,
  },
  'claude-3.5-sonnet': {
    input: 3.00,
    output: 15.00,
  },
  'claude-3.5-haiku': {
    input: 1.00,
    output: 5.00,
  },
  'claude-opus-4': {
    input: 15.00,
    output: 75.00,
  },
  'claude-sonnet-4': {
    input: 3.00,
    output: 15.00,
  },
  // Default for Claude Code CLI (typically uses Sonnet)
  'default': {
    input: 3.00,
    output: 15.00,
  },
};

export type ModelType = keyof typeof PRICING;

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: ModelType = 'default'
): number {
  const pricing = PRICING[model] || PRICING['default'];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
}

export function analyzeSession(messages: Array<{
  type: string;
  role?: string;
  message?: { content: string | Array<{ text?: string }> };
  richContent?: Array<{ type: string; text?: string; thinking?: string }>;
}>): TokenStats {
  let inputTokens = 0;
  let outputTokens = 0;
  let userMessages = 0;
  let assistantMessages = 0;

  for (const msg of messages) {
    let text = '';

    // Extract text from message content
    if (msg.message?.content) {
      if (typeof msg.message.content === 'string') {
        text = msg.message.content;
      } else if (Array.isArray(msg.message.content)) {
        text = msg.message.content
          .map(item => item.text || '')
          .join(' ');
      }
    }

    // Also check richContent
    if (msg.richContent) {
      text += msg.richContent
        .map(item => (item.text || '') + (item.thinking || ''))
        .join(' ');
    }

    const tokens = estimateTokens(text);

    if (msg.type === 'user' || msg.role === 'user') {
      inputTokens += tokens;
      userMessages++;
    } else if (msg.type === 'assistant' || msg.role === 'assistant') {
      outputTokens += tokens;
      assistantMessages++;
    }
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCost: estimateCost(inputTokens, outputTokens),
    messageCount: userMessages + assistantMessages,
    userMessages,
    assistantMessages,
  };
}

// Format cost for display
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(2)}¢`;
  }
  return `$${cost.toFixed(4)}`;
}

// Format tokens for display
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}
