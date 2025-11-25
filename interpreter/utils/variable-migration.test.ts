import { describe, it, expect } from 'vitest';
import { 
  createRenamedContentVariable, 
  createLoadContentResultVariable,
  extractVariableValue,
  hasVariableMetadata,
  getVariableMetadata,
  isRenamedContentVariable,
  isLoadContentResultVariable
} from './variable-migration';
import { LoadContentResultImpl } from '@interpreter/eval/load-content';

describe('Variable Migration Utils', () => {
  describe('createRenamedContentVariable', () => {
    it('should create Variable with RenamedContentArray behavior', () => {
      const items = ['Section 1', 'Section 2', 'Section 3'];
      const variable = createRenamedContentVariable(items);
      
      expect(variable.type).toBe('array');
      expect(variable.value).toEqual(items);
      expect(variable.internal?.arrayType).toBe('renamed-content');
      expect(variable.internal?.joinSeparator).toBe('\n\n');
      expect(variable.internal?.customToString).toBeDefined();
      expect(variable.internal?.customToString?.()).toBe('Section 1\n\nSection 2\n\nSection 3');
    });

    it('should accept additional metadata', () => {
      const items = ['Section 1'];
      const variable = createRenamedContentVariable(items, {
        fromGlobPattern: true,
        globPattern: '*.md',
        fileCount: 1
      });
      
      expect(variable.internal?.fromGlobPattern).toBe(true);
      expect(variable.internal?.globPattern).toBe('*.md');
      expect(variable.internal?.fileCount).toBe(1);
    });
  });

  describe('createLoadContentResultVariable', () => {
    it('should create Variable with LoadContentResultArray behavior', () => {
      const items = [
        new LoadContentResultImpl({
          content: 'File 1 content',
          filename: 'file1.md',
          relative: './file1.md',
          absolute: '/path/to/file1.md'
        }),
        new LoadContentResultImpl({
          content: 'File 2 content',
          filename: 'file2.md',
          relative: './file2.md',
          absolute: '/path/to/file2.md'
        })
      ];
      
      const variable = createLoadContentResultVariable(items);
      
      expect(variable.type).toBe('array');
      expect(variable.value).toEqual(items);
      expect(variable.internal?.arrayType).toBe('load-content-result');
      expect(variable.internal?.customToString?.()).toBe('File 1 content\n\nFile 2 content');
      expect(variable.internal?.contentGetter?.()).toBe('File 1 content\n\nFile 2 content');
    });
  });

  describe('extractVariableValue', () => {
    it('should preserve custom toString for RenamedContentArray', () => {
      const items = ['Item 1', 'Item 2'];
      const variable = createRenamedContentVariable(items);
      const extracted = extractVariableValue(variable);
      
      expect(extracted).toEqual(items);
      expect(extracted.toString()).toBe('Item 1\n\nItem 2');
      expect(hasVariableMetadata(extracted)).toBe(true);
    });

    it('should preserve all behaviors for LoadContentResultArray', () => {
      const items = [
        new LoadContentResultImpl({
          content: 'Content 1',
          filename: 'file1.md',
          relative: './file1.md',
          absolute: '/path/to/file1.md'
        })
      ];
      
      const variable = createLoadContentResultVariable(items);
      const extracted = extractVariableValue(variable);
      
      expect(extracted).toEqual(items);
      expect(extracted.toString()).toBe('Content 1');
      expect((extracted as any).content).toBe('Content 1');
      expect(hasVariableMetadata(extracted)).toBe(true);
    });
  });

  describe('type guards', () => {
    it('should identify RenamedContentVariable', () => {
      const variable = createRenamedContentVariable(['test']);
      expect(isRenamedContentVariable(variable)).toBe(true);
      
      const otherVariable = createLoadContentResultVariable([]);
      expect(isRenamedContentVariable(otherVariable)).toBe(false);
    });

    it('should identify LoadContentResultVariable', () => {
      const variable = createLoadContentResultVariable([]);
      expect(isLoadContentResultVariable(variable)).toBe(true);
      
      const otherVariable = createRenamedContentVariable(['test']);
      expect(isLoadContentResultVariable(otherVariable)).toBe(false);
    });
  });

  describe('metadata helpers', () => {
    it('should detect and retrieve Variable metadata', () => {
      const variable = createRenamedContentVariable(['test']);
      const extracted = extractVariableValue(variable);
      
      expect(hasVariableMetadata(extracted)).toBe(true);
      
      const metadata = getVariableMetadata(extracted);
      expect(metadata).toEqual(variable);
      expect(metadata?.internal?.arrayType).toBe('renamed-content');
    });
  });
});
