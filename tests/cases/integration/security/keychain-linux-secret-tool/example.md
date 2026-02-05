/policy @config = {
  auth: {
    claude: { from: "keychain:mlld-env-{projectname}/claude", as: "CLAUDE_CODE_OAUTH_TOKEN" }
  },
  keychain: {
    allow: ["mlld-env-{projectname}/*"]
  },
  capabilities: { danger: ["@keychain"] }
}
policy @p = union(@config)

run cmd { echo ok } using auth:claude
