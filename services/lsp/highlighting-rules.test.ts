import { describe, it, expect } from 'vitest';
import { HIGHLIGHTING_RULES, shouldInterpolate, isXMLTag } from '@core/highlighting/rules';

describe('Highlighting Rules', () => {
  describe('shouldInterpolate', () => {
    it('should interpolate @var in backtick templates', () => {
      const result = shouldInterpolate('backtick', '@name');
      expect(result.interpolates).toBe(true);
      expect(result.pattern).toBe('variable');
    });
    
    it('should interpolate @var in double-colon templates', () => {
      const result = shouldInterpolate('doubleColon', '@user');
      expect(result.interpolates).toBe(true);
      expect(result.pattern).toBe('variable');
    });
    
    it('should interpolate {{var}} in triple-colon templates', () => {
      const result = shouldInterpolate('tripleColon', '{{name}}');
      expect(result.interpolates).toBe(true);
      expect(result.pattern).toBe('mustache');
    });
    
    it('should NOT interpolate @var in triple-colon templates', () => {
      const result = shouldInterpolate('tripleColon', '@name');
      expect(result.interpolates).toBe(false);
    });
    
    it('should interpolate <file.md> in backtick templates', () => {
      const result = shouldInterpolate('backtick', '<README.md>');
      expect(result.interpolates).toBe(true);
      expect(result.pattern).toBe('alligator');
    });
    
    it('should interpolate files with special markers', () => {
      expect(shouldInterpolate('backtick', '<file.txt>').interpolates).toBe(true);
      expect(shouldInterpolate('backtick', '<path/to/file>').interpolates).toBe(true);
      expect(shouldInterpolate('backtick', '<*.md>').interpolates).toBe(true);
      expect(shouldInterpolate('backtick', '<@var/file>').interpolates).toBe(true);
    });
    
    it('should NOT interpolate XML-like tags without special markers', () => {
      const result = shouldInterpolate('backtick', '<div>');
      expect(result.interpolates).toBe(false);
    });
    
    it('should never interpolate in single quotes', () => {
      expect(shouldInterpolate('singleQuote', '@name').interpolates).toBe(false);
      expect(shouldInterpolate('singleQuote', '{{name}}').interpolates).toBe(false);
      expect(shouldInterpolate('singleQuote', '<file.md>').interpolates).toBe(false);
    });
    
    it('should interpolate in double quotes', () => {
      expect(shouldInterpolate('doubleQuote', '@var').interpolates).toBe(true);
      expect(shouldInterpolate('doubleQuote', '<file.md>').interpolates).toBe(true);
    });
  });
  
  describe('isXMLTag', () => {
    it('should identify XML tags in triple-colon templates', () => {
      expect(isXMLTag('tripleColon', '<div>')).toBe(true);
      expect(isXMLTag('tripleColon', '</div>')).toBe(true);
      expect(isXMLTag('tripleColon', '<user_name>')).toBe(true);
    });
    
    it('should NOT identify file references as XML', () => {
      expect(isXMLTag('tripleColon', '<file.md>')).toBe(false);
      expect(isXMLTag('tripleColon', '<path/to/file>')).toBe(false);
      expect(isXMLTag('tripleColon', '<*.txt>')).toBe(false);
      expect(isXMLTag('tripleColon', '<@var>')).toBe(false);
    });
    
    it('should not identify XML in non-triple-colon contexts', () => {
      expect(isXMLTag('backtick', '<div>')).toBe(false);
      expect(isXMLTag('doubleColon', '<div>')).toBe(false);
      expect(isXMLTag('doubleQuote', '<div>')).toBe(false);
    });
  });
  
  describe('Template Rules', () => {
    it('should have correct delimiters', () => {
      expect(HIGHLIGHTING_RULES.templates.backtick.delimiter).toBe('`');
      expect(HIGHLIGHTING_RULES.templates.doubleColon.delimiter).toBe('::');
      expect(HIGHLIGHTING_RULES.templates.tripleColon.delimiter).toBe(':::');
      expect(HIGHLIGHTING_RULES.templates.doubleQuote.delimiter).toBe('"');
      expect(HIGHLIGHTING_RULES.templates.singleQuote.delimiter).toBe("'");
    });
    
    it('should mark single quotes as literal only', () => {
      expect(HIGHLIGHTING_RULES.templates.singleQuote.literalOnly).toBe(true);
      expect(HIGHLIGHTING_RULES.templates.backtick.literalOnly).toBeUndefined();
    });
    
    it('should enable XML only in triple-colon', () => {
      expect(HIGHLIGHTING_RULES.templates.tripleColon.xmlEnabled).toBe(true);
      expect(HIGHLIGHTING_RULES.templates.backtick.xmlEnabled).toBeUndefined();
    });
  });
  
  describe('Directives', () => {
    it('should have current directives', () => {
      const current = HIGHLIGHTING_RULES.directives.current;
      expect(current).toContain('var');
      expect(current).toContain('show');
      expect(current).toContain('exe');
      expect(current).toContain('run');
      expect(current).toContain('import');
      expect(current).toContain('when');
      expect(current).toContain('if');
      expect(current).toContain('output');
      expect(current).toContain('path');
    });
    
    it('should have deprecated directives', () => {
      const deprecated = HIGHLIGHTING_RULES.directives.deprecated;
      expect(deprecated).toContain('text');
      expect(deprecated).toContain('data');
      expect(deprecated).toContain('add');
      expect(deprecated).toContain('exec');
    });
  });
  
  describe('Operators', () => {
    it('should have logical operators', () => {
      expect(HIGHLIGHTING_RULES.operators.logical).toContain('&&');
      expect(HIGHLIGHTING_RULES.operators.logical).toContain('||');
      expect(HIGHLIGHTING_RULES.operators.logical).toContain('!');
    });
    
    it('should have comparison operators', () => {
      expect(HIGHLIGHTING_RULES.operators.comparison).toContain('==');
      expect(HIGHLIGHTING_RULES.operators.comparison).toContain('!=');
      expect(HIGHLIGHTING_RULES.operators.comparison).toContain('<');
      expect(HIGHLIGHTING_RULES.operators.comparison).toContain('>');
    });
    
    it('should have other operators', () => {
      expect(HIGHLIGHTING_RULES.operators.pipe).toContain('|');
      expect(HIGHLIGHTING_RULES.operators.assignment).toContain('=');
      expect(HIGHLIGHTING_RULES.operators.arrow).toContain('=>');
    });
  });
  
  describe('Keywords', () => {
    it('should have command keywords', () => {
      expect(HIGHLIGHTING_RULES.keywords.commands).toContain('run');
      expect(HIGHLIGHTING_RULES.keywords.commands).toContain('sh');
    });
    
    it('should have language keywords', () => {
      expect(HIGHLIGHTING_RULES.keywords.languages).toContain('js');
      expect(HIGHLIGHTING_RULES.keywords.languages).toContain('python');
      expect(HIGHLIGHTING_RULES.keywords.languages).toContain('node');
    });
    
    it('should have special keywords', () => {
      expect(HIGHLIGHTING_RULES.keywords.special).toContain('when');
      expect(HIGHLIGHTING_RULES.keywords.special).toContain('if');
      expect(HIGHLIGHTING_RULES.keywords.special).toContain('else');
      expect(HIGHLIGHTING_RULES.keywords.special).toContain('foreach');
      expect(HIGHLIGHTING_RULES.keywords.special).toContain('from');
      expect(HIGHLIGHTING_RULES.keywords.special).toContain('as');
    });
  });
});
