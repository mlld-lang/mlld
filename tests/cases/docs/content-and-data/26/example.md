/var @jsonStr = '{"name": "Alice", "active": true}'

/exe @length(str) = js {
  return str.length;
}

/run @length(@jsonStr)          >> Default: string
/run @length(@jsonStr.text)     >> Explicit string
/run @length(@jsonStr.content)  >> Alias for .text