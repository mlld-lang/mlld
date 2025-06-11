# Changelog

All notable changes to the mlld project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1 - 1.2.2]
Fixed:
- Module publishing PR to correct path / structure

## [1.2.0]
Added: 
- Private modules! Just like regular modules... but privater!

Fixed:
- #248: Drop @run requirement for exec invocation in @text
- #250: Exec functions show as '[command: undefined]' when called
- #252: Unclear @run requirement for exec function calls

## [1.1.7]
Fixed:
- @data directives storing ExecInvocation nodes were not being evaluated when accessed through @add

## [1.1.6]
Added:
- Toggle for turning off line normalization:
   `--no-normalize-blank-lines` CLI flag
   `normalizeBlankLines: false` in the API

## [1.1.5]
Fixed:
- Publishing a module as an org

Added:
- Newline trimming / normalization by default

## [1.1.1 - 1.1.4] 
Fixed:
- Stuff I broke
- Formatting issues
- Publishing blocked by overly aggressive validation

## [1.1.0]
New:
- #240 Support for node with `@run node [(...)]`

Fixed:
- #239 Stopped section-getters repeating headers
- Foreach / section targeting bugs
- Made llmxml shut up (copious logging)

Added:
- #238 Support for backtick templates with @var interpolation

## [1.0.3]

Fixed:
- #235 Parser choking on EOF after closing backticks
- #234 Added blank line between frontmatter and h1 in mlld init template
- #233 Fixed yaml parsing issues by switching to graymatter 
- Created a resolver for @PROJECTPATH / @. variables to align with switch to resolver pattern

Known issues:
- #237 @INPUT variable is currently broken by fix for @. / @PROJECTPATH - # 
- #236 Template parsing fails with nested brackets in double-bracket templates

## [1.0.2]

Added:
- Foreach section extraction syntax: `foreach [@array.field # section] as [[template]]`
- Direct iteration over file arrays with section extraction for documentation assembly
- Support for variable section names: `[@docs.path # @docs.section]`

## [1.0.1]

Added:
- @add [file.md # @sectionVariable] syntax for variable section references
- Integration with foreach for collecting multiple sections dynamically

## [1.0.0]

Initial versioned release. 
