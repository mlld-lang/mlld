# Instead of: /run {wc -l < "@bigfile"}
/exe @count(data) = sh { echo "$data" | wc -l }
/show @count(@bigfile)