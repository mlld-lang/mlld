/policy @config = {
  auth: {
    claude: { from: "keychain:mlld-box-{projectname}/claude", as: "CLAUDE_CODE_OAUTH_TOKEN" }
  },
  keychain: {
    allow: ["mlld-box-{projectname}/*"]
  },
  capabilities: { danger: ["@keychain"] }
}
policy @p = union(@config)

run cmd { echo ok } using auth:claude
