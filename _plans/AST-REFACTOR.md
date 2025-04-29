# Step-by-Step Grammar Refactor Plan (table-free edition)

After every numbered task run:

npm run build:parser && npm test core/ast

Only commit on a green test-suite.

⸻

0. Preparation
	1.	Create branch

git switch -c refactor/split-grammar


	2.	Confirm baseline is green

npm run build:grammar
npm test core/ast


	3.	Create directory skeleton

mkdir -p grammar/helpers
mkdir -p grammar/lexer
mkdir -p grammar/directives
git add grammar

⸻

1. Extract helpers and constants
	1.	Move everything inside the { … } initializer in meld.pegjs that is not a rule
(NodeType, DirectiveKind, and the whole helpers object) to
grammar/helpers/nodes.ts.
	2.	Add import at the top of meld.pegjs:

{
  import { NodeType, DirectiveKind, helpers } from "./helpers/nodes.js";
}


	3.	Build and test. Commit with message helpers extracted.

⸻

2. Wire a multi-file build
	1.	Add script to package.json:

"scripts": {
  "build:parser": "peggy \
      grammar/meld.peggy \
      grammar/lexer/*.peggy \
      grammar/directives/*.peggy \
      -o core/ast/grammar/parser.ts --format es --cache"
}


	2.	Run npm run build:parser. Commit multi-file build scaffold.

⸻

3. Split the lexer
	1.	Create grammar/lexer/whitespace.peggy containing _, __, HWS, LineTerminator, EOF.
	2.	Create grammar/lexer/tokens.peggy with Identifier, SpecialPathChar, BacktickSequence, etc.
	3.	Delete those rules from meld.pegjs.
	4.	Build and test. Commit lexer isolated.

⸻

4. Move literals and interpolation rules
	1.	Add grammar/lexer/literals.peggy and move
StringLiteral, NumberLiteral, BooleanLiteral, NullLiteral there.
	2.	Add grammar/lexer/interpolation.peggy and move the whole “Interpolated Literal Rules” block.
	3.	Remove moved rules from meld.pegjs.
	4.	Build and test. Commit literals + interpolation isolated.

⸻

5. Slim the root orchestrator
	1.	Replace everything below Start in meld.pegjs with only the high-level structure:

Start
  = (LineStartComment
   / Comment
   / CodeFence
   / Variable
   / Directive
   / InterDirectiveNewline
   / TextBlock)*

Directive
  = ImportDirective
  / EmbedDirective
  / RunDirective
  / DefineDirective
  / DataDirective
  / TextDirective
  / PathDirective
  / VarDirective


	2.	Build and test. Commit root grammar slimmed.

⸻

6. Extract directives one-by-one

Recommended extraction order:

var → path → text → import → embed → run → define → data

For each directive:
	1.	Create file grammar/directives/<name>.peggy.
	2.	Copy that directive’s rules (plus its private helpers) into the new file.
	3.	Add initializer to the new file:

{
  import { NodeType, DirectiveKind, helpers } from "../helpers/nodes.js";
}


	4.	Delete the copied rules from meld.pegjs.
	5.	Ensure build order: if rule-order errors appear, move the file earlier in the CLI glob list.
	6.	Build and test.
	7.	Commit directive:<name> extracted.

⸻

7. Prune unused code
	1.	Use ripgrep to find orphan rules:

rg -n "^[A-Z][A-Za-z0-9]*" grammar/directives | sort | uniq


	2.	Remove unused rules or utilities.
	3.	Build and test.
	4.	Commit remove orphan rules.

⸻

8. Add CI guardrail

Create scripts/check-grammar.js:

const fs = require("fs");
const root = fs.readFileSync("grammar/meld.peggy", "utf8");
if ((root.match(/Directive\s*=/g) || []).length > 20) {
  throw new Error("Root grammar is growing again; add a sub-grammar instead.");
}

Hook it into CI. Commit grammar size gate.

⸻

9. (Opt) Generate TypeScript types
	1.	Append --dts to the build script to emit parser.d.ts.
	2.	Import the types where you construct ASTs.
	3.	Add a type-checking unit test.

Commit parser typings.

⸻

10. Document maintenance
	1.	Update docs/CONTRIBUTING.md with directory layout and “how to add a directive”.
	2.	Add a CODEOWNERS line for grammar/directives/*.

Commit docs: grammar maintenance guide.

⸻

🎉 Refactor done

You now have:
	•	A single glanceable meld.peggy spec.
	•	Lexer, literals, and each directive isolated.
	•	Smaller merge conflicts and faster reviews.
	•	A safety rail that prevents future monolith creep.