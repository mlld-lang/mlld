# Filesystem allow read via ~

/var @policyConfig = {
  allow: ["fs:r:~/.mlld-home/**"]
}
/policy @p = union(@policyConfig)

/var @data = </home/mlld-fs-tilde/.mlld-home/fs-sec-home-tilde.txt>
/show @data
