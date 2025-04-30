# AST Values Specification Draft - Planning Checklist

**Goal:** Ensure the proposed AST structure in this specification accurately reflects the Meld grammar (`meld.pegjs`) and syntax (`SYNTAX.md`) before implementation.

**Process:**

1.  **Identify All Directive Kinds:**
    *   [ ] `@run`
    *   [ ] `@embed`
    *   [ ] `@import`
    *   [ ] `@define`
    *   [ ] `@text`
    *   [ ] `@path`
    *   [ ] `@data`

    **Subtype Identification (Based on Grammar/Syntax):**
    *   `@run`: `runCommand`, `runDefined`, `runCode`, `runCodeParams`. *Grammar check done.*
    *   `@embed`: `embedPath`, `embedVariable`, `embedTemplate` (Note: Section embedding needs check)
    *   `@import`: `importAll`, `importStandard`, `importNamed`
    *   `@define`: `variable`, `command`. *Grammar check done.*
    *   `@text`: `textBracketed`, `textAssignment`. *Grammar check done.*
    *   `@path`: None. *Grammar check done.*
    *   `@data`: None. *Grammar check done.*

2.  **Specify Each Directive Variant:**
    *   For *each* unique `kind`/`subtype` combination:
        *   [ ] **Locate Grammar Rule:** Find the specific rule(s) in `core/ast/grammar/meld.pegjs` that parse this variant. (`@run`: L683-L733; `@embed`: L827-836 uses `_EmbedRHS` L549-597; `@import`: L751-800; `@define`: L881-904 uses helpers L906-955; `@text`: L1168-1196 uses L1198-1233; `@path`: L1000-1020; `@data`: L1035-1045 uses L1047-1085)
        *   [ ] **Identify Grammar Labels:** Extract the exact labels used in the grammar rule for each captured component. (`@run`: done; `@embed`: done; `@import`: `subtype` (from helper), `path` (from helper), `imports`; `@define`: `id.name`, `id.field`, `params`, `value` (or `value.value` for run); `@text`: `content`, `id`, `value` (-> `embed`, `run`, `values`), `value.type` (-> `source`); `@path`: `path`; `@data`: `id`, `value` (-> `embed`, `run`, `value`), `value.type` (-> `source`))
        *   [ ] **Define/Refine `...Values` Interface:** Create or update the corresponding TypeScript interface. (`@run` updated; `@embed` updated; `@import` updated; `@define` updated; `@text` updated; `@path` updated; `@data` updated)
        *   [ ] **Specify Node Types:** Define the expected `INode` type(s) for each field. (`@run` updated; `@embed` updated; `@import` updated; `@define` updated; `@text` updated; `@path` updated; `@data` updated)
        *   [ ] **Add/Verify Example:** Include a clear JSON example demonstrating the expected AST output. (`@run` updated; `@embed` examples OK; `@import` examples OK; `@define` OK; `@text` OK; `@path` needs review; `@data` added)

3.  **Standardize Common Fields:**
    *   [ ] **Identify Common Fields:** Look for fields that appear across multiple directives (e.g., `raw`, `path`, `identifier`).

### `@embed` Directive

Embeds content from external files, variables, or inline templates.

##### Base Structure for `@embed`

```typescript
interface BaseEmbedValues extends BaseDirectiveValues {
  subtype: 'embedPath' | 'embedVariable' | 'embedTemplate';
  /** Optional directive options like 'verbatim', 'syntax=md'. */
  options?: DirectiveOptions; // Grammar label: 'options'
  /** Optional header level adjustment (e.g., 'as ##'). */
  headerLevel?: number; // Grammar label: 'headerLevel'
  /** Optional target header for insertion (e.g., 'under "Some Header"'). */
  underHeader?: string; // Grammar label: 'underHeader'
}
```

##### `embedPath`

*   **Syntax:** `@embed [path/to/file.md#section?] ...options`
*   **Purpose:** Embeds content from a file, optionally from a specific section.

```typescript
interface EmbedPathValues extends BaseEmbedValues {
  subtype: 'embedPath';
  /** 
   * Object containing details about the path.
   * Grammar label: 'path' (derived from 'content' via validatePath)
   */
  path: PathValue;
  /** 
   * Optional section identifier (string after '#'). 
   * Grammar label: 'section' (derived from 'content')
   */
  section?: string;
}

// Supporting type for PathValue (ensure alignment with validatePath result)
interface PathValue {
  type: 'PathValue';
  /** The raw string as entered. Grammar: 'pathStr' from PathStringLiteral/BracketInterpolatableContent */
  raw: string;
  /** Array of nodes representing the path parts. Grammar: derived from parsing raw. Expects TextNode | VariableReferenceNode. */
  values: INode[]; 
  isAbsolute: boolean;
  isRelativeToCwd: boolean;
  hasVariables: boolean;
  hasTextVariables: boolean;
  hasPathVariables: boolean;
  variable_warning: boolean;
}
```

Example:

```json
// @embed [src/content.md#Introduction] as ### under "Overview"
{
  "type": "Directive",
  "directive": {
    "kind": "embed",
    "subtype": "embedPath",
    "raw": "[src/content.md#Introduction]", // Needs grammar confirmation
    "path": {
      "type": "PathValue",
      "raw": "src/content.md", 
      "values": [
         { "type": "Text", "content": "src/content.md" } // Example
         // Potentially includes SectionMarker node? TBC
      ],
      "isAbsolute": false,
      // ... other flags
    },
    "section": "Introduction",
    "headerLevel": 3,
    "underHeader": "Overview",
    "options": null // Example
  }
}
```

##### `embedVariable`

*   **Syntax:** `@embed {{variableName}} ...options`
*   **Purpose:** Embeds the content of a variable.

```typescript
interface EmbedVariableValues extends BaseEmbedValues {
  subtype: 'embedVariable';
  /** 
   * The variable reference node.
   * Grammar label: 'variable' (wrapped in 'values' array)
   */
  values: [VariableReferenceNode];
}
```

Example:

```json
// @embed {{userBio}}
{
  "type": "Directive",
  "directive": {
    "kind": "embed",
    "subtype": "embedVariable",
    "raw": "{{userBio}}", // Needs grammar confirmation
    "values": [
      { "type": "VariableReference", "identifier": "userBio", "valueType": "text or data? TBC" }
    ],
    "options": null,
    "headerLevel": null,
    "underHeader": null
  }
}
```

##### `embedTemplate`

*   **Syntax:** `@embed [[ inline template content {{var}} ]] ...options`
*   **Purpose:** Embeds inline content defined using `[[...]]`.

```typescript
interface EmbedTemplateValues extends BaseEmbedValues {
  subtype: 'embedTemplate';
  /** 
   * Indicates this is template content.
   * Grammar label: derived from using '[['
   */
  isTemplateContent: true;
  /** 
   * Array of nodes representing the template content.
   * Grammar label: 'content'
   */
  values: INode[]; // Array of TextNode and VariableReferenceNode
}
```

Example:

```json
// @embed [[## Welcome, {{name}}!]]
{
  "type": "Directive",
  "directive": {
    "kind": "embed",
    "subtype": "embedTemplate",
    "raw": "[[]]", // Needs grammar confirmation
    "isTemplateContent": true,
    "values": [
       { "type": "Text", "content": "## Welcome, " },
       { "type": "VariableReference", "identifier": "name" },
       { "type": "Text", "content": "!" }
    ],
    "options": null,
    "headerLevel": null,
    "underHeader": null
  }
}
```

### `@import` Directive

Imports variables or data from other Meld files or external sources.

##### Supporting Types

```typescript
// Represents an item in the import list (e.g., 'name' or 'name as alias')
interface ImportedItem {
  /** The original name of the item being imported. Grammar: 'name' from ImportItem */
  name: string; 
  /** The alias under which the item is imported, if any. Grammar: 'alias' from ImportItem */
  alias: string | null;
}

// Reusing PathValue defined under @embed
// interface PathValue { ... }
```

##### Base Structure for `@import`

```typescript
interface BaseImportValues extends BaseDirectiveValues {
  subtype: 'importAll' | 'importStandard' | 'importNamed';
  /** 
   * Object containing details about the import path.
   * Grammar label: 'path' (derived from 'pathParts' or 'variable' via validatePath)
   */
  path: PathValue;
}
```

##### `importAll`

*   **Syntax:** `@import [*] from [path]` or `@import [path]` (legacy)
*   **Purpose:** Imports all exported items from the source.

```typescript
interface ImportAllValues extends BaseImportValues {
  subtype: 'importAll';
  /** 
   * Indicates all items are imported. 
   * Grammar label: 'imports' (derived from '*' or implicit)
   */
  imports: [ImportedItem]; // Always [{ name: '*', alias: null }]
}
```

Example:

```json
// @import [*] from [./config.meld]
{
  "type": "Directive",
  "directive": {
    "kind": "import",
    "subtype": "importAll",
    "raw": "[./config.meld]",
    "path": { 
      "type": "PathValue",
      "raw": "./config.meld",
      "values": [ { "type": "Text", "content": "./config.meld" } ],
      "isAbsolute": false
    },
    "imports": [{ "name": "*", "alias": null }]
  }
}
```

##### `importNamed`

*   **Syntax:** `@import [item1, item2 as alias] from [path]`
*   **Purpose:** Imports specific named items from the source.

```typescript
interface ImportNamedValues extends BaseImportValues {
  subtype: 'importNamed';
  /** 
   * List of specific items to import.
   * Grammar label: 'imports' (derived from ImportsList)
   */
  imports: ImportedItem[];
}
```

Example:

```json
// @import [apiKey, theme as siteTheme] from [$config]
{
  "type": "Directive",
  "directive": {
    "kind": "import",
    "subtype": "importNamed",
    "raw": "$config",
    "path": { 
      "type": "PathValue",
      "raw": "./config.meld",
      "values": [ { "type": "Text", "content": "./config.meld" } ],
      "isAbsolute": false
    },
    "imports": [
      { "name": "apiKey", "alias": null },
      { "name": "theme", "alias": "siteTheme" }
    ]
  }
}
```

##### `importStandard`

*   **Syntax:** `@import [] from [path]` or `@import [pathValue]` (simple)
*   **Purpose:** Imports the 'default' or standard export of the source (exact meaning TBD, could be file content or specific variable).

```typescript
interface ImportStandardValues extends BaseImportValues {
  subtype: 'importStandard';
  /** No specific imports listed. Grammar label: 'imports' is empty [] or undefined. */
  // imports?: undefined; // Field is absent
}
```

Example:

```json
// @import [./document.md]
{
  "type": "Directive",
  "directive": {
    "kind": "import",
    "subtype": "importStandard", // Assuming getImportSubtype([]) returns this
    "raw": "[./document.md]",
    "path": { 
      "type": "PathValue",
      "raw": "./document.md",
      "values": [ { "type": "Text", "content": "./document.md" } ],
      "isAbsolute": false
    }
    // 'imports' field is absent
  }
}
```

### `@define` Directive

Defines variables or runnable commands within the Meld scope.

*   **Syntax (Variable):** `@define name.field?(param1, ...) = "value with {{interpolation}}"`
*   **Syntax (Command):** `@define commandName(param1, ...) = @run [ shell command {{param1}} ]`
*   **Purpose:** Assigns a value or a runnable command definition to an identifier.

```typescript
// Reusing RunDirectiveValues from @run section
// type RunDirectiveValues = ...

// Represents the data associated with a @define directive
interface DefineDirectiveValues extends BaseDirectiveValues {
  /** 
   * The primary name of the variable/command being defined.
   * Grammar label: 'id.name'
   */
  name: string; 
  /** 
   * Optional classification field (e.g., 'meta', 'risk.high').
   * Grammar label: 'id.field'
   */
  field?: string;
  /** 
   * Optional parameters if defining a runnable command or function-like variable.
   * Grammar label: 'params' (parsed by DefineParams)
   */
  parameters?: IdentifierNode[];
  /** 
   * The simple value assigned (if not a command).
   * Grammar label: 'value' (result of DefineValue, type 'string')
   */
  value?: InterpolatedStringLiteralNode; 
  /** 
   * The command definition (if value starts with @run).
   * Grammar label: 'command' (result of DefineValue, type 'run')
   */
  command?: RunDirectiveValues; // One of the Run...Values subtypes
}

// Note: 'value' and 'command' are mutually exclusive. A type guard or check
// is needed in processing logic based on the parsed structure.
```

**Example (Simple Value):**

```json
// @define site.title = "My Awesome {{project}} Blog"
{
  "type": "Directive",
  "directive": {
    "kind": "define",
    // "raw": "site.title", // BaseDirectiveData.raw needs definition
    "values": {
      "name": "site",
      "field": "title",
      "value": { 
         "type": "InterpolatedStringLiteral", 
         "values": [ 
            { "type": "Text", "content": "My Awesome " }, 
            { "type": "VariableReference", "identifier": "project" },
            { "type": "Text", "content": " Blog" }
         ]
      }
      // 'parameters' and 'command' are absent
    }
  }
}
```

**Example (Runnable Command):**

```json
// @define greet(name) = @run [echo \"Hello, {{name}}!\"]
{
  "type": "Directive",
  "directive": {
    "kind": "define",
    // "raw": "greet", // BaseDirectiveData.raw needs definition
    "values": {
      "name": "greet",
      "parameters": [
        { "type": "Identifier", "name": "name" }
      ],
      "command": { // This is a RunCommandValues structure
        "subtype": "runCommand",
        "raw": "[echo \"Hello, {{name}}!\"]",
        "values": [
           { "type": "Text", "content": "echo \"Hello, " },
           { "type": "VariableReference", "identifier": "name" },
           { "type": "Text", "content": "!\"" }
        ]
        // outputVariable/errorVariable potentially here from BaseRunValues?
      }
      // 'field' and 'value' are absent
    }
  }
}
```

### `@text` Directive

Handles the insertion or assignment of text content, potentially derived from various sources.

##### Base Structure for `@text`

```typescript
interface BaseTextValues extends BaseDirectiveValues {
  subtype: 'textBracketed' | 'textAssignment';
}
```

##### `textBracketed`

*   **Syntax:** `@text [ interpolated content ]`
*   **Purpose:** Directly inserts the bracketed content.

```typescript
interface TextBracketedValues extends BaseTextValues {
  subtype: 'textBracketed';
  /** 
   * Array of nodes representing the bracketed content.
   * Grammar label: 'content'
   */
  values: INode[]; // Array of TextNode and VariableReferenceNode
}
```

Example:

```json
// @text [Hello, {{world}}!]
{
  "type": "Directive",
  "directive": {
    "kind": "text",
    "subtype": "textBracketed",
    "raw": "[Hello, {{world}}!]",
    "values": [
      { "type": "Text", "content": "Hello, " },
      { "type": "VariableReference", "identifier": "world" },
      { "type": "Text", "content": "!" }
    ]
  }
}
```

##### `textAssignment`

*   **Syntax:** `@text identifier = sourceValue` (where sourceValue can be literal, @embed, @run)
*   **Purpose:** Assigns text content derived from a source to an identifier (likely for use in templating or later directives).

```typescript

// Interface for Assignment subtype
interface TextAssignmentValues extends BaseTextValues {
  subtype: 'textAssignment';
  /** 
   * The identifier the text is assigned to.
   * Grammar label: 'id'
   */
  identifier: IdentifierNode;
  /** 
   * The type of the source providing the text value.
   * Grammar label: Derived from TextValue rule ('embed', 'run', 'literal')
   */
  source: 'embed' | 'run' | 'literal';
  
  // --- Conditional Fields based on 'source' --- 
  /** The embedded content definition (if source is 'embed'). Grammar label: 'embed' */
  embed?: EmbedDirectiveValues;
  /** The run command definition (if source is 'run'). Grammar label: 'run' */
  run?: RunDirectiveValues;
  /** The literal nodes (if source is 'literal'). Grammar label: 'values' when type is 'literal' */
  values?: InterpolatedStringLiteralNode | InterpolatedMultilineTemplateNode; 
}

// Assume existence of InterpolatedMultilineTemplateNode type
```

Example (Literal Source):

```json
// @text greeting = "Hi {{user.name}}!"
{
  "type": "Directive",
  "directive": {
    "kind": "text",
    "subtype": "textAssignment",
    "raw": "= \"Hi {{user.name}}!\"",
    "identifier": { "type": "Identifier", "name": "greeting" },
    "source": "literal",
    "values": { 
      "type": "InterpolatedStringLiteral",
      "values": [ /* nodes for "Hi ", user.name ref, "!" */ ]
    }
  }
}
```

Example (Embed Source):

```json
// @text intro = @embed [./intro.md#section1]
{
  "type": "Directive",
  "directive": {
    "kind": "text",
    "subtype": "textAssignment",
    "raw": "= @embed [./intro.md#section1]",
    "identifier": { "type": "Identifier", "name": "intro" },
    "source": "embed",
    "embed": { // EmbedPathValues structure
       "subtype": "embedPath",
       "raw": "[./intro.md#section1]",
       "path": { 
         "type": "PathValue",
         "raw": "./intro.md", 
         "values": [ { "type": "Text", "content": "./intro.md" } ],
         "isAbsolute": false
       },
       "section": "section1"
       // options, headerLevel, underHeader would be null/absent here
     }
  }
}
```

### `@path` Directive

*   **Syntax:** `@path identifier = "pathValue"`
*   **Purpose:** Defines a named path, potentially used in later directives.

```typescript
interface PathDirectiveValues extends BaseDirectiveValues {
  /** 
   * The identifier for the path variable.
   * Grammar label: 'id'
   */
  identifier: IdentifierNode;
  /** 
   * Object containing details about the path.
   * Grammar label: 'path' (derived from 'content' via validatePath)
   */
  path: PathValue;
}
```

Example:

```json
// @path assets = "./src/assets"
{
  "type": "Directive",
  "directive": {
    "kind": "path",
    "raw": "= \"./src/assets\"",
    "identifier": { "type": "Identifier", "name": "assets" },
    "path": { 
       "type": "PathValue",
       "raw": "./src/assets", 
       "values": [ { "type": "Text", "content": "./src/assets" } ],
       "isAbsolute": false
       // ... other flags from validatePath
    }
  }
}
```

### `@data` Directive

Defines a named data structure, sourced from inline literals, embeds, or commands.

*   **Syntax:** `@data identifier = sourceValue`
*   **Purpose:** Creates a variable holding structured data.

```typescript
// Interface for @data directive values
interface DataDirectiveValues extends BaseDirectiveValues {
  /** 
   * The identifier for the data variable.
   * Grammar label: 'id'
   */
  identifier: IdentifierNode;
  /** 
   * The type of the source providing the data.
   * Grammar label: Derived from DataValue rule ('embed', 'run', 'literal')
   */
  source: 'embed' | 'run' | 'literal';
  
  // --- Conditional Fields based on 'source' --- 
  /** The embedded content definition (if source is 'embed'). Grammar label: 'embed' */
  embed?: EmbedDirectiveValues;
  /** The run command definition (if source is 'run'). Grammar label: 'run' */
  run?: RunDirectiveValues;
  /** 
   * The literal data structure (if source is 'literal'). 
   * Grammar label: 'value' when type is 'literal'. 
   * NOTE: The grammar parser returns a raw JavaScript object or array directly for this field.
   */
  value?: Record<string, any> | any[]; 
}
```

Example (Literal Object Source):

```json
// @data user = { name: "{{defaultName}}", role: "admin" }
{
  "type": "Directive",
  "directive": {
    "kind": "data",
    "raw": "= { name: \"{{defaultName}}\", role: \"admin\" }",
    "identifier": { "type": "Identifier", "name": "user" },
    "source": "literal",
    "value": { 
      // Raw JS object parsed directly by the grammar
      "name": "{{defaultName}}", // String value containing potential interpolation markers
      "role": "admin"         // Simple string value
    }
    // 'embed', 'run' are absent
  }
}
```

Example

```json
// @data config:AppConfig = @embed [./config.yaml]
{
  "type": "Directive",
  "directive": {
    "kind": "data",
    "raw": "= @embed [./config.yaml]",
    "identifier": { "type": "Identifier", "name": "config" },
    "source": "embed",
    "embed": { // EmbedPathValues structure for the *source* of the data
       "subtype": "embedPath",
       "raw": "[./config.yaml]",
       "path": { 
         "type": "PathValue", 
         "raw": "./config.yaml",
         "values": [ { "type": "Text", "content": "./config.yaml" } ],
         "isAbsolute": false
       }
       // section, options etc. likely null/absent
    }
    // 'value', 'run' are absent
  }
}
```

### Shared Structures

```typescript
// Base for directives that capture the RHS raw string
interface BaseDirectiveValues {
  /** The raw representation of the directive's right-hand side or primary content. */
  raw: string;
}
```

```typescript
// Represents a parsed path string, potentially with interpolation
interface PathValue extends INode {
  type: 'PathValue';
  /** The raw string as entered. Grammar: 'pathStr' from PathStringLiteral/BracketInterpolatableContent */
  raw: string;
  /** Array of nodes representing the path parts. Grammar: derived from parsing raw. Expects TextNode | VariableReferenceNode. */
  values: INode[]; 
  isAbsolute: boolean;
  isRelativeToCwd: boolean;
  hasVariables: boolean;
  hasTextVariables: boolean;
  hasPathVariables: boolean;
  variable_warning: boolean;
}
