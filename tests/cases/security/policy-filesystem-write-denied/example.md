# Policy denies filesystem write

/var @policyConfig = {
  allow: {
    filesystem: {
      write: ["@base/tmp/**"]
    }
  }
}

/policy @p = union(@policyConfig)

/output "blocked" to "@base/policy-fs-blocked.txt"
