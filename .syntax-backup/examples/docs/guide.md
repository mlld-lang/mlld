# User Guide

## Introduction

Welcome to TypeBlorp! This guide will help you get started with our lightweight state management library.

TypeBlorp provides a simple yet powerful way to manage state in your TypeScript applications using a unidirectional data flow pattern combined with an observer-based pub/sub architecture.

## Getting Started

First, install TypeBlorp in your project:

```bash
npm install typeblorp
```

Then import and create your first store:

```typescript
import { createStore } from 'typeblorp';

const store = createStore({
  counter: 0,
  user: null
});
```

## Basic Usage

Dispatch actions to update state:

```typescript
store.dispatch({ type: 'INCREMENT' });
store.dispatch({ type: 'SET_USER', payload: { name: 'Alice' } });
```

## Advanced Features

- Type-safe action creators
- Computed state selectors
- Middleware support
- DevTools integration