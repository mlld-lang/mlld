# Constructor Simplification Strategy

## Problem

Many service constructors in the codebase have complex conditional logic to support both DI and non-DI modes. This makes them:

1. Hard to understand
2. Difficult to maintain
3. Error-prone when making changes

## Approach

We'll simplify constructors **without changing their behavior** by:

1. Extracting complex logic to helper methods
2. Improving property naming and organization
3. Adding clearer documentation

## Example: StateService

### Current Implementation

```typescript
constructor(
  @inject(StateFactory) stateFactory?: StateFactory,
  @inject('IStateEventService') eventService?: IStateEventService,
  @inject('IStateTrackingService') trackingService?: IStateTrackingService,
  parentState?: IStateService
) {
  // Handle constructor for both DI and non-DI modes
  if (stateFactory) {
    // DI mode or manual initialization with factory
    this.stateFactory = stateFactory;
    this.eventService = eventService;
    this.trackingService = trackingService;
    
    // Initialize new state
    this.initializeState(parentState);
  } else {
    // Legacy mode - initialize with basic factory
    this.stateFactory = new StateFactory();
    
    // Legacy constructor overloading - handle various parameters
    if (eventService && !trackingService && !parentState) {
      // Handle StateService(eventService) legacy signature
      this.eventService = eventService as IStateEventService;
      this.initializeState();
    } else if (eventService && !trackingService && parentState) {
      // Handle StateService(parentState) legacy signature
      // In this case eventService is actually the parentState
      this.initializeState(eventService as unknown as IStateService);
    } else {
      // Default case or explicit initialize() call later
      this.initializeState(parentState as IStateService);
    }
  }
}
```

### Simplified Version

```typescript
/**
 * Creates a new StateService instance
 * Supports both DI mode and legacy non-DI mode
 * 
 * @param stateFactory State factory for creating states (injected in DI mode)
 * @param eventService Event service for state events (injected in DI mode)
 * @param trackingService Tracking service for debugging (injected in DI mode)
 * @param parentState Optional parent state to inherit from
 */
constructor(
  @inject(StateFactory) stateFactory?: StateFactory,
  @inject('IStateEventService') eventService?: IStateEventService,
  @inject('IStateTrackingService') trackingService?: IStateTrackingService,
  parentState?: IStateService
) {
  this.initializeFromParams(stateFactory, eventService, trackingService, parentState);
}

/**
 * Initialize this service with the given parameters
 * Handles both DI and non-DI mode initialization
 */
private initializeFromParams(
  stateFactory?: StateFactory,
  eventService?: IStateEventService | IStateService, // Could be event service or parent state in legacy mode
  trackingService?: IStateTrackingService,
  parentState?: IStateService
): void {
  if (stateFactory) {
    this.initializeDIMode(stateFactory, eventService as IStateEventService, trackingService, parentState);
  } else {
    this.initializeLegacyMode(eventService, trackingService, parentState);
  }
}

/**
 * Initialize in DI mode with explicit dependencies
 */
private initializeDIMode(
  stateFactory: StateFactory,
  eventService?: IStateEventService,
  trackingService?: IStateTrackingService,
  parentState?: IStateService
): void {
  this.stateFactory = stateFactory;
  this.eventService = eventService;
  this.trackingService = trackingService;
  this.initializeState(parentState);
}

/**
 * Initialize in legacy non-DI mode with parameter overloading
 */
private initializeLegacyMode(
  eventServiceOrParent?: IStateEventService | IStateService,
  trackingService?: IStateTrackingService,
  explicitParentState?: IStateService
): void {
  // Create default factory
  this.stateFactory = new StateFactory();
  
  // Handle different legacy constructor signatures
  if (eventServiceOrParent && !trackingService && !explicitParentState) {
    // Case: StateService(eventService)
    this.eventService = eventServiceOrParent as IStateEventService;
    this.initializeState();
  } else if (eventServiceOrParent && !trackingService && explicitParentState) {
    // Case: StateService(parentState)
    // In this case eventServiceOrParent is actually the parentState
    this.initializeState(eventServiceOrParent as IStateService);
  } else {
    // Default case or explicit initialize() call later
    this.initializeState(explicitParentState as IStateService);
  }
}
```

## Benefits of This Approach

1. **Improved Readability**: The constructor itself is much simpler
2. **Better Organization**: Separates different initialization paths
3. **Clearer Documentation**: Each method explains its purpose
4. **Easier Maintenance**: Changes can be made to specific paths without affecting others
5. **Preserved Behavior**: Functionally identical to the original
6. **Future Migration Path**: Will be easier to remove legacy mode later

## Implementation Strategy

For each service:

1. Create a new branch
2. Refactor one constructor at a time
3. Run tests after each refactor to ensure nothing breaks
4. Get targeted code reviews
5. Document any patterns or issues discovered

## Candidate Services

Good candidates for initial constructor simplification:

1. `ResolutionService`
2. `OutputService`
3. `FileSystemService`
4. `DirectiveService`

These services have complex constructors but relatively isolated functionality, making them good starting points.