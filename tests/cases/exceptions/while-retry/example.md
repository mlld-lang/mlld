# Retry is not allowed inside while processor

/exe @bad(state) = retry

/var @result = 1 | while(3) @bad
