# Test: Directory metadata properties

/var @file = <mx-dir-test-file.txt>

## dirname (immediate parent)
/show `dirname: @file.mx.dirname`

## relativeDir (relative path to dir)
/show `relativeDir: @file.mx.relativeDir`

## absoluteDir (absolute path to dir)
/show `absoluteDir: @file.mx.absoluteDir`

## filename should still work
/show `filename: @file.mx.filename`
