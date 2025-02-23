import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateTrackingService, StateMetadata, StateRelationship } from './IStateTrackingService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * @package
 * Implementation of the state tracking service.
 * 
 * @remarks
 * Provides state instance tracking, relationship management, and metadata storage.
 * Uses UUIDs for state identification and maintains relationship graphs.
 */
export class StateTrackingService implements IStateTrackingService {
  private states: Map<string, StateMetadata>;
  private relationships: Map<string, StateRelationship[]>;

  constructor() {
    this.states = new Map();
    this.relationships = new Map();
  }

  registerState(metadata: Partial<StateMetadata> & { id?: string }): string {
    // Use provided ID or generate a new one
    const stateId = metadata.id || uuidv4();
    
    if (this.states.has(stateId)) {
      // Update existing state metadata
      const existingMetadata = this.states.get(stateId)!;
      this.states.set(stateId, {
        ...existingMetadata,
        ...metadata,
        id: stateId
      });
    } else {
      // Create new state metadata
      this.states.set(stateId, {
        id: stateId,
        source: metadata.source || 'implicit',
        parentId: metadata.parentId,
        filePath: metadata.filePath,
        transformationEnabled: metadata.transformationEnabled || false,
        createdAt: Date.now()
      });
    }

    return stateId;
  }

  getStateMetadata(stateId: string): StateMetadata | undefined {
    return this.states.get(stateId);
  }

  addRelationship(sourceId: string, targetId: string, type: 'parent-child' | 'merge-source' | 'merge-target'): void {
    logger.debug('Adding relationship:', {
      operation: 'addRelationship',
      sourceId,
      targetId,
      type,
      sourceState: this.states.get(sourceId),
      targetState: this.states.get(targetId),
      sourceRelationships: this.relationships.get(sourceId),
      targetRelationships: this.relationships.get(targetId)
    });

    // Ensure both states exist
    if (!this.states.has(sourceId)) {
      logger.debug('Creating missing source state', { sourceId });
      this.registerState({ id: sourceId });
    }
    if (!this.states.has(targetId)) {
      logger.debug('Creating missing target state', { targetId });
      this.registerState({ id: targetId });
    }

    // Initialize relationships arrays if they don't exist
    if (!this.relationships.has(sourceId)) {
      logger.debug('Initializing source relationships array', { sourceId });
      this.relationships.set(sourceId, []);
    }
    if (!this.relationships.has(targetId)) {
      logger.debug('Initializing target relationships array', { targetId });
      this.relationships.set(targetId, []);
    }

    // Get the current relationships
    const relationships = this.relationships.get(sourceId)!;
    logger.debug('Current relationships before adding new one:', {
      sourceId,
      targetId,
      type,
      existingRelationships: relationships
    });

    // Check if this exact relationship already exists
    const existingRelationship = relationships.find(rel => 
      rel.targetId === targetId && rel.type === type
    );

    // Add the new relationship if it doesn't exist
    if (!existingRelationship) {
      relationships.push({ targetId, type });
      logger.debug('Added new relationship:', {
        sourceId,
        targetId,
        type,
        updatedRelationships: relationships
      });

      // For parent-child relationships, update the child's metadata
      if (type === 'parent-child') {
        const targetState = this.states.get(targetId);
        if (targetState) {
          const oldParentId = targetState.parentId;
          targetState.parentId = sourceId;
          this.states.set(targetId, targetState);
          logger.debug('Updated child state metadata for parent-child:', {
            childId: targetId,
            oldParentId,
            newParentId: sourceId,
            updatedMetadata: targetState
          });
        }
      }

      // For merge operations, we need to handle both source and target relationships
      if (type === 'merge-source' || type === 'merge-target') {
        const sourceState = this.states.get(sourceId);
        const targetState = this.states.get(targetId);

        logger.debug('Processing merge relationship:', {
          type,
          sourceState,
          targetState,
          sourceStateParentId: sourceState?.parentId,
          targetStateParentId: targetState?.parentId
        });

        if (sourceState && targetState) {
          if (type === 'merge-source') {
            const oldParentId = targetState.parentId;
            targetState.parentId = sourceId;
            this.states.set(targetId, targetState);
            logger.debug('Updated target state metadata for merge-source:', {
              targetId,
              oldParentId,
              newParentId: sourceId,
              updatedMetadata: targetState
            });
          } else if (type === 'merge-target') {
            const targetParentId = targetState.parentId;
            if (targetParentId) {
              const oldParentId = sourceState.parentId;
              sourceState.parentId = targetParentId;
              this.states.set(sourceId, sourceState);
              logger.debug('Updated source state metadata for merge-target:', {
                sourceId,
                oldParentId,
                newParentId: targetParentId,
                updatedMetadata: sourceState
              });
            }
          }
        }
      }
    }

    logger.debug('Final state after relationship operation:', {
      sourceId,
      targetId,
      type,
      sourceState: this.states.get(sourceId),
      targetState: this.states.get(targetId),
      sourceRelationships: this.relationships.get(sourceId),
      targetRelationships: this.relationships.get(targetId)
    });
  }

  getRelationships(stateId: string): StateRelationship[] {
    return this.relationships.get(stateId) || [];
  }

  getParentState(stateId: string): string | undefined {
    const metadata = this.states.get(stateId);
    return metadata?.parentId;
  }

  getChildStates(stateId: string): string[] {
    const relationships = this.relationships.get(stateId) || [];
    return relationships
      .filter(r => r.type === 'parent-child' || r.type === 'merge-source')
      .map(r => r.targetId);
  }

  hasState(stateId: string): boolean {
    return this.states.has(stateId);
  }

  getAllStates(): StateMetadata[] {
    return Array.from(this.states.values());
  }

  getStateLineage(stateId: string, visited: Set<string> = new Set()): string[] {
    logger.debug('Getting state lineage:', {
      operation: 'getStateLineage',
      stateId,
      visitedStates: Array.from(visited),
      currentState: this.states.get(stateId)
    });

    if (!this.states.has(stateId)) {
      logger.debug('State not found, returning empty lineage', { stateId });
      return [];
    }

    // If we've seen this state before, return empty array to prevent cycles
    if (visited.has(stateId)) {
      logger.debug('State already visited, preventing cycle', { stateId });
      return [];
    }

    // Mark this state as visited
    visited.add(stateId);
    logger.debug('Marked state as visited', { 
      stateId, 
      visitedStates: Array.from(visited) 
    });

    // Get the state's metadata
    const metadata = this.states.get(stateId)!;
    logger.debug('Retrieved state metadata', { 
      stateId, 
      metadata,
      relationships: this.relationships.get(stateId) || []
    });
    
    // Get parent's lineage first (recursively)
    let parentLineage: string[] = [];
    if (metadata.parentId) {
      parentLineage = this.getStateLineage(metadata.parentId, visited);
      logger.debug('Retrieved parent lineage', { 
        stateId, 
        parentId: metadata.parentId, 
        parentLineage,
        parentState: this.states.get(metadata.parentId)
      });
    }

    // Check for merge relationships
    const relationships = this.relationships.get(stateId) || [];
    const mergeTargets = relationships
      .filter(rel => rel.type === 'merge-target')
      .map(rel => rel.targetId);

    logger.debug('Found merge target relationships', { 
      stateId, 
      relationships,
      mergeTargets,
      mergeTargetStates: mergeTargets.map(id => this.states.get(id))
    });

    // Get lineage from merge targets AND their parents
    const mergeLineages = mergeTargets.flatMap(targetId => {
      logger.debug('Processing merge target', { 
        stateId, 
        targetId,
        targetState: this.states.get(targetId),
        targetRelationships: this.relationships.get(targetId)
      });

      if (visited.has(targetId)) {
        logger.debug('Merge target already visited, skipping', { targetId });
        return [];
      }
      
      const targetState = this.states.get(targetId);
      if (!targetState) {
        logger.debug('Merge target state not found', { targetId });
        return [];
      }

      // Include target's parent in lineage
      const targetParentId = targetState.parentId;
      logger.debug('Processing merge target parent', { 
        targetId, 
        targetParentId,
        targetParentState: targetParentId ? this.states.get(targetParentId) : undefined,
        targetParentRelationships: targetParentId ? this.relationships.get(targetParentId) : undefined
      });

      if (targetParentId && !visited.has(targetParentId)) {
        // Get parent's lineage first
        const parentLineage = this.getStateLineage(targetParentId, visited);
        // Then get target's lineage
        const targetLineage = this.getStateLineage(targetId, visited);
        
        logger.debug('Combined merge target lineages', {
          targetId,
          parentLineage,
          targetLineage,
          combined: [...new Set([...parentLineage, ...targetLineage])]
        });

        // Combine them, ensuring no duplicates
        return [...new Set([...parentLineage, ...targetLineage])];
      }

      // If no parent, just get target's lineage
      const targetLineage = this.getStateLineage(targetId, visited);
      logger.debug('Got merge target lineage (no parent)', {
        targetId,
        targetLineage
      });
      return targetLineage;
    });

    logger.debug('Processed all merge lineages', {
      stateId,
      mergeLineages,
      flattenedMergeLineages: mergeLineages.flat()
    });

    // Combine parent lineage with merge target lineages
    const combinedLineage = [...parentLineage];
    logger.debug('Starting lineage combination', {
      stateId,
      initialCombinedLineage: combinedLineage
    });

    // Ensure we're working with arrays, not strings
    const flattenedMergeLineages = mergeLineages.flat();
    logger.debug('Flattened merge lineages', {
      stateId,
      flattenedMergeLineages
    });

    // Add each ID from the flattened merge lineages
    for (const id of flattenedMergeLineages) {
      if (!combinedLineage.includes(id)) {
        combinedLineage.push(id);
        logger.debug('Added ID to combined lineage', {
          stateId,
          addedId: id,
          updatedCombinedLineage: combinedLineage
        });
      }
    }

    // Add current state to the lineage
    if (!combinedLineage.includes(stateId)) {
      combinedLineage.push(stateId);
      logger.debug('Added current state to lineage', {
        stateId,
        finalCombinedLineage: combinedLineage
      });
    }

    logger.debug('Final lineage result', {
      stateId,
      parentLineage,
      mergeLineages: flattenedMergeLineages,
      combinedLineage,
      relationships: this.relationships.get(stateId)
    });

    return combinedLineage;
  }

  getStateDescendants(stateId: string, visited: Set<string> = new Set()): string[] {
    if (!this.states.has(stateId)) {
      return [];
    }

    // If we've seen this state before, return empty array to prevent cycles
    if (visited.has(stateId)) {
      return [];
    }

    // Mark this state as visited
    visited.add(stateId);

    // Get all relationships where this state is the parent
    const childRelationships = this.relationships.get(stateId) || [];
    
    // Get immediate children
    const children = childRelationships
      .filter(rel => rel.type === 'parent-child' || rel.type === 'merge-source')
      .map(rel => rel.targetId);

    // Get descendants of each child
    const descendantArrays = children.map(childId => 
      this.getStateDescendants(childId, visited)
    );

    // Combine immediate children with their descendants
    return [...children, ...descendantArrays.flat()];
  }
} 