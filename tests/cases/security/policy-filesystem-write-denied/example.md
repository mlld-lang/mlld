# Policy denies filesystem write

/var @policyConfig = {
  allow: [
    "fs:w:@base/tmp/**"
  ]
}

/policy @p = union(@policyConfig)

/output "blocked" to "@base/policy-fs-blocked.txt"
