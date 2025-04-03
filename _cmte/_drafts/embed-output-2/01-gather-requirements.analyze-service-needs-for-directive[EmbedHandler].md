# Improving the EmbedDirectiveHandler with Stronger TypeScript Types

After reviewing the `EmbedDirectiveHandler` implementation, I've identified several areas where stronger TypeScript types would significantly improve code quality, reduce complexity, and prevent common errors. The current implementation contains extensive manual validation, complex subtype detection logic, and error-prone property access patterns.

## Current Pain Points in the Code

1. **Manual Subtype Detection**: The `determineSubtype` method contains complex conditional logic to differentiate between path, variable, and template embeds.

2. **Repetitive Property Validation**: Throughout the code, there are numerous type checks like `typeof x === 'string'` and property existence checks.

3. **Inconsistent Path Handling**: Different path types (string paths, variable references, structured paths) require special handling with manual validation.

4. **Complex Template Content Extraction**: Template content requires manual string manipulation and validation.

5. **Undefined/Null Checks**: Many defensive checks for undefined or null values.

## Proposed Type Improvements

### 1. Discriminated Union for Embed Types

```typescript
// Define a discriminated union for the three embed subtypes
type EmbedDirectiveParams = 
  | PathEmbedParams 
  | VariableEmbedParams 
  | TemplateEmbedParams;

// Path embed (for embedding file content)
interface PathEmbedParams {
  kind: 'embedPath';
  path: string | StructuredPath;
  // Optional modifiers
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
  preserveFormatting?: boolean;
}

// Variable embed (for embedding variable content)
interface VariableEmbedParams {
  kind: 'embedVariable';
  variableReference: VariableReference;
  // Optional modifiers
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
  preserveFormatting?: boolean;
}

// Template embed (for embedding template content)
interface TemplateEmbedParams {
  kind: 'embedTemplate';
  templateContent: string;
  // Optional modifiers
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
  preserveFormatting?: boolean;
}

// Strong type for variable references
interface VariableReference {
  identifier: string;
  valueType?: 'text' | 'data' | 'path' | 'command';
  fieldPath?: string;
  isVariableReference: true;
}
```

**Benefits:**
1. **Type Safety**: The discriminated union with the `kind` property eliminates the need for complex type checking.
2. **Exhaustive Handling**: TypeScript will enforce handling all cases in switch statements.
3. **Self-Documenting**: Makes the different embed types explicit in the type system.

### 2. Improved Path Type Definitions

```typescript
// Stronger typing for structured paths
interface StructuredPath {
  raw: string;
  resolved?: string;
  variables?: Array<{
    name: string;
    start: number;
    end: number;
  }>;
}

// Variable reference with specific field access support
interface VariableFieldAccess extends VariableReference {
  fieldPath: string;
  accessType: 'dot' | 'bracket';
}
```

**Benefits:**
1. **Path Variable Tracking**: Explicitly tracks variables in paths for better resolution.
2. **Clearer Field Access**: Differentiates between dot and bracket notation for field access.
3. **Reduced Manual Parsing**: Eliminates the need for regex-based variable extraction.

### 3. Resolution Context Type Enhancements

```typescript
interface ResolutionContext {
  currentFilePath?: string;
  state: IStateService;
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
    command: boolean;
  };
  allowNested: boolean;
  pathValidation: {
    requireAbsolute: boolean;
    allowedRoots: string[];
  };
  // Enhanced embed-specific flags
  embedContext?: {
    type: 'path' | 'variable' | 'template';
    disablePathPrefixing: boolean;
    preventPathPrefixing: boolean;
    isVariableEmbed: boolean;
  };
}
```

**Benefits:**
1. **Context-Aware Resolution**: Makes resolution context aware of the embed type.
2. **Explicit Flags**: Groups embed-specific flags for better organization.
3. **Clearer Intent**: Makes the purpose of each flag more explicit.

### 4. Replacement Node Type Enhancement

```typescript
interface ReplacementTextNode extends TextNode {
  formattingMetadata: {
    isFromDirective: true;
    originalNodeType: string;
    preserveFormatting: boolean;
    contextType?: string;
    isOutputLiteral?: boolean;
    nodeType?: string;
    parentContext?: any;
  };
}
```

**Benefits:**
1. **Explicit Metadata Structure**: Defines the expected structure of formatting metadata.
2. **Prevents Typos**: TypeScript will catch misspelled property names.
3. **Self-Documenting**: Makes the purpose of each metadata property clear.

## Implementation Benefits

### 1. Simplified Subtype Detection

With the discriminated union, the complex `determineSubtype` method could be simplified:

```typescript
private determineSubtype(node: DirectiveNode): 'embedPath' | 'embedVariable' | 'embedTemplate' {
  const directiveData = node.directive as EmbedDirectiveParams;
  
  // With discriminated union, this would be unnecessary
  // Just return directiveData.kind
  
  if (directiveData.kind) {
    return directiveData.kind;
  }
  
  // Legacy fallback logic for backward compatibility
  // ... (simplified version of current logic)
}
```

### 2. Type-Safe Handler Methods

The handler methods would benefit from more specific parameter types:

```typescript
private async handlePathEmbed(
  node: DirectiveNode,
  context: DirectiveContext,
  params: PathEmbedParams
): Promise<{ content: string; childState: IStateService }> {
  // Now we know we have a path without checking
  const resolvedPath = await this.resolutionService.resolveInContext(
    params.path,
    context.resolutionContext
  );
  
  // Rest of implementation...
}
```

### 3. Simplified Execute Method

The execute method would become much cleaner with discriminated unions:

```typescript
async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
  // Validate the directive structure
  this.validationService.validate(node);
  
  // Extract typed directive data
  const directiveData = node.directive as EmbedDirectiveParams;
  
  // Create appropriate resolution context based on embed type
  const resolutionContext = this.createResolutionContext(directiveData.kind, context);
  
  // Handle based on discriminated union
  switch (directiveData.kind) {
    case 'embedPath':
      return this.executePathEmbed(directiveData, context, resolutionContext);
      
    case 'embedVariable':
      return this.executeVariableEmbed(directiveData, context, resolutionContext);
      
    case 'embedTemplate':
      return this.executeTemplateEmbed(directiveData, context, resolutionContext);
      
    default:
      // TypeScript will ensure this is unreachable if all cases are handled
      throw new DirectiveError(
        `Unknown embed subtype: ${(directiveData as any).kind}`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
  }
}
```

### 4. More Robust Validation

The validator could leverage these stronger types:

```typescript
export function validateEmbedDirective(node: DirectiveNode): void {
  const directive = node.directive as EmbedDirectiveParams;
  
  // Validate based on discriminated union
  switch (directive.kind) {
    case 'embedPath':
      validatePathEmbed(directive