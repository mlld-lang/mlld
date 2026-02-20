# Policy guards cannot be bypassed with guards: false

/var @policyConfig = {
  deny: { cmd: ["cat"] }
}

/policy @p = union(@policyConfig)

/run { cat /etc/passwd } with { guards: false }
