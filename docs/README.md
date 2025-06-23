# mlld Documentation

mlld is a simple scripting language designed to work within markdown and markdown-like documents. It processes special `/directive` lines while preserving all other content as-is.

## Documentation Structure

- [Introduction to mlld](./introduction.md) - Overview and basic concepts
- [Grammar Reference](./grammar-reference.md) - Complete syntax reference
- [Directives](./directives/README.md) - Detailed documentation for each directive
- [Variables](./variables.md) - Working with different variable types
- [Error Handling](./error-handling.md) - Understanding how errors work in mlld
- [Modules](./modules.md) - Using and creating mlld modules
- [Publishing Modules](./publishing-modules.md) - Guide to publishing modules to the registry

## Getting Started

If you're new to mlld, start with the [Introduction](./introduction.md) to learn the basic concepts.

For CLI usage information, check the [CLI Usage](./cli-usage.md) guide.

If you're integrating mlld into your application, see the [SDK Usage](./sdk-usage.md) documentation.

For sharing your mlld code with others, see the [Publishing Modules](./publishing-modules.md) guide.

## Implementation Notes

This documentation is based on the actual implementation of mlld. The directive handlers, variable resolvers, and error handling mechanisms described here match the codebase's functionality. If you encounter any discrepancies or have questions about specific features, please refer to the tests in the repository for detailed examples of supported functionality.