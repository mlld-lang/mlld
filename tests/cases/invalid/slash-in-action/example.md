---
description: Using slash prefix in when action
---

# Incorrect slash in when action

/exe @test(p) = when [
  @p.try < 3 => show "Retrying..."
  * => @p
