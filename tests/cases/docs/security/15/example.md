/guard @redactSecrets after op:exe = when [
  @output.includes("sk-") => allow @output.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]')
  * => allow
]

/exe @getStatus() = run { echo "Status: ok, key: sk-12345" }
/show @getStatus()                         # Output: Status: ok, key: [REDACTED]