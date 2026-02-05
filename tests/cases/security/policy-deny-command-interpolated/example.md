# Policy deny overrides allow for interpolated command

/var @policyConfig = {
  capabilities: {
    allow: ["cmd:git:*"],
    deny: ["cmd:git:push"]
  }
}

/var @cmd = "git push origin main"

/policy @p = union(@policyConfig)

/run { @cmd }
