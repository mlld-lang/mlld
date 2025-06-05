# CLI Usage

The mlld CLI provides a simple way to process mlld files from the command line.

## Installation

Install globally to use the CLI:

```bash
npm install -g mlld
```

Or use it from a local installation:

```bash
npm install mlld
npx mlld <options>
```

## Basic Usage

Process a mlld file with default options:

```bash
mlld input.mld
```

By default, this will:
- Parse and interpret the mlld file
- Generate output in XML format
- Save to a file with the same name but extension changed to `.llm`

## Command Line Options

### Output Format

Specify the output format with the `--format` or `-f` option:

```bash
mlld input.mld --format md
```

Supported formats:
- `xml` (default) - Outputs in XML format
- `md` - Outputs in Markdown format

### Output File

Specify the output file with the `--output` or `-o` option:

```bash
mlld input.mld --output output.llm
```

By default, the output file uses the input filename with a new extension.

### Output to Console

Print to stdout instead of writing to a file with the `--stdout` option:

```bash
mlld input.mld --stdout
```

### Combined Options

You can combine multiple options:

```bash
mlld input.mld --format md --output custom.md --stdout
```

## File Extensions

mlld supports several file extensions:

- `.mld` - Standard mlld files
- `.mld.md` - mlld files with Markdown content
- `.mll` - Alternative extension for mlld files
- `.mll.md` - Alternative extension for mlld Markdown files

## Examples

Process a mlld file with default options:
```bash
mlld document.mld
```

Process a mlld file and output as Markdown:
```bash
mlld document.mld --format md
```

Process a mlld file and save with custom name:
```bash
mlld document.mld --output result.llm
```

Process a mlld file and print to console:
```bash
mlld document.mld --stdout
```

Process a mlld file with multiple options:
```bash
mlld document.mld --format md --output result.md --stdout
```

## Environment Variables

mlld scripts can access environment variables using the `{{ENV_NAME}}` syntax:

```mlld
@text token = "{{ENV_TOKEN}}"
```

You can set these when running the CLI:

```bash
ENV_TOKEN=12345 mlld script.mld
```

## Project Path

The special `$PROJECTPATH` or `$.` variable refers to the directory where the mlld CLI is executed. All relative paths in mlld scripts are resolved relative to this directory.