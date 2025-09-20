---
description: Test namespace derivation with special characters
---

# Special Character Namespace Test

## Hyphenated filename

/import "./special-chars-config.mld"

/show `Config name: @special_chars_config.name`

## Numeric and special chars

/import "./special-chars-version.mld"

/show `Version config: @special_chars_version.version`

## Path with directories

/import "./some/deep/path/settings.mld"

/show `Settings value: @settings.value`