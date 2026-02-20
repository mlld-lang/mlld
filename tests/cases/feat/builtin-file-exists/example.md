/var @path = "file-exists-target.md"
/var @missing = "file-exists-no-such-file.md"
/var @obj = { "path": "file-exists-target.md", "missing": "nope.md" }

/show @fileExists("file-exists-target.md")
/show @fileExists("file-exists-no-such-file.md")
/show @fileExists(@path)
/show @fileExists(@missing)
/show @fileExists(<file-exists-target.md>)
/show @fileExists(<file-exists-no-such-file.md>)
/show @fileExists(@obj.path)
/show @fileExists(@obj.missing)
/show @fileExists(<file-exists-subdir/*.md>)
/show @fileExists(<file-exists-subdir/*.nope>)
/show @FILEEXISTS("file-exists-target.md")
