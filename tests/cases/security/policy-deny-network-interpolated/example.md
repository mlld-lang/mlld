# Policy deny blocks interpolated network commands

/var @policyConfig = {
  capabilities: {
    deny: ["network"]
  }
}

/var @cmd = "curl https://example.com"

/policy @p = union(@policyConfig)

/run { @cmd }
