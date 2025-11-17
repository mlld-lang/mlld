/var @config = <config.json>             >> Load and parse JSON
/show @config.database.host              >> Access nested fields
/var @files = <docs/*.md>                >> Load multiple files
/show @files[0].ctx.filename              >> Access file metadata via .ctx