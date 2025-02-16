Below is a concise, “one-stop” set of high-level changes for each of the design documents from “DESIGN DOCS TO BE REVIEWED AND IMPROVED,” reconciling them with the existing meld-ast, llmxml, and meld-spec libraries, and reflecting the new SOLID architecture and testing approach. Each bullet is direct and decisive.

────────────────────────────────────────────────────────
1) “Services-Based” Architecture Document
────────────────────────────────────────────────────────
• Remove any instructions to write a custom parser: adopt meld-ast for AST creation.  
• Keep the same general “services + directives” structure, but clarify meld-ast is the single source for parsing tokens and building AST nodes.  
• Explicitly note that code fences and directives in Meld are already handled by meld-ast, so the ParserService can wrap or extend meld-ast if needed rather than re-implementing.  
• Emphasize that library integration (llmxml for LLM conversions, meld-spec for typed definitions) is mandatory, not optional. Each service must rely on those libraries where suitable instead of reinventing them.  

────────────────────────────────────────────────────────
2) “Meld Testing Setup” Document
────────────────────────────────────────────────────────
• Remove references suggesting building your own AST parser in tests: rely on meld-ast for parsing to keep test code consistent with production code.  
• Clarify that llmxml library is used for XML conversions in integration tests (e.g., verifying final LLM output), not re-coded from scratch.  
• Add a bullet that “When testing directives that interpret code or sections, rely on the existing meld-ast parse function, and MemFS/in-memory approach for file mocking.”  
• Reaffirm that we do not replicate “section extraction logic” for tests, since llmxml already does that; simply call llmxml in tests if we need to check fuzzy sections.  

────────────────────────────────────────────────────────
3) “InterpolationService” Design
────────────────────────────────────────────────────────
• Remove mention of any custom AST scanning for expansions that replicate meld-ast’s logic. Instead, define only the expansions that are not already handled by the grammar (e.g., embedding environment variables, path expansions).  
• Keep the emphasis on string replacements for variable references (${textVar}, #{dataVar}, etc.). For code fence or AST-level transformations, rely on meld-ast.  
• Document that data structure references (e.g. “#{config.user}”) are typed by meld-spec’s definition of Data variables.  
• State that final transformations to LLM-friendly XML is not done here but in either llmxml or the OutputService.  

────────────────────────────────────────────────────────
4) “InterpreterService” Design
────────────────────────────────────────────────────────
• Remove any references to building an internal parse loop or replicate token scanning. Confirm that interpret() receives MeldNode[] from meld-ast.  
• Emphasize that for sub-files or “@import,” the directive uses meld-ast to parse the child content. The interpreter only orchestrates the node-by-node flow.  
• Note that if a directive spawns sub-interpretation, it still (re)calls meld-ast for that sub-content. No manual parser logic is replicated.  

────────────────────────────────────────────────────────
5) “OutputService” Design
────────────────────────────────────────────────────────
• Strip out instructions for building a new generic Markdown or LLM parser. Clarify that we can reuse llmxml for advanced XML transformations or do minimal conversions ourselves.  
• The MarkdownConverter or LLMXmlConverter can still exist, but ensure we do not duplicate the entire llmxml feature set: fallback to llmxml when we want fuzzy headings or advanced formatting.  
• Acknowledge that the final output to “LLM-friendly” format can rely on llmxml if it matches the required LLM structure, or implement small differences as add-ons.  

────────────────────────────────────────────────────────
6) “PathService & FileSystemService” Document
────────────────────────────────────────────────────────
• Keep references to handling $PROJECTPATH, $HOMEPATH, etc. but remove any mention of extracting sections from markdown. That part is done by llmxml, not in the filesystem logic.  
• Clarify that path expansions or environment variable expansions that are grammar-based should be validated by meld-spec references (like “global constants for path variables”) if available.  
• Reaffirm that we do not replicate AST scanning for these expansions. This remains strictly “turn a Meld path string (with $PROJECTPATH/...) into an absolute system path.”  

────────────────────────────────────────────────────────
7) “StateService” Design
────────────────────────────────────────────────────────
• Keep the plan to store text/data/path variables, define commands, and merges. But confirm that the shape of data variables / define commands is typed by meld-spec.  
• Remove references to manually describing the abstract syntax for variables; rely on meld-spec’s definitions for variable directives.  
• Emphasize that we do not store or parse code fences inside StateService, because meld-ast handles code fence nodes; we only store the resulting variable or directives.  

────────────────────────────────────────────────────────
8) “ValidationService” Design
────────────────────────────────────────────────────────
• For directive argument validation, do not replicate any grammar tokenizing. Instead, rely on meld-ast’s node structure (DirectiveNode, etc.) so we only do semantic checks.  
• Where the doc says “Parse numeric or boolean fields,” interpret that we do so in alignment with meld-spec’s typed fields. No lexical scanning is needed if meld-ast already yields the correct structure.  
• Acknowledge that complex section or fuzzy matching validations (like in “@embed [someFile # sectionName >> fuzzy=0.7]”) is done by llmxml or the directive, not by the ValidationService. The service just checks that the syntax is present and well-formed per meld-spec.  

────────────────────────────────────────────────────────
9) The “Sub-Tasks” / “Implementation Steps” in the docs
────────────────────────────────────────────────────────
• Eliminate tasks about “Building a custom parser” or “Implementing new code-fence scanning.” Instead, redirect them to “Integrate meld-ast for Meld grammar.”  
• Link tasks that mention “Markdown ↔ LLM conversion” to using llmxml.  
• Keep or refine tasks about final hooking of services, testing in MemFS, new directive handlers, etc.  

────────────────────────────────────────────────────────
10) Overarching Clarifications
────────────────────────────────────────────────────────
• In each design doc, highlight that AST creation is done via meld-ast, not re-invented.  
• For LLM or Markdown transformations, first see if llmxml covers it. We only implement separate logic if we have format differences that llmxml can’t handle.  
• Every place the docs mention “section extraction,” ensure we reference that llmxml is used for fuzzy headings or nested sections, not a custom solution.  
• For typed definitions (API endpoints, variable schemas, etc.), meld-spec is the source. Our code should import them, not re-declare them.  

With these updates, each portion of the existing design documents is reconciled with the new reality of using meld-ast, llmxml, and meld-spec, while preserving the overall SOLID “services-based” architecture and robust test approach.
