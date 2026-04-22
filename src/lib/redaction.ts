// Sensitive information redaction utility

export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

// Default redaction rules
export const DEFAULT_RULES: RedactionRule[] = [
  // API Keys
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{48,}/g,
    replacement: '[OPENAI_API_KEY]',
  },
  {
    name: 'Anthropic API Key',
    pattern: /sk-ant-[a-zA-Z0-9-]{90,}/g,
    replacement: '[ANTHROPIC_API_KEY]',
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[AWS_ACCESS_KEY]',
  },
  {
    name: 'AWS Secret Key',
    pattern: /(?<![A-Za-z0-9\/+])[A-Za-z0-9\/+]{40}(?![A-Za-z0-9\/+])/g,
    replacement: '[AWS_SECRET_KEY]',
  },
  {
    name: 'GitHub Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    replacement: '[GITHUB_TOKEN]',
  },
  {
    name: 'GitHub OAuth',
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    replacement: '[GITHUB_OAUTH]',
  },
  // Generic patterns
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|apikey|api[_-]?token)['":\s]*[=:]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
    replacement: '[API_KEY]',
  },
  {
    name: 'Bearer Token',
    pattern: /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: 'Bearer [JWT_TOKEN]',
  },
  // Passwords
  {
    name: 'Password in URL',
    pattern: /(:\/\/[^:]+:)[^@]+(@)/g,
    replacement: '$1[PASSWORD]$2',
  },
  {
    name: 'Password Assignment',
    pattern: /(?:password|passwd|pwd)['":\s]*[=:]\s*['"]([^'"]+)['"]/gi,
    replacement: 'password=[REDACTED]',
  },
  // Private keys
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[PRIVATE_KEY]',
  },
  // Personal info
  {
    name: 'Email Address',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL]',
  },
  {
    name: 'IP Address',
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    replacement: '[IP_ADDRESS]',
  },
  {
    name: 'Phone Number',
    pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    replacement: '[PHONE]',
  },
  // Database connection strings
  {
    name: 'Database URL',
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+/g,
    replacement: '[DATABASE_URL]',
  },
];

// Apply redaction rules to text
export function redactText(text: string, rules: RedactionRule[] = DEFAULT_RULES): string {
  let redactedText = text;

  for (const rule of rules) {
    redactedText = redactedText.replace(rule.pattern, rule.replacement);
  }

  return redactedText;
}

// Redact sensitive info from a session export
export function redactSession(session: {
  messages: Array<{
    richContent: Array<{ type: string; text?: string; thinking?: string }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}, rules: RedactionRule[] = DEFAULT_RULES): typeof session {
  return {
    ...session,
    messages: session.messages.map(msg => ({
      ...msg,
      richContent: msg.richContent.map(content => ({
        ...content,
        text: content.text ? redactText(content.text, rules) : content.text,
        thinking: content.thinking ? redactText(content.thinking, rules) : content.thinking,
      })),
    })),
  };
}

// Get a summary of what would be redacted
export function analyzeRedaction(text: string, rules: RedactionRule[] = DEFAULT_RULES): Array<{
  rule: string;
  count: number;
  examples: string[];
}> {
  const results: Array<{ rule: string; count: number; examples: string[] }> = [];

  for (const rule of rules) {
    const matches = text.match(rule.pattern) || [];
    if (matches.length > 0) {
      results.push({
        rule: rule.name,
        count: matches.length,
        examples: matches.slice(0, 3).map(m => m.slice(0, 20) + (m.length > 20 ? '...' : '')),
      });
    }
  }

  return results;
}
