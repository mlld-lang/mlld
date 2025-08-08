# Alligator Glob Pattern Test

This test verifies glob pattern support in alligator syntax.

## Load markdown files

/var @mdFiles = <*.md>

## Show array of contents

/show @mdFiles

## Access metadata from first file

/when @mdFiles => /show `First file: @mdFiles[0].filename`
/when @mdFiles => /show `First file path: @mdFiles[0].relative`