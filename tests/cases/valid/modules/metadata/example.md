# Test Module Metadata Access

This tests accessing module frontmatter via __meta__.

/import { * as utils } from "./test-module.mld"
/add [[Module author: {{utils.__meta__.author}}]]
/add [[Module version: {{utils.__meta__.version}}]]
/add [[Module description: {{utils.__meta__.description}}]]
/add [[Custom field: {{utils.__meta__.customField}}]]