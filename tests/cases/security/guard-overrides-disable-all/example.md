# Guard overrides disable all

/guard @denySecret before op:show = when [
  * => deny "No secrets allowed"
]

/var secret @token = "sek"
/show `value: @token` with { guards: false, pipeline: [] }
