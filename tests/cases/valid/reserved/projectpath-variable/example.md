# @base Reserved Variable Test

This tests the @base reserved variable.

Project root: 
/show @base

/path @configPath = "@base/config"
/show :::Config location: {{configPath}}:::

/var @readme = :::Project README is at {{base}}/README.md:::
/show @readme