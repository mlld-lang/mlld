#### Error Reporting

While generating the parser, the compiler may throw a `GrammarError` which collects all of the issues that were seen.

There is also another way to collect problems as fast as they are reported — register one or more of these callbacks:

*   `error(stage: Stage, message: string, location?: LocationRange, notes?: DiagnosticNote[]): void`
*   `warning(stage: Stage, message: string, location?: LocationRange, notes?: DiagnosticNote[]): void`
*   `info(stage: Stage, message: string, location?: LocationRange, notes?: DiagnosticNote[]): void`

All parameters are the same as the parameters of the [reporting API](#session-api) except the first. The `stage` represent one of possible stages during which execution a diagnostic was generated. This is a string enumeration, that currently has one of three values:

*   `check`
*   `transform`
*   `generate`

### Generating TypeScript Types

If you are consuming the generated parser from TypeScript, it is useful for there to be a .d.ts file next to the generated .js file that describes the types used in the parser. To enable this, use a configuration file such as:

    // MJS
    export default {
      input: "foo.peggy",
      output: "foo.js",
      dts: true,
      returnTypes: {
        foo: "string",
      },
    };

If a rule name is in the allowedStartRules, but not in returnTypes, `any` will be used as the return type for that rule.

Note that `--return-types <JSON object>` can be specified on the command line; the use of a config file just makes quoting easier to get correct.

Using the Parser
----------------

To use the generated parser, import it using your selected module approach if needed, then call its `parse` method and pass an input string as a parameter. The method will return a parse result (the exact value depends on the grammar used to generate the parser) or throw an exception if the input is invalid. The exception will contain `location`, `expected`, `found`, `message`, and `diagnostic` properties with more details about the error. The error will have a [`format(SourceText[])`](#error-format) function, to which you pass an array of objects that look like `{ source: grammarSource, text: string }`; this will return a nicely-formatted error suitable for human consumption.

    parser.parse("abba"); // returns ["a", "b", "b", "a"]
    
    parser.parse("abcd"); // throws an exception

You can tweak parser behavior by passing a second parameter with an options object to the `parse` method. The following options are supported:

`startRule`

Name of the rule to start parsing from.

`tracer`

Tracer to use. A tracer is an object containing a `trace()` function. `trace()` takes a single parameter which is an object containing "type" ("rule.enter", "rule.fail", "rule.match"), "rule" (the rule name as a string), "[location](<a href=)", and, if the type is "rule.match", "result" (what the rule returned).

`...` (any others)

Made available in the `options` variable

As you can see above, parsers can also support their own custom options. For example:

    const parser = peggy.generate(`
    {
      // options are available in the per-parse initializer
      console.log(options.validWords);  // outputs "[ 'boo', 'baz', 'boop' ]"
    }
    
    validWord = @word:$[a-z]+ &{ return options.validWords.includes(word) }
    `);
    
    const result = parser.parse("boo", {
      validWords: [ "boo", "baz", "boop" ]
    });
    
    console.log(result);  // outputs "boo"
    

Grammar Syntax and Semantics
----------------------------

The grammar syntax is similar to JavaScript in that it is not line-oriented and ignores whitespace between tokens. You can also use JavaScript-style comments (`// ...` and `/* ... */`).

Let's look at example grammar that recognizes simple arithmetic expressions like `2*(3+4)`. A parser generated from this grammar computes their values.

    start
      = additive
    
    additive
      = left:multiplicative "+" right:additive { return left + right; }
      / multiplicative
    
    multiplicative
      = left:primary "*" right:multiplicative { return left * right; }
      / primary
    
    primary
      = integer
      / "(" additive:additive ")" { return additive; }
    
    integer "simple number"
      = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

On the top level, the grammar consists of _rules_ (in our example, there are five of them). Each rule has a _name_ (e.g. `integer`) that identifies the rule, and a _parsing expression_ (e.g. `digits:[0-9]+ { return parseInt(digits.join(""), 10); }`) that defines a pattern to match against the input text and possibly contains some JavaScript code that determines what happens when the pattern matches successfully. A rule can also contain _human-readable name_ that is used in error messages (in our example, only the `integer` rule has a human-readable name). The parsing starts at the first rule, which is also called the _start rule_.

A rule name must be a Peggy [identifier](#identifiers). It is followed by an equality sign (“=”) and a parsing expression. If the rule has a human-readable name, it is written as a JavaScript string between the rule name and the equality sign. Rules need to be separated only by whitespace (their beginning is easily recognizable), but a semicolon (“;”) after the parsing expression is allowed.

The first rule can be preceded by a _global initializer_ and/or a _per-parse initializer_, in that order. Both are pieces of JavaScript code in double curly braces (“{{'{{'}}” and “}}”) and single curly braces (“{” and “}”) respectively. All variables and functions defined in both _initializers_ are accessible in rule actions and semantic predicates. Curly braces in both _initializers_ code must be balanced.

The _global initializer_ is executed once and only once, when the generated parser is loaded (through a `require` or an `import` statement for instance). It is the ideal location to require, to import, to declare constants, or to declare utility functions to be used in rule actions and semantic predicates.

The _per-parse initializer_ is called before the generated parser starts parsing. The code inside the _per-parse initializer_ can access the input string and the options passed to the parser using the `input` variable and the `options` variable respectively. It is the ideal location to create data structures that are unique to each parse or to modify the input before the parse.

Let's look at the example grammar from above using a _global initializer_ and a _per-parse initializer_:

    {{'{{'}}
      function makeInteger(o) {
        return parseInt(o.join(""), 10);
      }
    }}
    
    {
      if (options.multiplier) {
        input = `(${input})*(${options.multiplier})`;
      }
    }
    
    start
      = additive
    
    additive
      = left:multiplicative "+" right:additive { return left + right; }
      / multiplicative
    
    multiplicative
      = left:primary "*" right:multiplicative { return left * right; }
      / primary
    
    primary
      = integer
      / "(" additive:additive ")" { return additive; }
    
    integer "simple number"
      = digits:[0-9]+ { return makeInteger(digits); }

The parsing expressions of the rules are used to match the input text to the grammar. There are various types of expressions — matching characters or character classes, indicating optional parts and repetition, etc. Expressions can also contain references to other rules. See [detailed description below](#grammar-syntax-and-semantics-parsing-expression-types).

If an expression successfully matches a part of the text when running the generated parser, it produces a _match result_, which is a JavaScript value. For example:

*   An expression matching a literal string produces a JavaScript string containing matched text.
*   An expression matching repeated occurrence of some subexpression produces a JavaScript array with all the matches.

The match results propagate through the rules when the rule names are used in expressions, up to the start rule. The generated parser returns start rule's match result when parsing is successful.

One special case of parser expression is a _parser action_ — a piece of JavaScript code inside curly braces (“{” and “}”) that takes match results of the preceding expression and returns a JavaScript value. This value is then considered match result of the preceding expression (in other words, the parser action is a match result transformer).

In our arithmetics example, there are many parser actions. Consider the action in expression `digits:[0-9]+ { return parseInt(digits.join(""), 10); }`. It takes the match result of the expression \[0-9\]+, which is an array of strings containing digits, as its parameter. It joins the digits together to form a number and converts it to a JavaScript `number` object.

### Importing External Rules

Sometimes, you want to split a large grammar into multiple files for ease of editing, reuse in multiple higher-level grammars, etc. There are two ways to accomplish this in Peggy:

1.  From the [Command Line](#generating-a-parser-command-line), include multiple source files. This will generate the least total amount of code, since the combined output will only have the runtime overhead included once. The resulting code will be slightly more performant, as there will be no overhead to call between the rules defined in different files at runtime. Finally, Peggy will be able to perform better checks and optimizations across the combined grammar with this approach, since the combination is applied before any other rules. For example:
    
    `csv.peggy`:
    
        a = number|1.., "," WS|
        WS = [ \t]*
    
    `number.peggy`:
    
        number = n:$[0-9]+ { return parseInt(n, 10); }
    
    Generate:
    
        $ npx peggy csv.peggy number.peggy
    
2.  The downside of the CLI approach is that editor tooling will not be able to detect that rules coming from another file -- references to such rules will be shown with errors like `Rule "number" is not defined`. Furthermore, you must rely on getting the CLI or API call correct, which is not possible in all workflows.
    
    The second approach is to use ES6-style `import` statements at the top of your grammar to import rules into the local rule namespace. For example:
    
    `csv_imp.peggy`:
    
        import {number} from "./number.js"
        a = number|1.., "," WS|
        WS = [ \t]*
    
    Note that the file imported from is the compiled version of the grammar, NOT the source. Grammars MUST be compiled by a version that supports imports in order to be imported. Only rules that are allowed start rules are valid. It can be useful to specify `--allowed-start-rules *` (with appropriate escaping for your shell!) in library grammars. Imports are only valid in output formats "es" and "commonjs". If you use imports, you should use `{ output: "source" }`; the default output of "parser" will call \`eval\` on the source which fails immediately for some formats (e.g. "es") and will not find modules in the expected places for others (e.g. "commonjs"). The [from-mem](https://github.com/peggyjs/from-mem/) project is used by the Peggy CLI to resolve these issues, but note well its relatively severe limitations.
    
    All of the following are valid:
    
    *   `import * as num from "number.js" // Call with num.number`
    *   `import num from "number.js" // Calls the default rule`
    *   `import {number, float} "number.js" // Import multiple rules by name`
    *   `import {number as NUM} "number.js" // Rename the local rule to NUM to avoid colliding`
    *   `import {"number" as NUM} "number.js" // Valid in ES6`
    *   `import integer, {float} "number.js" // The default rule and some named rules`
    *   `import from "number.js" // Just the top-level initializer side-effects`
    *   `import {} "number.js" // Just the top-level initializer side-effects`

### Parsing Expression Types

There are several types of parsing expressions, some of them containing subexpressions and thus forming a recursive structure. Each example below is a part of a [full grammar](js/examples.peggy.txt), which produces an object that contains `match` and `rest`. `match` is the part of the input that matched the example, `rest` is any remaining input after the match.

`"_literal_"i   '_literal_'i`

Match exact literal string and return it. The string syntax is the same as in JavaScript, including escape sequences such as `"\xff"`, `"\uffff"` and `"\u{f}"`. Appending `i` after the literal makes the match case-insensitive.

_Example:_ `literal = "foo"`

_Matches:_ `"foo"`

_Does not match:_ `"Foo"`, `"fOo"`, `"bar"`, `"fo"`

_Try it:_ 

_Example:_ `literal_i = "foo"i`

_Matches:_ `"foo"`, `"Foo"`, `"fOo"`

_Does not match:_ `"bar"`, `"fo"`

_Try it:_ 

`.` (U+002E: FULL STOP, or "period")

Match exactly one JavaScript character (UTF-16 code unit) and return it as a string.

_Example:_ `any = .`

_Matches:_ `"f"`, `"."`, `" "`

_Does not match:_ `""`

_Try it:_ 

`!.` (END OF INPUT)

Match END OF INPUT. This _Bang Dot_ sequence will specify that the end of input should be matched. `"f" !.` will test for end of input after the character "f".

_Example:_ `no_input = !.`

_Matches:_ `""`

_Does not match:_ `"f"`

_Try it:_ 

_Example:_ `end_of_input = "f" !.`

_Matches:_ `"f[EOI]"`

_Does not match:_ `"f [EOI]"`, `""`

_Try it:_ 

`[^_characters_]iu`

Match one character from a character class and return it as a string. The characters in the list can be escaped in exactly the same way as in JavaScript string, using `\uXXXX` or `\u{XXXX}`. The list of characters can also contain ranges (e.g. `[a-z]` means “all lowercase letters”). Preceding the characters with `^` inverts the matched set (e.g. `[^a-z]` means “all characters except lowercase letters”). Appending `i` after the class makes the match case-insensitive. Appending `u` after the class forces the class into Unicode mode, where an entire codepoint will be matched, even if it takes up two JavaScript characters in a UTF-16 surrogate pair. If any of the characters in the class are outside the range 0x0-0xFFFF (the Basic Multilingual Plane: BMP), the class is automatically forced into Unicode mode even if the "u" flag is not specified. In unicode mode, a range that includes the surrogates (without mentioning a codepoint in the surrogate range explicitly) will not match a lone surrogate. For example, the class `[\u0100-\u{10FFFF}]u` will not match `"\ud800"`, but `[\ud800-\udfff]u` will.

The list of characters may also contain the special escape sequences `\p{}` or `\P{}`. These escape sequences are used to match Unicode properties. See [MDN: Unicode character class escape](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape) for more information. When one or more of these escapes are included, the class is automatically put in Unicode mode.

Note: the Unicode mode generates a JavaScript regular expression with the "u" flag set.

_Example:_ `class = [a-z]`

_Matches:_ `"f"`

_Does not match:_ `"A"`, `"-"`, `""`

_Try it:_ 

_Example:_ `not_class_i = [^a-z]i`

_Matches:_ `"="`, `" "`

_Does not match:_ `"F"`, `"f"`, `""`

_Try it:_ 

_Example:_ `not_class_u = [^a-z]u`

_Matches:_ `"🦥"`

_Does not match:_ `"f"`, `""`

_Try it:_ 

_Example:_ `class_p = [\p{ASCII}]`

_Matches:_ `"a"`, `"_"`

_Does not match:_ `ø`, `"🦥"`

_Try it:_ 

_Example:_ `class_P = [\P{ASCII}]`

_Matches:_ `ø`, `"🦥"`

_Does not match:_ `"a"`, `"_"`

_Try it:_ 

`[^]u` (not-nothing)

This is a special case of a character class, which is defined to equal one character. If the "u" flag is not specified, this is the same as the `.` expression. If the "u" flag is specified, this matches a whole Unicode codepoint, which may be one or two JavaScript characters (UTF-16 code units). In unicode mode, it will never match a lone surrogate.

`_rule_`

Match a parsing expression of a rule (perhaps recursively) and return its match result.

_Example:_ `rule = child; child = "foo"`

_Matches:_ `"foo"`

_Does not match:_ `"Foo"`, `"fOo"`, `"bar"`, `"fo"`

_Try it:_ 

`( _expression_ )`

Match a subexpression and return its match result. Parentheses create a new local context for the [Action Execution Environment](#action-execution-environment) as well as [plucks](#pluck) with the `@` operator. Note that the action block in the following example returns `2` from the parenthesized expression, NOT from the rule -- the rule returns an array of `2`'s due to the `+` operator.

_Example:_ `paren = ("1" { return 2; })+`

_Matches:_ `"11"`

_Does not match:_ `"2"`, `""`

_Try it:_ 

Similarly, in the next example, the [pluck](#pluck) operator applies to the return value of the parentheses, not the rule:

_Example:_ `paren_pluck = (@[0-9] ",")+`

_Matches:_ `"1,"`, `"2,3,"`

_Does not match:_ `"2"`, `","`

_Try it:_ 

`_expression_ *`

Match zero or more repetitions of the expression and return their match results in an array. The matching is greedy, i.e. the parser tries to match the expression as many times as possible. Unlike in regular expressions, there is no backtracking.

_Example:_ `star = "a"*`

_Matches:_ `"a"`, `"aaa"`

_Does not match:_ (always matches)

_Try it:_ 

`_expression_ +`

Match one or more repetitions of the expression and return their match results in an array. The matching is greedy, i.e. the parser tries to match the expression as many times as possible. Unlike in regular expressions, there is no backtracking.

_Example:_ `plus = "a"+`

_Matches:_ `"a"`, `"aaa"`

_Does not match:_ `"b"`, `""`

_Try it:_ 

`_expression_ |count|   _expression_ |min..max|   _expression_ |count, delimiter|   _expression_ |min..max, delimiter|`

Match exact `count` repetitions of `expression`. If the match succeeds, return their match results in an array.

_\-or-_

Match expression at least `min` but not more then `max` times. If the match succeeds, return their match results in an array. Both `min` and `max` may be omitted. If `min` is omitted, then it is assumed to be `0`. If `max` is omitted, then it is assumed to be infinity. Hence

*   `expression |..|` is equivalent to `expression |0..|` and `expression *`
*   `expression |1..|` is equivalent to `expression +`
*   `expression |..1|` is equivalent to `expression ?`

Optionally, `delimiter` expression can be specified. The delimiter is a separate parser expression, its match results are ignored, and it must appear between matched expressions exactly once.

`count`, `min` and `max` can be represented as:

*   positive integer:
    
        start = "a"|2|;
    
*   name of the preceding label:
    
        start = count:n1 "a"|count|;
        n1 = n:$[0-9] { return parseInt(n); };
    
*   code block:
    
        start = "a"|{ return options.count; }|;
    
Any non-number values, returned by the code block, will be interpreted as `0`.

_Example:_ `repetition = "a"|2..3, ","|`

_Matches:_ `"a,a"`, `"a,a,a"`

_Does not match:_ `"a"`, `"b,b"`, `"a,a,a,"`, `"a,a,a,a"`

_Try it:_ 

`_expression_ ?`

Try to match the expression. If the match succeeds, return its match result, otherwise return `null`. Unlike in regular expressions, there is no backtracking.

_Example:_ `maybe = "a"?`

_Matches:_ `"a"`, `""`

_Does not match:_ (always matches)

_Try it:_ 

`& _expression_`

This is a positive assertion. No input is consumed.

Try to match the expression. If the match succeeds, just return `undefined` and do not consume any input, otherwise consider the match failed.

_Example:_ `posAssertion = "a" &"b"`

_Matches:_ `"ab"`

_Does not match:_ `"ac"`, `"a"`, `""`

_Try it:_ 

`! _expression_`

This is a negative assertion. No input is consumed.

Try to match the expression. If the match does not succeed, just return `undefined` and do not consume any input, otherwise consider the match failed.

_Example:_ `negAssertion = "a" !"b"`

_Matches:_ `"a"`, `"ac"`

_Does not match:_ `"ab"`, `""`

_Try it:_ 

`& { _predicate_ }`

This is a positive assertion. No input is consumed.

The predicate should be JavaScript code, and it's executed as a function. Curly braces in the predicate must be balanced.

The predicate should `return` a boolean value. If the result is truthy, it's match result is `undefined`, otherwise the match is considered failed. Failure to include the `return` keyword is a common mistake.

The predicate has access to all variables and functions in the [Action Execution Environment](#action-execution-environment).

_Example:_  
`posPredicate = @num:$[0-9]+ &{return parseInt(num, 10) < 100}`

_Matches:_ `"0"`, `"99"`

_Does not match:_ `"100"`, `"-1"`, `""`

_Try it:_ 

`! { _predicate_ }`

This is a negative assertion. No input is consumed.

The predicate should be JavaScript code, and it's executed as a function. Curly braces in the predicate must be balanced.

The predicate should `return` a boolean value. If the result is falsy, it's match result is `undefined`, otherwise the match is considered failed.

The predicate has access to all variables and functions in the [Action Execution Environment](#action-execution-environment).

_Example:_  
`negPredicate = @num:$[0-9]+ !{ return parseInt(num, 10) < 100 }`

_Matches:_ `"100"`, `"156"`

_Does not match:_ `"56"`, `"-1"`, `""`

_Try it:_ 

`$ _expression_`

Try to match the expression. If the match succeeds, return the matched text instead of the match result.

If you need to return the matched text in an action, you can use the [`text()`](#action-execution-environment) function, but returning a labeled `$` expression is sometimes more clear..

_Example:_ `dollar = $"a"+`

_Matches:_ `"a"`, `"aa"`

_Does not match:_ `"b"`, `""`

_Try it:_ 

`_label_ : _expression_`

Match the expression and remember its match result under given label. The label must be a Peggy [identifier](#identifiers).

Labeled expressions are useful together with actions, where saved match results can be accessed by action's JavaScript code.

_Example:_ `label = foo:"bar"i { return {foo}; }`

_Matches:_ `"bar"`, `"BAR"`

_Does not match:_ `"b"`, `""`

_Try it:_ 

`_@_ _label_: _expression_`

Match the expression and if the label exists, remember its match result under given label. The label must be a Peggy [identifier](#identifiers), and must be valid as a function parameter in the language that is being generated (by default, JavaScript). Labels are only useful for later reference in a semantic predicate at this time.

Return the value of this expression from the rule, or "pluck" it. You may not have an action for this rule. The expression must not be a semantic predicate ([`&{ predicate }`](#-predicate-) or [`!{ predicate }`](#--predicate-)). There may be multiple pluck expressions in a given rule, in which case an array of the plucked expressions is returned from the rule.

Pluck expressions are useful for writing terse grammars, or returning parts of an expression that is wrapped in parentheses.

_Example:_ `pluck_1 = @$"a"+ " "+ @$"b"+`

_Matches:_ `"aaa bb"`, `"a "`

_Does not match:_ `"b"`, `" "`

_Try it:_ 

_Example:_ `pluck_2 = @$"a"+ " "+ @two:$"b"+ &{ return two.length < 3 }`

_Matches:_ `"aaa b"`, `"a bb"`

_Does not match:_ `"a bbbb"`, `"b"`, `" "`

_Try it:_ 

`_expression1_ _expression2_ ... _expressionn_`

Match a sequence of expressions and return their match results in an array.

_Example:_ `sequence = "a" "b" "c"`

_Matches:_ `"abc"`

_Does not match:_ `"b"`, `" "`

_Try it:_ 

`_expression_ { _action_ }`

If the expression matches successfully, run the action, otherwise consider the match failed.

The action should be JavaScript code, and it's executed as a function. Curly braces in the action must be balanced.

The action should `return` some value, which will be used as the match result of the expression.

The action has access to all variables and functions in the [Action Execution Environment](#action-execution-environment).

_Example:_ `action = " "+ "a" { return location(); }`

_Matches:_ `" a"`

_Does not match:_ `"a"`, `" "`

_Try it:_ 

`_expression1_ / _expression2_ / ... / _expressionn_`

Try to match the first expression, if it does not succeed, try the second one, etc. Return the match result of the first successfully matched expression. If no expression matches, consider the match failed.

_Example:_ `alt = "a" / "b" / "c"`

_Matches:_ `"a"`, `"b"`, `"c"`

_Does not match:_ `"d"`, `""`

_Try it:_ 

### Action Execution Environment

Actions and predicates have these variables and functions available to them.

*   All variables and functions defined in the initializer or the top-level initializer at the beginning of the grammar are available.
    
*   Note, that all functions and variables, described below, are unavailable in the global initializer.
    
*   Labels from preceding expressions are available as local variables, which will have the match result of the labelled expressions.
    
    A label is only available after its labelled expression is matched:
    
        rule = A:('a' B:'b' { /* B is available, A is not */ } )
    
    A label in a sub-expression is only valid within the sub-expression:
    
        rule = A:'a' (B:'b') (C:'b' { /* A and C are available, B is not */ })
    
*   `input` is a parsed string that was passed to the `parse()` method.
    
*   `options` is a variable that contains the parser options. That is the same object that was passed to the `parse()` method.
    
*   `error(message, where)` will report an error and throw an exception. `where` is optional; the default is the value of `location()`.
    
*   `expected(message, where)` is similar to `error`, but reports
    
    > Expected _message_ but "_other_" found.
    
    where `other` is, by default, the character in the `location().start.offset` position.
    
*   `location()` returns an object with the information about the parse position. Refer to [the corresponding section](#locations) for the details.
    
*   `range()` is similar to `location()`, but returns an object with offsets only. Refer to [the "Locations" section](#locations) for the details.
    
*   `offset()` returns only the start offset, i.e. `location().start.offset`. Refer to [the "Locations" section](#locations) for the details.
    
*   `text()` returns the source text between `start` and `end` (which will be `""` for predicates). Instead of using that function as a return value for the rule consider using the [`$` operator](#-expression-2).
    

### Parsing Lists

One of the most frequent questions about Peggy grammars is how to parse a delimited list of items. The cleanest current approach is:

    list
      = word|.., _ "," _|
    word
      = $[a-z]i+
    _
      = [ \t]*

If you want to allow a trailing delimiter, append it to the end of the rule:

    list
      = word|.., delimiter| delimiter?
    delimiter
      = _ "," _
    word
      = $[a-z]i+
    _
      = [ \t]*

In the grammars created before the repetition operator was added to the peggy (in 3.0.0) you could see that approach, which is equivalent of the new approach with the repetition operator, but less efficient on long lists:

    list
      = head:word tail:(_ "," _ @word)* { return [head, ...tail]; }
    word
      = $[a-z]i+
    _
      = [ \t]*

Note that the `@` in the tail section [plucks](#pluck) the word out of the parentheses, NOT out of the rule itself.

Peggy Identifiers
-----------------

Peggy Identifiers are used as rule names, rule references, and label names. They are used as identifiers in the code that Peggy generates (by default, JavaScript), and as such, must conform to the limitations of the Peggy grammar as well as those of the target language.

Like all Peggy grammar constructs, identifiers MUST contain only codepoints in the [Basic Multilingual Plane](https://en.wikipedia.org/wiki/Plane_(Unicode)#Basic_Multilingual_Plane). They must begin with a codepoint whose Unicode General Category property is Lu, Ll, Lt, Lm, Lo, or Nl (letters), "\_" (underscore), or a Unicode escape in the form `\uXXXX`. Subsequent codepoints can be any of those that are valid as an initial codepoint, "$", codepoints whose General Category property is Mn or Mc (combining characters), Nd (numbers), Pc (connector punctuation), "\\u200C" (zero width non-joiner), or "\\u200D (zero width joiner)"

Labels have a further restriction, which is that they must be valid as a function parameter in the language being generated. For JavaScript, this means that they cannot be on the limited set of [JavaScript reserved words](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#reserved_words). Plugins can modify the list of reserved words at compile time.

Valid identifiers:

*   `Foo`
*   `Bär`
*   `_foo`
*   `foo$bar`

**Invalid** identifiers:

*   `const` (reserved word)
*   `𐓁𐒰͘𐓐𐓎𐓊𐒷` (valid in JavaScript, but not in the Basic Multilingual Plane)
*   `$Bar` (starts with "$")
*   `foo bar` (invalid JavaScript identifier containing space)

Error Messages
--------------

As described above, you can annotate your grammar rules with human-readable names that will be used in error messages. For example, this production:

    integer "simple number"
      = digits:[0-9]+

will produce an error message like:

> Expected simple number but "a" found.

when parsing a non-number, referencing the human-readable name "simple number." Without the human-readable name, Peggy instead uses a description of the character class that failed to match:

> Expected \[0-9\] but "a" found.

Aside from the text content of messages, human-readable names also have a subtler effect on _where_ errors are reported. Peggy prefers to match named rules completely or not at all, but not partially. Unnamed rules, on the other hand, can produce an error in the middle of their subexpressions.

For example, for this rule matching a comma-separated list of integers:

    seq
      = integer ("," integer)*

an input like 1,2,a produces this error message:

> Expected integer but "a" found.

But if we add a human-readable name to the seq production:

    seq "list of numbers"
      = integer ("," integer)*

then Peggy prefers an error message that implies a smaller attempted parse tree:

> Expected end of input but "," found.

There are two classes of errors in Peggy:

*   `SyntaxError`: Syntax errors, found during parsing the input. This kind of errors can be thrown both during _grammar_ parsing and during _input_ parsing. Although name is the same, errors of each generated parser (including Peggy parser itself) has its own unique class.
*   `GrammarError`: Grammar errors, found during construction of the parser. These errors can be thrown only in the parser generation phase. This error signals a logical mistake in the grammar, such as having two rules with the same name in one grammar, etc.

By default, stringifying these errors produces an error string without location information. These errors also have a [`format()`](#error-format) method that produces an error string with location information. If you provide an array of mappings from the [`grammarSource`](#grammar-source) to the input string being processed, then the formatted error string includes ASCII arrows and underlines highlighting the error(s) in the source.

    let source = ...;
    try {
      peggy.generate( , { grammarSource: 'recursion.pegjs', ... }); // throws SyntaxError or GrammarError
      parser.parse(input, { grammarSource: 'input.js', ... }); // throws SyntaxError
    } catch (e) {
      if (typeof e.format === "function") {
        console.log(e.format([
          { source: 'main.pegjs', text },
          { source: 'input.js', text: input },
          ...
        ]));
      } else {
        throw e;
      }
    }

Messages generated by `format()` look like this

    Error: Possible infinite loop when parsing (left recursion: start -> proxy -> end -> start)
     --> .\recursion.pegjs:1:1
      |
    1 | start = proxy;
      | ^^^^^
    note: Step 1: call of the rule "proxy" without input consumption
     --> .\recursion.pegjs:1:9
      |
    1 | start = proxy;
      |         ^^^^^
    note: Step 2: call of the rule "end" without input consumption
     --> .\recursion.pegjs:2:11
      |
    2 | proxy = a:end { return a; };
      |           ^^^
    note: Step 3: call itself without input consumption - left recursion
     --> .\recursion.pegjs:3:8
      |
    3 | end = !start
      |        ^^^^^
      Error: Expected ";" or "{" but "x" found.
    --> input.js:1:16
      |
    1 | function main()x {}
      |                ^
    

A plugin may register additional passes that can generate `GrammarError`s to report about problems, but they shouldn't do that by throwing an instance of `GrammarError`. They should use the [session API](#session-api) instead.

Locations
---------

During the parsing you can access to the information of the current parse location, such as offset in the parsed string, line and column information. You can get this information by calling `location()` function, which returns you the following object:

    {
      source: options.grammarSource,
      start: { offset: 23, line: 5, column: 6 },
      end: { offset: 25, line: 5, column: 8 }
    }
    

`source` is the a string or object that was supplied in the [`grammarSource`](#grammar-source) parser option.

For certain special cases, you can use an instance of the `GrammarLocation` class as the `grammarSource`. `GrammarLocation` allows you to specify the offset of the grammar source in another file, such as when that grammar is embedded in a larger document.

If `source` is `null` or `undefined` it doesn't appear in the formatted messages. The default value for `source` is `undefined`.

For actions, `start` refers to the position at the beginning of the preceding expression, and `end` refers to the position after the end of the preceding expression.

For semantic predicates, `start` and `end` are equal, denoting the location where the predicate is evaluated.

For the per-parse initializer, the location is the start of the input, i.e.

    {
      source: options.grammarSource,
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 0, line: 1, column: 1 }
    }
    

`offset` is a 0-based character index within the source text. `line` and `column` are 1-based indices.

The line number is incremented each time the parser finds an end of line sequence in the input.

Line and column are somewhat expensive to compute, so if you just need the offset, there's also a function `offset()` that returns just the start offset, and a function `range()` that returns the object:

    {
      source: options.grammarSource,
      start: 23,
      end: 25
    }

(i.e. difference from the `location()` result only in type of `start` and `end` properties, which contain just an offset instead of the `Location` object.)

All of the notes about values for `location()` object are also applicable to the `range()` and `offset()` calls.

Peggy grammars work one UTF-16 code unit at a time, except for string literals containing characters from outside the [Basic Multilingual Plane (BMP)](https://en.wikipedia.org/wiki/Plane_(Unicode)#Basic_Multilingual_Plane) of Unicode or character classes in Unicode mode. All offsets are measured in UTF-16 code units (JavaScript characters). It is possible to get an offset in the middle of a UTF-16 surrogate pair.

Plugins API
-----------

A plugin is an object with the `use(config, options)` method. That method will be called for all plugins in the `options.plugins` array, supplied to the `generate()` method.

Plugins suitable for use on the command line can be written either as CJS or MJS modules that export a "use" function. The CLI loads plugins with `await(plugin_name)`, which should correctly load from node\_modules, a local file starting with "/" or "./", etc. For example:

    // CJS
    exports.use = (config, options) => {
    }

    // MJS
    export function use(config, options) => {
    }

`use` accepts these parameters:

### `config`

Object with the following properties:

`parser`

`Parser` object, by default the `peggy.parser` instance. That object will be used to parse the grammar. Plugin can replace this object

`passes`

Mapping `{ [stage: string]: Pass[] }` that represents compilation stages that would applied to the AST, returned by the `parser` object. That mapping will contain at least the following keys:

*   `prepare` - passes that prepare the AST for further processing. They may add to the AST, but not otherwise modify it.
*   `check` — passes that check AST for correctness. They shouldn't change the AST
*   `transform` — passes that performs various optimizations. They can change the AST, add or remove nodes or their properties
*   `semantic` — passes that process the AST semantically, relying on all of the transformations from previous passes.
*   `generate` — passes used for actual code generation.

A plugin that implements a pass should usually push it to the end of the correct array. Each pass is a function with the signature `pass(ast, options, session)`:

*   `ast` — the AST created by the `config.parser.parse()` method
*   `options` — compilation options passed to the `peggy.compiler.compile()` method. If parser generation is started because `generate()` function was called that is also an options, passed to the `generate()` method
*   `session` — a [`Session`](#session-api) object that allows raising errors, warnings and informational messages

`reservedWords`

String array with a list of words that shouldn't be used as label names. This list can be modified by plugins. That property is not required to be sorted or not contain duplicates, but it is recommend to remove duplicates.

Default list contains [JavaScript reserved words](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#reserved_words), and can be found in the `peggy.RESERVED_WORDS` property.

### `options`

Build options passed to the `generate()` method. A best practice for a plugin would look for its own options under a `<plugin_name>` key:

    // File: foo.mjs
    export function use(config, options) => {
      const mine = options['foo_mine'] ?? 'my default';
    }

### Session API

Each compilation request is represented by a `Session` instance. An object of this class is created by the compiler and given to each pass as a 3rd parameter. The session object gives access to the various compiler services. At the present time there is only one such service: reporting of diagnostics.

All diagnostics are divided into three groups: errors, warnings and informational messages. For each of them the `Session` object has a method, described below.

All reporting methods have an identical signature:

    (message: string, location?: LocationRange, notes?: DiagnosticNote[]) => void;

*   `message`: a main diagnostic message
*   `location`: an optional location information if diagnostic is related to the grammar source code
*   `notes`: an array with additional details about diagnostic, pointing to the different places in the grammar. For example, each note could be a location of a duplicated rule definition

`error(...)`

Reports an error. Compilation process is subdivided into pieces called _stages_ and each stage consist of one or more _passes_. Within the one stage all errors, reported by different passes, are collected without interrupting the parsing process.

When all passes in the stage are completed, the stage is checked for errors. If one was registered, a `GrammarError` with all found problems in the `problems` property is thrown. If there are no errors, then the next stage is processed.

After processing all three stages (`check`, `transform` and `generate`) the compilation process is finished.

The process, described above, means that passes should be careful about what they do. For example, if you place your pass into the `check` stage there is no guarantee that all rules exists, because checking for existing rules is also performed during the `check` stage. On the contrary, passes in the `transform` and `generate` stages can be sure that all rules exists, because that precondition was checked on the `check` stage.

`warning(...)`

Reports a warning. Warnings are similar to errors, but they do not interrupt a compilation.

`info(...)`

Report an informational message. This method can be used to inform user about significant changes in the grammar, for example, replacing proxy rules.

Compatibility
-------------

Both the parser generator and generated parsers should run well in the following environments:

*   Node.js 14+
*   Edge
*   Firefox
*   Chrome
*   Safari
*   Opera

The generated parser is intended to run in older environments when the format chosen is "globals" or "umd". Extensive testing is NOT performed in these environments, but issues filed regarding the generated code will be fixed.

function validateGrammar({target}) { const results = target.nextElementSibling; try { const res = peggyExamples.parse(target.value, {startRule: target.name}); // not innerHTML, or needs to be escaped. results.innerText = JSON.stringify(res); results.classList.remove('error'); } catch (e) { results.innerText = e.toString(); results.classList.add('error'); } } const inputs = document.querySelectorAll('.example input'); for (const i of inputs) { i.addEventListener("input", validateGrammar) validateGrammar({target: i}); }
