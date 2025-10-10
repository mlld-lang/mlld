# Registry module (offline after install)
/import module { @api } from @company/tools

# Embedded at parse time
/import static <./prompts/system.md> as @systemPrompt

# Always fetch fresh
/import live <https://api.status.io> as @status

# Cached with TTL
/import cached(30m) <https://feed.xml> as @feed

# Local development (llm/modules/)
/import local { @helper } from @alice/dev-module