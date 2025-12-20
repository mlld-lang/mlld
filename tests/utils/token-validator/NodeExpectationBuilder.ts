/**
 * NodeExpectationBuilder - Walks AST and builds token expectations for each node
 */

import type { NodeExpectation, ValidationContext, NodeTokenRule } from './types.js';
import type { SourceLocation } from '../../../core/types/primitives.js';
import { ContextBuilder } from './ContextBuilder.js';

export class NodeExpectationBuilder {
  private expectations: NodeExpectation[] = [];
  private nodeTokenRules: Map<string, NodeTokenRule>;
  private contextBuilder: ContextBuilder;

  constructor(nodeTokenRules: Map<string, NodeTokenRule>) {
    this.nodeTokenRules = nodeTokenRules;
    this.contextBuilder = new ContextBuilder();
  }

  /**
   * Build expectations from AST
   */
  buildExpectations(
    ast: any[] | any,
    mode: 'strict' | 'markdown',
    input: string,
    templateType?: 'att' | 'mtt'
  ): NodeExpectation[] {
    this.expectations = [];

    const rootContext: ValidationContext = {
      inTemplate: !!templateType,
      templateType,
      inCommand: false,
      mode
    };

    // Ensure AST is an array
    const astArray = Array.isArray(ast) ? ast : [ast];
    this.walkAST(astArray, rootContext, input);

    return this.expectations;
  }

  /**
   * Walk AST recursively
   */
  private walkAST(nodes: any[], context: ValidationContext, input: string): void {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;

      this.processNode(node, context, input);

      // Update context for children
      const childContext = this.updateContext(node, context);

      // Recurse into children
      this.walkNodeChildren(node, childContext, input);
    }
  }

  /**
   * Process a single node
   */
  private processNode(node: any, context: ValidationContext, input: string): void {
    if (!node.type || !node.location) return;

    const rule = this.nodeTokenRules.get(node.type);
    if (!rule) {
      // No rule defined - create a default expectation for unknown nodes
      this.addExpectation(node, [], false, context, input);
      return;
    }

    if (rule.skipValidation) {
      return;
    }

    // Get expected token types
    const expectedTokenTypes = typeof rule.expectedTokenTypes === 'function'
      ? rule.expectedTokenTypes(node, context)
      : rule.expectedTokenTypes;

    this.addExpectation(
      node,
      expectedTokenTypes,
      rule.mustBeCovered ?? false,
      context,
      input
    );
  }

  /**
   * Add an expectation
   */
  private addExpectation(
    node: any,
    expectedTokenTypes: string[],
    mustBeCovered: boolean,
    context: ValidationContext,
    input: string
  ): void {
    const text = this.extractNodeText(node.location, input);

    this.expectations.push({
      nodeId: node.nodeId || 'unknown',
      nodeType: node.type,
      location: node.location,
      expectedTokenTypes,
      mustBeCovered,
      context: { ...context },
      text
    });
  }

  /**
   * Update context based on current node
   */
  private updateContext(node: any, parentContext: ValidationContext): ValidationContext {
    return this.contextBuilder.updateContext(node, parentContext);
  }

  /**
   * Walk node children
   */
  private walkNodeChildren(node: any, context: ValidationContext, input: string): void {
    for (const key of Object.keys(node)) {
      if (key === 'location' || key === 'type' || key === 'nodeId' || key === 'meta') {
        continue;
      }

      const value = node[key];

      if (Array.isArray(value)) {
        this.walkAST(value, context, input);
      } else if (value && typeof value === 'object') {
        // Recurse into all objects (not just those with .type)
        // This handles .values containers and nested structures
        if (value.type) {
          this.walkAST([value], context, input);
        } else {
          // Plain object - recurse into its properties
          this.walkNodeChildren(value, context, input);
        }
      }
    }
  }

  /**
   * Extract text for a node location
   */
  private extractNodeText(location: SourceLocation, input: string): string {
    const lines = input.split('\n');

    if (location.start.line === location.end.line) {
      const line = lines[location.start.line - 1] || '';
      return line.substring(
        location.start.column - 1,
        location.end.column - 1
      );
    }

    // Multi-line
    const result: string[] = [];
    for (let i = location.start.line - 1; i < location.end.line; i++) {
      const line = lines[i] || '';
      if (i === location.start.line - 1) {
        result.push(line.substring(location.start.column - 1));
      } else if (i === location.end.line - 1) {
        result.push(line.substring(0, location.end.column - 1));
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }
}
