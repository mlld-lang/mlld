# @embed Directive

The `@embed` directive includes content from external files into your Meld document.

## Syntax

```meld
@embed [path]
@embed [path # section_text]
@embed [path] as ###
@embed [path # section_text] as ###
@embed [path] under header_text
```

Where:
- `path` is the path to the file to embed (can use path variables)
- `section_text` is optional text that identifies a specific section to extract
- `###` is an optional heading level (number of # characters) for the embedded content
- `header_text` is optional text to use as a header for the embedded content

## Path Specification

The path can be:
- An absolute path using `$HOMEPATH` or `$PROJECTPATH`
- A path variable: `@embed [$docs/guide.md]`

## Section Extraction

You can extract specific sections from Markdown files using the `#` symbol:

```meld
@embed [guide.md # Getting Started]
```

This will extract only the section titled "Getting Started" from guide.md.

## Heading Level Adjustment

You can adjust the heading level of embedded content using the `as` keyword:

```meld
@embed [guide.md] as ###
```

This will increase all headings by the specified number of `#` characters.

## Adding Headers

You can add a header to embedded content using the `under` keyword:

```meld
@embed [code.js] under Example Code
```

This will add a header "Example Code" above the embedded content.

## Variable Support

Path, section, and header parameters can all contain variables:

```meld
@text section = "Getting Started"
@text header = "Code Example"
@embed [$docs/guide.md # {{section}}] under {{header}}
```

## Error Handling

The implementation handles these error scenarios:
- Missing/empty path parameter
- File not found
- Section not found in target file
- Invalid heading level (must be 1-6)
- Invalid parameter types
- Circular file inclusions

## Examples

Basic file embedding:
```meld
@embed ["$PROJECTPATH/README.md"]
```

Embedding with path variables:
```meld
@path docs = "$PROJECTPATH/docs"
@embed [$docs/guide.md]
```

Embedding specific sections:
```meld
@embed [$docs/api.md # Authentication]
```

Adjusting heading levels:
```meld
@embed [$docs/guide.md] as ##
```

Adding headers:
```meld
@embed [$src/example.js] under Code Example
```

## Notes

- Missing files will generate fatal errors
- The `#` section identifier looks for heading text matching exactly
- For non-markdown files, the entire file content is embedded
- If the section is not found, a warning will be generated
- The implementation protects against circular file inclusions