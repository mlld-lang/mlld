# Publishing System Refactor

This directory contains the refactored mlld module publishing system, broken down from the original monolithic `publish.ts` file (1,927 lines) into focused, maintainable modules.

## Architecture Overview

The refactored system follows these key design patterns:

- **Strategy Pattern**: Different publishing methods (Gist, Repository, Private) as pluggable strategies
- **Pipeline Pattern**: Validation steps that can be composed and executed in sequence  
- **Command Pattern**: Interactive decisions as discrete command objects
- **Single Responsibility**: Each module handles one clear concern

## Directory Structure

```
cli/commands/publish/
├── PublishCommand.ts              # Main orchestrator (300 lines)
├── index.ts                       # Clean exports
├── __tests__/                     # Integration tests
│   └── PublishCommand.integration.test.ts
│
├── types/                         # Core type definitions
│   ├── PublishingTypes.ts         # Shared interfaces and types
│   └── PublishingStrategy.ts      # Strategy pattern interfaces
│
├── utils/                         # Utility classes
│   └── ModuleReader.ts            # File reading and parsing (300 lines)
│
├── validation/                    # Validation pipeline
│   ├── ModuleValidator.ts         # Validation orchestrator (200 lines)
│   ├── SyntaxValidator.ts         # AST syntax validation (150 lines)
│   ├── MetadataEnhancer.ts        # Metadata enhancement (250 lines) 
│   ├── ImportValidator.ts         # Import validation (200 lines)
│   └── DependencyValidator.ts     # Runtime dependency checking (200 lines)
│
├── strategies/                    # Publishing strategies
│   ├── GistPublishingStrategy.ts  # GitHub Gist publishing (300 lines)
│   ├── RepoPublishingStrategy.ts  # Repository publishing (300 lines)
│   └── PrivateRepoStrategy.ts     # Private repo publishing (200 lines)
│
└── interaction/                   # Interactive decision points
    ├── InteractivePrompter.ts     # Decision coordinator (200 lines)
    ├── MetadataCommitDecision.ts  # Metadata commit choices (100 lines)
    └── PublishingMethodDecision.ts # Publishing method choices (100 lines)
```

## Key Components

### 1. PublishCommand (Main Orchestrator)

The central coordinator that:
- Manages the overall publishing workflow
- Coordinates between all subsystems
- Handles error recovery and rollback
- Provides the main `publish()` API

```typescript
const publishCommand = new PublishCommand();
await publishCommand.publish(modulePath, options);
```

### 2. Publishing Strategies

Each publishing method is implemented as a strategy:

- **GistPublishingStrategy**: Creates GitHub gists for modules not in repositories
- **RepoPublishingStrategy**: Publishes from public GitHub repositories  
- **PrivateRepoStrategy**: Handles private repository publishing

Strategies implement the `PublishingStrategy` interface:
```typescript
interface PublishingStrategy {
  canHandle(context: PublishContext): boolean;
  execute(context: PublishContext): Promise<PublishResult>;
  rollback?(context: PublishContext): Promise<void>;
}
```

### 3. Validation Pipeline

Modular validation with clear separation of concerns:

- **SyntaxValidator**: AST parsing and reserved word checking
- **ExportValidator**: Enforces explicit `/export { ... }` manifests and verifies exported bindings
- **MetadataEnhancer**: Required field validation and auto-population
- **ImportValidator**: Registry, local, and resolver import policy validation
- **DependencyValidator**: Runtime dependency consistency checking

Modules must describe their public API with `/export { ... }`. The validation pipeline rejects wildcard manifests and exports that do not correspond to `/var`, `/path`, or `/exe` declarations. Import validation now records structured import metadata so later stages can enforce registry policies without re-parsing the module.

### 4. Interactive Decision System

User prompts are abstracted into decision points:

- **MetadataCommitDecision**: Handle metadata changes and git commits
- **PublishingMethodDecision**: Choose between publishing strategies
- **InteractivePrompter**: Orchestrates all decision points

### 5. Module Reading

**ModuleReader** handles all file system operations:
- Module discovery (directory vs file, .mld/.mld.md/.mlld.md)
- Frontmatter parsing and YAML handling
- Interactive frontmatter setup for new modules
- Basic syntax validation

## Integration Points

### Authentication
Uses existing `GitHubAuthService` for OAuth and token management.

### Registry System
Integrates with `RegistryManager` for module submission and PR creation.

### Error Handling
Preserves all existing `MlldError` types and context-aware error messages.

### Git Integration
Maintains all git repository analysis and operation capabilities.

## Benefits of Refactoring

### Code Organization
- **1,927 lines → ~300 lines per module**: Much more manageable
- **Single responsibility**: Each module has one clear purpose
- **Better testability**: Components can be tested in isolation
- **Clearer dependencies**: Explicit interfaces and injection

### Maintainability  
- **Easier debugging**: Issues isolated to specific modules
- **Simpler feature addition**: Clear extension points
- **Better code review**: Smaller, focused changes
- **Improved onboarding**: Clearer code organization

### Extensibility
- **New publishing methods**: Add new strategies easily
- **New validation rules**: Add validation steps to pipeline
- **New interactive flows**: Add decision points to prompter
- **Custom workflows**: Compose components differently

## Backward Compatibility

The refactored system maintains 100% backward compatibility:

- Same public API: `publish(modulePath, options)`
- Same option interface: All `PublishOptions` fields preserved  
- Same error types: All `MlldError` classes maintained
- Same user experience: Identical prompts and workflows

## Usage

### Basic Publishing
```typescript
import { PublishCommand } from './cli/commands/publish';

const publishCommand = new PublishCommand();
await publishCommand.publish('./my-module.mld');
```

### With Options
```typescript
await publishCommand.publish('./my-module.mld', {
  dryRun: true,
  verbose: true,
  useGist: true
});
```

### Custom Strategy
```typescript
import { PublishCommand, CustomStrategy } from './cli/commands/publish';

const publishCommand = new PublishCommand();
publishCommand.addStrategy(new CustomStrategy());
```

## Testing

The refactored system includes comprehensive integration tests:

```bash
npm test cli/commands/publish/__tests__/
```

Tests cover:
- Module reading and parsing
- Validation pipeline execution  
- Strategy selection logic
- Interactive decision flows
- Error handling scenarios
- Backward compatibility

## Migration Notes

### For Developers
- Import from new module structure: `import { PublishCommand } from './cli/commands/publish'`
- Extend validation: Add new `ValidationStep` implementations
- Add publishing methods: Implement new `PublishingStrategy` classes
- Customize prompts: Add new `DecisionPoint` implementations

### For Integration
- CLI integration unchanged: Same command interface
- API integration unchanged: Same programmatic interface  
- Configuration unchanged: Same option handling
- Error handling unchanged: Same error types and messages

## Performance

The refactored system maintains identical performance characteristics:
- Same number of API calls
- Same file system operations
- Same git commands
- Same network requests

Modular structure adds negligible overhead while significantly improving maintainability.

## Future Enhancements

The modular architecture enables easy future improvements:

- **Parallel validation**: Run validation steps concurrently
- **Strategy caching**: Cache strategy results for repeated operations
- **Enhanced rollback**: More sophisticated state management
- **Plugin system**: External plugins for custom workflows
- **Configuration**: File-based strategy and validation configuration