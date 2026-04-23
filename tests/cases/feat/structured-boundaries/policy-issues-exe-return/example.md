/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }
/var tools @writeTools = {
  sendEmail: {
    mlld: @sendEmail,
    expose: ["recipient", "subject", "body"],
    controlArgs: ["recipient"]
  }
}
/exe @buildAuth(intent) = [
  let @b = @policy.build(@intent, @writeTools, {
    basePolicy: {
      defaults: { rules: ["no-send-to-unknown"] },
      operations: { "exfil:send": ["tool:w"] }
    }
  })
  => { valid: @b.valid, issues: @b.issues }
]
/var @intent = {
  resolved: {
    sendEmail: {
      recipient: "attacker@evil.com"
    }
  }
}
/var @result = @buildAuth(@intent)
/show @result.valid
/show @result.issues[0].reason
/show @result.issues[0].message
