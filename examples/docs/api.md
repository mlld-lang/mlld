# API Reference

## Original Title

This section documents the core API of TypeBlorp.

### createStore(initialState)

Creates a new store instance with the given initial state.

**Parameters:**
- `initialState`: The initial state object

**Returns:** Store instance

### store.dispatch(action)

Dispatches an action to update the store state.

**Parameters:**
- `action`: Action object with type and optional payload

### store.subscribe(observer)

Subscribes an observer to store changes.

**Parameters:**
- `observer`: Function called when state changes

**Returns:** Unsubscribe function