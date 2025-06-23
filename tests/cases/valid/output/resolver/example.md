# @output Resolver Tests

This tests outputting variables to resolver paths.

/var @content = "Hello, World!"
/var @config = { "name": "Test", "version": "1.0.0" }

/output @content to github:gist/example
/output @config to npm:registry/@myorg/config as json
/output @content to custom:handler/path