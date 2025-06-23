# Environment Variables with @INPUT

This test shows @INPUT importing with environment variables through stdin.

/import { * } from @INPUT

/show [[
Variables from @INPUT:
- MY_ALLOWED_VAR: {{MY_ALLOWED_VAR}}
- ANOTHER_ALLOWED: {{ANOTHER_ALLOWED}}
]]