# Import Alias Test

Test import aliases to resolve naming conflicts.

/import { author as primaryAuthor, title } from [config.mld]
/import { author as secondaryAuthor } from [utils.mld]

/var @result = [[Primary: {{primaryAuthor}}, Secondary: {{secondaryAuthor}}, Title: {{title}}]]
/show @result