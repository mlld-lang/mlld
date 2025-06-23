/var @sections = ["tldr", "details", "examples"]
/exe @extractSection(name) = [[content from {{name}} section]]
/show foreach @extractSection(@sections)