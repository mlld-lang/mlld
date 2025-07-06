/**
 * ConsoleManager handles console output management, error deduplication,
 * and console override mechanisms for the CLI
 */
export class ConsoleManager {
  private originalConsole: {
    error: typeof console.error;
    warn: typeof console.warn;
    log: typeof console.log;
  };
  
  private errorDeduplicationSet: Set<string> = new Set();
  private isOverrideActive: boolean = false;

  constructor() {
    this.originalConsole = {
      error: console.error,
      warn: console.warn,
      log: console.log
    };
  }

  /**
   * Override console methods to capture and deduplicate errors
   */
  overrideConsole(): void {
    if (this.isOverrideActive) {
      return;
    }

    this.isOverrideActive = true;
    
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      const messageKey = this.generateMessageKey(message);
      
      if (!this.errorDeduplicationSet.has(messageKey)) {
        this.errorDeduplicationSet.add(messageKey);
        this.originalConsole.error(...args);
      }
    };

    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      const messageKey = this.generateMessageKey(message);
      
      if (!this.errorDeduplicationSet.has(messageKey)) {
        this.errorDeduplicationSet.add(messageKey);
        this.originalConsole.warn(...args);
      }
    };
  }

  /**
   * Restore original console methods
   */
  restoreConsole(): void {
    if (!this.isOverrideActive) {
      return;
    }

    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.log = this.originalConsole.log;
    
    this.isOverrideActive = false;
  }

  /**
   * Force output an error bypassing deduplication
   */
  forceError(...args: any[]): void {
    this.originalConsole.error(...args);
  }

  /**
   * Force output a warning bypassing deduplication
   */
  forceWarn(...args: any[]): void {
    this.originalConsole.warn(...args);
  }

  /**
   * Force output a log bypassing deduplication
   */
  forceLog(...args: any[]): void {
    this.originalConsole.log(...args);
  }

  /**
   * Clear the error deduplication set
   */
  clearDeduplication(): void {
    this.errorDeduplicationSet.clear();
  }

  /**
   * Generate a unique key for message deduplication
   */
  private generateMessageKey(message: string): string {
    // Simple hash function for message deduplication
    // Remove timestamps and variable content that might change
    const normalizedMessage = message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, 'TIMESTAMP')
      .replace(/line \d+/g, 'line X')
      .replace(/column \d+/g, 'column X')
      .replace(/\d+ ms/g, 'X ms')
      .trim();
    
    return normalizedMessage;
  }

  /**
   * Check if console override is currently active
   */
  isConsoleOverridden(): boolean {
    return this.isOverrideActive;
  }
}