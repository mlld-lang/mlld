import { container } from 'tsyringe';
import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService.js';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import { ContextDebuggerService } from '@tests/utils/debug/StateDebuggerService/ContextDebuggerService.js';

/**
 * Initialize the context debugger with all required services
 * @returns An instance of the ContextDebuggerService
 */
export function initializeContextDebugger(): ContextDebuggerService {
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
  
  // Create and return the context debugger service
  return new ContextDebuggerService(
    visualizationService,
    historyService,
    trackingService
  );
}

// Re-export types and classes
export * from './IStateDebuggerService.js';
export * from './StateDebuggerService.js';
export * from './ContextDebuggerService.js'; 