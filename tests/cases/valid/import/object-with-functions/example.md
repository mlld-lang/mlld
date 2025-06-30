# Test importing object with function properties

@import { claude, claude_ask } from "./module.mld"

## Direct function import (should work)
@run @claude_ask("test")

## Object method access (currently fails but should work)  
@run @claude.ask("test")