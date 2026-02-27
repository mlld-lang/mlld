import { describe, it, expect } from 'vitest';
import { parseDuration, parseSize, formatDuration, formatSize } from './utils';

describe('Configuration Utilities', () => {
  describe('Duration Parsing', () => {
    it('parses milliseconds', () => {
      expect(parseDuration('100')).toBe(100);
      expect(parseDuration('1500ms')).toBe(1500);
      expect(parseDuration(2000)).toBe(2000);
    });

    it('parses seconds', () => {
      expect(parseDuration('5s')).toBe(5000);
      expect(parseDuration('1.5s')).toBe(1500);
      expect(parseDuration('30s')).toBe(30000);
    });

    it('parses minutes', () => {
      expect(parseDuration('5m')).toBe(5 * 60 * 1000);
      expect(parseDuration('1.5m')).toBe(90000);
      expect(parseDuration('10m')).toBe(600000);
    });

    it('parses hours', () => {
      expect(parseDuration('1h')).toBe(60 * 60 * 1000);
      expect(parseDuration('2.5h')).toBe(2.5 * 60 * 60 * 1000);
      expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
    });

    it('parses days', () => {
      expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
      expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseDuration('0.5d')).toBe(12 * 60 * 60 * 1000);
    });

    it('throws on invalid format', () => {
      expect(() => parseDuration('abc')).toThrow('Invalid duration format');
      expect(() => parseDuration('5x')).toThrow('Invalid duration format');
    });
  });

  describe('Size Parsing', () => {
    it('parses bytes', () => {
      expect(parseSize('100')).toBe(100);
      expect(parseSize('1024B')).toBe(1024);
      expect(parseSize(2048)).toBe(2048);
    });

    it('parses kilobytes', () => {
      expect(parseSize('1KB')).toBe(1024);
      expect(parseSize('10KB')).toBe(10240);
      expect(parseSize('1.5KB')).toBe(1536);
    });

    it('parses megabytes', () => {
      expect(parseSize('1MB')).toBe(1024 * 1024);
      expect(parseSize('5MB')).toBe(5 * 1024 * 1024);
      expect(parseSize('10.5MB')).toBe(Math.floor(10.5 * 1024 * 1024));
    });

    it('parses gigabytes', () => {
      expect(parseSize('1GB')).toBe(1024 * 1024 * 1024);
      expect(parseSize('2.5GB')).toBe(Math.floor(2.5 * 1024 * 1024 * 1024));
    });

    it('throws on invalid format', () => {
      expect(() => parseSize('abc')).toThrow('Invalid size format');
      expect(() => parseSize('5XB')).toThrow('Invalid size format');
    });
  });

  describe('Duration Formatting', () => {
    it('formats durations correctly', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(300000)).toBe('5m');
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(86400000)).toBe('1d');
    });
  });

  describe('Size Formatting', () => {
    it('formats sizes correctly', () => {
      expect(formatSize(100)).toBe('100B');
      expect(formatSize(1024)).toBe('1.0KB');
      expect(formatSize(1536)).toBe('1.5KB');
      expect(formatSize(1048576)).toBe('1.0MB');
      expect(formatSize(5242880)).toBe('5.0MB');
      expect(formatSize(1073741824)).toBe('1.0GB');
    });
  });
});
