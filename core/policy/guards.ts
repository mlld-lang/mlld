import type { GuardBlockNode, GuardRuleNode, GuardActionNode } from '@core/types/guard';
import type { PolicyConfig } from './union';
import type { PolicyConditionFn } from '../../interpreter/guards';
import { v4 as uuid } from 'uuid';
import { parseCommand } from '@core/policy/operation-labels';

export interface PolicyGuardSpec {
  name: string;
  filterKind: 'operation' | 'data';
  filterValue: string;
  scope: 'perOperation' | 'perInput';
  block: GuardBlockNode;
  timing: 'before' | 'after' | 'always';
  privileged: true;
  policyCondition: PolicyConditionFn;
}

function makeGuardAction(decision: 'allow' | 'deny', message?: string): GuardActionNode {
  return {
    type: 'GuardAction',
    nodeId: uuid(),
    location: null as any,
    decision,
    message,
    rawMessage: message ? `"${message}"` : undefined
  };
}

function makeWildcardRule(action: GuardActionNode): GuardRuleNode {
  return {
    type: 'GuardRule',
    nodeId: uuid(),
    location: null as any,
    isWildcard: true,
    action
  };
}

function makeGuardBlock(): GuardBlockNode {
  return {
    type: 'GuardBlock',
    nodeId: uuid(),
    location: null as any,
    modifier: 'default',
    rules: [makeWildcardRule(makeGuardAction('allow'))]
  };
}

function isAutoverifyEnabled(policy: PolicyConfig): boolean {
  return Boolean(policy.defaults?.autoverify);
}

function isMlldVerifyCommand(operation: { command?: string; metadata?: Record<string, unknown> }): boolean {
  const metadataPreview = operation.metadata?.commandPreview;
  const preview =
    typeof metadataPreview === 'string'
      ? metadataPreview
      : typeof operation.command === 'string'
        ? operation.command
        : '';
  if (!preview) {
    return false;
  }
  const parsed = parseCommand(preview);
  return parsed.command === 'mlld' && parsed.subcommand === 'verify';
}

export function generatePolicyGuards(policy: PolicyConfig): PolicyGuardSpec[] {
  const guards: PolicyGuardSpec[] = [];

  if (!policy.deny) {
    return guards;
  }

  if (policy.deny === true) {
    guards.push({
      name: '__policy_deny_all',
      filterKind: 'operation',
      filterValue: 'run',
      scope: 'perOperation',
      block: makeGuardBlock(),
      timing: 'before',
      privileged: true,
      policyCondition: ({ operation }) => {
        if (isAutoverifyEnabled(policy) && isMlldVerifyCommand(operation)) {
          return { decision: 'allow' };
        }
        return {
          decision: 'deny',
          reason: 'All operations denied by policy'
        };
      }
    });
    return guards;
  }

  const deny = policy.deny;

  if (isDenied('sh', deny)) {
    guards.push({
      name: '__policy_deny_sh',
      filterKind: 'operation',
      filterValue: 'run',
      scope: 'perOperation',
      block: makeGuardBlock(),
      timing: 'before',
      privileged: true,
      policyCondition: ({ operation }) => {
        if (isAutoverifyEnabled(policy) && isMlldVerifyCommand(operation)) {
          return { decision: 'allow' };
        }
        const command = operation.command?.trim() ?? '';
        const firstWord = command.split(/\s+/)[0] ?? '';
        if (firstWord === 'sh' || firstWord === 'bash' || firstWord.endsWith('/sh') || firstWord.endsWith('/bash')) {
          return { decision: 'deny', reason: 'Shell access denied by policy' };
        }
        return { decision: 'allow' };
      }
    });
  }

  if (isDenied('network', deny)) {
    guards.push({
      name: '__policy_deny_network',
      filterKind: 'operation',
      filterValue: 'run',
      scope: 'perOperation',
      block: makeGuardBlock(),
      timing: 'before',
      privileged: true,
      policyCondition: ({ operation }) => {
        if (isAutoverifyEnabled(policy) && isMlldVerifyCommand(operation)) {
          return { decision: 'allow' };
        }
        const command = operation.command?.trim() ?? '';
        const firstWord = command.split(/\s+/)[0] ?? '';
        const networkCommands = ['curl', 'wget', 'nc', 'netcat', 'ssh', 'scp', 'rsync', 'ftp', 'telnet'];
        if (networkCommands.includes(firstWord) || networkCommands.some(cmd => firstWord.endsWith(`/${cmd}`))) {
          return { decision: 'deny', reason: 'Network access denied by policy' };
        }
        return { decision: 'allow' };
      }
    });
  }

  const cmdDeny = deny['cmd'];
  if (cmdDeny) {
    if (cmdDeny === true || (Array.isArray(cmdDeny) && cmdDeny.includes('*'))) {
      guards.push({
        name: '__policy_deny_all_cmd',
        filterKind: 'operation',
        filterValue: 'run',
        scope: 'perOperation',
        block: makeGuardBlock(),
        timing: 'before',
        privileged: true,
        policyCondition: ({ operation }) => {
          if (isAutoverifyEnabled(policy) && isMlldVerifyCommand(operation)) {
            return { decision: 'allow' };
          }
          return {
            decision: 'deny',
            reason: 'All commands denied by policy'
          };
        }
      });
    } else if (Array.isArray(cmdDeny) && cmdDeny.length > 0) {
      const deniedCommands = cmdDeny.map(c => String(c).toLowerCase());
      guards.push({
        name: '__policy_deny_cmd',
        filterKind: 'operation',
        filterValue: 'run',
        scope: 'perOperation',
        block: makeGuardBlock(),
        timing: 'before',
        privileged: true,
        policyCondition: ({ operation }) => {
          if (isAutoverifyEnabled(policy) && isMlldVerifyCommand(operation)) {
            return { decision: 'allow' };
          }
          const command = operation.command?.trim() ?? '';
          const firstWord = (command.split(/\s+/)[0] ?? '').toLowerCase();
          const baseName = firstWord.split('/').pop() ?? firstWord;
          if (deniedCommands.includes(baseName)) {
            return { decision: 'deny', reason: `Command '${baseName}' denied by policy` };
          }
          return { decision: 'allow' };
        }
      });
    }
  }

  return guards;
}

function isDenied(
  capability: string,
  deny: Record<string, string[] | true>
): boolean {
  const denyValue = deny[capability];
  if (denyValue === true) return true;
  if (Array.isArray(denyValue) && denyValue.includes('*')) return true;
  return false;
}
