import { describe, expect, it } from 'vitest';
import {
  findRoleDisplayMode,
  formatDisplayModeName,
  isRoleDisplayModeName,
  resolveDisplaySelection
} from './display-mode';

describe('display mode helpers', () => {
  it('detects role-labeled display modes and finds them on exe labels', () => {
    expect(isRoleDisplayModeName('role:planner')).toBe(true);
    expect(isRoleDisplayModeName('planner')).toBe(false);
    expect(findRoleDisplayMode(['llm', 'role:planner', 'tool:w'])).toBe('role:planner');
  });

  it('prefers explicit scoped display over exe role defaults', () => {
    expect(resolveDisplaySelection({
      exeLabels: ['llm', 'role:planner']
    })).toEqual({
      strictMode: false,
      modeName: 'role:planner'
    });

    expect(resolveDisplaySelection({
      scopedDisplay: 'role:worker',
      exeLabels: ['llm', 'role:planner']
    })).toEqual({
      strictMode: false,
      modeName: 'role:worker'
    });

    expect(resolveDisplaySelection({
      scopedDisplay: 'strict',
      exeLabels: ['llm', 'role:planner']
    })).toEqual({
      strictMode: true
    });
  });

  it('formats role display modes without quoting or aliasing', () => {
    expect(formatDisplayModeName('default')).toBe('default');
    expect(formatDisplayModeName('role:planner')).toBe('role:planner');
  });
});
