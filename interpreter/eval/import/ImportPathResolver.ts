import type { DirectiveNode, ContentNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import { interpolate } from '../../core/interpreter';

export interface ImportResolution {
  type: 'file' | 'url' | 'module' | 'resolver' | 'input';
  resolvedPath: string;
  expectedHash?: string;
  resolverName?: string;
  sectionName?: string;
}

type ContentNodeArray = ContentNode[];

/**
 * Handles import path processing and resolution routing
 */
export class ImportPathResolver {
  constructor(private env: Environment) {}

  /**
   * Resolve import path and determine the type of import
   */
  async resolveImportPath(directive: DirectiveNode): Promise<ImportResolution> {
    // Get the path to import
    const pathValue = directive.values?.path;
    if (!pathValue) {
      throw new Error('Import directive missing path');
    }

    // Convert path to node array for consistent processing
    const pathNodes = this.normalizePathNodes(pathValue, directive);

    // Check for special imports first (INPUT, stdin, resolvers)
    const specialImport = await this.detectSpecialImports(pathNodes, directive);
    if (specialImport) {
      return specialImport;
    }

    // Interpolate the path nodes to get the final import path
    const importPath = await this.interpolatePathNodes(pathNodes);

    // Determine import type and resolve the path
    return this.routeImportRequest(importPath, pathNodes, directive);
  }

  /**
   * Convert path value to consistent node array format
   */
  private normalizePathNodes(pathValue: any, directive: DirectiveNode): ContentNodeArray {
    if (typeof pathValue === 'string') {
      // Legacy string path handling - convert to node array
      return [{ type: 'Text', content: pathValue, nodeId: '', location: directive.location }];
    } else if (Array.isArray(pathValue)) {
      // Normal case: pathValue is already an array of nodes
      return pathValue;
    } else {
      throw new Error('Import directive path must be a string or array of nodes');
    }
  }

  /**
   * Detect special imports (@INPUT, @stdin, resolver imports)
   */
  private async detectSpecialImports(
    pathNodes: ContentNodeArray, 
    directive: DirectiveNode
  ): Promise<ImportResolution | null> {
    if (pathNodes.length === 0) {
      return null;
    }

    const firstNode = pathNodes[0];

    // Handle text-based special imports
    if (firstNode.type === 'Text') {
      const content = firstNode.content;
      if (content === '@INPUT' || content === '@input') {
        return {
          type: 'input',
          resolvedPath: '@INPUT',
          resolverName: 'INPUT'
        };
      } else if (content === '@stdin') {
        // Silently handle @stdin for backward compatibility
        return {
          type: 'input',
          resolvedPath: '@INPUT',
          resolverName: 'INPUT'
        };
      }
    }

    // Handle variable reference special imports
    if (firstNode.type === 'VariableReference') {
      const varRef = firstNode as any;
      
      // Handle @INPUT/@input/@stdin as variable references
      if (varRef.identifier === 'INPUT' || varRef.identifier === 'input') {
        return {
          type: 'input',
          resolvedPath: '@INPUT',
          resolverName: 'INPUT'
        };
      } else if (varRef.identifier === 'stdin') {
        return {
          type: 'input',
          resolvedPath: '@INPUT',
          resolverName: 'INPUT'
        };
      }

      // Handle resolver imports with isSpecial flag
      if (varRef.isSpecial && varRef.identifier) {
        const resolverManager = this.env.getResolverManager();
        if (resolverManager && resolverManager.isResolverName(varRef.identifier)) {
          return {
            type: 'resolver',
            resolvedPath: `@${varRef.identifier}`,
            resolverName: varRef.identifier
          };
        }
      }
    }

    return null;
  }

  /**
   * Interpolate path nodes to get the final import path
   */
  private async interpolatePathNodes(pathNodes: ContentNodeArray): Promise<string> {
    // Regular path interpolation - handles liberal import syntax through normal interpolation
    return (await interpolate(pathNodes, this.env)).trim();
  }

  /**
   * Route import request based on the interpolated path
   */
  private async routeImportRequest(
    importPath: string,
    pathNodes: ContentNodeArray,
    directive: DirectiveNode
  ): Promise<ImportResolution> {
    // Extract section name if specified
    const sectionNodes = directive.values?.section;
    let sectionName: string | undefined;
    if (sectionNodes && Array.isArray(sectionNodes)) {
      sectionName = await interpolate(sectionNodes, this.env);
    }

    // Check if this is a module reference (@prefix/ pattern)
    if (importPath.startsWith('@')) {
      return this.handleModuleReference(importPath, directive, sectionName);
    }

    // Check if this is a URL
    const pathNode = pathNodes[0];
    const isURL = pathNode?.subtype === 'urlPath' || 
                  pathNode?.subtype === 'urlSectionPath' || 
                  this.env.isURL(importPath);

    if (isURL) {
      return this.handleURLImport(importPath, directive, sectionName);
    }

    // Handle file path
    return this.handleFileImport(importPath, directive, sectionName);
  }

  /**
   * Handle module reference imports (@user/module, @TIME, etc.)
   */
  private async handleModuleReference(
    importPath: string,
    directive: DirectiveNode,
    sectionName?: string
  ): Promise<ImportResolution> {
    // First check if it's a resolver name (like @TIME, @DEBUG, etc.)
    const resolverManager = this.env.getResolverManager();
    const potentialResolverName = importPath.substring(1); // Remove @ prefix
    
    if (resolverManager && resolverManager.isResolverName(potentialResolverName)) {
      return {
        type: 'resolver',
        resolvedPath: importPath,
        resolverName: potentialResolverName,
        sectionName
      };
    }

    // Extract hash from the module reference if present
    const { moduleRef, expectedHash } = this.extractHashFromPath(importPath, directive);

    return {
      type: 'module',
      resolvedPath: moduleRef,
      expectedHash,
      sectionName
    };
  }

  /**
   * Handle URL imports
   */
  private async handleURLImport(
    importPath: string,
    directive: DirectiveNode,
    sectionName?: string
  ): Promise<ImportResolution> {
    // Extract hash if present in metadata
    const pathMeta = directive.meta?.path;
    const expectedHash = pathMeta?.hash;

    return {
      type: 'url',
      resolvedPath: importPath,
      expectedHash,
      sectionName
    };
  }

  /**
   * Handle file path imports
   */
  private async handleFileImport(
    importPath: string,
    directive: DirectiveNode,
    sectionName?: string
  ): Promise<ImportResolution> {
    // Resolve relative to current basePath
    const resolvedPath = await this.env.resolvePath(importPath);
    
    // Extract hash if present in metadata
    const pathMeta = directive.meta?.path;
    const expectedHash = pathMeta?.hash;

    return {
      type: 'file',
      resolvedPath,
      expectedHash,
      sectionName
    };
  }

  /**
   * Extract hash information from module reference
   */
  private extractHashFromPath(
    importPath: string, 
    directive: DirectiveNode
  ): { moduleRef: string; expectedHash?: string } {
    let moduleRef = importPath;
    let expectedHash: string | undefined;
    
    // Check if the directive has hash information in metadata
    const pathMeta = directive.meta?.path;
    if (pathMeta && pathMeta.hash) {
      expectedHash = pathMeta.hash;
      // Remove hash from module reference for resolution
      const hashIndex = importPath.lastIndexOf('@');
      if (hashIndex > 0) {
        moduleRef = importPath.substring(0, hashIndex);
      }
    }

    return { moduleRef, expectedHash };
  }

  /**
   * Check if a path is a URL
   */
  private isURLPath(path: string): boolean {
    return this.env.isURL(path);
  }

  /**
   * Liberal import syntax support - handles both quoted and unquoted module references
   * This follows Postel's Law: "be liberal in what you accept"
   */
  private handleLiberalImportSyntax(pathNodes: ContentNodeArray): ContentNodeArray {
    // The liberal syntax is actually handled through normal interpolation
    // When a quoted module reference like "@local/test" is encountered,
    // the interpolation process will try to resolve @local as a variable first,
    // and if not found, it will reconstruct the full path
    // This is implemented in the interpolate function, not here
    return pathNodes;
  }
}