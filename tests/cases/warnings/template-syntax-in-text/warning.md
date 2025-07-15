**Warning: Template syntax in regular text**

The line `This line uses template syntax: {{myvar}}` contains template syntax outside of a template directive.

Template syntax like `{{myvar}}` only works inside template content (within `::...::` brackets) in mlld directives.

**To fix this:**
```mlld
/var @greeting = :::This line uses template syntax: {{myvar}}:::
/show @greeting
```