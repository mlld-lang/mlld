import { container } from 'tsyringe';
import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService';
import { IStateEventService } from '@services/state/StateEventService/IStateEventService';
import { ContextDebuggerService } from '@tests/utils/debug/StateDebuggerService/ContextDebuggerService';

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
export * from './IStateDebuggerService';
export * from './StateDebuggerService';
export * from './ContextDebuggerService'; 