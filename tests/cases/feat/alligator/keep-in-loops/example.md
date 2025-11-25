# Keep in Loops

/var @files = <loop-*.txt>

/for @file in @files => show `Plain: @file`
/for @file in @files.keep => show `Kept: @file`
