/var @file = <package.json>

>> Basic metadata
/show @file.filename                     >> "package.json"
/show @file.relative                     >> "./package.json" 
/show @file.absolute                     >> Full path

>> Token counting
/show @file.tokest                       >> Estimated tokens (fast)
/show @file.tokens                       >> Exact tokens

>> Content access
/show @file.content                      >> File contents (explicit)
/show @file                              >> Same as above (implicit)