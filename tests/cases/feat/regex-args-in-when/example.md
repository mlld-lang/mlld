---
description: regex arguments with parentheses inside when expression conditions
---

/var @payload = { message: { content: "auth request", mentions: [] } }

/exe @route() = when first [
  @payload.message.mentions.length == 1 => "direct"
  @payload.message.content.match(/(greeting|salute)$/i) => "greeting"
  @payload.message.content.match(/(auth|session|login|password)/i) => "auth"
  * => "default"
]

/show @route()
