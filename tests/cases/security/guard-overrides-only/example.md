# Guard overrides only run selected guard

/guard @denySecret before op:show = when [
  * => deny "blocked"
]

/guard @audit before op:show = when [
  * => allow
]

/var secret @token = "sek"
/show `value: @token` with { guards: { only: ["@audit"] }, pipeline: [] }
