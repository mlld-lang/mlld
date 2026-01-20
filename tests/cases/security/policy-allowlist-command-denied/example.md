# Policy allow list denies unlisted command

/var @policyConfig = {
  allow: ["cmd:git:*"]
}

/policy @p = union(@policyConfig)

/run { echo "blocked" }
