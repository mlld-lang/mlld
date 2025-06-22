# Import Namespace Test

Test namespace imports with aliases.

@import { * as config } from "settings.mld"

@text result = [[Config author: {{config.author}}, API URL: {{config.apiUrl}}]]
@add @result