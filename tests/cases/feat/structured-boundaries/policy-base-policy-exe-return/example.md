/var @intent = {
  sendEmail: {
    recipient: {
      eq: "ada@example.com",
      attestations: ["known"]
    }
  }
}
/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }
/var tools @writeTools = {
  sendEmail: {
    mlld: @sendEmail,
    expose: ["recipient", "subject", "body"],
    controlArgs: ["recipient"]
  }
}
/exe @makeBasePolicy() = js {
  return {
    defaults: {
      rules: ["no-send-to-unknown"]
    },
    operations: {
      "exfil:send": ["tool:w"]
    },
    authorizations: {
      deny: []
    }
  };
}
/var @built = @policy.build(@intent, @writeTools, {
  basePolicy: @makeBasePolicy()
})
/show @built.valid
/show @built.policy.defaults.rules.0
/show @sendEmail("ada@example.com", "hi", "body") with { policy: @built.policy }
