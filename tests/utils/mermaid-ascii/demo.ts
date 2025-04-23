/**
 * Demo of mermaid-ascii wrapper
 * 
 * This file contains examples of how to use the mermaid-ascii wrapper.
 * Run it with: npx ts-node tests/utils/mermaid-ascii/demo.ts
 */

import { mermaidToAscii, getBinaryVersion, isBinaryAvailable } from '@tests/utils/mermaid-ascii/index';
import { AsciiVisualizationAdapter, enhanceWithAsciiVisualization } from '@tests/utils/mermaid-ascii/integration';
import { VisualizationConfig } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService';

// Example: Basic usage of mermaid-ascii converter
async function runBasicDemo() {
  console.log('==== Basic Usage Demo ====');
  
  // Check if the binary is available
  const available = await isBinaryAvailable();
  console.log('Binary available:', available);
  
  if (available) {
    const version = await getBinaryVersion();
    console.log('Binary version:', version);
  }
  
  // Simple flowchart example
  const flowchart = `
graph TD
  A[Start] --> B{Is it?}
  B -->|Yes| C[OK]
  C --> D[Rethink]
  D --> B
  B -->|No| E[End]
`;

  console.log('\nFlowchart example:');
  try {
    const asciiArt = await mermaidToAscii(flowchart, { width: 80 });
    console.log(asciiArt);
  } catch (error) {
    console.error('Error converting flowchart:', error);
    console.log('Using mock output for demonstration:');
    console.log(`
    +-------+     +--------+     +----+     +---------+
    | Start | --> | Is it? | --> | OK | --> | Rethink |
    +-------+     +--------+     +----+     +---------+
                      |                          |
                      |                          |
                      v                          |
                      |                          |
                      |                          |
                      +--------------------------+
                      |
                      v
                   +-----+
                   | End |
                   +-----+
    `);
  }
  
  // Sequence diagram example
  const sequenceDiagram = `
sequenceDiagram
  participant Browser
  participant Server
  Browser->>Server: GET /api/data
  Server-->>Browser: Response with data
  Browser->>Browser: Process data
  Browser->>Server: POST /api/update
  Server-->>Browser: Update confirmation
`;

  console.log('\nSequence diagram example:');
  try {
    const asciiArt = await mermaidToAscii(sequenceDiagram, { width: 80 });
    console.log(asciiArt);
  } catch (error) {
    console.error('Error converting sequence diagram:', error);
    console.log('Using mock output for demonstration:');
    console.log(`
    Browser                 Server
    -------                 ------
       |                       |
       | GET /api/data         |
       |---------------------->|
       |                       |
       |   Response with data  |
       |<----------------------|
       |                       |
       |---+                   |
       |   | Process data      |
       |<--+                   |
       |                       |
       | POST /api/update      |
       |---------------------->|
       |                       |
       | Update confirmation   |
       |<----------------------|
       |                       |
    `);
  }
}

// Example: Integration with StateVisualizationService
async function runVisualizationDemo() {
  console.log('\n==== Visualization Service Integration Demo ====');
  
  // Create mock visualization service
  const mockVisualizationService = {
    generateHierarchyView: (stateId: string, config: VisualizationConfig) => {
      return `graph TD
  State_${stateId}[State ${stateId}] --> State_child1[Child 1]
  State_${stateId} --> State_child2[Child 2]
  State_child1 --> State_grandchild[Grandchild]`;
    },
    generateTransitionDiagram: (stateId: string, config: VisualizationConfig) => {
      return `graph LR
  State_A[State A] -->|Event 1| State_B[State B]
  State_B -->|Event 2| State_C[State C]
  State_C -->|Event 3| State_A`;
    },
    generateRelationshipGraph: (stateIds: string[], config: VisualizationConfig) => {
      return `graph TD
  State_1[State 1] --> State_2[State 2]
  State_2 --> State_3[State 3]
  State_1 -.-> State_3`;
    },
    generateTimeline: (stateIds: string[], config: VisualizationConfig) => {
      return `gantt
  title State Timeline
  dateFormat s
  State 1 :a1, 0, 30s
  State 2 :a2, after a1, 45s
  State 3 :a3, after a2, 30s`;
    },
    visualizeResolutionPathTimeline: (variableName: string, stateId: string, config: any) => {
      return `sequenceDiagram
  participant State_${stateId} as State ${stateId}
  participant P as Parent
  participant C as Context
  State_${stateId}->>P: Resolve ${variableName}
  P->>C: Look up ${variableName}
  C-->>P: Value found
  P-->>State_${stateId}: Return value`;
    },
    // Add other required methods to satisfy the interface
    getMetrics: () => ({ totalStates: 0, statesByType: {}, averageTransformationsPerState: 0, maxTransformationChainLength: 0, averageChildrenPerState: 0, maxTreeDepth: 0, operationFrequency: {} }),
    exportStateGraph: () => '',
    visualizeContextHierarchy: () => '',
    visualizeVariablePropagation: () => '',
    visualizeContextsAndVariableFlow: () => ''
  };
  
  // Create the enhanced service
  const enhancedService = enhanceWithAsciiVisualization(mockVisualizationService);
  
  // Example state ID
  const stateId = 'example-123';
  
  console.log('\nHierarchy View:');
  try {
    const asciiArt = await enhancedService.generateAsciiHierarchyView(stateId, { width: 80 });
    console.log(asciiArt);
  } catch (error) {
    console.error('Error generating hierarchy view:', error);
  }
  
  console.log('\nTransition Diagram:');
  try {
    const asciiArt = await enhancedService.generateAsciiTransitionDiagram(stateId, { width: 80 });
    console.log(asciiArt);
  } catch (error) {
    console.error('Error generating transition diagram:', error);
  }
  
  console.log('\nVariable Resolution:');
  try {
    const asciiArt = await enhancedService.generateAsciiVariableResolution(stateId, 'myVariable', { width: 80 });
    console.log(asciiArt);
  } catch (error) {
    console.error('Error generating variable resolution:', error);
  }
}

// Run the demos
async function runAllDemos() {
  await runBasicDemo();
  await runVisualizationDemo();
}

runAllDemos().catch(console.error);