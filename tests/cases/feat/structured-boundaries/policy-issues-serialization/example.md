/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }
/var tools @writeTools = {
  sendEmail: {
    mlld: @sendEmail,
    expose: ["recipient", "subject", "body"],
    controlArgs: ["recipient"]
  }
}
/var @intent = {
  resolved: {
    sendEmail: {
      recipient: "attacker@evil.com"
    }
  }
}
/var @built = @policy.build(@intent, @writeTools, {
  basePolicy: {
    defaults: { rules: ["no-send-to-unknown"] },
    operations: { "exfil:send": ["tool:w"] }
  }
})
/show @built.valid
/show @built.issues.length
/show @built.issues[0].reason
/show @built.issues[0].tool
/show @built.issues
