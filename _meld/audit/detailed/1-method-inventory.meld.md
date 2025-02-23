# Detailed Method Inventory Analysis

@import[../partials/header.md]

## PREVIOUS FINDINGS

@import[../1-answer.md]

## CODE TO ANALYZE

=== INTERFACE AND IMPLEMENTATION ===

@cmd[cpai ../../../services/StateService/IStateService.ts ../../../services/StateService/StateService.ts --stdout]

## YOUR TASK

Create a detailed method inventory focusing ONLY on transformation and state management methods:

1. For each transformation-related method:
   ```typescript
   {
     name: string;
     signature: string;
     inInterface: boolean;
     inImplementation: boolean;
     transformationFlags: string[];
     stateModification: string[];
     usageCount: number;
   }
   ```

2. For each state management method (clone, createChild, etc):
   ```typescript
   {
     name: string;
     signature: string;
     inInterface: boolean;
     inImplementation: boolean;
     deepCopyFields: string[];
     shallowCopyFields: string[];
     usageCount: number;
   }
   ```

DO NOT INCLUDE methods that aren't related to transformation or state management.
BE PRECISE about the types and fields that are deep vs shallow copied.
INCLUDE line numbers for each finding.

@import[../partials/quality-requirements.md] 