Phase 1 – extract helpers and constants
	1.	mkdir -p grammar/helpers
	2.	Create grammar/helpers/nodes.ts.
Copy every item inside the { … } initializer of grammar/meld.peggy that is pure JavaScript ( NodeType, DirectiveKind, and the entire helpers object).  Export them:

export const NodeType = { … } as const
export const DirectiveKind = { … } as const
export const helpers = { … }


	3.	Delete the original initializer block from grammar/meld.peggy and replace it with

{
  import { NodeType, DirectiveKind, helpers } from "./helpers/nodes.js";
}


	4.	npm run build:grammar && npm test core/ast
Commit: git commit -am "phase 1: helpers/constants extracted"

Phase 2 – turn the build script into a multi-file builder
	1.	Decide on a fixed compilation order: lexer files first, then directive files, then the root file.  For now create empty directories:

mkdir -p grammar/lexer grammar/directives


	2.	Open grammar/build-grammar.mjs.
Change only three things.
a) Replace the single-file read with a merge of multiple files.

-const grammar = fs.readFileSync(GRAMMAR_FILE, 'utf8');
+const GRAMMAR_SOURCES = [
+  // order matters
+  ...fs.readdirSync(path.resolve(__dirname, './lexer'))
+      .filter(f => f.endsWith('.peggy'))
+      .sort()
+      .map(f => fs.readFileSync(path.resolve(__dirname, './lexer', f), 'utf8')),
+  ...fs.readdirSync(path.resolve(__dirname, './directives'))
+      .filter(f => f.endsWith('.peggy'))
+      .sort()
+      .map(f => fs.readFileSync(path.resolve(__dirname, './directives', f), 'utf8')),
+  fs.readFileSync(GRAMMAR_FILE, 'utf8') // root goes last
+].join('\n');

b) Rename the variable used by the generator calls:

-peggy.generate(grammar, …
+peggy.generate(GRAMMAR_SOURCES, …

Do this in all peggy.generate calls.
c) Remove the final “copy grammar to dist” step—it now has no single source file to copy.

	3.	npm run build:grammar && npm testcore/ast
Commit: git commit -am "phase 2: builder accepts multi-file input"

Phase 3 – isolate lexer whitespace and basic tokens
	1.	Create grammar/lexer/whitespace.peggy and move rules: _, __, HWS, LineTerminator, EOF, EndOfLine.
	2.	Create grammar/lexer/tokens.peggy and move: Identifier, SpecialPathChar, BacktickSequence, DotSeparatorToken, PathSeparatorToken, SectionMarkerToken.
	3.	Delete those rules from grammar/meld.peggy.
	4.	Build and test, then commit:
git commit -am "phase 3: whitespace + token rules isolated"

Phase 4 – move literals and interpolation primitives
	1.	grammar/lexer/literals.peggy → StringLiteral, NumberLiteral, BooleanLiteral, NullLiteral, MultilineTemplateLiteral.
	2.	grammar/lexer/interpolation.peggy → the full “Interpolated Literal Rules” and any small helpers they depend on.
	3.	Remove the moved blocks from the root file.
	4.	Build, test, commit:
git commit -am "phase 4: literals + interpolation extracted"

Phase 5 – slim the root grammar
	1.	In grammar/meld.peggy keep only:
	•	the JavaScript import block
	•	the Start rule
	•	the Directive dispatch rule
	•	any global comment or code-fence rules still needed
	2.	Build, test, commit:
git commit -am "phase 5: root grammar reduced to structure only"

Phase 6 – extract each directive module

Perform the following mini-procedure eight times in this order: var, path, text, import, embed, run, define, data.
	1.	cp grammar/meld.peggy grammar/directives/<name>.peggy (temporary helper)
Delete everything except the rules that clearly belong to that directive and its private helpers.
	2.	At the top of the new file add:

{
  import { NodeType, DirectiveKind, helpers } from "../helpers/nodes.js";
}


	3.	Delete those rules from grammar/meld.peggy.
	4.	npm run build:grammar && npm testcore/ast
	5.	git add grammar/directives/<name>.peggy
git commit -m "phase 6: <name> directive isolated"

Repeat until all directive families live under grammar/directives/ and the root file contains no directive logic.

Phase 7 – prune dead code
	1.	rg -n "^[A-Z][A-Za-z0-9]*" grammar | sort | uniq
For any rule not referenced elsewhere, delete it.
	2.	Search helpers/nodes.ts for unused functions and remove them.
	3.	Run the full test-suite once more and commit:
git commit -am "phase 7: remove orphan rules and helpers"

Phase 8 – add a guardrail script
	1.	Create scripts/check-grammar-root-size.js:

import fs from 'fs';
const root = fs.readFileSync('grammar/meld.peggy', 'utf8');
if (root.split('\n').length > 400)
  throw new Error('Root grammar should stay slim – extract into sub-files instead.');


	2.	Add to "scripts" in package.json:

"pretest": "node scripts/check-grammar-root-size.js"


	3.	Commit:
git add scripts/check-grammar-root-size.js package.json
git commit -m "phase 8: guardrail keeps root grammar small"

Phase 9 – optional type-safety pass
	1.	Modify grammar/build-grammar.mjs to call peggy.generate(…, { output: 'source', format: 'es', dts: true }) once and write parser.d.ts next to parser.ts.
	2.	Export the generated types from @core/ast/grammar and use them in code.
	3.	Add a TS test file that imports the parser and compiles with tsc --noEmit.

Commit: git commit -am "phase 9: emit .d.ts for parser"

Phase 10 – documentation
	1.	Update docs/CONTRIBUTING.md with:
	•	the directory layout (grammar/helpers, grammar/lexer, grammar/directives)
	•	“how to add a new directive” steps (copy template, import helpers, run tests)
	2.	Add a badge or section in the project README that explains the multi-file grammar build.

Commit: git commit -am "phase 10: docs for new grammar structure"

All refactor phases are now complete.  The grammar is modular, every intermediate commit keeps the test-suite green, and the old single-file grammar remains intact for historical reference.