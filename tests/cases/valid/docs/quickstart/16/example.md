/var @docs = <docs/*.md>
/show `Found @docs.length() documentation files`

# Transform each file with templates
/var @toc = <docs/*.md> as "- [@filename](@relative)"
/show @toc