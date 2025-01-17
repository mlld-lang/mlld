

2. Clarify and Expand Coverage

We must verify that each major functionality (parsing, interpreting, directives, state management, CLI, SDK) has:
	•	Basic happy-path tests: Confirm that correct inputs produce correct outputs.
	•	Critical error-handling tests: Confirm that invalid inputs produce the expected errors.
	•	Location and line/column handling (where relevant).
	•	Core state or side-effect checks (e.g., new variables in state, merged states, etc.).

2.1 Parser/Tokenizer (parser.test.ts)
	•	Tokenization:
	•	Add tests for multiline content """...""".
	•	Add tests for lines containing only whitespace, empty lines, etc.
	•	Test edge cases (e.g., content ends abruptly in a multiline).
	•	Directive Parsing:
	•	Add a test for complex JSON arguments (like @data name="test" value={"nested":{"arr":[1,2]}}).
	•	Test malformed JSON arguments to confirm it throws a parse error.
	•	Confirm the parser sets line and column in the error messages.
	•	Location Coverage:
	•	For a multiline token, verify the start and end line/column are correct.
	•	Specifically test columns for the first line vs. subsequent lines.

Exact Changes:
	•	In parser.test.ts, add a describe('Tokenizer') block with:
	1.	"handles multiline content with """ syntax".
	2.	"handles empty/whitespace lines".
	3.	"throws on unclosed multiline block".
	•	In parser.test.ts, expand or create a "JSON argument parsing" test that:
	1.	Uses @data name="test" value={"complex":true,"arr":[1,2,3]}.
	2.	Ensures the directive node is correctly formed and location lines/columns are tested.
	•	In parser.test.ts, add a "malformed JSON arguments" test that expects a parse error with correct location details.

2.2 Interpreter & Directives

Each directive test (e.g., data.test.ts, text.test.ts, etc.) should confirm:
	1.	canHandle returns true/false in correct modes.
	2.	handle method:
	•	Succeeds with valid input (happy path).
	•	Throws or returns error with missing/invalid properties (error path).
	•	Sets or modifies the interpreter state as expected (variable assignment, etc.).
	•	(If relevant) checks location adjustments in rightside mode.

Exact Changes (example for data.test.ts):
	•	Add a describe('canHandle') block verifying that handler.canHandle('data','toplevel') → true, handler.canHandle('something','toplevel') → false, etc.
	•	Within describe('basic data handling'), add a test for null/undefined values to confirm the correct error or fallback.
	•	For each directive, test a second or third scenario of complex values (arrays, nested objects).
	•	Ensure each directive’s test includes rightside mode example verifying location offset.

Similarly for embed.test.ts, import.test.ts, path.test.ts, run.test.ts, etc.:
	•	import.test.ts: Add tests for @import from="..." with multiple import specifiers (e.g., import: ["var1", { name: "var2", as: "alias2" }]).
	•	embed.test.ts: Add a scenario for embedding content from data.content = """some multiline""", or rename path→content if that’s the actual implementation.
	•	run.test.ts: Test background:true if that’s in the design, or confirm it either is not supported or throws.
	•	define.test.ts: The code uses data.value but tests mention fn. Align them so that define directives use value consistently.

2.3 State Management (state.test.ts)

We have tests for text/data/path vars, nodes, imports, etc. We must:
	1.	Add concurrency or “multiple modifications” tests to ensure if we set multiple text/data variables in succession, the local changes reflect them correctly.
	2.	Add immutability scenarios where the parent is immutable, the child merges up, etc.
	3.	Add deeper parent → child → grandchild merges verifying only changed variables bubble up.
	4.	Add tests for setCommand usage and merges.

Exact Changes:
	•	Under describe('immutability'), add tests for “parent is immutable, child tries to override” → confirm error is thrown but parent is unaffected.
	•	Under describe('parent state'), add a test:
"should handle a grandchild state merging up through parent to root" verifying inheritance at three levels.
	•	Under describe('commands') (or create one), add tests for setCommand verifying the command name, parameters, merges, and overrides.

2.4 Location Helpers (location.test.ts, location-helpers.test.ts)
	•	Confirm column adjustments for lines beyond the first line.
	•	Test negative lines/columns or “line=0” if that scenario can occur.
	•	Confirm that an undefined location or base location just returns undefined (already present).
	•	Add a test for “chained” adjustments if any code uses multiple layers of baseLocation in a single chain.

Exact Changes:
	•	In location.test.ts (or location-helpers.test.ts), add a test for multi-line offsets:
	•	"adjustLocation with line=2, baseLocation line=5 => new line=6, column remains X".
	•	Add an “invalid input” test: if location has line=0 or negative, do we gracefully handle or throw?

2.5 Integration Tests

CLI Tests (cli.test.ts or tests/integration/cli.test.ts):
	•	Argument parsing (invalid arguments, missing input, extra arguments).
	•	File existence (file not found), ensures it calls process.exit(1) or throws an error.
	•	Output verification: mock console.log or use a string buffer to confirm output is correct.

SDK Tests (sdk.test.ts or tests/integration/sdk.test.ts):
	•	Confirm that runMeld(filePath, { format: ... }) calls parse → interpret → format in the correct order.
	•	Add tests for initialState or includeMetadata if those fields exist but are untested.

Exact Changes:
	•	For the CLI:
	1.	it('exits with code 1 when no args provided') or a similar test ensures it calls process.exit or logs an error.
	2.	it('handles multiple --format flags') verifying we parse them properly.
	3.	Mock console.log to confirm the actual rendered string for --stdout.
	•	For the SDK:
	1.	it('merges initialState variables before interpret') if we have that feature.
	2.	it('throws on parse error with correct error message') verifying the error type.
	3.	Possibly a large file or complex content test that ensures we can parse multiple directives.

3. Strengthen Error Testing

We must show that each error path is tested. For instance:
	•	Parser: Malformed JSON, unknown directive kind, unclosed multiline block.
	•	Interpreter: Unknown directive, directive missing required fields, nested error.
	•	Directives: Missing name or value, circular embedding, invalid path, etc.
	•	CLI: Missing input file, invalid extension, parse or interpret errors bubble up.
	•	SDK: File not found, parse errors, interpret errors, unexpected exceptions.

Exact Changes:
	•	For each directive test file, add a "missing required property" or "invalid property type" test.
	•	For CLI integration, explicitly test a scenario that triggers the parser to throw an error. Ensure we see process.exit(1).
	•	For the SDK, test a scenario of “@unknown-directive” to confirm it fails gracefully.

4. Add Logging Verification (Optional but Advised)

If we want to confirm log messages:
	1.	Mock the logger or use a spy to confirm certain messages are logged at certain severities.
	2.	For key classes (Parser, CLI, etc.), add a small test checking that an error is logged before throwing.

Exact Changes:
	•	In parser.test.ts, for example, spy on interpreterLogger.error and confirm it was called with a message containing "Failed to parse directive arguments" when we feed it malformed JSON.

If this is too large a scope, we can skip initially, but it’s often beneficial to ensure we’re not silently swallowing errors.

5. Enforce Async Consistency

Many directives use async handle(...). Ensure the tests all use await or .resolves/.rejects properly. This means:
	•	Wrap all directive tests in async () => {...} if the directive’s handle() is async.
	•	Use await expect(handler.handle(...)).rejects.toThrow(...) for error testing.
	•	For synchronous directives, confirm if they are truly synchronous or if they might be updated to async.

Exact Changes:
	•	Update all directive tests from:

it('should throw error for missing name', () => {
  expect(() => dataDirectiveHandler.handle(...)).toThrow();
});

to:

it('should throw error for missing name', async () => {
  await expect(dataDirectiveHandler.handle(...)).rejects.toThrow();
});

if handle is async.

6. Incremental Implementation Roadmap

Finally, here is a recommended order to tackle these changes to avoid an unmanageable PR:
	1.	File Renames & Splits
	•	Fix naming (test-infrastructure.test.ts → test-utils.test.ts, etc.).
	•	Split nested-directives.test.ts.
	•	Remove or unify any duplicated mocks.
	2.	Add Basic “Happy Path” Tests Where Missing
	•	For each directive or module that lacks a straightforward test, add at least one “it works” test.
	3.	Add Key Error Path Tests
	•	For each directive, parse, interpret, state, etc. → add at least a “missing required field” test, or “invalid path,” “unknown directive,” etc.
	4.	Expand Location Coverage
	•	Add a few carefully targeted tests verifying multiline offset logic, columns, baseLocation adjustments, etc.
	5.	Fill in Gaps in Integration Tests
	•	CLI and SDK integration: add argument parsing tests, error cases, multiple formats, --stdout, etc.
	6.	Upgrade to Async
	•	Ensure all directive tests that call await handle(...) do so properly.
	•	Modify older tests from synchronous .toThrow() to asynchronous .rejects.toThrow().
	7.	(Optional) Add Logging Spies
	•	If time remains, add targeted checks to ensure errors/logs appear as intended.

By following these exact steps, we will ensure that all major functionalities—parsing, directive handling, state management, and CLI/SDK usage—are thoroughly tested for both the happy path and common error paths. This approach keeps the code “just working” and maintainable, which satisfies the project’s immediate goals.


--- FOR LATER ---


Phase 3: Minor DRY Enhancements

Goal: Remove or unify small duplications (particularly around file-based directives).
	1.	Create a “File-based Directive” Helper
	•	For import.ts and embed.ts, factor out a helper that checks for circular usage, checks if the file path exists, reads the file, etc. Something like:

function readEmbedOrImportFile(path: string, state: InterpreterState, isImport = false): string {
  if (!fs.existsSync(path)) {
    throw ...
  }
  if (state.hasImport(path)) {
    throw ...
  }
  ...
  return fs.readFileSync(path, 'utf8');
}


	•	This is purely a DRY convenience. Right now, your code is mostly fine.

	2.	Combine “Active Paths” vs. state.hasImport()
	•	If you anticipate more directives requiring circular checks, store them in a single structure. For now, you do it only for import and embed, which is consistent.