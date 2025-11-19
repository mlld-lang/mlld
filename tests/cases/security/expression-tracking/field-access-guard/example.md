/guard @configSecretBlock for secret = when [
  * => deny "Nested field secrets blocked"
]

/var secret @config = {
  api: {
    key: "sk-nested-555"
  }
}

/show @config.api.key
