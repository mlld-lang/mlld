# Test Module Metadata Access

This tests accessing module frontmatter via __meta__.

/import { * as utils } from "./metadata-test-module.mld"
/show :::Module author: {{utils.__meta__.author}}:::
/show :::Module version: {{utils.__meta__.version}}:::
/show :::Module description: {{utils.__meta__.description}}:::
/show :::Custom field: {{utils.__meta__.customField}}:::