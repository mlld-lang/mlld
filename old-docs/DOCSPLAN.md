Below is a comprehensive example of how you might structure and write a complete documentation set for this codebase. Each file or logical grouping of files gets its own “unit doc” in a __docs__ folder adjacent to the code, and there is a set of “high-level” documents in a top-level docs folder. You can adapt file names, referencing styles, and subfolders as you see fit. The overarching principle is that each module has its own doc file, each directive has its own doc file, and there is a root-level set of docs that summarize the architecture.

The sample text below demonstrates the style and organization you might aim for: each doc uses an inverted-pyramid style (most important info at the top), includes ASCII diagrams, references to other modules’ docs, and a troubleshooting section.

Finally, at the bottom, you’ll find an Implementation Plan that describes how to place these docs into the codebase.

1. Top-Level Docs (docs/)

docs/Architecture_Overview.md

Title: Meld Project - Architecture Overview
Location: docs/Architecture_Overview.md

Purpose
Provide a high-level overview of the Meld system, how the modules interact, and the big-picture architecture.

High-Level Summary
Meld is a system for parsing, interpreting, and transforming content (written in “Meld language”) into various outputs or states. At its core, Meld revolves around three processes:
	1.	Parsing: Breaking Meld content into an internal AST (Abstract Syntax Tree).
	2.	Interpreting: Executing “directives” found in the AST to modify an in-memory state or trigger side effects (like reading or writing files).
	3.	Converting: Rendering the interpreted state into final output formats (like LLM-friendly text or Markdown).

Here’s a rough ASCII diagram of the core data flow:

+-------------------+        +--------------------+        +----------------------+
|   Meld Content    | --->   |      Parser        | --->   |    Interpreter       |
| (input files)     |        | (parseMeld)        |        | (directiveRegistry)  |
+-------------------+        +--------------------+        +-----------+----------+
                                                                      |
                                                                      v
                                                        +----------------------------+
                                                        |    Interpreter State       |
                                                        | (stores variables, data)   |
                                                        +----------------------------+
                                                                      |
                                                                      v
                                                        +----------------------------+
                                                        |   Output Conversion       |
                                                        | (mdToLlm, mdToMarkdown)   |
                                                        +----------------------------+
                                                                      |
                                                                      v
                                                        +----------------------------+
                                                        |      Final Output         |
                                                        +----------------------------+

	•	CLI (meld.ts / cli.ts): Entry points for command-line usage.
	•	Interpreter: Where directives and state logic happen (interpreter, state, directives).
	•	Parser: Breaks raw Meld text into an internal AST (parseMeld).
	•	Directives: Specialized instructions discovered during parsing and executed by the interpreter (text, data, run, etc.).
	•	SDK (index.ts): A friendly interface (e.g. runMeld) for programmatically using Meld.

Key Modules
	1.	meld.ts: CLI starter that delegates to cli.ts.
	2.	cli.ts: Orchestrates CLI argument parsing and calls the core runMeld function.
	3.	index.ts: Re-exports the main functionality, including parseMeld, interpretMeld, and runMeld.
	4.	Directives: Each file (data.ts, define.ts, embed.ts, etc.) implements a “directive handler.”
	5.	interpreter.ts / parser.ts: Coordinates directive handling (interpret) and tokenization/AST-building.
	6.	logger.ts: Winston-based logging for debugging and error logging.
	7.	converter.ts: Converts an AST to other formats (e.g., Markdown, XML).
	8.	errors.ts / factory.ts: Errors and error-factory logic.
	9.	state.ts: Holds the ephemeral “interpreter state.”

See the individual docs in src/__docs__/*.md and src/interpreter/directives/__docs__/*.md for detailed explanations.

Troubleshooting
	•	Problem: CLI returns “File not found: xyz”
Solution: Ensure the input file path is correct and that your current working directory is what you expect.
	•	Problem: Logger output isn’t showing up.
Solution: Make sure LOG_LEVEL is set to debug or info, and that the logs folder is writable.
	•	Problem: Some directives aren’t recognized.
Solution: Check that the directive type (e.g., @data) is spelled correctly, and that the directive is indeed registered in the directive registry.

References
	•	Implementation Plan
	•	CLI Module Documentation
	•	Interpreter Documentation

docs/Implementation_Plan.md

Title: Implementation Plan for AI Developers
Location: docs/Implementation_Plan.md

Overview
This document outlines how you, as an AI developer or integrator, should organize and place the documentation in the codebase, ensuring each module and directive has a dedicated “unit doc” that references the rest of the system.

Plan
	1.	Create a docs folder at the root of the repo for top-level project docs.
	2.	Within the src folder, create a __docs__ subfolder that mirrors the structure of the source code. For instance, src/__docs__/cli.md, src/__docs__/meld.md, etc.
	3.	For directives, create __docs__ inside src/interpreter/directives, e.g. src/interpreter/directives/__docs__/DataDirectiveHandler.md.
	4.	Each doc should begin with a short summary (2–3 lines) that explains the role of the file or directive, then an ASCII diagram, then detailed usage, references to other docs, and a troubleshooting section.
	5.	Link them using relative paths, e.g. [CLI Doc](../cli.md).
	6.	Encourage consistent naming: each doc is named exactly like the module, e.g. cli.ts -> cli.md. For directive classes, name the doc after the class, e.g. DataDirectiveHandler.md.
	7.	Review all references to ensure no broken links.
	8.	Commit these docs to version control so they stay up-to-date with code changes.

References
	•	Architecture Overview

2. Per-Module Docs (src/__docs__/...)

Below are examples of how to structure each doc. You will create one doc file per module. Where relevant, we show a shorter version below for brevity; in an actual codebase, you would elaborate more deeply.

src/docs/meld.md

Title: Meld CLI Entry (meld.ts)
Location: src/__docs__/meld.md

Summary
meld.ts is the NodeJS entry point that calls cli.ts. It receives process.argv, spawns the CLI command logic, and logs any critical errors.

Diagram

[ CLI command ]
      |
      v
+--------------------+
| meld.ts / cli.ts   |
|   (entry point)    |
+--------------------+
      |
      v
[ interpreter logic in index.ts ]

Detailed Explanation
	1.	Imports: It imports { cli } from '../cli' and a logger.
	2.	Execution: It calls cli(process.argv) and catches any errors.
	3.	Error Handling: On error, it logs and exits with code 1.

Troubleshooting
	•	Problem: “CLI execution failed.”
Solution: Check that your arguments are valid and that cli.ts is returning a promise.
	•	Problem: Permissions error.
Solution: Ensure your Node environment has the necessary permissions.

References
	•	CLI Module Doc
	•	Index Module Doc
	•	Logger Module Doc

src/docs/cli.md

Title: CLI Module (cli.ts)
Location: src/__docs__/cli.md

Summary
The cli.ts handles command-line parsing (parseArgs) and orchestrates the Meld flow by calling runMeld.

Diagram

+------------------+  parseArgs  +--------------------+
|  process.argv    | ----------> |  CLIOptions object |
+------------------+             +--------------------+
                                       |
                                       v
                                  runMeld(inputFile, options)
                                       |
                                       v
                          [Return or write output to file/stdout]

Detailed Explanation
	1.	parseArgs(args: string[]): CliOptions
	•	Analyzes --input, --output, --format, etc.
	•	Logs debugging messages. Throws an error if --input is missing.
	2.	run(args: string[]): Promise<void>
	•	Logs start of execution.
	•	Resolves input & output file paths.
	•	Calls runMeld from index.ts.
	•	Writes the output to disk or stdout.

Troubleshooting
	•	Problem: “Input file is required” error.
Solution: Provide --input path/to/file.meld.
	•	Problem: Output not seen in console.
Solution: Omit --output to force writing to stdout, or check you have console access.

References
	•	Meld Entry (meld.ts)
	•	Index Module Doc
	•	Logger Module Doc

src/docs/index.md

Title: Index Module (index.ts)
Location: src/__docs__/index.md

Summary
Serves as the main aggregator for Meld’s core functionalities, providing parseMeld, interpretMeld, runMeld, and type exports.

Diagram

            +------------------+
            | index.ts exports |
            +------------------+
                 |    |    |
                 v    v    v
  parseMeld(...)   interpretMeld(...)    runMeld(...)
                 ^         |
                 |         +----> uses interpreter.ts
                 |
          uses parser.ts

Detailed Explanation
	•	Exports
	•	parseMeld(content) → returns an array of AST nodes from parser.ts.
	•	interpretMeld(nodes, state?) → interprets nodes with the directive registry (interpreter.ts).
	•	runMeld(filePath, options?) → orchestrates reading a Meld file, parsing, interpretation, and final output.
	•	Implementation
	1.	parseMeld delegates to parser.ts.
	2.	interpretMeld delegates to interpreter.ts.
	3.	runMeld uses fs to read the file and performs an end-to-end parse + interpret + format.

Troubleshooting
	•	Problem: “File not found” from runMeld.
Solution: Ensure the file path is correct or absolute.
	•	Problem: Format output is incorrect.
Solution: Check the format property is 'md' or 'llm'.

References
	•	Parser Doc
	•	Interpreter Doc
	•	CLI Doc

src/docs/converter.md

Title: Converter Module (converter.ts)
Location: src/__docs__/converter.md

Summary
converter.ts provides toXml and toMarkdown functions to convert Meld AST nodes into various textual formats.

Diagram

+--------------------+
|  MeldNode[] input  |
+---------+----------+
          |
          v
   converter.toXml(...)
          |
          v
    <XML output>

Similarly for toMarkdown.

Detailed Explanation
	•	toXml(nodes: MeldNode[]): string
Iterates over each node and transforms it into an XML string snippet.
	•	toMarkdown(nodes: MeldNode[]): string
Iterates over each node and maps them to GitHub-flavored Markdown constructs.

Troubleshooting
	•	Problem: Unexpected or empty output.
Solution: Confirm your nodes have recognized types (Text, CodeFence, Directive).
	•	Problem: Special characters break XML.
Solution: Consider escaping them yourself or adding escape logic in toXml().

References
	•	Index Module Doc (for seeing how converters may integrate)
	•	Parser Doc

src/docs/meld-ast.md

Title: Meld AST Module (meld-ast.ts)
Location: src/__docs__/meld-ast.md

Summary
meld-ast.ts demonstrates a mock parsing system with simple structures for DirectiveNode and TextNode. In production, more advanced parsing is used, but this is a simplified reference.

Diagram

            +------------------------+
            | meld-ast.ts           |
            | parse(content: string)|
            +-----------+------------+
                        |
       +----------------v----------------+
       | returns Node[] with type=Text  |
       | or type=Directive if matched   |
       +--------------------------------+

Detailed Explanation
	•	parse(content: string) => Node[]
	•	If @text ..., returns a DirectiveNode of kind text.
	•	If @data ..., returns a DirectiveNode of kind data.
	•	Otherwise returns a TextNode.

Troubleshooting
	•	Problem: Mismatch between real parser vs. meld-ast’s simplified approach.
Solution: Ensure you’re aware that meld-ast.ts is primarily a mock. Use the real parser.ts in production.

References
	•	Parser Doc
	•	Interpreter Doc

src/docs/data.md

Title: Data Directive (data.ts)
(We’ll put each directive in its own doc in the src/interpreter/directives/__docs__ folder, but if you prefer them all in src/__docs__, that’s also acceptable.)

Below is the structure you’d do for each directive file. We will show one fully, then a short version for the rest.

3. One Document per Directive (src/interpreter/directives/__docs__/...)

Below is an example “unit doc” for the Data Directive. Repeat this pattern for each directive type: Define, Embed, Import, Path, Run, Text.

src/interpreter/directives/docs/DataDirectiveHandler.md

Title: Data Directive Handler (data.ts)
Location: src/interpreter/directives/__docs__/DataDirectiveHandler.md

Summary
Handles @data directives, storing arbitrary JSON-like data into the interpreter’s state. For example:

@data user = { "name": "Alice", "age": 30 }

This would parse into a directive that sets user to that data object.

Diagram

   +----------------------+
   |   DataDirective      |
   |   kind: 'data'       |
   |   name: 'user'       |
   |   value: {...}       |
   +--------+-------------+
            |
            v
   [ DataDirectiveHandler.handle(...) ]
            |
            v
  state.setDataVar(name, value)

Detailed Explanation
	•	DataDirectiveHandler.canHandle(kind, mode)
Returns true if kind==='data'.
	•	DataDirectiveHandler.handle(node, state, context)
	•	Validates name.
	•	Logs progress with directiveLogger.
	•	If valid, calls state.setDataVar(name, value).

Troubleshooting
	•	Problem: “Data directive requires a name parameter.”
Solution: Ensure you wrote @data yourName = {...}.
	•	Problem: JSON parse error in the directive.
Solution: Confirm your inline JSON is valid (matching braces, quotes, etc.).

References
	•	Interpreter State Doc
	•	Registry Doc (to see how directives are registered)
	•	Define Directive Doc

(Repeat a similarly structured doc for each directive file: define.ts, embed.ts, import.ts, path.ts, run.ts, text.ts. Each should have its own ASCII diagram, summary, troubleshooting, references, etc.)

4. Other Key Files (Examples)

Below are short examples of how to document other core files. In a real project, you’d produce a similarly thorough doc for each file.

src/docs/errors.md

Title: Errors Module (errors.ts)
Location: src/__docs__/errors.md

Summary
Defines custom error classes for parse, interpret, import, embed, directive errors, etc.

Diagram

[MeldError] --- base class
   |
   +--> [MeldParseError]
   |
   +--> [MeldInterpretError]
   |
   +--> [MeldDirectiveError]
   ... 

Detailed Explanation
	•	Each error extends MeldError.
	•	Contains specialized fields like directiveKind for better debugging.
	•	Typically thrown via ErrorFactory in factory.ts.

Troubleshooting
	•	Problem: Hard to track error location.
Solution: All errors optionally contain a location property that indicates file/line/column context.

References
	•	Error Factory Doc
	•	Interpreter Doc

src/docs/factory.md

Title: Error Factory (factory.ts)
Location: src/__docs__/factory.md

Summary
Centralizes creation of typed Meld errors with optional location adjustments.

Diagram

    +-----------------------------------+
    | ErrorFactory                      |
    +-----------------------------------+
    | - createParseError(...)           |
    | - createInterpretError(...)       |
    | - createDirectiveError(...)       |
    |  ...                              |
    +-----------------------------------+
           +----------------------+
           | returns MeldError   |
           +----------------------+

Detailed Explanation
	•	Functions like createParseError() or createDirectiveError() wrap the constructor calls to specific error classes.
	•	createWithAdjustedLocation(...) can offset the error’s line/column to reflect included or nested content.

Troubleshooting
	•	Problem: The error location doesn’t match actual file lines.
Solution: Confirm the code uses ErrorFactory.createWithAdjustedLocation() in the correct contexts.

References
	•	Errors Module
	•	Interpreter Implementation

src/docs/interpreter.md

Title: Interpreter (interpreter.ts)
Location: src/__docs__/interpreter.md

Summary
Coordinates the handling of each directive node via the directiveRegistry, ultimately modifying the InterpreterState.

Diagram

[Node[]] ---+
            |
            v
   interpret(nodes, state, context)
            |
            +---> for each DirectiveNode --> directiveRegistry.handle(...)
            |--> for each TextNode        --> (no direct handling except storing nodes)
            |
            v
   [state is updated or side effects triggered]

Detailed Explanation
	•	Iterates over each node. If it’s a DirectiveNode, delegates to directiveRegistry.
	•	Catches errors, rethrows them as MeldDirectiveError or MeldInterpretError.

Troubleshooting
	•	Problem: A directive is never triggered.
Solution: Check directiveRegistry has a matching .canHandle(...) for that directive’s kind.
	•	Problem: State not updated after interpretation.
Solution: Ensure handle(...) calls state.setDataVar(...) or relevant method.

References
	•	State Module
	•	Registry Doc
	•	Parser Doc

src/docs/parser.md

Title: Parser (parser.ts)
Location: src/__docs__/parser.md

Summary
Converts raw Meld content into an array of tokens, then transforms tokens to DirectiveNode or TextNode.

Diagram

[Raw Meld Content]
       |
       v
   tokenize(content) --> Token[] 
       |
       v
   parseDirective(...) or TextNode
       |
       v
 [MeldNode[] AST]

Detailed Explanation
	•	Tokenization: Lines starting with @ become directive tokens, lines between triple quotes become multiline text tokens, etc.
	•	parseDirective: Splits directive content (@foo arg1=...).
	•	parseMeld: Orchestrates it all, returns a final array of MeldNodes.

Troubleshooting
	•	Problem: “Failed to parse directive.”
Solution: Inspect the log for mismatched quotes or unknown directive format.
	•	Problem: Multiline content never ends.
Solution: Confirm that you properly close triple quotes (""").

References
	•	Interpreter Doc
	•	Index Module Doc

src/docs/state.md

Title: Interpreter State (state.ts)
Location: src/__docs__/state.md

Summary
InterpreterState holds runtime data (variables, nodes, imports, etc.) while Meld content is being interpreted.

Diagram

+-----------------------------------+
|    InterpreterState               |
+-----------------------------------+
| - textVars: Map<string, string>   |
| - dataVars: Map<string, any>      |
| - commands: Map<string, string>   |
| - imports:  Set<string>           |
+-----------------------------------+

Detailed Explanation
	•	addNode(node) / getNodes(): Tracks the raw AST nodes.
	•	setTextVar() / getTextVar(): For storing string-based user variables.
	•	setDataVar() / getDataVar(): For storing JSON-like data.
	•	addImport(): For referencing included files.

Troubleshooting
	•	Problem: Values not persisting after a directive.
Solution: Confirm the directive’s handle() is calling setDataVar or setTextVar.
	•	Problem: Imported file reloaded multiple times.
Solution: Check if hasImport(path) is used to avoid repeated loading.

References
	•	Interpreter Doc
	•	Directive Docs, etc.

src/docs/subInterpreter.md

(And so on for each additional file like subInterpreter.ts, location-helpers.ts, location.ts, md-llm.d.ts, etc. Each doc follows the same pattern with a summary, ASCII diagram, details, troubleshooting, references.)

5. Placing Docs & Final Notes

Below is a concrete plan for physically placing each doc:
	1.	Root-level docs in docs/:
	•	docs/Architecture_Overview.md
	•	docs/Implementation_Plan.md
	2.	For each file in src/, create a corresponding doc file in src/__docs__.
Example:
	•	src/meld.ts → src/__docs__/meld.md
	•	src/cli.ts → src/__docs__/cli.md
	•	src/index.ts → src/__docs__/index.md
	•	…and so on for converter.ts, meld-ast.ts, data.ts, etc.
	3.	For directives inside src/interpreter/directives/, create a __docs__ folder:
	•	src/interpreter/directives/__docs__/DataDirectiveHandler.md
	•	src/interpreter/directives/__docs__/DefineDirectiveHandler.md
	•	src/interpreter/directives/__docs__/EmbedDirectiveHandler.md
	•	src/interpreter/directives/__docs__/ImportDirectiveHandler.md
	•	src/interpreter/directives/__docs__/PathDirectiveHandler.md
	•	src/interpreter/directives/__docs__/RunDirectiveHandler.md
	•	src/interpreter/directives/__docs__/TextDirectiveHandler.md
	4.	Link references using relative paths so each doc references the others.

By following this scheme, you have a complete, modular, and navigable documentation set—one file per module, plus the top-level docs describing overall architecture.

End of Documentation Example