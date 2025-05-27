# Complex Test 2: Dynamic Path Resolution and Conditional Content

@data env = {
  "mode": "development",
  "paths": {
    "dev": "./files/dev-config",
    "prod": "./files/prod-config",
    "test": "./files/test-config"
  }
}

>> Dynamic path selection based on data
@path config_dir = @env.paths.dev

>> Build dynamic file paths
@path config_file = [[{{config_dir}}/settings.json]]
@path docs_file = [[{{config_dir}}/README.md]]

>> Test path operations with dynamic paths
@text settings = @config_file
@text documentation = @docs_file # Section Extraction

>> Complex template with nested conditionals (simulated)
@text report = [[
# Configuration Report

Environment: {{env.mode}}
Config Directory: {{config_dir}}

## Would load from:
- Settings: {{config_file}}
- Documentation: {{docs_file}}
]]

## Directory Contents:
@run [ls -la @config_dir 2>/dev/null || echo "Directory not found"]

## Current Working Directory:
@run [pwd]

## All .mld files in examples:
@run [find . -name "*.mld" -type f | head -10]

@add @report