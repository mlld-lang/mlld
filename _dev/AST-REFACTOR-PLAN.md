# Rolling Wave Plan: AST/Types/State Refactor

## About This Format
This is a rolling wave plan. Current / next work is thoroughly detailed and implementation-focused, future work has slight detail, distant work is just a simple outline of deliverables. As phases complete, the plan "rolls forward" with upcoming phases becoming more detailed. A phase is work that can be done in a day. Each phase is split into a few 2-hour sessions. Each phase should have exit criteria which include updating the next phase's plan and other relevant docs.

---

## Project Context
**Project Name**: Meld AST/Types/State System Refactor  
**Reference Documents**: 
- `_dev/NEWSTATE.md` - Original state simplification plan
- `docs/dev/AST.md` - AST design documentation
- `_dev/TYPE-RESTRUCTURE-UNIFIED.md` - Type system design
- `_dev/AST-REFACTOR-TECHNICAL-NOTES.md` - Implementation learnings and patterns
- `CLAUDE.md` - Project guidelines and current status

## Architecture Approach

### Current Architecture Issues
1. **Circular Logic**: State service has complex business logic that belongs in handlers
2. **Type Confusion**: Multiple overlapping type definitions across services
3. **Tight Coupling**: Services deeply interdependent, making changes risky
4. **State Mutations**: Unpredictable state changes throughout processing

### New Architecture: "AST Knows All"
1. **Smart Types, Dumb Services**: All intelligence in AST types via discriminated unions
2. **Immutable State Flow**: State changes returned as data, not mutations
3. **Handler Pattern**: Each directive type has dedicated handler with clear contract
4. **Minimal Interfaces**: Services have narrow, focused APIs (e.g., StateService: 8 methods vs 50+)

### Migration Strategy
Using adapter pattern to maintain backward compatibility while incrementally migrating services. This allows:
- All existing tests to continue passing
- Gradual migration without breaking changes
- Validation at each step

---

## CURRENT PHASE: Interface Design & Validation

**Timeframe**: Next session (Day 1)  
**Phase Goal**: Create comprehensive interface designs for all services based on new architecture principles  

### Sessions

**Session 1.1**: Service Interface Analysis [2 hours]
- Description: Analyze current service usage patterns and design minimal interfaces
- Technical Details: 
  - Review how each service is actually used (not just what methods exist)
  - Document data flow patterns between services
  - Identify which methods belong in services vs handlers
- Dependencies: Current codebase analysis
- Expected Output: 
  - Service dependency graph
  - List of required methods per service
  - Data flow diagrams

**Session 1.2**: Interface Design [2 hours]
- Description: Design new interfaces following "AST Knows All" principles
- Technical Details:
  - IStateService (already done - validate)
  - IResolutionService (needs context handling)
  - IDirectiveService (already done - validate)
  - IInterpreterService (already done - validate)
  - IParserService (minimal changes needed)
  - IOutputService (needs state handling updates)
- Dependencies: Session 1.1 analysis
- Expected Output: Complete interface definitions in TypeScript

**Session 1.3**: Type Integration Design [2 hours]
- Description: Design how new AST types flow through services
- Technical Details:
  - Map AST node types to handler inputs/outputs
  - Define StateChanges type properly
  - Design ResolutionContext to work with new state
  - Ensure DirectiveResult handles all cases
- Dependencies: Interface designs
- Expected Output: Type flow documentation and interfaces

**Session 1.4**: Validation Planning [2 hours]
- Description: Create test scenarios to validate the design
- Technical Details:
  - Design integration tests for each directive type
  - Use core/ast/fixtures for test cases
  - Plan adapter removal strategy
  - Identify high-risk areas needing extra validation
- Dependencies: Interface and type designs
- Expected Output: Test plan document

### Exit Criteria
- [ ] All service interfaces documented with full method signatures
- [ ] Type flow from Parser → Interpreter → Handlers → Output documented
- [ ] Integration test scenarios defined for validation
- [ ] Detailed plan created/updated for Core Services Migration phase
- [ ] Documentation updates:
  - [ ] Update `docs/dev/TYPES.md` with finalized interface definitions
  - [ ] Update `docs/dev/ARCHITECTURE.md` if service relationships change
  - [ ] Document any deviations from original plan in Rolling Updates Log

### Technical Decisions & Assumptions
- Maintain adapter pattern until full migration complete
- Services should not know about directive specifics (handler responsibility)
- State remains mutable within a processing run, but changes are explicit
- Resolution context carries all needed information (no service lookups)

### Risk Factors
- ResolutionService has complex interdependencies - needs careful design
- Variable interpolation touches many services - ensure clean boundaries
- Path resolution involves security concerns - maintain validation

---

## NEXT PHASE: Core Services Migration

**Timeframe**: Day 2  
**Phase Goal**: Implement StateService, ResolutionService, and DirectiveService with new interfaces  

### Features

**Feature 2.1**: StateService Implementation
- Description: Implement production StateService (not adapter)
- Approach: 
  - Start from minimal interface (8 methods)
  - Ensure proper variable storage and retrieval
  - Handle node accumulation for output
- Dependencies: Interface design from Phase 1
- Est. Effort: 3-4 hours

**Feature 2.2**: ResolutionService Migration
- Description: Update ResolutionService to use new state/context
- Approach:
  - Update ResolutionContext interface
  - Ensure variable interpolation works
  - Handle path resolution properly
- Dependencies: StateService, AST types
- Est. Effort: 4-6 hours

**Feature 2.3**: Integration Validation
- Description: Validate core services work together
- Approach:
  - Run integration tests from Phase 1
  - Fix issues with state flow
  - Ensure variable resolution works end-to-end
- Dependencies: Core services implemented
- Est. Effort: 2-3 hours

### Exit Criteria
- Core services implemented and tested
- Integration tests passing for basic scenarios
- Documentation updates:
  - [ ] Update `docs/dev/ARCHITECTURE.md` with actual dependencies
  - [ ] Update `docs/dev/TYPES.md` with concrete implementations
  - [ ] Document any architectural decisions in `_dev/AST-REFACTOR-TECHNICAL-NOTES.md`
  - [ ] Update phase progress in Rolling Updates Log

### Open Questions
- Should ResolutionContext be immutable with builder pattern?
- How to handle async resolution (commands, URLs)?
- Where does path validation logic belong?

### Known Issues (To Address in Phase 3)
- **Variable interpolation in new system**: Currently failing in integration tests due to adapter complexity between old/new ResolutionService interfaces. This is expected and will be properly fixed when handlers are migrated to use new interfaces in Phase 3.
- **Complex directives**: Some directives (import, add with templates) may not work fully until handlers are properly migrated.
- **ResolutionContext structure**: The mapping between old and new context formats in adapters is imperfect.

### Potential Adjustments
- May need to update ParserService if AST structure needs changes
- OutputService might need updates based on state structure

---

## CURRENT PHASE: Handler Migration

**Timeframe**: Day 3-4  
**Phase Goal**: Migrate all directive handlers to use new interfaces properly  

### Sessions

**Session 3.1**: TextDirectiveHandler Migration [2 hours]
- Description: Migrate the most critical handler to use new ResolutionService
- Technical Details:
  - Update to use new IResolutionService interface directly
  - Fix ResolutionContext to properly pass state
  - Ensure variable interpolation works
  - Handle both = and += operators correctly
- Dependencies: New ResolutionService from Phase 2
- Expected Output: Working text directive with variable interpolation

**Session 3.2**: Simple Handlers Migration [2 hours]  
- Description: Migrate handlers that don't need resolution
- Technical Details:
  - DataDirectiveHandler: Direct value storage from AST
  - PathDirectiveHandler: Simple path resolution
  - Both should be straightforward migrations
- Dependencies: Minimal - mostly AST structure
- Expected Output: Data and path directives fully working

**Session 3.3**: Command Handlers Migration [2 hours]
- Description: Migrate Run/Exec handlers for command execution
- Technical Details:
  - RunDirectiveHandler: Execute without capturing output
  - ExecDirectiveHandler: Execute and store output
  - Ensure proper command resolution and execution
  - Handle both inline code and command references
- Dependencies: FileSystemService for execution
- Expected Output: Command execution working properly

**Session 3.4**: Complex Handlers Migration [2 hours]
- Description: Migrate Add/Import handlers with content inclusion
- Technical Details:
  - AddDirectiveHandler: Content addition with resolution
  - ImportDirectiveHandler: File import with child states
  - These are most complex due to recursive processing
- Dependencies: InterpreterService for recursive processing
- Expected Output: Full directive suite working

### Exit Criteria
- All handlers using new interfaces exclusively
- Integration tests passing for all directive types
- No adapter usage in handlers
- Documentation updates:
  - [ ] Update `docs/dev/ARCHITECTURE.md` with handler details
  - [ ] Update `docs/dev/PIPELINE.md` with actual data flow
  - [ ] Add handler examples to `docs/directives/`
  - [ ] Update `CLAUDE.md` with migration progress

---

## CURRENT PHASE: Integration & Cleanup

**Timeframe**: Day 5  
**Phase Goal**: Remove adapters and validate complete system  

### Sessions

**Session 4.1**: Update DI Configuration [1 hour]
- Description: Wire up new handlers and services in DI container
- Technical Details:
  - Replace old handlers with new minimal versions
  - Ensure proper service registration
  - Update HandlerRegistry to use new handlers
- Dependencies: All new handlers from Phase 3
- Expected Output: DI container using all new components

**Session 4.2**: Remove Adapters [2 hours]
- Description: Remove adapter pattern and use services directly
- Technical Details:
  - Remove StateServiceAdapter usage
  - Remove ResolutionServiceAdapter usage
  - Update all imports to use new services
  - Fix any type mismatches
- Dependencies: New services fully implemented
- Expected Output: No adapter usage in codebase

**Session 4.3**: Integration Test Fixes [3 hours]
- Description: Get all integration tests passing
- Technical Details:
  - Run api/smoke.new.test.ts and fix failures
  - Update test expectations if needed
  - Ensure variable interpolation works E2E
  - Validate all directive types
- Dependencies: Adapters removed, new services wired
- Expected Output: All integration tests green

**Session 4.4**: Cleanup & Documentation [2 hours]
- Description: Remove old code and update docs
- Technical Details:
  - Delete .bak files
  - Remove old handler implementations
  - Update architecture documentation
  - Create migration summary
- Dependencies: All tests passing
- Expected Output: Clean codebase with updated docs

### Exit Criteria
- All tests passing without adapters
- API integration tests at 100%
- Performance benchmarks met
- Final documentation updates:
  - [ ] Remove all references to old architecture from docs
  - [ ] Update all code examples in documentation
  - [ ] Archive migration-specific docs (`_dev/NEWSTATE.md`, etc.)
  - [ ] Create migration retrospective document
  - [ ] Update README with new architecture highlights

---

## DISTANT HORIZON: Future Enhancements

- **Streaming Support**: Process large files incrementally
- **Parallel Processing**: Handle independent directives concurrently
- **Error Recovery**: Partial processing with error boundaries
- **Type Generation**: Generate TypeScript types from Meld schemas

---

## Rolling Updates Log

**Update [Session Date]**:
- Phase Updated: Current State
- Change Description: Initial plan creation
- Rationale: Shifting from ad-hoc fixes to systematic refactor
- Impact on Future Phases: All phases designed around complete migration

**Update [Phase 1 Completion]**:
- Phase Updated: Interface Design & Validation
- Change Description: Completed all Phase 1 sessions with comprehensive deliverables
- Rationale: Established solid foundation for minimal interfaces following AST Knows All
- Deliverables:
  - Service usage analysis showing 3-5x over-engineering
  - Minimal interface designs (StateService: 8 methods vs 50+)
  - Type flow documentation with discriminated unions
  - Validation plan using 70+ AST fixtures
- Key Findings:
  - ResolutionService needs biggest refactor (15+ methods → 4)
  - Most complexity belongs in handlers, not services
  - Adapter pattern working well for gradual migration
- Impact on Future Phases: 
  - Phase 2 should prioritize ResolutionService implementation
  - Variable interpolation fix is blocking integration tests
  - All handlers need ResolutionContext updates

**Update [Phase 2 In Progress]**:
- Phase Updated: Core Services Migration
- Change Description: Implemented StateService and ResolutionService with adapters
- Status:
  - ✅ Feature 2.1: StateService already minimal (no changes needed)
  - ✅ Feature 2.2: ResolutionService minimal implementation complete with tests
  - ✅ ResolutionServiceAdapter created for backward compatibility
  - 🔄 Feature 2.3: Integration validation shows 2/6 API tests passing
- Key Decisions:
  - Using adapter pattern for ResolutionService (like StateService)
  - Postponing variable interpolation fixes to Phase 3 (handler migration)
  - Focusing on forward progress vs perfecting temporary adapter code
- Known Issues:
  - Variable interpolation failing due to context structure mismatches
  - Complex directives (import, add) not fully working
  - These are expected and will be fixed when handlers are properly migrated
- Impact on Future Phases:
  - Phase 3 (Handler Migration) becomes critical for fixing integration tests
  - Adapters will be removed in Phase 4 after all handlers migrated

**Update [Phase 3 Complete, Architecture Issue Found]**:
- Phase Updated: Handler Migration
- Change Description: Migrated all 7 handlers but discovered architectural issue
- Status:
  - ✅ All handlers migrated to new pattern (45/45 unit tests passing)
  - ❌ Handlers doing too much work (executing commands, reading files)
  - ❌ ResolutionService interface too minimal (missing needed methods)
- Architectural Discovery:
  - Initial 4-method ResolutionService interface was too minimal
  - Handlers were violating "AST Knows All" by executing commands directly
  - Updated interface to 8 methods that handlers actually need:
    - resolve, resolveNodes, resolvePath (original)
    - executeCommand, executeCode, readFile (added)
    - extractSection, initialize (original)
- Key Learning:
  - "Minimal" doesn't mean "insufficient" - need right abstraction level
  - Handlers should extract from AST, ResolutionService should execute
  - Command execution, file reading, code eval belong in ResolutionService
- Impact on Current Work:
  - Need to implement new ResolutionService methods
  - Need to update handlers to properly delegate
  - This fixes the architectural alignment before removing adapters

---

## Project Guardrails

- **No Breaking Changes**: All existing tests must pass throughout migration
- **Incremental Progress**: Each session must leave system in working state
- **Type Safety**: All new code must be fully typed with strict TypeScript
- **Test Coverage**: New code must have comprehensive tests
- **AST First**: All decisions should support "AST Knows All" principle