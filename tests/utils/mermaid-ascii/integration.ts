/**
 * Integration with StateVisualizationService
 * 
 * This module provides utilities to extend the StateVisualizationService
 * with ASCII rendering capabilities.
 */

import { mermaidToAscii, MermaidAsciiOptions } from '@tests/utils/mermaid-ascii/index.js';
import { IStateVisualizationService, VisualizationConfig } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService.js';

/**
 * Options for ASCII visualization
 */
export interface AsciiVisualizationOptions extends MermaidAsciiOptions {
  // Additional ASCII-specific options can be added here
  includeHeader?: boolean;
}

/**
 * Adapter class that extends a visualization service to provide ASCII rendering capabilities
 */
export class AsciiVisualizationAdapter {
  constructor(private visualizationService: IStateVisualizationService) {}

  /**
   * Generate an ASCII representation of a state hierarchy
   * 
   * @param stateId The ID of the root state
   * @param options ASCII visualization options
   * @returns ASCII representation of the hierarchy
   */
  async generateHierarchyViewAscii(stateId: string, options: AsciiVisualizationOptions = {}): Promise<string> {
    const config: VisualizationConfig = {
      format: 'mermaid',
      ascii: {
        width: options.width,
        height: options.height,
        color: options.color,
        includeHeader: options.includeHeader
      }
    };
    
    const mermaidDiagram = this.visualizationService.generateHierarchyView(stateId, config);
    return mermaidToAscii(mermaidDiagram, options);
  }

  /**
   * Generate an ASCII representation of state transitions
   * 
   * @param stateId The ID of the state
   * @param options ASCII visualization options
   * @returns ASCII representation of transitions
   */
  async generateTransitionDiagramAscii(stateId: string, options: AsciiVisualizationOptions = {}): Promise<string> {
    const config: VisualizationConfig = {
      format: 'mermaid',
      ascii: {
        width: options.width,
        height: options.height,
        color: options.color,
        includeHeader: options.includeHeader
      }
    };
    
    const mermaidDiagram = this.visualizationService.generateTransitionDiagram(stateId, config);
    return mermaidToAscii(mermaidDiagram, options);
  }

  /**
   * Generate an ASCII representation of state relationships
   * 
   * @param stateId The ID of the state or array of state IDs
   * @param options ASCII visualization options
   * @returns ASCII representation of relationships
   */
  async generateRelationshipGraphAscii(stateId: string | string[], options: AsciiVisualizationOptions = {}): Promise<string> {
    const config: VisualizationConfig = {
      format: 'mermaid',
      ascii: {
        width: options.width,
        height: options.height,
        color: options.color,
        includeHeader: options.includeHeader
      }
    };
    
    const stateIds = Array.isArray(stateId) ? stateId : [stateId];
    const mermaidDiagram = this.visualizationService.generateRelationshipGraph(stateIds, config);
    return mermaidToAscii(mermaidDiagram, options);
  }

  /**
   * Generate an ASCII representation of a timeline
   * 
   * @param stateId The ID of the state or array of state IDs
   * @param options ASCII visualization options
   * @returns ASCII representation of the timeline
   */
  async generateTimelineAscii(stateId: string | string[], options: AsciiVisualizationOptions = {}): Promise<string> {
    const config: VisualizationConfig = {
      format: 'mermaid',
      ascii: {
        width: options.width,
        height: options.height,
        color: options.color,
        includeHeader: options.includeHeader
      }
    };
    
    const stateIds = Array.isArray(stateId) ? stateId : [stateId];
    const mermaidDiagram = this.visualizationService.generateTimeline(stateIds, config);
    return mermaidToAscii(mermaidDiagram, options);
  }

  /**
   * Generate an ASCII representation of variable resolution
   * 
   * @param stateId The ID of the state
   * @param variableName The name of the variable
   * @param options ASCII visualization options
   * @returns ASCII representation of variable resolution
   */
  async generateVariableResolutionAscii(stateId: string, variableName: string, options: AsciiVisualizationOptions = {}): Promise<string> {
    const config: VisualizationConfig = {
      format: 'mermaid',
      ascii: {
        width: options.width,
        height: options.height,
        color: options.color,
        includeHeader: options.includeHeader
      }
    };
    
    const mermaidDiagram = this.visualizationService.visualizeResolutionPathTimeline(variableName, stateId, {
      ...config,
      includeVars: true,
      highlightBoundaries: true
    });
    
    return mermaidToAscii(mermaidDiagram, options);
  }
}

/**
 * Create an enhanced visualization service with ASCII capabilities
 * 
 * @param visualizationService The base visualization service to enhance
 * @returns Enhanced visualization service with ASCII methods
 */
export function enhanceWithAsciiVisualization(visualizationService: IStateVisualizationService): IStateVisualizationService & {
  generateAsciiHierarchyView: (stateId: string, options?: AsciiVisualizationOptions) => Promise<string>;
  generateAsciiTransitionDiagram: (stateId: string, options?: AsciiVisualizationOptions) => Promise<string>;
  generateAsciiRelationshipGraph: (stateId: string | string[], options?: AsciiVisualizationOptions) => Promise<string>;
  generateAsciiTimeline: (stateId: string | string[], options?: AsciiVisualizationOptions) => Promise<string>;
  generateAsciiVariableResolution: (stateId: string, variableName: string, options?: AsciiVisualizationOptions) => Promise<string>;
} {
  const adapter = new AsciiVisualizationAdapter(visualizationService);
  
  return Object.assign(visualizationService, {
    generateAsciiHierarchyView: adapter.generateHierarchyViewAscii.bind(adapter),
    generateAsciiTransitionDiagram: adapter.generateTransitionDiagramAscii.bind(adapter),
    generateAsciiRelationshipGraph: adapter.generateRelationshipGraphAscii.bind(adapter),
    generateAsciiTimeline: adapter.generateTimelineAscii.bind(adapter),
    generateAsciiVariableResolution: adapter.generateVariableResolutionAscii.bind(adapter)
  });
}

/**
 * Create a wrapper function for CLI commands to render any mermaid diagram as ASCII
 */
export function createAsciiRenderer(options: AsciiVisualizationOptions = {}): (diagram: string, title?: string) => Promise<string> {
  return async (diagram: string, title?: string): Promise<string> => {
    const asciiArt = await mermaidToAscii(diagram, {
      width: options.width || 120,
      height: options.height,
      color: options.color !== undefined ? options.color : true
    });
    
    if (!title) {
      return asciiArt;
    }
    
    // Create a header with title
    const header = `=== ${title} ===`;
    const footer = '='.repeat(header.length);
    
    return `${header}\n${asciiArt}\n${footer}`;
  };
}