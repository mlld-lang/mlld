/policy @config = {
  auth: {
    claude: { from: "keychain:mlld-env-{projectname}/blocked", as: "TOKEN" }
  },
  keychain: {
    allow: ["mlld-env-{projectname}/*"],
    deny: ["mlld-env-{projectname}/blocked"]
  },
  capabilities: { danger: ["@keychain"] }
}

/run "echo ok" with { auth: "claude" }
