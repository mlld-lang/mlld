# Chaining LLM Requests Example
/import { role } from "files/imports.mld"

/text @tests = run {npm test}
/text @res = run {llm --context @tests --task "What's one thing that's broken here?"}
/run {llm "Make a plan to fix this:\n\n# Issue:\n@res" --system @role.architect}