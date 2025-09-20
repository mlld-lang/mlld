# Inline /for in backtick template

/var @tpl = `
/for @v in ["x","y"]
- @v
/end
`
/show @tpl

