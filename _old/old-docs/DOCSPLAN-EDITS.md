Below is a point-by-point, explicit list of changes needed to DOCSPLAN.md (the previously proposed documentation plan) so it better aligns with our actual codebase and addresses the feedback in your “DOCSPLAN Feedback” document. Each item indicates precisely where and what to change or add, making it as easy as possible to update the document.

1. Directory Structure Updates

1.1 Add Our Actual Top-Level Directories
	•	Where: In the “Directory Structure” or “File Layout” subsection near the start of DOCSPLAN.md.
	•	Change:
	1.	Replace the existing reference to a “flat src/” structure with an explicit list of subdirectories actually found in src/, i.e.:
	•	bin/
	•	cli/
	•	converter/
	•	interpreter/
	•	sdk/
	•	types/
	•	utils/
	2.	Remove or revise any mention of a single-level __docs__ folder that lumps everything together, since our code is more deeply nested.

1.2 Reflect “interpreter” Subdirectories
	•	Where: In the “Interpreter Module” or “Interpreter Docs” section.
	•	Change:
	1.	Insert a note or bullet describing that the interpreter directory includes its own subdirectories, e.g., state/, directives/, errors/, and utils/.
	2.	Specifically highlight the presence of state/ for managing the interpreter’s state, and errors/ for specialized error classes.

1.3 Mention __tests__ and __mocks__ Folders
	•	Where: Wherever test directories are referenced or in a new “Testing Infrastructure” subsection.
	•	Change:
	1.	Add an explicit mention that tests, mocks, and test utilities live in __tests__ and __mocks__ directories, clarifying that these are not just placeholders but fully fledged test setups.

2. Documentation Structure Adjustments

2.1 Rethink “docs” Placement to Match Our Code
	•	Where: In the “Implementation Plan” or “Document Placement Strategy” section of DOCSPLAN.md.
	•	Change:
	1.	Instead of using a single src/__docs__ folder, update the plan so each top-level directory (e.g., cli/, interpreter/, converter/) may contain its own nested docs/ folder.
	2.	Remove references to the flat “unit docs” approach and emphasize that we should place docs “co-located” within each module’s directory structure.

2.2 Add Guidance for “bin/” and “sdk/” Docs
	•	Where: Still within the “Implementation Plan” or “Document Placement Strategy” section.
	•	Change:
	1.	Insert bullet points clarifying that bin/ (or wherever meld.ts actually lives) has its own doc describing how the Node entry point works.
	2.	Also clarify that sdk/ (which re-exports key APIs) will have its own doc describing the high-level usage for external consumers.

2.3 Incorporate a “Testing Documentation” Section
	•	Where: Either as a standalone heading in DOCSPLAN.md or in the “High-Level Docs” area.
	•	Change:
	1.	State that test-related documentation (mocks, test utilities, test patterns) belongs in src/__tests__/docs/ or a similarly suitable location.
	2.	Emphasize the structure and usage of __mocks__ and how it ties into the main system.

3. Parser Module Clarifications

3.1 Expand Description of Multi-Line Tokenization & Location
	•	Where: In the “Parser” or “Parser Module” doc outline.
	•	Change:
	1.	Add bullet points explaining that the parser uses a multiline-aware tokenizer (with triple-quote detection, line-by-line scanning).
	2.	State that location info (line and column) is tracked carefully for error reporting.
	3.	Mention that the parser logs tokenization progress and errors via the interpreterLogger.

3.2 Clarify Error Handling & Logging in Parser
	•	Where: Same “Parser” doc outline.
	•	Change:
	1.	Specify that parse errors are thrown as MeldParseError (or wrapped in ErrorFactory) with location info.
	2.	Emphasize that the parser logs at debug level, especially on directive boundaries or multiline starts/ends.

4. Interpreter & Directive Registry Details

4.1 Emphasize Registry-Driven Directive Handling
	•	Where: In the “Interpreter Module” or “Directives” doc outline.
	•	Change:
	1.	Clarify that all directives (@data, @define, @embed, etc.) are discovered in the parser but actually executed via the directiveRegistry.handle(...).
	2.	Mention that the registry pattern uses handler.canHandle(kind, mode) logic to route each directive to the correct handler.

4.2 Show “Parent-Child State” & “Local Changes” in the Interpreter
	•	Where: The same “Interpreter Module” or “State Management” doc outline.
	•	Change:
	1.	Add a sub-bullet describing how child interpreters can inherit a parent state, track local changes, then merge them back.
	2.	State that the interpreter can run in 'toplevel' or 'rightside' mode, adjusting location offsets accordingly.

5. Expanded State Management Documentation

5.1 Cover All Storage Mechanisms (Text/Data/Path/Commands/Imports)
	•	Where: The “State Module” doc outline.
	•	Change:
	1.	Add separate bullets for text variables, data variables, path variables, commands, imports, and raw node storage.
	2.	Indicate that each is stored in a separate map or set for clarity and to track merges properly.

5.2 Discuss Immutability & Merge Behavior
	•	Where: Same “State Module” doc outline.
	•	Change:
	1.	Insert an explicit mention of the setImmutable() method and how attempts to modify the state afterward are disallowed.
	2.	Summarize how merging child states into a parent can handle collisions or variable overwriting.

5.3 Emphasize Local Change Tracking
	•	Where: Same “State Module” doc outline.
	•	Change:
	1.	Note that changes are tracked (like adding a new text var or data var).
	2.	Mention potential uses for logging or debugging which lines triggered which changes.

6. Converter Module Updates

6.1 Clarify Node Types & Current Implementation
	•	Where: In the “Converter” doc outline.
	•	Change:
	1.	State that our system specifically supports Text, CodeFence, and Directive nodes in toXml() or toMarkdown().
	2.	Remove or rephrase references to advanced or extraneous XML features not actually implemented.

6.2 Mention Simpler Markdown Support
	•	Where: Same “Converter” doc outline.
	•	Change:
	1.	Make it clear we only do code fences, text lines, and directive placeholders for now.
	2.	If any future expansions (like heading-level support) are planned, mark them as “future enhancements.”

7. SDK Module Documentation

7.1 Add a Separate Section for “SDK Usage”
	•	Where: In DOCSPLAN.md under “High-Level Docs” or in a new “SDK Documentation” heading.
	•	Change:
	1.	Introduce a short overview of the sdk/ directory’s structure (like index.ts exports and any sub-files).
	2.	Provide examples showing how to import { runMeld } from 'sdk' or how to pass custom MeldOptions.
	3.	Clarify that this is for programmatic usage vs. the CLI usage.

7.2 Document Error Handling & Logging in the SDK
	•	Where: Same “SDK Documentation” heading.
	•	Change:
	1.	Note that all errors are typed (e.g., MeldParseError, MeldInterpretError) and can be caught.
	2.	Emphasize that the SDK logs progress with Winston, but also mention the possibility to customize log levels or attach your own logger if needed.

8. CLI Module Revision

8.1 Emphasize Dedicated CLI Directory
	•	Where: The “CLI Documentation” or “cli.ts” doc outline.
	•	Change:
	1.	Instead of referencing a single file cli.ts at the root, revise it to reflect the actual cli/ directory.
	2.	Document the interplay between any files in cli/ (like argument parsing modules, execution modules).

8.2 Show Argument Validation & Format Options
	•	Where: Same “CLI Documentation” heading.
	•	Change:
	1.	Provide more detail on recognized flags (--input, --output, --format).
	2.	Explain error messages, exit codes, and logging levels in more depth.

9. Type System Documentation

9.1 Document Each Meld Node Type
	•	Where: Possibly a new “Types Documentation” or “Meld Types” heading in the plan.
	•	Change:
	1.	Add sub-bullets enumerating TextNode, CodeFenceNode, DirectiveNode, and how MeldNode is a union of them.
	2.	Indicate location fields (start/end line/column) and directive properties.

9.2 Mention “md-llm” and Other Declarations
	•	Where: Same “Types Documentation” heading.
	•	Change:
	1.	Note that we declare modules like 'md-llm' to provide specialized conversion type definitions.
	2.	Emphasize how the user can utilize or extend these declared modules in advanced workflows.

10. Logging System Documentation

10.1 Reflect Winston-based Logging Setup
	•	Where: Possibly create a dedicated “Logging Documentation” heading.
	•	Change:
	1.	State that Winston is configured with colorized logs, file-based logs, separate error/combined logs, etc.
	2.	Document the usage of directiveLogger vs. interpreterLogger vs. base logger.

10.2 Add “Logger Configuration” Subsection
	•	Where: Inside the new “Logging Documentation” heading.
	•	Change:
	1.	Show how to customize LOG_LEVEL, mention how to rotate logs, or direct logs to different files.
	2.	Provide an example of reading logs from logs/error.log.

11. Testing Infrastructure Documentation

11.1 Create a Separate “Testing Documentation” Section
	•	Where: In DOCSPLAN.md or as a top-level doc in docs/.
	•	Change:
	1.	Reference __tests__, __mocks__, and any specialized test utilities or patterns.
	2.	Summarize how we handle mocking of file I/O, tokenization tests, directive tests, etc.

11.2 Show Parent-Child State Testing & Integration Tests
	•	Where: Same “Testing Documentation” or “Interpreter Tests” heading.
	•	Change:
	1.	Emphasize that we test nested states, multiple directives in a single file, error throws, location tracking, etc.
	2.	Include examples of how we use the mock file system or test harness.

12. Final Architecture & Docs Organization

12.1 Consolidate the “Recommendations for New Documentation Structure” From Feedback
	•	Where: In the “Final” or “Conclusion” section of DOCSPLAN.md.
	•	Change:
	1.	Insert the recommended structure from the feedback for root-level docs (e.g., architecture/, guides/, api/).
	2.	Show how each major directory in src/ would have its own local docs/ folder.
	3.	Emphasize we do not want a single __docs__ folder with all docs (unless we keep it in well-defined subfolders matching the codebase).

13. Miscellaneous Clarifications
	1.	Mention “mocks and test utilities” more explicitly:
	•	In your “Implementation Plan” section, add a bullet referencing how __mocks__ helps isolate directive logic in tests.
	2.	Add coverage for “ErrorFactory”:
	•	In any mention of error handling, specify that calls to ErrorFactory.createXxxError preserve or adjust location context.
	3.	Directives:
	•	In the “Directive Docs,” note that each directive file (data.ts, define.ts, etc.) is physically located under src/interpreter/directives/.
	•	Show how new directives are registered in registry.ts.
	4.	Highlight advanced features:
	•	For instance, mention that embedded file content or imported files also track state changes, logging, etc.
	•	Note that “EmbedDirectiveHandler” and “ImportDirectiveHandler” require file system access and do so via node’s fs/promises.

Summary of Required Updates
	1.	Reflect Actual Directory Layout: Expand the doc plan to match bin/, cli/, converter/, interpreter/, sdk/, types/, and utils/.
	2.	Adjust “Implementation Plan”: Switch from a flat __docs__ approach to localized docs within each directory, plus a root docs/.
	3.	Expand Parser Details: Acknowledge multiline content, location offsetting, error logging, and real tokenization logic.
	4.	Deepen Interpreter & State Explanation: Mention directiveRegistry, parent-child state, immutability, local changes.
	5.	Clarify Converter: Show it’s simpler than originally stated, covering TextNode and CodeFenceNode mainly.
	6.	Add a Thorough “SDK” Doc: Describe usage, error handling, logging approach, advanced settings.
	7.	Revise CLI Section: Reflect that the CLI logic is in cli/, with options for input/output format.
	8.	Document Our Detailed Type System: Node types, location tracking, 'md-llm' declarations, etc.
	9.	Emphasize Winston Logging: Show error/combined logs, colorization, metadata.
	10.	Include Testing: Thoroughly describe test directories, mocks, integration vs. unit tests, location-based error checks.
	11.	Rework Structure: Conclude with a recommended directory-level docs plan that matches feedback.

By making these explicit, atomic changes in DOCSPLAN.md—section by section, bullet by bullet—the final documentation will accurately reflect our true codebase structure, features, and best practices.