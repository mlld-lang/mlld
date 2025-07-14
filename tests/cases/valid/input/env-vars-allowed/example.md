# Environment Variables with @input

This test shows @input importing with environment variables through stdin.

/import @input

/show ::
Variables from @input:
- MY_ALLOWED_VAR: {{input.MY_ALLOWED_VAR}}
- ANOTHER_ALLOWED: {{input.ANOTHER_ALLOWED}}
::