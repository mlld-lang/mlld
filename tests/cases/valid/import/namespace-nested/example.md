# Import Namespace with Nested Access Test

Test namespace imports with nested object access from JSON files.

/import { * as settings } from [app-settings.json]

/var @result = [[Settings: {{settings.database.host}}:{{settings.database.port}} with auth={{settings.features.auth}}]]
/show @result