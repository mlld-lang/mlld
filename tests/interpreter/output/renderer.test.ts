import { describe, it, expect, beforeEach } from 'vitest';
import { OutputRenderer, DocumentRenderer } from '@interpreter/output/renderer';
import { breakIntent, contentIntent, progressIntent, errorIntent } from '@interpreter/output/intent';
import type { OutputIntent } from '@interpreter/output/intent';

describe('OutputRenderer', () => {
  describe('break collapsing', () => {
    it('collapses adjacent collapsible breaks', () => {
      const emitted: OutputIntent[] = [];
      const renderer = new OutputRenderer((intent) => emitted.push(intent));

      renderer.emit(breakIntent('\n', true));
      renderer.emit(breakIntent('\n', true));
      renderer.emit(breakIntent('\n', true));
      renderer.emit(contentIntent('content'));

      expect(emitted).toHaveLength(2);
      expect(emitted[0].type).toBe('break');
      expect(emitted[0].value).toBe('\n');
      expect(emitted[1].type).toBe('content');
      expect(emitted[1].value).toBe('content');
    });

    it('does not collapse non-collapsible breaks', () => {
      const emitted: OutputIntent[] = [];
      const renderer = new OutputRenderer((intent) => emitted.push(intent));

      renderer.emit(breakIntent('\n', false));
      renderer.emit(breakIntent('\n', false));
      renderer.emit(contentIntent('content'));

      expect(emitted).toHaveLength(3);
      expect(emitted[0].type).toBe('break');
      expect(emitted[1].type).toBe('break');
      expect(emitted[2].type).toBe('content');
    });

    it('handles mixed collapsible and non-collapsible breaks', () => {
      const emitted: OutputIntent[] = [];
      const renderer = new OutputRenderer((intent) => emitted.push(intent));

      renderer.emit(breakIntent('\n', true));
      renderer.emit(breakIntent('\n', true));
      renderer.emit(breakIntent('\n', false)); // Non-collapsible flushes pending
      renderer.emit(breakIntent('\n', true));
      renderer.emit(contentIntent('content'));

      expect(emitted).toHaveLength(4);
      expect(emitted[0].type).toBe('break'); // Collapsed collapsibles
      expect(emitted[1].type).toBe('break'); // Non-collapsible
      expect(emitted[2].type).toBe('break'); // New collapsible
      expect(emitted[3].type).toBe('content');
    });

    it('collapses breaks with content interruption', () => {
      const emitted: OutputIntent[] = [];
      const renderer = new OutputRenderer((intent) => emitted.push(intent));

      renderer.emit(breakIntent('\n', true));
      renderer.emit(breakIntent('\n', true));
      renderer.emit(contentIntent('first'));
      renderer.emit(breakIntent('\n', true));
      renderer.emit(breakIntent('\n', true));
      renderer.emit(contentIntent('second'));

      expect(emitted).toHaveLength(4);
      expect(emitted[0].type).toBe('break');
      expect(emitted[1].type).toBe('content');
      expect(emitted[1].value).toBe('first');
      expect(emitted[2].type).toBe('break');
      expect(emitted[3].type).toBe('content');
      expect(emitted[3].value).toBe('second');
    });

    it('flushes trailing breaks on render', () => {
      const emitted: OutputIntent[] = [];
      const renderer = new OutputRenderer((intent) => emitted.push(intent));

      renderer.emit(contentIntent('content'));
      renderer.emit(breakIntent('\n', true));
      renderer.emit(breakIntent('\n', true));
      renderer.render();

      expect(emitted).toHaveLength(2);
      expect(emitted[0].type).toBe('content');
      expect(emitted[1].type).toBe('break');
    });
  });

  describe('smart buffering', () => {
    it('emits content immediately after flushing breaks', () => {
      const emitted: OutputIntent[] = [];
      const renderer = new OutputRenderer((intent) => emitted.push(intent));

      renderer.emit(breakIntent('\n', true));
      expect(emitted).toHaveLength(0); // Break buffered

      renderer.emit(contentIntent('content'));
      expect(emitted).toHaveLength(2); // Break flushed + content emitted
    });

    it('emits progress immediately', () => {
      const emitted: OutputIntent[] = [];
      const renderer = new OutputRenderer((intent) => emitted.push(intent));

      renderer.emit(progressIntent('loading...'));
      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('progress');
    });

    it('emits errors immediately', () => {
      const emitted: OutputIntent[] = [];
      const renderer = new OutputRenderer((intent) => emitted.push(intent));

      renderer.emit(errorIntent('error occurred'));
      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('error');
    });

    it('preserves streaming order', () => {
      const emitted: OutputIntent[] = [];
      const renderer = new OutputRenderer((intent) => emitted.push(intent));

      renderer.emit(contentIntent('line1'));
      renderer.emit(breakIntent('\n', true));
      renderer.emit(contentIntent('line2'));
      renderer.emit(breakIntent('\n', true));
      renderer.emit(contentIntent('line3'));

      expect(emitted.map(i => i.value)).toEqual(['line1', '\n', 'line2', '\n', 'line3']);
    });
  });

  describe('pending break tracking', () => {
    it('tracks pending breaks', () => {
      const renderer = new OutputRenderer();

      expect(renderer.getPendingBreakCount()).toBe(0);

      renderer.emit(breakIntent('\n', true));
      expect(renderer.getPendingBreakCount()).toBe(1);

      renderer.emit(breakIntent('\n', true));
      expect(renderer.getPendingBreakCount()).toBe(2);

      renderer.emit(contentIntent('content'));
      expect(renderer.getPendingBreakCount()).toBe(0);
    });

    it('clears pending breaks', () => {
      const renderer = new OutputRenderer();

      renderer.emit(breakIntent('\n', true));
      renderer.emit(breakIntent('\n', true));
      expect(renderer.getPendingBreakCount()).toBe(2);

      renderer.clear();
      expect(renderer.getPendingBreakCount()).toBe(0);
    });
  });

  describe('without callback', () => {
    it('buffers intents without callback', () => {
      const renderer = new OutputRenderer();

      renderer.emit(breakIntent('\n', true));
      renderer.emit(contentIntent('content'));

      expect(renderer.getPendingBreakCount()).toBe(0);
    });
  });
});

describe('DocumentRenderer', () => {
  it('assembles document from content and breaks', () => {
    const renderer = new DocumentRenderer();

    renderer.emit(contentIntent('# Header'));
    renderer.emit(breakIntent('\n'));
    renderer.emit(contentIntent('Content'));

    expect(renderer.getDocument()).toBe('# Header\nContent\n');
  });

  it('ignores progress and error intents', () => {
    const renderer = new DocumentRenderer();

    renderer.emit(contentIntent('line1'));
    renderer.emit(progressIntent('loading...'));
    renderer.emit(errorIntent('error'));
    renderer.emit(contentIntent('line2'));

    expect(renderer.getDocument()).toBe('line1line2\n');
  });

  it('normalizes output', () => {
    const renderer = new DocumentRenderer();

    renderer.emit(contentIntent('line1  '));
    renderer.emit(breakIntent('\n'));
    renderer.emit(breakIntent('\n'));
    renderer.emit(breakIntent('\n'));
    renderer.emit(breakIntent('\n'));
    renderer.emit(contentIntent('line2'));

    const result = renderer.getDocument();
    expect(result).not.toContain('  \n'); // Trailing spaces removed
    expect(result).not.toContain('\n\n\n'); // Max 2 newlines
  });

  it('ensures single trailing newline', () => {
    const renderer = new DocumentRenderer();

    renderer.emit(contentIntent('content'));

    expect(renderer.getDocument()).toBe('content\n');
  });

  it('clears buffer', () => {
    const renderer = new DocumentRenderer();

    renderer.emit(contentIntent('content'));
    renderer.clear();
    expect(renderer.getDocument()).toBe('\n');
  });
});

describe('intent helpers', () => {
  it('creates content intent with defaults', () => {
    const intent = contentIntent('test');
    expect(intent.type).toBe('content');
    expect(intent.value).toBe('test');
    expect(intent.source).toBe('text');
    expect(intent.visibility).toBe('always');
    expect(intent.collapsible).toBe(false);
  });

  it('creates break intent with collapsible', () => {
    const intent = breakIntent();
    expect(intent.type).toBe('break');
    expect(intent.value).toBe('\n');
    expect(intent.collapsible).toBe(true);
  });

  it('creates progress intent with optional visibility', () => {
    const intent = progressIntent('loading...');
    expect(intent.type).toBe('progress');
    expect(intent.visibility).toBe('optional');
  });

  it('creates error intent', () => {
    const intent = errorIntent('error');
    expect(intent.type).toBe('error');
    expect(intent.visibility).toBe('always');
  });
});
