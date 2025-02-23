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
    // Ensure both states exist
    if (!this.states.has(sourceId)) {
      this.registerState({ id: sourceId });
    }
    if (!this.states.has(targetId)) {
      this.registerState({ id: targetId });
    }

    // Initialize relationships arrays if they don't exist
    if (!this.relationships.has(sourceId)) {
      this.relationships.set(sourceId, []);
    }
    if (!this.relationships.has(targetId)) {
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
    }

    // For merge operations, we need to handle both source and target relationships
    if (type === 'merge-source' || type === 'merge-target') {
      const sourceState = this.states.get(sourceId);
      const targetState = this.states.get(targetId);

      if (sourceState && targetState) {
        if (type === 'merge-source') {
          // For merge-source, ensure the target's parent ID is set correctly
          targetState.parentId = sourceId;
          this.states.set(targetId, targetState);

          // Note: We don't need to add a parent-child relationship here
          // because it should already exist from when the child was created
        } else if (type === 'merge-target') {
          // Update source's parent ID to be the target's parent
          const targetParentId = targetState.parentId;
          if (targetParentId) {
            sourceState.parentId = targetParentId;
            this.states.set(sourceId, sourceState);

            // Add parent-child relationship between target's parent and source
            const sourceRelationships = this.relationships.get(sourceId)!;
            const parentChildRel = sourceRelationships.find(rel =>
              rel.targetId === targetParentId && rel.type === 'parent-child'
            );
            if (!parentChildRel) {
              sourceRelationships.push({ targetId: targetParentId, type: 'parent-child' });
              logger.debug('Added parent-child relationship for merge-target:', {
                sourceId,
                targetId: targetParentId,
                updatedRelationships: sourceRelationships
              });
            }
          }
        }
      }
    }

    logger.debug('Final relationships after all operations:', {
      sourceId,
      relationships: this.relationships.get(sourceId)
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
    if (!this.states.has(stateId)) {
      return [];
    }

    // If we've seen this state before, return empty array to prevent cycles
    if (visited.has(stateId)) {
      return [];
    }

    // Mark this state as visited
    visited.add(stateId);

    // Get the state's metadata
    const metadata = this.states.get(stateId)!;
    
    // Get parent's lineage first (recursively)
    const parentLineage = metadata.parentId ? this.getStateLineage(metadata.parentId, visited) : [];

    // Check for merge relationships
    const relationships = this.relationships.get(stateId) || [];
    const mergeTargets = relationships
      .filter(rel => rel.type === 'merge-target')
      .map(rel => rel.targetId);

    // Get lineage from merge targets
    const mergeLineages = mergeTargets
      .map(targetId => {
        if (visited.has(targetId)) {
          return [];
        }
        return this.getStateLineage(targetId, visited);
      });

    // Combine parent lineage with merge target lineages
    const combinedLineage = [...parentLineage];
    for (const mergeLineage of mergeLineages) {
      for (const id of mergeLineage) {
        if (!combinedLineage.includes(id)) {
          combinedLineage.push(id);
        }
      }
    }

    // Add current state to the lineage
    if (!combinedLineage.includes(stateId)) {
      combinedLineage.push(stateId);
    }

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