# Filesystem allow read via @base

/var @policyConfig = {
  allow: ["fs:r:@base/src/**"]
}
/policy @p = union(@policyConfig)

/var @data = <src/fs-sec-allow-read-base.txt>
/show @data
