# Changelog

All notable changes to the mlld project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4]
Fixed:
- Foreach / section targeting bugs

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
