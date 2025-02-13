import { ICircularityService } from './ICircularityService';
import { MeldImportError } from '../../core/errors/MeldImportError';
import { importLogger as logger } from '../../core/utils/logger';

export class CircularityService implements ICircularityService {
  private importStack: string[] = [];

  beginImport(filePath: string): void {
    logger.debug('Beginning import', { 
      filePath,
      currentStack: this.importStack 
    });

    if (this.isInStack(filePath)) {
      const importChain = [...this.importStack, filePath];
      logger.error('Circular import detected', {
        filePath,
        importChain
      });

      throw new MeldImportError(
        `Circular import detected for file: ${filePath}`,
        'circular_import',
        { importChain }
      );
    }

    this.importStack.push(filePath);
  }

  endImport(filePath: string): void {
    const idx = this.importStack.lastIndexOf(filePath);
    if (idx !== -1) {
      this.importStack.splice(idx, 1);
      logger.debug('Ended import', { 
        filePath,
        remainingStack: this.importStack 
      });
    } else {
      logger.warn('Attempted to end import for file not in stack', {
        filePath,
        currentStack: this.importStack
      });
    }
  }

  isInStack(filePath: string): boolean {
    return this.importStack.includes(filePath);
  }

  getImportStack(): string[] {
    return [...this.importStack];
  }

  reset(): void {
    logger.debug('Resetting import stack', {
      previousStack: this.importStack
    });
    this.importStack = [];
  }
} 