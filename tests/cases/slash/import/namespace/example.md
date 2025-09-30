# Import Namespace Test

Test namespace imports with aliases.

/import { * as @config } from "namespace-settings.mld"

/var @result = :::Config author: {{config.author}}, API URL: {{config.apiUrl}}:::
/show @result
