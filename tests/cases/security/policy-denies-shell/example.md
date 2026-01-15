# Policy denies shell access

/var @policyConfig = {
  deny: { sh: true }
}

/policy @p = union(@policyConfig)

/run { sh -c "echo should not run" }
