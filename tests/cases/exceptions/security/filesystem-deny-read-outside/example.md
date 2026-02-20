# Filesystem deny read outside allowlist

/var @policyConfig = {
  allow: ["fs:r:@base/src/**"]
}
/policy @p = union(@policyConfig)

/var @data = <fs-sec-deny-read-outside.txt>
/show @data
