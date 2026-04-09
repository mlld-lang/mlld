/import { @writeTools } from "/structured-boundaries-tools.mld"
/exe @layer(tools) = @tools["send_email"]({
  recipient: "ada@example.com",
  subject: "hi"
})
/show @layer(@writeTools)
