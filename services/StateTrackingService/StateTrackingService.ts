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
        source: metadata.source || 'unknown',
        parentId: metadata.parentId,
        filePath: metadata.filePath,
        transformationEnabled: metadata.transformationEnabled || false
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

    // Initialize relationships array if it doesn't exist
    if (!this.relationships.has(sourceId)) {
      this.relationships.set(sourceId, []);
    }

    // Add the relationship
    const relationships = this.relationships.get(sourceId)!;
    const existingRelationship = relationships.find(rel => 
      rel.targetId === targetId && rel.type === type
    );

    if (!existingRelationship) {
      relationships.push({ targetId, type });
    }

    // For merge operations, we need to handle both source and target relationships
    if (type === 'merge-source' || type === 'merge-target') {
      const sourceState = this.states.get(sourceId)!;
      const targetState = this.states.get(targetId)!;

      if (type === 'merge-source') {
        // The target becomes a child of the source's parent
        if (sourceState.parentId) {
          // Remove any existing parent-child relationships for the target
          const targetRels = this.relationships.get(targetId) || [];
          const parentRels = targetRels.filter(r => r.type === 'parent-child');
          for (const rel of parentRels) {
            const parentRelationships = this.relationships.get(rel.targetId);
            if (parentRelationships) {
              const index = parentRelationships.findIndex(r => r.targetId === targetId && r.type === 'parent-child');
              if (index !== -1) {
                parentRelationships.splice(index, 1);
              }
            }
          }
          
          // Add new parent-child relationship
          this.addRelationship(sourceState.parentId, targetId, 'parent-child');
          
          // Update target's parent ID
          targetState.parentId = sourceState.parentId;
          this.states.set(targetId, targetState);
        }
      } else { // merge-target
        // The source becomes a child of the target's parent
        if (targetState.parentId) {
          // Remove any existing parent-child relationships for the source
          const sourceRels = this.relationships.get(sourceId) || [];
          const parentRels = sourceRels.filter(r => r.type === 'parent-child');
          for (const rel of parentRels) {
            const parentRelationships = this.relationships.get(rel.targetId);
            if (parentRelationships) {
              const index = parentRelationships.findIndex(r => r.targetId === sourceId && r.type === 'parent-child');
              if (index !== -1) {
                parentRelationships.splice(index, 1);
              }
            }
          }
          
          // Add new parent-child relationship
          this.addRelationship(targetState.parentId, sourceId, 'parent-child');
          
          // Update source's parent ID
          sourceState.parentId = targetState.parentId;
          this.states.set(sourceId, sourceState);
        }
      }
    }
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
    
    // If no parent, check for merge relationships
    if (!metadata.parentId) {
      // Check if this state is a merge target
      const relationships = this.relationships.get(stateId) || [];
      const mergeSourceRel = relationships.find(r => r.type === 'merge-source');
      
      if (mergeSourceRel) {
        // Get the lineage through the merge source
        const sourceLineage = this.getStateLineage(mergeSourceRel.targetId, visited);
        return [...sourceLineage, stateId];
      }
      
      return [stateId];
    }

    // Get parent's lineage first (recursively)
    const parentLineage = this.getStateLineage(metadata.parentId, visited);

    // Check for merge relationships
    const relationships = this.relationships.get(stateId) || [];
    const mergeSourceRel = relationships.find(r => r.type === 'merge-source');
    
    if (mergeSourceRel) {
      // Get the lineage through the merge source
      const sourceLineage = this.getStateLineage(mergeSourceRel.targetId, visited);
      // Combine lineages, removing duplicates
      const combinedLineage = [...new Set([...parentLineage, ...sourceLineage])];
      return [...combinedLineage, stateId];
    }

    // Return lineage from root to current state
    return [...parentLineage, stateId];
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