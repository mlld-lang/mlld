# llmxml integration plan

Below is a concrete, high-level refactor plan for integrating llmxml into this Meld codebase. The plan is broken down into atomic steps so you can follow it precisely. Each step indicates what to change in the code, what to update in the tests, and what to adjust in the architecture docs. When complete, Meld will rely on llmxml for all Markdown ↔ LLM conversions and section extraction features.

────────────────────────────────────────────────────────────────────────
1. Remove md-llm references, introduce llmxml ✅
────────────────────────────────────────────────────────────────────────

1A) Delete md-llm references ✅
   • Delete tests/__mocks__/md-llm.js and any other md-llm mock files
   • Remove any imports of mdToLlm or mdToMarkdown from the codebase
   • Delete src/types/md-llm.d.ts if it exists

1B) Install llmxml ✅
   • In package.json, add:
       "llmxml": "^<VERSION>"
   • Run:
       npm install llmxml
   • Remove any md-llm dependencies from package.json

1C) Create a llmxml utility module ✅
   • Under src/converter, create llmxml-utils.ts:
     import { createLLMXML } from 'llmxml';

     const llmxml = createLLMXML();

     export async function toLLMXml(markdown: string): Promise<string> {
       return llmxml.toXML(markdown);
     }

     export async function toMarkdown(xmlOrMd: string): Promise<string> {
       return llmxml.toMarkdown(xmlOrMd);
     }

     export async function extractSection(
       content: string,
       heading: string,
       opts?: {
         level?: number;
         fuzzyThreshold?: number;
         includeNested?: boolean;
       }
     ): Promise<string> {
       return llmxml.getSection(content, heading, opts);
     }

     export type LLMXMLError = 
       | { code: 'SECTION_NOT_FOUND'; message: string }
       | { code: 'PARSE_ERROR'; message: string }
       | { code: 'INVALID_FORMAT'; message: string }
       | { code: 'INVALID_LEVEL'; message: string }
       | { code: 'INVALID_SECTION_OPTIONS'; message: string };

────────────────────────────────────────────────────────────────────────
2. Refactor conversion logic to use llmxml 🟨
────────────────────────────────────────────────────────────────────────

2A) Replace conversion calls ✅
   • In index.ts (SDK's runMeld pipeline), update the format conversion:
       import { toLLMXml, toMarkdown } from '../converter/llmxml-utils';
       ...
       if (options.format === 'llm') {
         output = await toLLMXml(content);
       } else {
         output = await toMarkdown(content);
       }

2B) Remove metadata handling ✅
   • Remove any code handling includeMetadata options
   • Update function signatures to remove metadata parameters
   • Remove metadata-related tests

2C) Add error handling ✅
   • Wrap llmxml calls in try/catch blocks
   • Handle specific error codes from llmxml:
       try {
         const output = await toLLMXml(content);
       } catch (error) {
         if (error.code === 'PARSE_ERROR') {
           logger.error('Failed to parse markdown:', error.message);
         }
         // Handle other specific error codes
         throw error;
       }

────────────────────────────────────────────────────────────────────────
3. Implement section extraction for @embed directive 🟨
────────────────────────────────────────────────────────────────────────

3A) Update @embed directive to use section extraction ✅
   • Modify the directive handler to use extractSection:
       const section = await extractSection(fileContent, heading, {
         fuzzyThreshold: 0.8,
         includeNested: true
       });

3B) Add error handling for section extraction ✅
   • Handle SECTION_NOT_FOUND and other specific errors
   • Add appropriate error messages and logging
   • Ensure errors bubble up to the user appropriately

3C) Add fuzzy matching configuration ✅
   • Set default fuzzyThreshold to 0.8
   • Allow configuration via directive arguments:
     @embed [file.md # Setup >> fuzzy=0.9]

────────────────────────────────────────────────────────────────────────
4. Update tests for new XML format 🟨
────────────────────────────────────────────────────────────────────────

4A) Update format conversion tests ✅
   • Replace old .llm format expectations with new XML format
   • Add tests for XML structure validation
   • Test error cases for invalid markdown

4B) Add section extraction tests ✅
   • Test exact matches
   • Test fuzzy matches with different thresholds
   • Test error cases for missing sections
   • Test nested section handling

4C) Add comprehensive error handling tests ✅
   • Test each error code from llmxml
   • Verify error messages and logging
   • Test error propagation

────────────────────────────────────────────────────────────────────────
5. Update Documentation ✅
────────────────────────────────────────────────────────────────────────

5A) Update ARCHITECTURE.md ✅
   • Document the use of llmxml for conversions
   • Explain the XML format structure
   • Document error handling approach

5B) Document @embed enhancements ✅
   • Document fuzzy section matching
   • Explain configuration options
   • Provide examples

5C) Update CLI docs ✅
   • Document the XML format for --format llm output
   • Add examples of section extraction via CLI

────────────────────────────────────────────────────────────────────────
6. Final Integration & Testing 🟨
────────────────────────────────────────────────────────────────────────

6A) Run full test suite ✅
   • Verify all tests pass with new XML format
   • Check error handling coverage
   • Verify section extraction functionality

6B) Manual testing ❌
   • Blocked: Need to complete CLI refactoring first
   • Test CLI with various inputs
   • Verify error messages are user-friendly
   • Test fuzzy matching with real-world examples

6C) Code cleanup ✅
   • Remove any remaining md-llm references
   • Remove unused code and types
   • Update comments and documentation

────────────────────────────────────────────────────────────────────────
SUMMARY
────────────────────────────────────────────────────────────────────────
Progress:
✅ Complete: 14 items
🟨 Partial: 3 items
❌ Not Started: 1 items

This plan fully embraces llmxml's capabilities, implementing proper error handling and fuzzy section matching. The result will be a more robust system with better section extraction capabilities and clearer error handling. The XML format provides better structure for LLM consumption, and the fuzzy matching makes the @embed directive more powerful and user-friendly.
