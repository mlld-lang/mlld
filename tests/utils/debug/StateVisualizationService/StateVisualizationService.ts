import { IStateVisualizationService, VisualizationConfig, StateMetrics, NodeStyle, EdgeStyle } from './IStateVisualizationService';
import { IStateHistoryService } from '../StateHistoryService/IStateHistoryService';
import { IStateTrackingService, StateMetadata, StateRelationship } from '../StateTrackingService/IStateTrackingService';

/**
 * @package
 * Implementation of state visualization service.
 */
export class StateVisualizationService implements IStateVisualizationService {
  constructor(
    private historyService: IStateHistoryService,
    private trackingService: IStateTrackingService,
  ) {}

  private generateMermaidGraph(nodes: Map<string, StateMetadata>, edges: StateRelationship[], config: VisualizationConfig): string {
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
      const style = this.getEdgeStyle(edge, config);
      const styleStr = `style="${style.style},${style.color}"`;
      const label = edge.type;
      lines.push(`    ${edge.targetId} -->|${label}| ${edge.type} ${styleStr};`);
    });

    return lines.join('\n');
  }

  private generateDotGraph(nodes: Map<string, StateMetadata>, edges: StateRelationship[], config: VisualizationConfig): string {
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
      const style = this.getEdgeStyle(edge, config);
      const attrs = [
        `style="${style.style}"`,
        `color="${style.color}"`,
        `label="${edge.type}"`,
      ];
      if (style.tooltip) {
        attrs.push(`tooltip="${style.tooltip}"`);
      }
      lines.push(`    "${edge.targetId}" -> "${edge.type}" [${attrs.join(',')}];`);
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

    // Build nodes and edges
    const nodes = new Map<string, StateMetadata>();
    const edges: StateRelationship[] = [];

    // Collect all states and their relationships
    allStateIds.forEach(stateId => {
      // Get state metadata from history
      const operations = this.historyService.getOperationHistory(stateId);
      const createOp = operations.find(op => op.type === 'create');
      if (createOp && createOp.metadata) {
        nodes.set(stateId, createOp.metadata);
      }

      // Get relationships from tracking service
      const stateLineage = this.trackingService.getStateLineage(stateId);
      if (stateLineage.length > 1) {
        const parentIndex = stateLineage.indexOf(stateId) - 1;
        if (parentIndex >= 0) {
          edges.push({
            targetId: stateId,
            type: 'parent-child',
          });
        }
      }
    });

    // Generate visualization in requested format
    switch (config.format) {
      case 'mermaid':
        return this.generateMermaidGraph(nodes, edges, config);
      case 'dot':
        return this.generateDotGraph(nodes, edges, config);
      case 'json':
        return JSON.stringify({
          nodes: Array.from(nodes.entries()).map(([id, metadata]) => ({
            id,
            ...metadata,
          })),
          edges,
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
    const lines: string[] = ['graph LR;'];
    
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
      lines.push(`    ${beforeId}["${beforeLabel}"];`);
      
      // Add after state
      const afterLabel = formatValue(transform.after);
      lines.push(`    ${afterId}["${afterLabel}"];`);
      
      // Add transition with timestamp first for better readability
      const transitionLabel = config.includeTimestamps
        ? `${transform.timestamp} ${transform.operation}`
        : transform.operation;
      lines.push(`    ${beforeId} -->|${transitionLabel}| ${afterId};`);
      
      // Add styling
      const style = this.getNodeStyle({ source: transform.source } as StateMetadata, config);
      lines.push(`    style ${beforeId} fill:${style.color};`);
      lines.push(`    style ${afterId} fill:${style.color};`);
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
                .map(([k, v]) => `${key}.${k}: ${v}`)
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
    if (!['mermaid', 'dot', 'json'].includes(config.format)) {
      throw new Error(`Unsupported format: ${config.format}`);
    }

    // Collect all states and their relationships
    const nodes = new Map<string, StateMetadata>();
    const edges: StateRelationship[] = [];
    const processedStates = new Set<string>();

    // Helper to process a state and its relationships
    const processState = (stateId: string) => {
      if (processedStates.has(stateId)) return;
      processedStates.add(stateId);

      // Get state metadata from history
      const operations = this.historyService.getOperationHistory(stateId);
      const createOrMergeOp = operations.find(op => op.type === 'create' || op.type === 'merge');
      if (createOrMergeOp?.metadata) {
        nodes.set(stateId, createOrMergeOp.metadata);
      }

      // Get lineage relationships
      const lineage = this.trackingService.getStateLineage(stateId);
      if (lineage.length > 1) {
        for (let i = 1; i < lineage.length; i++) {
          edges.push({
            targetId: lineage[i],
            sourceId: lineage[i - 1],
            type: 'parent-child',
          });
        }
      }

      // Get merge relationships
      const mergeOps = operations.filter(op => op.type === 'merge');
      mergeOps.forEach(op => {
        if (op.parentId) {
          edges.push({
            sourceId: op.parentId,
            targetId: stateId,
            type: 'merge-source',
          });
          // Also process the parent state if we haven't yet
          processState(op.parentId);
        }
      });

      // Process descendants
      const descendants = this.trackingService.getStateDescendants(stateId);
      descendants.forEach(descendantId => processState(descendantId));
    };

    // Process all requested states
    stateIds.forEach(stateId => processState(stateId));

    // Generate visualization in requested format
    switch (config.format) {
      case 'mermaid':
        return this.generateMermaidRelationshipGraph(nodes, edges, config);
      case 'dot':
        return this.generateDotRelationshipGraph(nodes, edges, config);
      case 'json':
        return JSON.stringify({
          nodes: Array.from(nodes.entries()).map(([id, metadata]) => ({
            id,
            ...metadata,
          })),
          edges,
        }, null, 2);
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }
  }

  private generateMermaidRelationshipGraph(
    nodes: Map<string, StateMetadata>,
    edges: StateRelationship[],
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
      const style = this.getEdgeStyle(edge, config);
      const sourceId = edge.sourceId || 'unknown';
      const label = config.includeMetadata ? edge.type : '';
      lines.push(`    ${sourceId} -->|${label}| ${edge.targetId};`);
      lines.push(`    linkStyle ${lines.length - 2} stroke:${style.color},stroke-width:2px,${style.style};`);
    });

    return lines.join('\n');
  }

  private generateDotRelationshipGraph(
    nodes: Map<string, StateMetadata>,
    edges: StateRelationship[],
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
      const style = this.getEdgeStyle(edge, config);
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
} 