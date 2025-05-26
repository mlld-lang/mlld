# Grammar Tweaks

Small grammar fixes that should be made during the consolidation work or as a quick follow-up.

## 1. Optional Whitespace for Parameterized Definitions

**Issue**: Whitespace is currently required between identifier and parameters in parameterized definitions.

**Current**:
```mlld
@text template (param1, param2) = ...
@exec command (arg1, arg2) = ...
```

**Should allow**:
```mlld
@text template(param1, param2) = ...
@exec command(arg1, arg2) = ...
```

**Files to update**:
- `grammar/directives/text.peggy` - Line ~108: Change `_ "("` to `_? "("` 
- `grammar/directives/exec.peggy` - Similar pattern for command definitions

## 2. Other Tweaks

(Add more as discovered)