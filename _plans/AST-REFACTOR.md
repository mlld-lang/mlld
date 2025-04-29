Phase 2 – turn the build script into a multi-file builder
	1.	Decide on a fixed compilation order: lexer files first, then directive files, then the root file. Create empty directories:

mkdir -p grammar/lexer
mkdir -p grammar/directives

	2.	Open grammar/build-grammar.mjs and make the following changes:

a) Replace all single-file grammar reads with a merged multi-file approach:

```js
// Replace all instances of:
// const grammar = fs.readFileSync(GRAMMAR_FILE, 'utf8');
// with:
const GRAMMAR_SOURCES = [
  // order matters
  ...fs.readdirSync(path.resolve(__dirname, './lexer'))
      .filter(f => f.endsWith('.peggy'))
      .sort()
      .map(f => fs.readFileSync(path.resolve(__dirname, './lexer', f), 'utf8')),
  ...fs.readdirSync(path.resolve(__dirname, './directives'))
      .filter(f => f.endsWith('.peggy'))
      .sort()
      .map(f => fs.readFileSync(path.resolve(__dirname, './directives', f), 'utf8')),
  fs.readFileSync(GRAMMAR_FILE, 'utf8') // root goes last
].join('\n');
```

b) Ensure all peggy.generate calls use the common options with dependencies:

```js
const commonOpts = {
  output: 'source',
  cache: false,
  optimize: 'speed',
  plugins: [],
  allowedStartRules: ['Start'],
  exportVar: false,
  dependencies: {
    NodeType:      './node-type.js',
    DirectiveKind: './directive-kind.js',
    helpers:       './helpers.js'
  }
};

const tsSource  = peggy.generate(GRAMMAR_SOURCES, { ...commonOpts, format: 'es', trace: true });
const esmSource = peggy.generate(GRAMMAR_SOURCES, { ...commonOpts, format: 'es' });
const cjsSource = peggy.generate(GRAMMAR_SOURCES, { ...commonOpts, format: 'commonjs' });
```

c) Remove the old "copy grammar to dist" step, but retain the dependency file copying:

```js
// Keep this block that copies the dependency files
['node-type.js', 'directive-kind.js', 'helpers.js'].forEach(file => {
  fs.copyFileSync(
    path.resolve(__dirname, './deps', file),
    path.resolve(path.dirname(DIST_PARSER_ESM), file)
  );
  fs.copyFileSync(
    path.resolve(__dirname, './deps', file),
    path.resolve(path.dirname(DIST_PARSER_CJS), file)
  );
  fs.copyFileSync(
    path.resolve(__dirname, './deps', file),
    path.resolve(path.dirname(SRC_PARSER), file)
  );
});
```

	3.	npm run build:grammar && vitest run core/ast
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
	4.	npm run build:grammar && vitest run core/ast
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