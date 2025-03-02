# Mermaid ASCII Wrapper

> Note: This has *not* been incorporated into StateVisualizationService yet.

A utility for converting Mermaid diagrams to ASCII art for terminal-friendly visualization.

## Features

- Convert Mermaid diagrams to ASCII art
- Integrate with the StateVisualizationService to provide ASCII rendering capabilities
- Command-line interface for processing Mermaid diagrams
- Support for various diagram types (flowcharts, sequence diagrams, etc.)
- Customizable output (width, height, color)

## Installation

The wrapper uses a binary executable for the actual conversion. The binary is automatically downloaded and installed when needed.

## Usage

### Basic Usage

```typescript
import { mermaidToAscii } from './utils/mermaid-ascii';

const diagram = `
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Success]
  B -->|No| D[Failure]
`;

async function renderDiagram() {
  const asciiArt = await mermaidToAscii(diagram, { width: 80, color: true });
  console.log(asciiArt);
}

renderDiagram();
```

### Integration with StateVisualizationService

```typescript
import { enhanceWithAsciiVisualization } from './utils/mermaid-ascii/integration';
import { StateVisualizationService } from './utils/debug/StateVisualizationService/StateVisualizationService';

// Create a visualization service
const visualizationService = new StateVisualizationService(/* dependencies */);

// Enhance it with ASCII capabilities
const enhancedService = enhanceWithAsciiVisualization(visualizationService);

// Use the enhanced service
async function visualizeState(stateId: string) {
  const asciiHierarchy = await enhancedService.generateAsciiHierarchyView(stateId, { width: 100 });
  console.log(asciiHierarchy);
}
```

### Command-Line Interface

The package includes a simple CLI example that demonstrates how to use the wrapper in a command-line tool:

```bash
npx ts-node cli-example.ts <input-file> [--output ascii|mermaid] [--width <width>]
```

Example:

```bash
npx ts-node cli-example.ts sample-diagram.mmd --output ascii --width 80
```

## API

### Core Functions

- `mermaidToAscii(mermaidContent: string, options?: MermaidAsciiOptions): Promise<string>`
- `isBinaryAvailable(): Promise<boolean>`
- `getBinaryVersion(): Promise<string>`
- `getBinaryPath(): string`
- `ensureBinaryAvailable(): Promise<boolean>`

### Integration Functions

- `enhanceWithAsciiVisualization(visualizationService: IStateVisualizationService): IStateVisualizationService & { ... }`
- `createAsciiRenderer(options?: AsciiVisualizationOptions): (diagram: string, title?: string) => Promise<string>`

### Options

```typescript
interface MermaidAsciiOptions {
  width?: number;
  height?: number;
  color?: boolean;
}

interface AsciiVisualizationOptions extends MermaidAsciiOptions {
  includeHeader?: boolean;
}
```

## Examples

See the following files for usage examples:

- `demo.ts`: Demonstrates basic usage and integration with visualization services
- `cli-example.ts`: Shows how to create a command-line tool using the wrapper
- `cli-integration-example.ts`: Demonstrates integration with CLI commands for debugging

## Requirements

- Node.js 14 or later
- TypeScript 4.0 or later

## License

MIT