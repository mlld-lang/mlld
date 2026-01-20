# Policy allows filesystem read

/var @policyConfig = {
  allow: [
    "fs:r:@base/policy-fs-allowed.txt"
  ]
}

/policy @p = union(@policyConfig)

/show <policy-fs-allowed.txt>
