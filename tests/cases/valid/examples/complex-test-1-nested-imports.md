# Complex Test 1: Nested Imports and Variable Scoping

@text project_name = "Meld Complex Test"

# Create a library file that imports another file
@text lib_content = [[
@import { imported_title } from "files/imports.mld"
@text lib_message = "Library says: {{imported_title}}"
@data lib_config = {
  "name": "lib",
  "version": "1.0.0",
  "imported": @imported_title
}
]]

>> Simulate creating the lib file (in real usage, this would be a separate file)
@exec write_lib(content) = @run [echo '@lib_content @content' > ./files/lib.mld]

@run @write_lib("Hi")

>> Now import from our "lib" that itself has imports
@import { lib_message, lib_config } from "./files/lib.mld"

>> Test if nested imports work and variable scoping is correct
@text final_output = [[
Project: {{project_name}}
Library Message: {{lib_message}}
Library Config: {{lib_config.name}} v{{lib_config.version}}
Imported Value in Config: {{lib_config.imported}}
]]

@add @final_output