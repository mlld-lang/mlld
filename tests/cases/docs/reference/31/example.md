/var @result = run {cat data.json} | @json | @csv
/var @processed = @data | @validate | @transform