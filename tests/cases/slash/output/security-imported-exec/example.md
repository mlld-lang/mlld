# Output directive handles imported executable results

/import { greeter } from "security-output-module.mld"

/var @result = @greeter("Katherine Johnson")
/output @result to "./greeting.txt"
/show "Wrote greeting file."
