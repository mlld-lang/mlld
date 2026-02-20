import * as shellQuote from 'shell-quote';

export interface ExecutionContext {
  type:
    | 'cmd'
    | 'sh'
    | 'node'
    | 'js'
    | 'py'
    | 'prose'
    | 'show'
    | 'output'
    | 'log'
    | 'append'
    | 'stream';
  command?: string;
  subcommand?: string;
}

export function getOperationLabels(ctx: ExecutionContext): string[] {
  const labels: string[] = [];

  switch (ctx.type) {
    case 'cmd':
      labels.push('op:cmd');
      if (ctx.command) {
        labels.push(`op:cmd:${ctx.command}`);
        if (ctx.subcommand) {
          labels.push(`op:cmd:${ctx.command}:${ctx.subcommand}`);
        }
      }
      break;
    case 'sh':
      labels.push('op:sh');
      break;
    case 'node':
      labels.push('op:node');
      break;
    case 'js':
      labels.push('op:js');
      break;
    case 'py':
      labels.push('op:py');
      break;
    case 'prose':
      labels.push('op:prose');
      break;
    case 'show':
      labels.push('op:show');
      break;
    case 'output':
      labels.push('op:output');
      break;
    case 'log':
      labels.push('op:log');
      break;
    case 'append':
      labels.push('op:append');
      break;
    case 'stream':
      labels.push('op:stream');
      break;
  }

  return labels;
}

export function getOperationSources(ctx: ExecutionContext): string[] {
  if (ctx.type === 'cmd') {
    if (!ctx.command) {
      return [];
    }
    const suffix = ctx.subcommand ? `:${ctx.subcommand}` : '';
    return [`cmd:${ctx.command}${suffix}`];
  }
  return [ctx.type];
}

export function parseCommand(commandString: string): { command?: string; subcommand?: string } {
  const tokens = tokenizeCommand(commandString);
  if (tokens.length === 0) {
    return {};
  }

  let index = 0;
  while (index < tokens.length && isEnvAssignment(tokens[index])) {
    index += 1;
  }

  const commandToken = tokens[index];
  if (!commandToken) {
    return {};
  }

  const command = normalizeCommandToken(commandToken);
  const subcommand = findSubcommand(tokens.slice(index + 1));
  return {
    command: command || undefined,
    subcommand: subcommand || undefined
  };
}

function tokenizeCommand(commandString: string): string[] {
  if (!commandString) {
    return [];
  }
  const parsed = shellQuote.parse(commandString);
  return parsed.filter((token): token is string => typeof token === 'string');
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function normalizeCommandToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }
  const parts = trimmed.split('/');
  const base = parts[parts.length - 1] || trimmed;
  return base.toLowerCase();
}

function findSubcommand(tokens: string[]): string {
  let candidate: string | null = null;
  let hasPathCandidate = false;

  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (token === '--') {
      continue;
    }
    if (token.startsWith('-') || isEnvAssignment(token)) {
      continue;
    }

    const normalized = normalizeCommandToken(token);
    if (!normalized) {
      continue;
    }

    if (looksLikePath(token)) {
      hasPathCandidate = true;
      if (!candidate) {
        candidate = normalized;
      }
      continue;
    }

    return normalized;
  }

  if (hasPathCandidate) {
    return '';
  }

  return candidate ?? '';
}

function looksLikePath(token: string): boolean {
  if (!token) {
    return false;
  }
  return token.startsWith('/') || token.startsWith('./') || token.startsWith('~/') || token.includes('/');
}
