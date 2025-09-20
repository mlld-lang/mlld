# Test template interpolation preservation in imports

/import { exports } from "template-module-helpers.mld"

# Test executable template with module variable access
/show @exports.greetTemplate()

# Test simple template variable
/show @exports.simpleGreeting

# Verify module variables are accessible
/show `Name: @exports.name`
/show `Version: @exports.version`