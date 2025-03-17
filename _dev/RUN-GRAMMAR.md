We are going to make the following changes to the run grammar:

  1. the change described in ISSUE-command-reference-args.md
  2. allow multi-line run directives with @run [[...]] where $path and {{variable}}
  contents are properly tokenized for interpretation (see @embed and @text
  implementations)
  3. allow multi-line run directives with a programming language indicator that
  allow for passing the whole contents of the lines between [[ and ]] along with the
   language indicator, so:

  @run [[ javascript
  some invalid
  js with a {{variable}}
  here
  @text this is ignored too
  ]]

  would pass "javascript" as the language and the entire contents of the lines
  between the brackets as a single node without interpreting anything as:
  ```
  some invalid
  js with a {{variable}}
  here
  @text this is ignored too
  ```
  4. allow the same as the above but also with passed variables also handled so you
  can do:
  ```
  @run ({{variable}},{{othervariable}} [[ javascript
  (some python here that has {{variable}} and {{othervariable}} available to import
  natively)
  ]]
  ```
  Before you work on the grammar, it's very important to approach our grammar
  carefully and intentionally and to take a "measure 5 times, cut once" approach,
  really really thinking things through before taking action. Here's our current
  grammar for your review core/ast/grammar/meld.pegjs and additional required
  reading: core/ast/docs/ADVICE.md core/ast/docs/DEBUG.md

  Start by fully investigating the right strategy here
