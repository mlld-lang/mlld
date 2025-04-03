
That's exactly the right approach! Start with inventory-taking for @embed and @run, then design comprehensive types that include everything they need throughout their lifecycle.

## Inventory for @embed Directive

Based on EMBED-CLARITY.md and the codebase:

1. **Core Type Information**
   - Explicit subtype: `'embedPath' | 'embedVariable' | 'embedTemplate'`
   - Source location data
   - Original AST node reference

2. **Content Source**
   - For Path: resolved file path + original path expression
   - For Variable: variable name, value type, field path
   - For Template: template content, variable references

3. **Processing Metadata**
   - Section extraction parameters
   - Heading level and title
   - Formatting preferences
   - Preservation flags

4. **Resolution Requirements**
   - For Variable: field access options, array notation support
   - For Path: path resolution status
   - For Template: variable resolution status

5. **Transformation State**
   - Original content
   - Resolved content
   - Transformation status

## Inventory for @run Directive

Based on RUN-CLARITY.md:

1. **Core Type Information**
   - Explicit subtype: `'basicCommand' | 'languageCommand' | 'definedCommand'`
   - Source location
   - Parsing context

2. **Command Details**
   - For BasicCommand: command string, multiline flag
   - For LanguageCommand: language, parameters, code content
   - For DefinedCommand: command name, parameter values

3. **Execution Metadata**
   - Working directory
   - Environment variables
   - Shell context
   - Timeout settings

4. **Output Handling**
   - Capture stdout/stderr
   - Error handling behavior
   - Output formatting

5. **Transformation State**
   - Execution status
   - Command output
   - Error information

## Implementation Plan

1. **Define the strict types** with all properties they need throughout lifecycle
2. **Enhance ParserService** to transform basic AST nodes into these strict types
3. **Update handlers** to expect the strict types and remove duplicate detection logic
4. **Remove context flags** related to type detection from resolution contexts
5. **Test each directive type** thoroughly as you implement

This approach will systematically eliminate the "organic accumulation" and provide a clear type-based foundation for each directive's journey through the pipeline.
