# Guard overrides except skip a named guard

/guard @denySecret before op:show = when [
  * => deny "blocked"
]

/guard @allowAudit before op:show = when [
  * => allow
]

/var secret @token = "sek"
/show `value: @token` with { guards: { except: ["@denySecret"] }, pipeline: [] }
