# Import Namespace from JSON Test  

Test namespace imports from JSON files with aliases.

@import { * as config } from [config.json]

@text result = [[Config values - name: {{config.name}}, version: {{config.version}}, environment: {{config.environment}}]]
@add @result