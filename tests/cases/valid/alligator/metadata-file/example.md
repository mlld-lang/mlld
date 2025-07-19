# Alligator File Metadata Test

This test verifies that files loaded with alligator syntax include rich metadata.

## Load a single file

/var @readme = <README.md>

## Access file metadata

/show `Filename: @readme.filename`
/show `Relative path: @readme.relative`
/show `Absolute path: @readme.absolute`

## Default content behavior

/show @readme