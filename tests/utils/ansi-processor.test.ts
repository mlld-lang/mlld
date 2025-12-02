import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  expandAnsiCodes,
  stripAnsiMarkers,
  stripAnsiEscapes,
  hasAnsiMarkers,
  hasAnsiEscapes,
  processAnsi,
  shouldProcessAnsi,
  getFormattedText,
  getAvailableCodes
} from '@core/utils/ansi-processor';

describe('ansi-processor', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables
    delete process.env.MLLD_NO_COLOR;
    delete process.env.MLLD_FORCE_COLOR;
    delete process.env.NO_COLOR;
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
  });

  describe('expandAnsiCodes', () => {
    it('should expand color codes to ANSI escapes', () => {
      expect(expandAnsiCodes('%red%hello%reset%')).toBe('\x1b[31mhello\x1b[0m');
      expect(expandAnsiCodes('%green%success%reset%')).toBe('\x1b[32msuccess\x1b[0m');
      expect(expandAnsiCodes('%blue%info%reset%')).toBe('\x1b[34minfo\x1b[0m');
    });

    it('should expand modifier codes', () => {
      expect(expandAnsiCodes('%bold%text%reset%')).toBe('\x1b[1mtext\x1b[0m');
      expect(expandAnsiCodes('%dim%faded%reset%')).toBe('\x1b[2mfaded\x1b[0m');
      expect(expandAnsiCodes('%underline%emphasis%reset%')).toBe('\x1b[4memphasis\x1b[0m');
    });

    it('should expand bright colors', () => {
      expect(expandAnsiCodes('%bright_red%alert%reset%')).toBe('\x1b[91malert\x1b[0m');
      expect(expandAnsiCodes('%bright_green%notice%reset%')).toBe('\x1b[92mnotice\x1b[0m');
    });

    it('should expand background colors', () => {
      expect(expandAnsiCodes('%bg_red%warning%reset%')).toBe('\x1b[41mwarning\x1b[0m');
      expect(expandAnsiCodes('%bg_blue%info%reset%')).toBe('\x1b[44minfo\x1b[0m');
    });

    it('should handle multiple codes', () => {
      const result = expandAnsiCodes('%bold%%red%ERROR%reset%: something failed');
      expect(result).toBe('\x1b[1m\x1b[31mERROR\x1b[0m: something failed');
    });

    it('should preserve unknown codes', () => {
      expect(expandAnsiCodes('%unknown%text%reset%')).toBe('%unknown%text\x1b[0m');
    });

    it('should handle text without codes', () => {
      expect(expandAnsiCodes('plain text')).toBe('plain text');
    });

    it('should be case-insensitive', () => {
      expect(expandAnsiCodes('%RED%text%RESET%')).toBe('\x1b[31mtext\x1b[0m');
      expect(expandAnsiCodes('%Red%text%Reset%')).toBe('\x1b[31mtext\x1b[0m');
    });
  });

  describe('stripAnsiMarkers', () => {
    it('should remove %code% markers', () => {
      expect(stripAnsiMarkers('%red%hello%reset%')).toBe('hello');
      expect(stripAnsiMarkers('%bold%%green%text%reset%')).toBe('text');
    });

    it('should preserve text without markers', () => {
      expect(stripAnsiMarkers('plain text')).toBe('plain text');
    });

    it('should handle mixed content', () => {
      expect(stripAnsiMarkers('prefix %red%colored%reset% suffix')).toBe('prefix colored suffix');
    });
  });

  describe('stripAnsiEscapes', () => {
    it('should remove ANSI escape sequences', () => {
      expect(stripAnsiEscapes('\x1b[31mhello\x1b[0m')).toBe('hello');
      expect(stripAnsiEscapes('\x1b[1m\x1b[32mtext\x1b[0m')).toBe('text');
    });

    it('should preserve text without escapes', () => {
      expect(stripAnsiEscapes('plain text')).toBe('plain text');
    });
  });

  describe('hasAnsiMarkers', () => {
    it('should detect %code% markers', () => {
      expect(hasAnsiMarkers('%red%hello%reset%')).toBe(true);
      expect(hasAnsiMarkers('plain text')).toBe(false);
    });
  });

  describe('hasAnsiEscapes', () => {
    it('should detect ANSI escape sequences', () => {
      expect(hasAnsiEscapes('\x1b[31mhello\x1b[0m')).toBe(true);
      expect(hasAnsiEscapes('plain text')).toBe(false);
    });
  });

  describe('shouldProcessAnsi', () => {
    it('should return false for file output', () => {
      expect(shouldProcessAnsi('file')).toBe(false);
    });

    it('should return false for doc buffer', () => {
      expect(shouldProcessAnsi('doc')).toBe(false);
    });

    it('should return false when MLLD_NO_COLOR is set', () => {
      process.env.MLLD_NO_COLOR = 'true';
      expect(shouldProcessAnsi('stdout', { forceTTY: true })).toBe(false);
    });

    it('should return false when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      expect(shouldProcessAnsi('stdout', { forceTTY: true })).toBe(false);
    });

    it('should return true when MLLD_FORCE_COLOR is set', () => {
      process.env.MLLD_FORCE_COLOR = 'true';
      expect(shouldProcessAnsi('stdout')).toBe(true);
    });

    it('should return false when options.enabled is false', () => {
      expect(shouldProcessAnsi('stdout', { enabled: false, forceTTY: true })).toBe(false);
    });

    it('should return true when forceTTY is true', () => {
      expect(shouldProcessAnsi('stdout', { forceTTY: true })).toBe(true);
      expect(shouldProcessAnsi('stderr', { forceTTY: true })).toBe(true);
    });
  });

  describe('processAnsi', () => {
    it('should expand codes for TTY stdout', () => {
      const result = processAnsi('%green%ok%reset%', 'stdout', { forceTTY: true });
      expect(result).toBe('\x1b[32mok\x1b[0m');
    });

    it('should strip markers for file output', () => {
      const result = processAnsi('%green%ok%reset%', 'file');
      expect(result).toBe('ok');
    });

    it('should strip markers for doc buffer', () => {
      const result = processAnsi('%green%ok%reset%', 'doc');
      expect(result).toBe('ok');
    });

    it('should strip markers when MLLD_NO_COLOR is set', () => {
      process.env.MLLD_NO_COLOR = 'true';
      const result = processAnsi('%green%ok%reset%', 'stdout', { forceTTY: true });
      expect(result).toBe('ok');
    });
  });

  describe('getFormattedText', () => {
    it('should return both plain and ansi versions', () => {
      const result = getFormattedText('%red%error%reset%');
      expect(result.plain).toBe('error');
      expect(result.ansi).toBe('\x1b[31merror\x1b[0m');
    });

    it('should handle text without markers', () => {
      const result = getFormattedText('plain text');
      expect(result.plain).toBe('plain text');
      expect(result.ansi).toBe('plain text');
    });
  });

  describe('getAvailableCodes', () => {
    it('should return available ANSI codes', () => {
      const codes = getAvailableCodes();
      expect(codes).toContain('red');
      expect(codes).toContain('green');
      expect(codes).toContain('bold');
      expect(codes).toContain('reset');
      expect(codes).toContain('bg_red');
      expect(codes).toContain('bright_green');
    });
  });

  describe('color combinations', () => {
    it('should handle nested colors', () => {
      const input = '%bold%%bg_blue%%white%HEADER%reset%';
      const expanded = expandAnsiCodes(input);
      expect(expanded).toBe('\x1b[1m\x1b[44m\x1b[37mHEADER\x1b[0m');
      expect(stripAnsiMarkers(input)).toBe('HEADER');
    });

    it('should handle status indicators', () => {
      const success = '%green%✓%reset% Done';
      const error = '%red%✗%reset% Failed';
      const warning = '%yellow%⚠%reset% Warning';

      expect(expandAnsiCodes(success)).toBe('\x1b[32m✓\x1b[0m Done');
      expect(expandAnsiCodes(error)).toBe('\x1b[31m✗\x1b[0m Failed');
      expect(expandAnsiCodes(warning)).toBe('\x1b[33m⚠\x1b[0m Warning');
    });
  });
});
