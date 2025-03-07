import { ICircularityService } from './ICircularityService.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import { importLogger as logger } from '@core/utils/logger.js';
import { Service } from '../../../core/ServiceProvider';
import { injectable } from 'tsyringe';

@injectable()
@Service({
  description: 'Service for tracking and detecting circular imports in Meld files'
})
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
        {
          code: 'CIRCULAR_IMPORT',
          details: { importChain }
        }
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