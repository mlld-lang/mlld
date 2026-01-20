# Policy allow list allows command

/var @policyConfig = {
  allow: { cmd: ["echo:*"] }
}

/policy @p = union(@policyConfig)

/run { echo "allowed" }
