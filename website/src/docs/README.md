---
layout: docs.njk
title: "Meld Documentation"
---

# Meld Documentation

Meld is a simple scripting language designed to work within markdown-like documents. It processes special `@directive` lines while preserving all other content as-is.

## Documentation Structure

- [Introduction to Meld](./introduction.md) - Overview and basic concepts
- [Grammar Reference](./grammar-reference.md) - Complete syntax reference
- [Directives](./directives/README.md) - Detailed documentation for each directive
- [Variables](./variables.md) - Working with different variable types
- [Error Handling](./error-handling.md) - Understanding how errors work in Meld

## Getting Started

If you're new to Meld, start with the [Introduction](./introduction.md) to learn the basic concepts.

For CLI usage information, check the [CLI Usage](./cli-usage.md) guide.

If you're integrating Meld into your application, see the [SDK Usage](./sdk-usage.md) documentation.

## Implementation Notes

This documentation is based on the actual implementation of Meld. The directive handlers, variable resolvers, and error handling mechanisms described here match the codebase's functionality. If you encounter any discrepancies or have questions about specific features, please refer to the tests in the repository for detailed examples of supported functionality.