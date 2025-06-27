# Environment Variables with @INPUT

This test shows @INPUT importing with environment variables through stdin.

/import @INPUT

/show ::
Variables from @INPUT:
- MY_ALLOWED_VAR: {{input.MY_ALLOWED_VAR}}
- ANOTHER_ALLOWED: {{input.ANOTHER_ALLOWED}}
::