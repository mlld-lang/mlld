# Common mlld Mistakes - Invalid Usage Examples

This file shows common mistakes that new mlld users make when trying to use mlld like a template language.

/text @myvar = "Hello world"
/data @person = { "name": "John", "age": 30 }

## Mistake 1: Bare @ variable references
This is some text. Now I'm going to say @myvar - this WON'T work!

## Mistake 2: Template syntax in regular text  
Or maybe I'll say {{myvar}} - this also WON'T work!

## Mistake 3: Directive in middle of line
Some text @add @myvar in the middle - this WON'T work either!

## Mistake 4: Object field access in text
The person's name is @person.name - nope, still won't work!

---

## The CORRECT way:

/text @myvar = "Hello world"

This is some text. Now I'm going to say:
/add @myvar

Or with templates:
/text @greeting = [[Hello {{myvar}}!]]
/add @greeting

The key insight: mlld is a **programming language embedded IN markdown**, not a **template language**. 
It treats as plain text EVERY line that doesn't start with a mlld directive.