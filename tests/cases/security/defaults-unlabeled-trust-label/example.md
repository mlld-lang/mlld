# Defaults unlabeled applies trust label

/var @policyConfig = {
  defaults: { unlabeled: "untrusted" }
}

/policy @p = union(@policyConfig)

/var @data = <./defaults-unlabeled-data.txt>

/show @data.mx.labels
