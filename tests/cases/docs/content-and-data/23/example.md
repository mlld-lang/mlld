/var @file = <package.json>

>> Basic metadata
/show @file.ctx.filename                 >> "package.json"
/show @file.ctx.relative                 >> "./package.json" 
/show @file.ctx.absolute                 >> Full path

>> Token counting
/show @file.ctx.tokest                   >> Estimated tokens (fast)
/show @file.ctx.tokens                   >> Exact tokens

>> Content access
/show @file.content                      >> File contents (explicit)
/show @file                              >> Same as above (implicit)