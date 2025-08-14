import { Location } from '@core/types/location';
import * as fs from 'fs';

/**
 * Represents an effect (side effect) that should be executed immediately
 * rather than being stored as a node for later processing.
 */
export interface Effect {
  type: 'doc' | 'stdout' | 'stderr' | 'both' | 'file';
  content: string;
  path?: string;  // For file effects
  source?: Location;  // For error reporting
  metadata?: any;  // For preserving LoadContentResult metadata, etc.
}

/**
 * Interface for handling effects (immediate outputs) in the interpreter.
 * This allows for different implementations: default (console), test (collection), 
 * and future streaming handlers.
 */
export interface EffectHandler {
  handleEffect(effect: Effect): void;
  getDocument?(): string;  // Optional method to get accumulated document
}

/**
 * Default effect handler that manages both streaming output and document generation.
 * Used in normal execution mode.
 */
export class DefaultEffectHandler implements EffectHandler {
  private documentBuffer: string[] = [];
  private streamingEnabled: boolean;

  constructor(options: { streaming?: boolean } = {}) {
    // Enable streaming via environment variable or option
    this.streamingEnabled = options.streaming || 
                           process.env.MLLD_STREAMING === 'true' ||
                           process.env.MLLD_IMMEDIATE_EFFECTS === 'true';
  }

  handleEffect(effect: Effect): void {
    switch (effect.type) {
      case 'doc':
        // Only append to document
        this.documentBuffer.push(effect.content);
        break;
        
      case 'stdout':
        // Only write to stdout (bypasses document)
        process.stdout.write(effect.content);
        break;
        
      case 'stderr':
        // Only write to stderr
        process.stderr.write(effect.content);
        break;
        
      case 'both':
        // Write to stdout if streaming
        if (this.streamingEnabled) {
          process.stdout.write(effect.content);
        }
        // Always append to document
        this.documentBuffer.push(effect.content);
        break;
        
      case 'file':
        // Write to file
        if (effect.path) {
          try {
            fs.writeFileSync(effect.path, effect.content);
          } catch (error) {
            console.error(`Failed to write to file ${effect.path}:`, error);
          }
        }
        break;
    }
  }

  getDocument(): string {
    // Basic newline normalization
    return this.documentBuffer
      .join('')
      .replace(/\n{3,}/g, '\n\n');  // Max 2 consecutive newlines
  }
}

/**
 * Test effect handler that collects effects for verification.
 * Used in test environments to assert on output without actual I/O.
 */
export class TestEffectHandler implements EffectHandler {
  collected: Effect[] = [];
  private documentBuffer: string[] = [];
  
  handleEffect(effect: Effect): void {
    this.collected.push(effect);
    
    // Also maintain document buffer for testing
    if (effect.type === 'doc' || effect.type === 'both') {
      this.documentBuffer.push(effect.content);
    }
  }
  
  getDocument(): string {
    return this.documentBuffer
      .join('')
      .replace(/\n{3,}/g, '\n\n');
  }
  
  getOutput(): string {
    return this.collected
      .filter(e => e.type === 'stdout' || e.type === 'both')
      .map(e => e.content)
      .join('');
  }
  
  getErrors(): string {
    return this.collected
      .filter(e => e.type === 'stderr')
      .map(e => e.content)
      .join('');
  }
  
  getAll(): Effect[] {
    return this.collected;
  }
  
  clear(): void {
    this.collected = [];
    this.documentBuffer = [];
  }
}

/**
 * No-op effect handler that discards all effects.
 * Useful for scenarios where output should be suppressed.
 */
export class NullEffectHandler implements EffectHandler {
  handleEffect(_effect: Effect): void {
    // Intentionally do nothing
  }
}