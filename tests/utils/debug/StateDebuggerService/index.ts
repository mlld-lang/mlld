import { container } from 'tsyringe';
import { StateDebuggerService } from './StateDebuggerService.js';
import { StateVisualizationService } from '../StateVisualizationService/StateVisualizationService.js';
import { StateHistoryService } from '../StateHistoryService/StateHistoryService.js';
import { StateTrackingService } from '../StateTrackingService/StateTrackingService.js';
import { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';

/**
 * Initialize the context debugger with all required services
 * @returns An instance of the StateDebuggerService
 */
export function initializeContextDebugger(): StateDebuggerService {
  // Create services in proper dependency order
  const trackingService = new StateTrackingService();
  
  // Get the state event service from the DI container
  const eventService = container.resolve<IStateEventService>('StateEventService');
  
  // Create history service with event service
  const historyService = new StateHistoryService(eventService);
  
  // Create visualization service with history and tracking services
  const visualizationService = new StateVisualizationService(
    historyService,
    trackingService
  );
  
  // Create and return the debugger service
  return new StateDebuggerService(
    visualizationService,
    historyService,
    trackingService
  );
}

// Re-export types and classes
export * from './IStateDebuggerService.js';
export * from './StateDebuggerService.js'; 