/policy @config = {
  auth: {
    claude: { from: "keychain:mlld-box-{projectname}/blocked", as: "TOKEN" }
  },
  keychain: {
    allow: ["mlld-box-{projectname}/*"],
    deny: ["mlld-box-{projectname}/blocked"]
  },
  capabilities: { danger: ["@keychain"] }
}

/run "echo ok" with { auth: "claude" }
