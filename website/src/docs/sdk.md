---
layout: docs.njk
title: "SDK Usage"
---

# SDK Usage

The mlld SDK allows you to integrate mlld processing into your JavaScript or TypeScript applications.

## Installation

```bash
npm install mlld
```

## Core Function

The SDK provides one main function for processing mlld content:

### Process mlld Content

Process raw mlld content and return the output:

```typescript
import { processMlld } from 'mlld';

const content = `
/var @name = "World"
/show "Hello, @name!"
`;

const result = await processMlld(content);
console.log(result); // "Hello, World!"
```
