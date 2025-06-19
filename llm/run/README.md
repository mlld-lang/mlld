# mlld Scripts Directory

This directory contains mlld scripts that can be executed using the `mlld run` command.

## Usage

Run any script in this directory by name (without the .mld extension):

```bash
mlld run example     # Runs example.mld
mlld run             # Lists all available scripts
```

## Creating Scripts

Scripts are regular `.mld` files that can use all mlld features:

1. Create a new `.mld` file in this directory
2. Write mlld code to perform your task
3. Run it with `mlld run <script-name>`

## Example Script Structure

```mlld
# Script Title

Description of what this script does.

@import { helper } from @local/utils

@text result = @helper("input")
@add @result
```

## Configuration

The script directory location is configured in `mlld.lock.json`. 
Run `mlld setup` to change the default location.