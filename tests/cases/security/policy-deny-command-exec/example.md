# Policy deny applies to exec invocation commands

/var @policyConfig = {
  capabilities: {
    allow: ["cmd:git:*"],
    deny: ["cmd:git:push"]
  }
}

/policy @p = union(@policyConfig)

/exe @push() = cmd { git push origin main }

/var @result = @push()
