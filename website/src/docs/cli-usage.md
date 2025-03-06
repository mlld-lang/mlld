---
layout: docs.njk
title: "Meld CLI Usage"
---

{% raw %}
# Meld CLI Usage

The Meld CLI provides a simple way to process Meld files from the command line.

## Installation

Install Meld globally to use the CLI:

```bash
npm install -g meld
```

Or use it from a local installation:

```bash
npm install meld
npx meld <options>
```

## Basic Usage

Process a Meld file with default options:

```bash
meld input.meld
```

By default, this will:
- Parse and interpret the Meld file
- Generate output in XML format
- Save to a file with the same name but extension changed to `.llm`

## Command Line Options

### Output Format

Specify the output format with the `--format` or `-f` option:

```bash
meld input.meld --format md
```

Supported formats:
- `xml` (default) - Outputs in XML format
- `md` - Outputs in Markdown format

### Output File

Specify the output file with the `--output` or `-o` option:

```bash
meld input.meld --output output.llm
```

By default, the output file uses the input filename with a new extension.

### Output to Console

Print to stdout instead of writing to a file with the `--stdout` option:

```bash
meld input.meld --stdout
```

### Combined Options

You can combine multiple options:

```bash
meld input.meld --format md --output custom.md --stdout
```

## File Extensions

Meld supports several file extensions:

- `.meld` - Standard Meld files
- `.meld.md` - Meld files with Markdown content
- `.mll` - Alternative extension for Meld files
- `.mll.md` - Alternative extension for Meld Markdown files

## Examples

Process a Meld file with default options:
```bash
meld document.meld
```

Process a Meld file and output as Markdown:
```bash
meld document.meld --format md
```

Process a Meld file and save with custom name:
```bash
meld document.meld --output result.llm
```

Process a Meld file and print to console:
```bash
meld document.meld --stdout
```

Process a Meld file with multiple options:
```bash
meld document.meld --format md --output result.md --stdout
```

## Environment Variables

Meld scripts can access environment variables using the `{{ENV_NAME}}` syntax:

```meld
@text token = "{{ENV_TOKEN}}"
```

You can set these when running the CLI:

```bash
ENV_TOKEN=12345 meld script.meld
```

## Project Path

The special `$PROJECTPATH` or `$.` variable refers to the directory where the Meld CLI is executed. All relative paths in Meld scripts are resolved relative to this directory.
{% endraw %}