# Policy allows filesystem read

/var @policyConfig = {
  allow: {
    filesystem: {
      read: ["@base/policy-fs-allowed.txt"]
    }
  }
}

/policy @p = union(@policyConfig)

/show <policy-fs-allowed.txt>
