# Filesystem dangerous write blocked without allow.danger

/var @policyConfig = {
  allow: ["fs:w:@base/.mlld/**"]
}
/policy @p = union(@policyConfig)

/output "blocked" ".mlld/fs-sec-danger-write.txt"
