# Architecture

## Overview

TypeBlorp follows a unidirectional data flow pattern with an observer-based pub/sub architecture.

## Core Components

### Store
- Central state container
- Immutable state updates
- Event emission on changes

### Actions
- Pure functions that describe state changes
- Dispatched to the store
- Type-safe action creators

### Observers
- Subscribe to store changes
- React to specific state slices
- Automatic cleanup on unsubscribe

## Data Flow

1. Actions are dispatched to the store
2. Store processes actions and updates state
3. Observers are notified of changes
4. UI components react to state updates

## Benefits

- Predictable state management
- Type safety throughout
- Excellent developer experience
- Minimal boilerplate