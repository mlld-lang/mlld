/var @content = "hi"
/output @content to "@base/foo.txt"

/var @fileSugar = <@base/foo.txt>.keep
/show `dot keep: @fileSugar.ctx.relative`

/var @fileHelper = @keep(<@base/foo.txt>)
/show `helper keep: @fileHelper.ctx.relative`
