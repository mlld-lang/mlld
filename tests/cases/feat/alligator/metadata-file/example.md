# Alligator File Metadata Test

This test verifies that files loaded with alligator syntax include rich metadata.

## Load a single file

/var @readme = <metadata-test-README.md>

## Access file metadata

/show `Filename: @readme.mx.filename`
/show `Relative path: @readme.mx.relative`
/show `Absolute path: @readme.mx.absolute`

## Default content behavior

/show @readme
