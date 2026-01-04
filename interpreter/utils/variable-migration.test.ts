import { describe, it, expect } from 'vitest';
import type { ArrayVariable } from '@core/types/variable/VariableTypes';
import {
  extractVariableValue,
  hasVariableMetadata,
  getVariableMetadata
} from './variable-migration';

describe('Variable Migration Utils', () => {
  describe('extractVariableValue', () => {
    it('should preserve custom toString when present', () => {
      const items = ['Item 1', 'Item 2'];
      const customToString = function() {
        return items.join('\n\n');
      };

      const variable: ArrayVariable = {
        type: 'array',
        name: 'test',
        value: items,
        source: {
          directive: 'var',
          syntax: 'array',
          hasInterpolation: false,
          isMultiLine: false
        },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        mx: {},
        internal: {
          customToString
        }
      };

      const extracted = extractVariableValue(variable);

      expect(extracted).toEqual(items);
      expect(extracted.toString()).toBe('Item 1\n\nItem 2');
      expect(hasVariableMetadata(extracted)).toBe(true);
    });

    it('should preserve custom toJSON when present', () => {
      const items = ['Item 1', 'Item 2'];
      const customToJSON = function() {
        return [...items];
      };

      const variable: ArrayVariable = {
        type: 'array',
        name: 'test',
        value: items,
        source: {
          directive: 'var',
          syntax: 'array',
          hasInterpolation: false,
          isMultiLine: false
        },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        mx: {},
        internal: {
          customToJSON
        }
      };

      const extracted = extractVariableValue(variable);

      expect(extracted).toEqual(items);
      expect(JSON.stringify(extracted)).toBe(JSON.stringify(['Item 1', 'Item 2']));
      expect(hasVariableMetadata(extracted)).toBe(true);
    });

    it('should preserve content getter when present', () => {
      const contentGetterFunc = function() {
        return 'Getter content';
      };

      const variable: ArrayVariable = {
        type: 'array',
        name: 'test',
        value: [],
        source: {
          directive: 'var',
          syntax: 'array',
          hasInterpolation: false,
          isMultiLine: false
        },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        mx: {},
        internal: {
          contentGetter: contentGetterFunc
        }
      };

      const extracted = extractVariableValue(variable);

      expect((extracted as any).content).toBe('Getter content');
      expect(hasVariableMetadata(extracted)).toBe(true);
    });
  });

  describe('metadata helpers', () => {
    it('should detect and retrieve Variable metadata', () => {
      const variable: ArrayVariable = {
        type: 'array',
        name: 'test',
        value: ['test'],
        source: {
          directive: 'var',
          syntax: 'array',
          hasInterpolation: false,
          isMultiLine: false
        },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        mx: {},
        internal: {
          arrayType: 'test-type'
        }
      };

      const extracted = extractVariableValue(variable);

      expect(hasVariableMetadata(extracted)).toBe(true);

      const metadata = getVariableMetadata(extracted);
      expect(metadata).toEqual(variable);
      expect(metadata?.internal?.arrayType).toBe('test-type');
    });
  });
});
