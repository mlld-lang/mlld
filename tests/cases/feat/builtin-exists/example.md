/var @text = "hello"
/var @obj = { "field": { "nested": "value" } }
/var @arr = [1, 2, 3]

/show @exists("existing.md")
/show @exists("missing.md")
/show @exists("@base/tmp/file.md")
/show @exists(<existing.md>)
/show @exists(<missing.md>)
/show @exists(<dir/*.md>)
/show @exists(<dir/*.nope>)
/show @exists(@obj.field.nested)
/show @exists(@obj.missing)
/show @exists(@arr[2])
/show @exists(@arr[99])
/show @exists(@text)
/show @exists(@missingVar)
