/var @summary = <docs/*.md> | @extractTitles | @claude("summarize these")
/var @clean = @raw | @validate | @normalize | @format