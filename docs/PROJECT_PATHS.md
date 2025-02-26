# Project Path Resolution in Meld

Meld uses a secure project path resolution system to determine the root of your project. This is important for resolving relative paths and ensuring that path variables like `$PROJECTPATH` and `$.` work correctly.

## How Project Paths are Resolved

Meld resolves project paths in the following order:

1. **meld.json Configuration**: If a `meld.json` file is found (by searching up from the current directory), its location is used as the base, and the `projectRoot` setting determines the actual project root.

2. **Project Markers**: If no `meld.json` is found, Meld looks for common project markers like `.git`, `package.json`, etc. to identify the project root.

3. **Current Directory**: If no markers are found, the current working directory is used as the project root.

## Security Constraints

For security reasons, Meld enforces strict constraints on project paths:

- The project root must be either the directory containing `meld.json` or a subdirectory of it
- Path traversal (using `..`) is not allowed in the `projectRoot` setting
- Absolute paths are not allowed in the `projectRoot` setting

If an invalid path is specified in `meld.json`, Meld will silently fall back to using the directory containing `meld.json` as the project root.

## Initializing a Meld Project

To explicitly set your project root, use the `meld init` command:

```bash
cd /your/project
meld init
```

This will create a `meld.json` file in the current directory with default settings.

## Example meld.json

```json
{
  "projectRoot": ".",
  "version": 1
}
```

To use a subdirectory as your project root:

```json
{
  "projectRoot": "src",
  "version": 1
}
```

## Path Variables

Once the project root is determined, Meld sets the following path variables:

- `$PROJECTPATH` or `$.`: The resolved project root
- `$HOMEPATH` or `$~`: The user's home directory

These variables can be used in Meld files to reference paths relative to these locations:

```
// Reference a file in the project
![Project file]($.path/to/file.png)

// Reference a file in the home directory
![Home file]($~path/to/file.png)
```

## Path Validation

Meld enforces strict path validation rules to ensure security:

1. Paths with slashes must start with `$.` or `$~`
2. Paths cannot contain `.` or `..` segments
3. Raw absolute paths are not allowed

These rules help prevent path traversal attacks and ensure that all file access is explicitly scoped to either the project directory or the user's home directory. 