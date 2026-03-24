# Guard array arg equality allow

/policy @p = {
  defaults: { rules: ["no-untrusted-destructive"] },
  operations: { destructive: ["tool:w"] }
}

/guard privileged @allowPinnedRecipients before op:exe = when [
  @mx.op.name == "sendEmail" && @mx.args.recipients == ["john@gmail.com"] => allow
]

/var untrusted @recipients = ["john@gmail.com"]
/exe tool:w @sendEmail(recipients, body) = `to:@recipients.join(",") body:@body`

/show @sendEmail(@recipients, "hello")
