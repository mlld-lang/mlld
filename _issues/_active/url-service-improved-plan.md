# URL Service Implementation - Improved Plan

## Background

Previous attempts to implement URL support in Meld encountered significant issues that led to extensive rework. This improved plan incorporates lessons learned to ensure a more successful implementation.

## Core Principles

1. **Incremental, Non-Breaking Changes**
   - Each change must be backward compatible
   - Implementation must never break existing tests

2. **Comprehensive Testing First**
   - Testing infrastructure must be in place before implementing features
   - Each component must have thorough tests before integration

3. **Feature Toggle Support**
   - All URL functionality must be toggleable
   - System must work seamlessly with URLs disabled

4. **Interface Extension over Modification**
   - Extend interfaces rather than modify existing ones
   - Use composition patterns to add functionality

## Implementation Phases

### Phase 0: Testing Infrastructure (Week 1)

**Objective**: Build robust testing tools to support URL implementation without modifying production code.

**Tasks**:
- Complete the `HttpTestContext` and `urlTestFactories` utilities
- Create a comprehensive `MockHTTPServer` for testing
- Develop test helpers for URL validation and response mocking
- Write tests for the testing tools themselves

**Exit Criteria**:
- [ ] HTTP mocking infrastructure passes all tests
- [ ] Test factories generate consistent test data
- [ ] Mock server can reliably start/stop in test contexts
- [ ] URL validation helper functions work correctly

### Phase 1: Core URL Service (Week 2)

**Objective**: Implement a standalone URL service that doesn't affect existing code.

**Tasks**:
- Implement `URLCache` with thorough testing
- Implement `URLService` with minimal dependencies
- Create feature flags for URL functionality
- Ensure all components can be disabled without side effects

**Design Patterns**:
- Use dependency injection for all services
- Keep interfaces minimal and focused
- Implement thorough error handling with custom error classes
- Use options objects for configuration

**Exit Criteria**:
- [ ] All URL service tests pass consistently
- [ ] Service operates correctly with feature flag disabled
- [ ] Cache behaves as expected with various TTL settings
- [ ] Error handling covers network failures, timeouts, etc.

### Phase 2: Extension Interfaces (Week 3)

**Objective**: Create extension interfaces that build on existing ones without breaking changes.

**Tasks**:
- Define extension interfaces (e.g., `IURLAwarePathService extends IPathService`)
- Implement extended service versions that wrap core services
- Create factory methods that produce the appropriate implementation based on feature flags
- Write thorough tests for all extension interfaces

**Design Patterns**:
- Use decorator pattern for extended services
- Implement "pass-through" behavior when URL features are disabled
- Keep constructors compatible with existing code

**Exit Criteria**:
- [ ] Extension interfaces pass all tests
- [ ] Core services continue to work with extensions disabled
- [ ] No existing tests break when extensions are introduced
- [ ] Service creation logic correctly handles feature flags

### Phase 3: Handle Meld Directives with URLs (Week 4)

**Objective**: Enable URL imports and embeds without modifying existing handlers.

**Tasks**:
- Implement URL-aware directive handlers as decorators around existing handlers
- Update service registration to use URL-aware handlers when feature flag is enabled
- Ensure path detection properly identifies URLs
- Implement circular reference detection for URLs

**Design Patterns**:
- Use dependency injection to replace handlers conditionally
- Consider using chain of responsibility pattern for URL handling
- Keep all URL-specific logic in decorators, not core handlers

**Exit Criteria**:
- [ ] Import directives work with URLs when enabled
- [ ] Embed directives work with URLs when enabled
- [ ] Existing file-based directives continue to work unchanged
- [ ] Circular reference detection works across files and URLs
- [ ] All original tests pass with URL features enabled or disabled

### Phase 4: Integration and Performance (Week 5)

**Objective**: Ensure the URL service integrates well with the entire system and performs adequately.

**Tasks**:
- Implement caching strategies for various content types
- Add performance monitoring and tuning
- Create comprehensive integration tests
- Implement security features (allowlists, blocklists)

**Exit Criteria**:
- [ ] Integration tests pass with URLs enabled
- [ ] Performance meets acceptable thresholds
- [ ] Security features correctly block/allow URLs
- [ ] System works under various network conditions

## Interface Design Principles

### Extension-Based Approach

Instead of modifying existing interfaces:

```typescript
// AVOID:
interface IPathService {
  // Existing methods
  resolveURL(url: string): Promise<string>; // Breaking change!
}

// PREFER:
interface IURLAwarePathService extends IPathService {
  resolveURL(url: string): Promise<string>;
}
```

### Feature Toggle Integration

All URL functionality should respect feature toggles:

```typescript
export class URLAwarePathService implements IURLAwarePathService {
  constructor(
    private pathService: IPathService,
    private featureFlags: IFeatureFlags,
    private urlService?: IURLService
  ) {}

  // Delegate to core service for existing functionality
  resolvePath(path: string): string {
    return this.pathService.resolvePath(path);
  }

  // New functionality with toggle checks
  async resolveURL(url: string): Promise<string> {
    if (!this.featureFlags.isEnabled('url-support') || !this.urlService) {
      throw new URLSupportDisabledException();
    }
    return this.urlService.fetchURL(url).then(r => r.content);
  }
}
```

### Mock Implementation Strategy

Provide default implementations for all interfaces:

```typescript
export class MockURLService implements IURLService {
  // Default implementations of all required methods
  // Safe to use in tests without explicit configuration
}
```

## Testing Strategy

### Unit Tests

1. **Test Each Component in Isolation**
   - URL validation logic
   - Cache behavior
   - Service error handling

2. **Test Feature Flag Behavior**
   - Ensure components respond correctly when disabled
   - Verify graceful fallbacks

3. **Test Interface Compliance**
   - Ensure all implementations properly satisfy their interfaces
   - Verify extension interfaces properly extend base interfaces

### Integration Tests

1. **Test Component Interactions**
   - URLService with PathService
   - Directive Handlers with URLService

2. **Test Feature Flag Transitions**
   - System behavior when toggling flags on/off

3. **Test Error Propagation**
   - How errors from URL service affect parent components

### End-to-End Tests

1. **Complete Meld Document Processing**
   - Documents with URL imports/embeds
   - Various URL types and content formats

2. **Error Recovery**
   - System behavior with network failures
   - Timeout handling

## Lessons Applied from Previous Attempts

1. **Interface Extension**
   - Using extension interfaces instead of modifying core interfaces
   - Making all new methods optional with feature flags

2. **Constructor Compatibility**
   - Maintaining backward compatibility in constructors
   - Using dependency injection for new dependencies

3. **Testing Infrastructure**
   - Building testing infrastructure first
   - Creating standardized mocks for all interfaces

4. **Implementation Sequence**
   - Following a strict phased approach
   - Completing each phase before moving to the next

5. **Feature Toggles**
   - Implementing comprehensive feature toggle system
   - Ensuring system works with URL features disabled

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing tests | Extension interfaces with explicit feature flags |
| Mock incompatibilities | Create comprehensive mock implementations upfront |
| Performance issues | Implement tiered caching and monitoring |
| Integration complexity | Use decorator pattern to isolate URL logic |
| Security concerns | Implement allowlist/blocklist system |

## Timeline and Milestones

- **Week 1**: Complete testing infrastructure
- **Week 2**: Implement standalone URL service
- **Week 3**: Create and test extension interfaces
- **Week 4**: Implement URL-aware directive handlers
- **Week 5**: Integration, performance tuning, and final testing

## Conclusion

This improved implementation plan addresses the core issues from previous attempts by focusing on:

1. Non-breaking extensions rather than modifications
2. Comprehensive testing infrastructure
3. Feature toggle support throughout
4. Incremental, phased implementation

By following this plan, we can implement URL support in Meld without disrupting existing functionality and with minimal risk of regression. 