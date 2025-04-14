# Synthesized Requirements for Embed Directive Subtypes and Parameters

## Core Structure Requirements

- Requirement 1: Implement a discriminated union pattern with an `embedType` field to distinguish between the three embed subtypes: 'path', 'variable', and 'template'.

- Requirement 2: Create a base interface with common properties shared across all embed subtypes.

- Requirement 3: Ensure all three subtypes properly extend the base interface while adding their specific properties.

## Path Embed Requirements

- Requirement 4: Define a `PathEmbed` interface with required `path` property (string or structured path object).

- Requirement 5: Include optional section targeting parameters: `section`, `headingLevel`, `underHeader`, and `fuzzy`.

- Requirement 6: Add a constraint that path embeds cannot contain newlines.

## Variable Embed Requirements

- Requirement 7: Define a `VariableEmbed` interface with a required `variableReference` property.

- Requirement 8: Create a standardized `VariableReference` interface with `identifier`, `valueType`, and optional `fieldPath` properties.

- Requirement 9: Include a flag to prevent path prefixing in variable embeds (`disablePathPrefixing: true`).

- Requirement 10: Add a constraint that variable embeds cannot contain newlines.

## Template Embed Requirements

- Requirement 11: Define a `TemplateEmbed` interface with a required `content` or `templateContent` property.

- Requirement 12: Include an `ignoreFirstNewline` flag to control how the first newline is handled.

- Requirement 13: Allow newlines specifically in template embeds (unlike path and variable embeds).

## Common Optional Parameters

- Requirement 14: Support a `preserveFormatting` flag across all embed types.

- Requirement 15: Include source location information to aid in error reporting.

## Type Safety Requirements

- Requirement 16: Design types to enable exhaustive switch/case handling with TypeScript's type narrowing.

- Requirement 17: Include validation constraints directly in the type system where possible.

- Requirement 18: Ensure the type system prevents invalid combinations of properties for each embed subtype.