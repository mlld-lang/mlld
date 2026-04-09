/exe tool:w @send_email(recipient, subject) = `sent:@recipient:@subject` with { controlArgs: ["recipient"] }
/var tools @writeTools = {
  send_email: {
    mlld: @send_email,
    expose: ["recipient", "subject"],
    controlArgs: ["recipient"]
  }
}
/exe @layer(tools) = @tools["send_email"]({
  recipient: "ada@example.com",
  subject: "hi"
})
/show @layer(@writeTools)
