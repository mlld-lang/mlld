# Meld AST Parser

This module provides the core AST parser functionality for Meld.

## Overview

The Meld AST parser converts Meld documents into an Abstract Syntax Tree (AST) that can be processed by the interpreter. This module was consolidated from the previously separate `meld-ast` package.

## Usage

```typescript
import { parse } from '@core/ast';

// Parse a Meld document
const document = `@text greeting = "Hello, world!"`;
const nodes = await parse(document);

// The nodes variable will contain an array of MeldNode objects
console.log(nodes);
```

## Features

- Fast and flexible PEG.js-based parser
- Support for all Meld directive types
- Location tracking for error reporting
- Configurable validation options

## Architecture

The parser is composed of the following key components:

1. **Grammar Definition**: Uses PEG.js to define the grammar rules (`meld.pegjs`)
2. **Parser**: Converts raw text into AST nodes
3. **Type Definitions**: Shares type definitions with the core syntax module
4. **Error Handling**: Provides detailed error information for syntax issues

## Building

The grammar is compiled using the Peggy parser generator. The build process is handled by the main project build scripts.

## Integration

This module is intended to be used by the ParserService, which provides a higher-level interface for the rest of the application.