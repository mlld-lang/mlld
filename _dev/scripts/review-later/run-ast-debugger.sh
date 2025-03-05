#!/bin/bash

# Run AST Debugger
# This script makes it easier to run ast-debugger.ts with proper TypeScript support
#
# Usage: ./scripts/run-ast-debugger.sh <directive-type> ["custom content"]
#
# Examples:
#   ./scripts/run-ast-debugger.sh path
#   ./scripts/run-ast-debugger.sh import
#   ./scripts/run-ast-debugger.sh custom "@import [test.meld]"

# Get the directive type from command line arguments
DIRECTIVE_TYPE=${1:-path}
CUSTOM_CONTENT=$2

# Run the AST debugger with proper TypeScript configuration
if [ -z "$CUSTOM_CONTENT" ]; then
    npx ts-node -P tsconfig.json scripts/ast-debugger.ts "$DIRECTIVE_TYPE"
else
    npx ts-node -P tsconfig.json scripts/ast-debugger.ts "$DIRECTIVE_TYPE" "$CUSTOM_CONTENT"
fi 