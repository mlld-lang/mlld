import { IStateVisualizationService, VisualizationConfig, StateMetrics, NodeStyle, EdgeStyle, ContextVisualizationConfig } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService';
import { IStateHistoryService, StateOperation, StateTransformation } from '@tests/utils/debug/StateHistoryService/IStateHistoryService';
import type { IStateTrackingService, StateMetadata, StateRelationship, ContextBoundary, VariableCrossing, ContextHierarchyInfo } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import { injectable, inject } from 'tsyringe';

/**
 * @package
 * Implementation of state visualization service.
 */
@injectable()
export class StateVisualizationService implements IStateVisualizationService {
  constructor(
    @inject('IStateHistoryService') private historyService: IStateHistoryService,
    @inject('IStateTrackingService') private trackingService: IStateTrackingService,
  ) {}

  private generateMermaidGraph(nodes: Map<string, StateMetadata>, edges: Array<{ sourceId: string, targetId: string, type: string }>, config: VisualizationConfig): string {
    const lines: string[] = ['graph TD;'];
    
    // Add nodes with styling
    nodes.forEach((metadata, id) => {
      const style = this.getNodeStyle(metadata, config);
      const styleStr = `style="${style.shape},${style.color}"`;
      const label = config.includeMetadata 
        ? `${id}[${metadata.source}${metadata.filePath ? `\\n${metadata.filePath}` : ''}]`
        : `${id}[${metadata.source}]`;
      lines.push(`    ${label} ${styleStr};`);
    });

    // Add edges with styling
    edges.forEach(edge => {
      const style = this.getEdgeStyle({ targetId: edge.targetId, type: edge.type as any, sourceId: edge.sourceId } as StateRelationship, config);
      const styleStr = `style="${style.style},${style.color}"`;
      const label = edge.type;
      const source = edge.sourceId || 'unknown_source';
      lines.push(`    ${source} -->|${label}| ${edge.targetId};`);
      lines.push(`    linkStyle ${lines.length - 2} stroke:${style.color},stroke-width:2px,${style.style};`);
    });

    return lines.join('\n');
  }

  private generateDotGraph(nodes: Map<string, StateMetadata>, edges: Array<{ sourceId: string, targetId: string, type: string }>, config: VisualizationConfig): string {
    const lines: string[] = ['digraph G {'];
    
    // Add nodes with styling
    nodes.forEach((metadata, id) => {
      const style = this.getNodeStyle(metadata, config);
      const label = config.includeMetadata
        ? `${id}\\n${metadata.source}${metadata.filePath ? `\\n${metadata.filePath}` : ''}`
        : `${id}\\n${metadata.source}`;
      const attrs = [
        `label="${label}"`,
        `shape="${style.shape}"`,
        `color="${style.color}"`,
      ];
      if (style.tooltip) {
        attrs.push(`tooltip="${style.tooltip}"`);
      }
      lines.push(`    "${id}" [${attrs.join(',')}];`);
    });

    // Add edges with styling
    edges.forEach(edge => {
      const style = this.getEdgeStyle({ targetId: edge.targetId, type: edge.type as any, sourceId: edge.sourceId } as StateRelationship, config);
      const attrs = [
        `style="${style.style}"`,
        `color="${style.color}"`,
        `label="${edge.type}"`,
      ];
      if (style.tooltip) {
        attrs.push(`tooltip="${style.tooltip}"`);
      }
      const source = edge.sourceId || 'unknown_source';
      lines.push(`    "${source}" -> "${edge.targetId}" [${attrs.join(',')}];`);
    });

    lines.push('}');
    return lines.join('\n');
  }

  private getNodeStyle(metadata: StateMetadata, config: VisualizationConfig): NodeStyle {
    if (config.styleNodes) {
      return config.styleNodes(metadata);
    }

    // Default styling based on state type
    const style: NodeStyle = {
      shape: 'box',
      color: '#000000',
    };

    switch (metadata.source) {
      case 'new':
        style.color = '#4CAF50';
        break;
      case 'clone':
        style.color = '#2196F3';
        break;
      case 'merge':
        style.shape = 'diamond';
        style.color = '#9C27B0';
        break;
      case 'implicit':
        style.color = '#757575';
        break;
    }

    return style;
  }

  private getEdgeStyle(relationship: StateRelationship, config: VisualizationConfig): EdgeStyle {
    if (config.styleEdges) {
      return config.styleEdges(relationship);
    }

    // Default styling based on relationship type
    const style: EdgeStyle = {
      style: 'solid',
      color: '#000000',
    };

    switch (relationship.type) {
      case 'parent-child':
        style.style = 'solid';
        break;
      case 'merge-source':
        style.style = 'dashed';
        break;
      case 'merge-target':
        style.style = 'dotted';
        break;
    }

    return style;
  }

  public generateHierarchyView(rootStateId: string, config: VisualizationConfig): string {
    // Validate format first
    if (!['mermaid', 'dot', 'json'].includes(config.format)) {
      throw new Error(`Unsupported format: ${config.format}`);
    }

    const lineage = this.trackingService.getStateLineage(rootStateId);
    const descendants = this.trackingService.getStateDescendants(rootStateId);
    const allStateIds = new Set([...lineage, ...descendants]);

    const nodes = new Map<string, StateMetadata>();
    const edges: Array<{ sourceId: string, targetId: string, type: string }> = [];

    allStateIds.forEach(stateId => {
      const metadata = this.trackingService.getStateMetadata(stateId);
      if (metadata) {
        nodes.set(stateId, metadata);
        // Infer parent-child from metadata.parentId if it exists
        if (metadata.parentId && allStateIds.has(metadata.parentId)) {
           // Avoid duplicate edges if already added from child perspective
           if (!edges.some(e => e.sourceId === metadata.parentId && e.targetId === stateId)) {
               edges.push({ sourceId: metadata.parentId, targetId: stateId, type: 'parent-child' });
           }
        }
      }
    });

    // Generate visualization in requested format
    switch (config.format) {
      case 'mermaid':
        return this.generateMermaidGraph(nodes, edges.map(e => ({...e, sourceId: e.sourceId || 'unknown'})), config);
      case 'dot':
        return this.generateDotGraph(nodes, edges.map(e => ({...e, sourceId: e.sourceId || 'unknown'})), config);
      case 'json':
        return JSON.stringify({
          nodes: Array.from(nodes.values())
                 .filter(metadata => metadata && metadata.id) // Ensure metadata and id exist
                 .map(metadata => ({ ...metadata })),
          edges, // Output the reconstructed edges
        }, null, 2);
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }
  }

  public generateTransitionDiagram(stateId: string, config: VisualizationConfig): string {
    const transformations = this.historyService.getTransformationChain(stateId);
    
    if (transformations.length === 0) {
      return '';
    }

    switch (config.format) {
      case 'mermaid':
        return this.generateMermaidTransitionDiagram(transformations, config);
      case 'dot':
        return this.generateDotTransitionDiagram(transformations, config);
      case 'json':
        return JSON.stringify(transformations, null, 2);
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }
  }

  private generateMermaidTransitionDiagram(transformations: StateTransformation[], config: VisualizationConfig): string {
    const lines: string[] = ['graph LR;']; // Use LR for left-to-right transitions

    // Helper to format value display (limited length for mermaid)
    const formatValue = (value: unknown): string => {
        if (value === undefined || value === null) return 'null/undefined';
        const str = JSON.stringify(value);
        // Limit length to avoid overly large nodes in Mermaid
        const maxLength = 50;
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    };

    transformations.forEach((transform, index) => {
        const beforeId = `state_${index}_before`;
        const afterId = `state_${index}_after`;
        const operation = transform.operation || 'unknown_op';

        // Node for state before transformation
        lines.push(`    ${beforeId}["Before: ${formatValue(transform.before)}"];`);

        // Node for state after transformation
        lines.push(`    ${afterId}["After: ${formatValue(transform.after)}"];`);

        // Edge representing the transformation
        const edgeLabel = config.includeTimestamps ? `${operation}\n${transform.timestamp}` : operation;
        lines.push(`    ${beforeId} -->|${edgeLabel}| ${afterId};`);

        // Basic styling (can be enhanced with config.styleNodes/Edges)
        // Note: Styling individual nodes in Mermaid sequence/graph is limited.
    });

    return lines.join('\n');
  }

  private generateDotTransitionDiagram(transformations: StateTransformation[], config: VisualizationConfig): string {
    const lines: string[] = ['digraph G {'];
    lines.push('    rankdir=LR;'); // Left to right layout
    
    // Helper to format value display
    const formatValue = (value: unknown): string => {
      if (typeof value === 'object' && value !== null) {
        return Object.entries(value as Record<string, unknown>)
          .map(([key, val]) => {
            if (Array.isArray(val)) {
              return `${key}: [${val.join(',')}]`;
            } else if (typeof val === 'object' && val !== null) {
              return Object.entries(val as Record<string, unknown>)
                .map(([k, v]) => Array.isArray(v) ? `${key}.${k}: [${v.join(',')}]` : `${key}.${k}: ${v}`)
                .join('\\n');
            }
            return `${key}: ${val}`;
          })
          .join('\\n');
      }
      return String(value);
    };

    // Add nodes and transitions
    transformations.forEach((transform, index) => {
      const beforeId = `state_${index}`;
      const afterId = `state_${index + 1}`;
      
      // Add before state
      const beforeLabel = formatValue(transform.before);
      const beforeStyle = this.getNodeStyle({ source: transform.source } as StateMetadata, config);
      lines.push(`    "${beforeId}" [label="${beforeLabel}",shape="${beforeStyle.shape}",color="${beforeStyle.color}"];`);
      
      // Add after state
      const afterLabel = formatValue(transform.after);
      const afterStyle = this.getNodeStyle({ source: transform.source } as StateMetadata, config);
      lines.push(`    "${afterId}" [label="${afterLabel}",shape="${afterStyle.shape}",color="${afterStyle.color}"];`);
      
      // Add transition
      const transitionLabel = config.includeTimestamps
        ? `${transform.operation}\\n${transform.timestamp}`
        : transform.operation;
      lines.push(`    "${beforeId}" -> "${afterId}" [label="${transitionLabel}"];`);
    });

    lines.push('}');
    return lines.join('\n');
  }

  public generateRelationshipGraph(stateIds: string[], config: VisualizationConfig): string {
    const nodes = new Map<string, StateMetadata>();
    const edges: Array<{ sourceId: string, targetId: string, type: string }> = [];
    const processedStates = new Set<string>();

    const processState = (stateId: string) => {
      if (processedStates.has(stateId)) return;
      processedStates.add(stateId);

      const metadata = this.trackingService.getStateMetadata(stateId);
      if (metadata) {
        nodes.set(stateId, metadata);
        // Add parent relationship if parent is in the set or processed
        if (metadata.parentId && (stateIds.includes(metadata.parentId) || processedStates.has(metadata.parentId))) {
             if (!edges.some(e => e.sourceId === metadata.parentId && e.targetId === stateId)) {
                 edges.push({ sourceId: metadata.parentId, targetId: stateId, type: 'parent-child' });
                 // Process parent only if it was in the original requested list
                 if (stateIds.includes(metadata.parentId)) {
                    processState(metadata.parentId);
                 }
             }
        }
      }
      
      // Find children by checking other states' parentId
      const allStatesData = this.trackingService.getAllStates();
      allStatesData.forEach(potentialChild => {
          if (potentialChild.parentId === stateId && (stateIds.includes(potentialChild.id) || processedStates.has(potentialChild.id))) {
               if (!edges.some(e => e.sourceId === stateId && e.targetId === potentialChild.id)) {
                    edges.push({ sourceId: stateId, targetId: potentialChild.id, type: 'parent-child' });
                    // Process child only if it was in the original requested list
                    if (stateIds.includes(potentialChild.id)) {
                        processState(potentialChild.id);
                    }
               }
          }
      });
      
      // TODO: Add logic to infer merge relationships if needed, potentially using historyService or contextBoundaries
    };

    stateIds.forEach(stateId => processState(stateId));

    switch (config.format) {
      case 'mermaid':
         return this.generateMermaidRelationshipGraph(nodes, edges.map(e => ({...e, sourceId: e.sourceId || 'unknown'})), config);
      case 'dot':
         return this.generateDotRelationshipGraph(nodes, edges.map(e => ({...e, sourceId: e.sourceId || 'unknown'})), config);
      case 'json':
        return JSON.stringify({
          nodes: Array.from(nodes.values())
                 .filter(metadata => metadata && metadata.id)
                 .map(metadata => ({ ...metadata })),
          edges,
        }, null, 2);
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }
  }

  private generateMermaidRelationshipGraph(
    nodes: Map<string, StateMetadata>,
    edges: Array<{ sourceId: string, targetId: string, type: string }>,
    config: VisualizationConfig
  ): string {
    const lines: string[] = ['graph TD;'];
    
    // Add nodes with styling
    nodes.forEach((metadata, id) => {
      const style = this.getNodeStyle(metadata, config);
      const label = config.includeMetadata 
        ? `${id}[${metadata.source}${metadata.filePath ? `\\n${metadata.filePath}` : ''}]`
        : `${id}[${metadata.source}]`;
      lines.push(`    ${label};`);
      lines.push(`    style ${id} fill:${style.color},stroke:${style.color},stroke-width:2px,${style.shape};`);
    });

    // Add edges with styling
    edges.forEach(edge => {
      const style = this.getEdgeStyle({ targetId: edge.targetId, type: edge.type as any, sourceId: edge.sourceId } as StateRelationship, config);
      const sourceId = edge.sourceId || 'unknown';
      const label = config.includeMetadata ? edge.type : '';
      lines.push(`    ${sourceId} -->|${label}| ${edge.targetId};`);
      lines.push(`    linkStyle ${lines.length - 2} stroke:${style.color},stroke-width:2px,${style.style};`);
    });

    return lines.join('\n');
  }

  private generateDotRelationshipGraph(
    nodes: Map<string, StateMetadata>,
    edges: Array<{ sourceId: string, targetId: string, type: string }>,
    config: VisualizationConfig
  ): string {
    const lines: string[] = ['digraph G {'];
    lines.push('    rankdir=TB;'); // Top to bottom layout
    
    // Add nodes with styling
    nodes.forEach((metadata, id) => {
      const style = this.getNodeStyle(metadata, config);
      const label = config.includeMetadata
        ? `${id}\\n${metadata.source}${metadata.filePath ? `\\n${metadata.filePath}` : ''}`
        : `${id}\\n${metadata.source}`;
      const attrs = [
        `label="${label}"`,
        `shape="${style.shape}"`,
        `color="${style.color}"`,
        `style="filled"`,
        `fillcolor="${style.color}22"`, // Add transparency to fill color
      ];
      if (style.tooltip) {
        attrs.push(`tooltip="${style.tooltip}"`);
      }
      lines.push(`    "${id}" [${attrs.join(',')}];`);
    });

    // Add edges with styling
    edges.forEach(edge => {
      const style = this.getEdgeStyle({ targetId: edge.targetId, type: edge.type as any, sourceId: edge.sourceId } as StateRelationship, config);
      const sourceId = edge.sourceId || 'unknown';
      const attrs = [
        `style="${style.style}"`,
        `color="${style.color}"`,
        `penwidth=2`,
      ];
      if (config.includeMetadata) {
        attrs.push(`label="${edge.type}"`);
      }
      if (style.tooltip) {
        attrs.push(`tooltip="${style.tooltip}"`);
      }
      lines.push(`    "${sourceId}" -> "${edge.targetId}" [${attrs.join(',')}];`);
    });

    lines.push('}');
    return lines.join('\n');
  }

  public generateTimeline(stateIds: string[], config: VisualizationConfig): string {
    const operations = stateIds.flatMap(id => this.historyService.getOperationHistory(id));
    operations.sort((a, b) => a.timestamp - b.timestamp);

    if (operations.length === 0) {
      return '';
    }

    switch (config.format) {
      case 'mermaid':
        return this.generateMermaidTimeline(operations, config);
      case 'dot':
        return this.generateDotTimeline(operations, config);
      case 'json':
        return JSON.stringify(operations, null, 2);
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }
  }

  private generateMermaidTimeline(operations: StateOperation[], config: VisualizationConfig): string {
    const lines: string[] = [
      'gantt',
      '    dateFormat X',
      '    axisFormat %s',
      '',
    ];

    // Group operations by state
    const stateGroups = new Map<string, StateOperation[]>();
    operations.forEach(op => {
      if (!stateGroups.has(op.stateId)) {
        stateGroups.set(op.stateId, []);
      }
      stateGroups.get(op.stateId)!.push(op);
    });

    // Add sections for each state
    stateGroups.forEach((stateOps, stateId) => {
      lines.push(`    section ${stateId}`);
      
      stateOps.forEach((op, index) => {
        const duration = index < stateOps.length - 1 ? stateOps[index + 1].timestamp - op.timestamp : 1000;
        const taskId = `${stateId}_${op.type}_${op.timestamp}`;
        const label = config.includeTimestamps
          ? `${op.type} (${op.timestamp})`
          : op.type;
        
        lines.push(`    ${label} :${taskId}, ${op.timestamp}, ${duration}ms`);
      });
      
      lines.push('');
    });

    return lines.join('\n');
  }

  private generateDotTimeline(operations: StateOperation[], config: VisualizationConfig): string {
    const lines: string[] = ['digraph G {'];
    lines.push('    rankdir=LR;');
    
    // Add nodes for each operation
    operations.forEach((op, index) => {
      const label = config.includeTimestamps
        ? `${op.type}\\n${op.timestamp}`
        : op.type;
      lines.push(`    "op_${index}" [label="${label}"];`);
      
      // Add edge to next operation if it exists
      if (index < operations.length - 1) {
        lines.push(`    "op_${index}" -> "op_${index + 1}";`);
      }
    });
    
    lines.push('}');
    return lines.join('\n');
  }

  public getMetrics(timeRange?: { start: number; end: number }): StateMetrics {
    // Get all operations within time range
    const operations = this.historyService.queryHistory({
      timeRange,
    });

    // Calculate metrics
    const metrics: StateMetrics = {
      totalStates: 0,
      statesByType: {},
      averageTransformationsPerState: 0,
      maxTransformationChainLength: 0,
      averageChildrenPerState: 0,
      maxTreeDepth: 0,
      operationFrequency: {},
    };

    if (operations.length === 0) {
      return metrics;
    }

    // Count unique states and their types
    const stateIds = new Set<string>();
    const stateTypes = new Map<string, number>();
    const transformationsPerState = new Map<string, number>();
    const operationCounts = new Map<string, number>();

    operations.forEach(op => {
      // Count states
      stateIds.add(op.stateId);

      // Count state types
      if ((op.type === 'create' || op.type === 'merge') && op.source) {
        stateTypes.set(op.source, (stateTypes.get(op.source) || 0) + 1);
      }

      // Count transformations per state
      if (op.type === 'transform') {
        transformationsPerState.set(op.stateId, (transformationsPerState.get(op.stateId) || 0) + 1);
      }

      // Count operation frequencies
      operationCounts.set(op.type, (operationCounts.get(op.type) || 0) + 1);
    });

    // Calculate tree depth metrics
    const stateLineages = Array.from(stateIds)
      .map(id => this.trackingService.getStateLineage(id))
      .filter(lineage => lineage && lineage.length > 0); // Filter out undefined or empty lineages

    const maxDepth = stateLineages.length > 0
      ? Math.max(...stateLineages.map(lineage => lineage.length))
      : 0;
    
    // Calculate children per state
    const childrenCounts = new Map<string, number>();
    stateLineages.forEach(lineage => {
      if (lineage.length > 1) {
        const parentId = lineage[lineage.length - 2];
        childrenCounts.set(parentId, (childrenCounts.get(parentId) || 0) + 1);
      }
    });

    // Set metrics
    metrics.totalStates = stateIds.size;
    metrics.statesByType = Object.fromEntries(stateTypes);
    metrics.averageTransformationsPerState = stateIds.size > 0
      ? Array.from(transformationsPerState.values()).reduce((a, b) => a + b, 0) / stateIds.size
      : 0;
    metrics.maxTransformationChainLength = transformationsPerState.size > 0
      ? Math.max(...Array.from(transformationsPerState.values()))
      : 0;
    metrics.averageChildrenPerState = childrenCounts.size > 0
      ? Array.from(childrenCounts.values()).reduce((a, b) => a + b, 0) / childrenCounts.size
      : 0;
    metrics.maxTreeDepth = maxDepth;
    metrics.operationFrequency = Object.fromEntries(operationCounts);

    return metrics;
  }

  public exportStateGraph(config: VisualizationConfig): string {
    // TODO: Implement complete graph export
    return '';
  }

  /**
   * Generate a context hierarchy visualization showing context boundaries
   * @param rootStateId - The root state to start visualization from
   * @param config - Context visualization configuration
   * @returns Context hierarchy visualization in the specified format
   */
  public visualizeContextHierarchy(rootStateId: string, config: ContextVisualizationConfig): string {
    // Get the hierarchy information from the tracking service
    const hierarchyInfo = this.trackingService.getContextHierarchy(rootStateId);
    
    // Generate visualization based on the format
    switch (config.format) {
      case 'mermaid':
        return this.generateMermaidContextHierarchy(hierarchyInfo, config);
      case 'dot':
        return this.generateDotContextHierarchy(hierarchyInfo, config);
      case 'json':
        return JSON.stringify(hierarchyInfo, null, 2);
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }
  }

  /**
   * Generate a variable propagation visualization showing how variables move across contexts
   * @param variableName - The name of the variable to track propagation for
   * @param rootStateId - Optional root state to limit visualization scope
   * @param config - Context visualization configuration
   * @returns Variable propagation visualization in the specified format
   */
  public visualizeVariablePropagation(variableName: string, rootStateId?: string, config?: ContextVisualizationConfig): string {
    const defaultConfig: ContextVisualizationConfig = {
      format: 'mermaid',
      includeVars: true,
      filterToRelevantVars: true,
      includeTimestamps: true,
      includeFilePaths: true
    };
    
    const mergedConfig = { ...defaultConfig, ...config };
    
    // Get all states or limit to the subtree from rootStateId
    let states: StateMetadata[] = [];
    
    if (rootStateId) {
      const hierarchyInfo = this.trackingService.getContextHierarchy(rootStateId);
      states = hierarchyInfo.states;
    } else {
      states = this.trackingService.getAllStates();
    }
    
    // Get all variable crossings for the specified variable
    const allCrossings = states.flatMap(state => 
      this.trackingService.getVariableCrossings(state.id)
    );
    
    // Filter to just the specified variable
    const variableCrossings = allCrossings.filter(
      crossing => crossing.variableName === variableName
    );
    
    // If there are no crossings, return a simple message
    if (variableCrossings.length === 0) {
      return `// No variable crossings found for variable "${variableName}"`;
    }
    
    // Generate visualization based on the format
    switch (mergedConfig.format) {
      case 'mermaid':
        return this.generateMermaidVariablePropagation(variableName, states, variableCrossings, mergedConfig);
      case 'dot':
        return this.generateDotVariablePropagation(variableName, states, variableCrossings, mergedConfig);
      case 'json':
        return JSON.stringify({ variableName, states, crossings: variableCrossings }, null, 2);
      default:
        throw new Error(`Unsupported format: ${mergedConfig.format}`);
    }
  }

  /**
   * Generate a combined context and variable flow visualization
   * @param rootStateId - The root state to start visualization from
   * @param config - Context visualization configuration
   * @returns Combined context and variable flow visualization
   */
  public visualizeContextsAndVariableFlow(rootStateId: string, config: ContextVisualizationConfig): string {
    // Get the hierarchy information from the tracking service
    const hierarchyInfo = this.trackingService.getContextHierarchy(rootStateId);
    
    // Generate visualization based on the format
    switch (config.format) {
      case 'mermaid':
        return this.generateMermaidContextsAndFlow(hierarchyInfo, config);
      case 'dot':
        return this.generateDotContextsAndFlow(hierarchyInfo, config);
      case 'json':
        return JSON.stringify(hierarchyInfo, null, 2);
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }
  }

  /**
   * Generate a resolution path timeline visualization for a specific variable
   * @param variableName - The name of the variable to track resolution for
   * @param rootStateId - Optional root state to limit visualization scope
   * @param config - Context visualization configuration
   * @returns Resolution path timeline visualization
   */
  public visualizeResolutionPathTimeline(variableName: string, rootStateId?: string, config?: ContextVisualizationConfig): string {
    const defaultConfig: ContextVisualizationConfig = {
      format: 'mermaid',
      includeVars: true,
      includeTimestamps: true,
      includeFilePaths: true
    };
    
    const mergedConfig = { ...defaultConfig, ...config };
    
    // Get all states or limit to the subtree from rootStateId
    let states: StateMetadata[] = [];
    
    if (rootStateId) {
      const hierarchyInfo = this.trackingService.getContextHierarchy(rootStateId);
      states = hierarchyInfo.states;
    } else {
      states = this.trackingService.getAllStates();
    }
    
    // Get all variable crossings for the specified variable
    const allCrossings = states.flatMap(state => 
      this.trackingService.getVariableCrossings(state.id)
    );
    
    // Filter to just the specified variable
    const variableCrossings = allCrossings.filter(
      crossing => crossing.variableName === variableName
    );
    
    // If there are no crossings, return a simple message
    if (variableCrossings.length === 0) {
      return `// No variable crossings found for variable "${variableName}"`;
    }
    
    // Generate visualization based on the format
    switch (mergedConfig.format) {
      case 'mermaid':
        return this.generateMermaidResolutionTimeline(variableName, states, variableCrossings, mergedConfig);
      case 'dot':
        return this.generateDotResolutionTimeline(variableName, states, variableCrossings, mergedConfig);
      case 'json':
        return JSON.stringify({ variableName, states, crossings: variableCrossings }, null, 2);
      default:
        throw new Error(`Unsupported format: ${mergedConfig.format}`);
    }
  }

  /**
   * Generate a Mermaid diagram for context hierarchy
   * @private
   */
  private generateMermaidContextHierarchy(hierarchyInfo: ContextHierarchyInfo, config: ContextVisualizationConfig): string {
    const { states, boundaries } = hierarchyInfo;
    
    let mermaid = 'graph TD\n';
    
    // Add states as nodes
    states.forEach(state => {
      const label = this.formatStateLabel(state, config);
      mermaid += `  ${state.id}["${label}"]\n`;
      mermaid += `  style ${state.id} ${this.getContextNodeStyle(state, config)}\n`;
    });
    
    // Add boundaries as edges
    boundaries.forEach(boundary => {
      const style = this.getContextBoundaryStyle(boundary, config);
      
      let label = '';
      if (config.includeBoundaryTypes) {
        label = ` |${boundary.boundaryType}|`;
      }
      
      mermaid += `  ${boundary.sourceStateId} --> ${boundary.targetStateId}${label}\n`;
    });
    
    // Add variable crossings if requested
    if (config.includeVars && hierarchyInfo.variableCrossings.length > 0) {
      mermaid += '\n  %% Variable crossings\n';
      
      hierarchyInfo.variableCrossings.forEach(crossing => {
        const sourceNodeId = crossing.sourceStateId;
        const targetNodeId = crossing.targetStateId;
        
        let label = `${crossing.variableName}`;
        if (crossing.alias && crossing.alias !== crossing.variableName) {
          label += ` as ${crossing.alias}`;
        }
        
        mermaid += `  ${sourceNodeId} -. "${label}" .-> ${targetNodeId}\n`;
      });
    }
    
    return mermaid;
  }

  /**
   * Generate a DOT diagram for context hierarchy
   * @private
   */
  private generateDotContextHierarchy(hierarchyInfo: ContextHierarchyInfo, config: ContextVisualizationConfig): string {
    const { states, boundaries } = hierarchyInfo;
    
    let dot = 'digraph ContextHierarchy {\n';
    dot += '  rankdir=TB;\n';
    dot += '  node [shape=box, style=filled, fontname="Arial"];\n';
    
    // Add states as nodes
    states.forEach(state => {
      const label = this.formatStateLabel(state, config);
      dot += `  "${state.id}" [label="${label}" ${this.getContextNodeStyleDot(state, config)}];\n`;
    });
    
    // Add boundaries as edges
    boundaries.forEach(boundary => {
      let label = '';
      if (config.includeBoundaryTypes) {
        label = `label="${boundary.boundaryType}"`;
      }
      
      dot += `  "${boundary.sourceStateId}" -> "${boundary.targetStateId}" [${label} ${this.getContextBoundaryStyleDot(boundary, config)}];\n`;
    });
    
    // Add variable crossings if requested
    if (config.includeVars && hierarchyInfo.variableCrossings.length > 0) {
      dot += '\n  // Variable crossings\n';
      
      hierarchyInfo.variableCrossings.forEach(crossing => {
        const sourceNodeId = crossing.sourceStateId;
        const targetNodeId = crossing.targetStateId;
        
        let label = `${crossing.variableName}`;
        if (crossing.alias && crossing.alias !== crossing.variableName) {
          label += ` as ${crossing.alias}`;
        }
        
        dot += `  "${sourceNodeId}" -> "${targetNodeId}" [label="${label}", style=dashed, color=blue];\n`;
      });
    }
    
    dot += '}\n';
    
    return dot;
  }

  /**
   * Generate a Mermaid diagram for variable propagation
   * @private
   */
  private generateMermaidVariablePropagation(
    variableName: string, 
    states: StateMetadata[], 
    crossings: VariableCrossing[], 
    config: ContextVisualizationConfig
  ): string {
    // Create a map for quick state lookup
    const stateMap = new Map<string, StateMetadata>();
    states.forEach(state => stateMap.set(state.id, state));
    
    let mermaid = `graph TD\n  %% Variable propagation for "${variableName}"\n`;
    
    // Add states involved in crossings
    const involvedStateIds = new Set<string>();
    crossings.forEach(crossing => {
      involvedStateIds.add(crossing.sourceStateId);
      involvedStateIds.add(crossing.targetStateId);
    });
    
    // Add states as nodes
    Array.from(involvedStateIds).forEach(stateId => {
      const state = stateMap.get(stateId);
      if (state) {
        const label = this.formatStateLabel(state, config);
        mermaid += `  ${state.id}["${label}"]\n`;
        mermaid += `  style ${state.id} ${this.getContextNodeStyle(state, config)}\n`;
      }
    });
    
    // Add crossings as edges
    crossings.forEach(crossing => {
      const sourceNodeId = crossing.sourceStateId;
      const targetNodeId = crossing.targetStateId;
      
      let label = variableName;
      if (crossing.alias && crossing.alias !== variableName) {
        label += ` as ${crossing.alias}`;
      }
      
      let edge = '';
      if (crossing.variableType === 'text') {
        edge = ` -. "${label} (text)" .-> `;
      } else if (crossing.variableType === 'data') {
        edge = ` -. "${label} (data)" .-> `;
      } else if (crossing.variableType === 'path') {
        edge = ` -. "${label} (path)" .-> `;
      } else {
        edge = ` -. "${label}" .-> `;
      }
      
      mermaid += `  ${sourceNodeId}${edge}${targetNodeId}\n`;
    });
    
    return mermaid;
  }

  /**
   * Generate a DOT diagram for variable propagation
   * @private
   */
  private generateDotVariablePropagation(
    variableName: string, 
    states: StateMetadata[], 
    crossings: VariableCrossing[], 
    config: ContextVisualizationConfig
  ): string {
    // Create a map for quick state lookup
    const stateMap = new Map<string, StateMetadata>();
    states.forEach(state => stateMap.set(state.id, state));
    
    let dot = `digraph VariablePropagation {\n  // Variable propagation for "${variableName}"\n`;
    dot += '  rankdir=TB;\n';
    dot += '  node [shape=box, style=filled, fontname="Arial"];\n';
    
    // Add states involved in crossings
    const involvedStateIds = new Set<string>();
    crossings.forEach(crossing => {
      involvedStateIds.add(crossing.sourceStateId);
      involvedStateIds.add(crossing.targetStateId);
    });
    
    // Add states as nodes
    Array.from(involvedStateIds).forEach(stateId => {
      const state = stateMap.get(stateId);
      if (state) {
        const label = this.formatStateLabel(state, config);
        dot += `  "${state.id}" [label="${label}" ${this.getContextNodeStyleDot(state, config)}];\n`;
      }
    });
    
    // Add crossings as edges
    crossings.forEach(crossing => {
      const sourceNodeId = crossing.sourceStateId;
      const targetNodeId = crossing.targetStateId;
      
      let label = variableName;
      if (crossing.alias && crossing.alias !== variableName) {
        label += ` as ${crossing.alias}`;
      }
      
      if (crossing.variableType) {
        label += ` (${crossing.variableType})`;
      }
      
      dot += `  "${sourceNodeId}" -> "${targetNodeId}" [label="${label}", style=dashed, color=blue];\n`;
    });
    
    dot += '}\n';
    
    return dot;
  }

  /**
   * Generate a Mermaid diagram for combined context and variable flow
   * @private
   */
  private generateMermaidContextsAndFlow(hierarchyInfo: ContextHierarchyInfo, config: ContextVisualizationConfig): string {
    const { states, boundaries, variableCrossings } = hierarchyInfo;
    
    let mermaid = 'graph TD\n';
    
    // Add states as nodes
    states.forEach(state => {
      const label = this.formatStateLabel(state, config);
      mermaid += `  ${state.id}["${label}"]\n`;
      mermaid += `  style ${state.id} ${this.getContextNodeStyle(state, config)}\n`;
    });
    
    // Add boundaries as edges
    boundaries.forEach(boundary => {
      const style = this.getContextBoundaryStyle(boundary, config);
      
      let label = '';
      if (config.includeBoundaryTypes) {
        label = ` |${boundary.boundaryType}|`;
      }
      
      mermaid += `  ${boundary.sourceStateId} --> ${boundary.targetStateId}${label}\n`;
    });
    
    // Group variable crossings by variable name
    const crossingsByVariable = new Map<string, VariableCrossing[]>();
    
    variableCrossings.forEach(crossing => {
      if (!crossingsByVariable.has(crossing.variableName)) {
        crossingsByVariable.set(crossing.variableName, []);
      }
      
      crossingsByVariable.get(crossing.variableName)!.push(crossing);
    });
    
    // Add variable crossings grouped by variable
    if (config.includeVars && variableCrossings.length > 0) {
      mermaid += '\n  %% Variable flows\n';
      
      crossingsByVariable.forEach((crossings, variableName) => {
        mermaid += `  %% Flow for variable "${variableName}"\n`;
        
        crossings.forEach(crossing => {
          const sourceNodeId = crossing.sourceStateId;
          const targetNodeId = crossing.targetStateId;
          
          let label = variableName;
          if (crossing.alias && crossing.alias !== variableName) {
            label += ` as ${crossing.alias}`;
          }
          
          mermaid += `  ${sourceNodeId} -. "${label}" .-> ${targetNodeId}\n`;
        });
      });
    }
    
    return mermaid;
  }

  /**
   * Generate a DOT diagram for combined context and variable flow
   * @private
   */
  private generateDotContextsAndFlow(hierarchyInfo: ContextHierarchyInfo, config: ContextVisualizationConfig): string {
    const { states, boundaries, variableCrossings } = hierarchyInfo;
    
    let dot = 'digraph ContextsAndVariableFlow {\n';
    dot += '  rankdir=TB;\n';
    dot += '  node [shape=box, style=filled, fontname="Arial"];\n';
    
    // Add states as nodes
    states.forEach(state => {
      const label = this.formatStateLabel(state, config);
      dot += `  "${state.id}" [label="${label}" ${this.getContextNodeStyleDot(state, config)}];\n`;
    });
    
    // Add boundaries as edges
    boundaries.forEach(boundary => {
      let label = '';
      if (config.includeBoundaryTypes) {
        label = `label="${boundary.boundaryType}"`;
      }
      
      dot += `  "${boundary.sourceStateId}" -> "${boundary.targetStateId}" [${label} ${this.getContextBoundaryStyleDot(boundary, config)}];\n`;
    });
    
    // Group variable crossings by variable name
    const crossingsByVariable = new Map<string, VariableCrossing[]>();
    
    variableCrossings.forEach(crossing => {
      if (!crossingsByVariable.has(crossing.variableName)) {
        crossingsByVariable.set(crossing.variableName, []);
      }
      
      crossingsByVariable.get(crossing.variableName)!.push(crossing);
    });
    
    // Add variable crossings grouped by variable
    if (config.includeVars && variableCrossings.length > 0) {
      dot += '\n  // Variable flows\n';
      
      crossingsByVariable.forEach((crossings, variableName) => {
        dot += `  // Flow for variable "${variableName}"\n`;
        
        crossings.forEach(crossing => {
          const sourceNodeId = crossing.sourceStateId;
          const targetNodeId = crossing.targetStateId;
          
          let label = variableName;
          if (crossing.alias && crossing.alias !== variableName) {
            label += ` as ${crossing.alias}`;
          }
          
          dot += `  "${sourceNodeId}" -> "${targetNodeId}" [label="${label}", style=dashed, color=blue];\n`;
        });
      });
    }
    
    dot += '}\n';
    
    return dot;
  }

  /**
   * Generate a Mermaid timeline diagram for variable resolution
   * @private
   */
  private generateMermaidResolutionTimeline(
    variableName: string, 
    states: StateMetadata[], 
    crossings: VariableCrossing[], 
    config: ContextVisualizationConfig
  ): string {
    // Create a map for quick state lookup
    const stateMap = new Map<string, StateMetadata>();
    states.forEach(state => stateMap.set(state.id, state));
    
    // Sort crossings by timestamp
    const sortedCrossings = [...crossings].sort((a, b) => a.timestamp - b.timestamp);
    
    let mermaid = `gantt\n  title Resolution Timeline for "${variableName}"\n`;
    mermaid += `  dateFormat X\n`;
    mermaid += `  axisFormat %s\n`;
    
    // Define context sections
    const contextIds = new Set<string>();
    crossings.forEach(crossing => {
      contextIds.add(crossing.sourceStateId);
      contextIds.add(crossing.targetStateId);
    });
    
    // Add context sections
    Array.from(contextIds).forEach(stateId => {
      const state = stateMap.get(stateId);
      if (state) {
        const contextName = state.filePath ? `${state.id} (${state.filePath})` : state.id;
        mermaid += `  section ${contextName}\n`;
        
        // Find all crossings where this state is involved
        const relevantCrossings = sortedCrossings.filter(
          crossing => crossing.sourceStateId === stateId || crossing.targetStateId === stateId
        );
        
        if (relevantCrossings.length === 0) {
          mermaid += `  No crossings : 0, 0\n`;
        } else {
          relevantCrossings.forEach(crossing => {
            const direction = crossing.sourceStateId === stateId ? 'out' : 'in';
            const otherStateId = direction === 'out' ? crossing.targetStateId : crossing.sourceStateId;
            
            const description = `${direction === 'out' ? 'Export to' : 'Import from'} ${otherStateId}`;
            
            // For timelines, use the timestamp directly
            const timestamp = crossing.timestamp;
            const duration = 10; // Small fixed duration for visibility
            
            mermaid += `  ${description} : ${timestamp}, ${timestamp + duration}\n`;
          });
        }
      }
    });
    
    return mermaid;
  }

  /**
   * Generate a DOT timeline diagram for variable resolution
   * @private
   */
  private generateDotResolutionTimeline(
    variableName: string, 
    states: StateMetadata[], 
    crossings: VariableCrossing[], 
    config: ContextVisualizationConfig
  ): string {
    // Create a map for quick state lookup
    const stateMap = new Map<string, StateMetadata>();
    states.forEach(state => stateMap.set(state.id, state));
    
    // Sort crossings by timestamp
    const sortedCrossings = [...crossings].sort((a, b) => a.timestamp - b.timestamp);
    
    let dot = `digraph ResolutionTimeline {\n  label="Resolution Timeline for "${variableName}"\n`;
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style=filled, fontname="Arial"];\n';
    
    // Create a timeline node for each crossing
    sortedCrossings.forEach((crossing, index) => {
      const sourceState = stateMap.get(crossing.sourceStateId);
      const targetState = stateMap.get(crossing.targetStateId);
      
      const sourceLabel = sourceState?.filePath ? `${crossing.sourceStateId} (${sourceState.filePath})` : crossing.sourceStateId;
      const targetLabel = targetState?.filePath ? `${crossing.targetStateId} (${targetState.filePath})` : crossing.targetStateId;
      
      const eventTime = new Date(crossing.timestamp).toISOString().replace('T', ' ').substring(0, 19);
      const label = `${eventTime}\\n${variableName}${crossing.alias ? ` as ${crossing.alias}` : ''}`;
      
      dot += `  "event${index}" [label="${label}", shape=circle, color=lightblue];\n`;
      
      // Add edge from source to event
      dot += `  "${crossing.sourceStateId}" -> "event${index}" [label="export", style=dashed];\n`;
      
      // Add edge from event to target
      dot += `  "event${index}" -> "${crossing.targetStateId}" [label="import", style=dashed];\n`;
      
      // Add node labels if first occurrence
      if (!dot.includes(`"${crossing.sourceStateId}" [`)) {
        dot += `  "${crossing.sourceStateId}" [label="${sourceLabel}", ${this.getContextNodeStyleDot(sourceState!, config)}];\n`;
      }
      
      if (!dot.includes(`"${crossing.targetStateId}" [`)) {
        dot += `  "${crossing.targetStateId}" [label="${targetLabel}", ${this.getContextNodeStyleDot(targetState!, config)}];\n`;
      }
    });
    
    // Add timeline constraint
    if (sortedCrossings.length > 1) {
      dot += '\n  // Timeline ordering\n';
      dot += '  { rank=same; ';
      
      for (let i = 0; i < sortedCrossings.length; i++) {
        dot += `"event${i}" `;
      }
      
      dot += '}\n';
      
      // Add invisible edges for timeline ordering
      for (let i = 0; i < sortedCrossings.length - 1; i++) {
        dot += `  "event${i}" -> "event${i+1}" [style=invis];\n`;
      }
    }
    
    dot += '}\n';
    
    return dot;
  }

  /**
   * Format a state label for visualization
   * @private
   */
  private formatStateLabel(state: StateMetadata, config: ContextVisualizationConfig): string {
    let label = state.id;
    
    if (config.includeFilePaths && state.filePath) {
      label += `\\n${state.filePath}`;
    }
    
    if (config.includeTimestamps && state.createdAt) {
      const date = new Date(state.createdAt);
      label += `\\n${date.toISOString().replace('T', ' ').substring(0, 19)}`;
    }
    
    return label;
  }

  /**
   * Get Mermaid style string for a context node
   * @private
   */
  private getContextNodeStyle(state: StateMetadata, config: ContextVisualizationConfig): string {
    let style = '';
    
    // Style based on state source
    switch (state.source) {
      case 'new':
        style = 'fill:#e1f5fe,stroke:#01579b';
        break;
      case 'clone':
        style = 'fill:#fff9c4,stroke:#fbc02d';
        break;
      case 'child':
        style = 'fill:#c8e6c9,stroke:#388e3c';
        break;
      case 'merge':
        style = 'fill:#f8bbd0,stroke:#c2185b';
        break;
      case 'implicit':
        style = 'fill:#d1c4e9,stroke:#512da8';
        break;
      default:
        style = 'fill:#f5f5f5,stroke:#616161';
    }
    
    return style;
  }

  /**
   * Get DOT style string for a context node
   * @private
   */
  private getContextNodeStyleDot(state: StateMetadata, config: ContextVisualizationConfig): string {
    let fillColor = '';
    let strokeColor = '';
    
    // Style based on state source
    switch (state.source) {
      case 'new':
        fillColor = '#e1f5fe';
        strokeColor = '#01579b';
        break;
      case 'clone':
        fillColor = '#fff9c4';
        strokeColor = '#fbc02d';
        break;
      case 'child':
        fillColor = '#c8e6c9';
        strokeColor = '#388e3c';
        break;
      case 'merge':
        fillColor = '#f8bbd0';
        strokeColor = '#c2185b';
        break;
      case 'implicit':
        fillColor = '#d1c4e9';
        strokeColor = '#512da8';
        break;
      default:
        fillColor = '#f5f5f5';
        strokeColor = '#616161';
    }
    
    return `fillcolor="${fillColor}", color="${strokeColor}"`;
  }

  /**
   * Get Mermaid style for a context boundary edge
   * @private
   */
  private getContextBoundaryStyle(boundary: ContextBoundary, config: ContextVisualizationConfig): string {
    if (boundary.boundaryType === 'import') {
      return 'stroke:#388e3c,stroke-width:2';
    } else {
      return 'stroke:#01579b,stroke-width:2';
    }
  }

  /**
   * Get DOT style for a context boundary edge
   * @private
   */
  private getContextBoundaryStyleDot(boundary: ContextBoundary, config: ContextVisualizationConfig): string {
    if (boundary.boundaryType === 'import') {
      return 'color="#388e3c", penwidth=2';
    } else {
      return 'color="#01579b", penwidth=2';
    }
  }
} 