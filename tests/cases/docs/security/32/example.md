/exe @sanitize(text) = js {
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

/guard @sanitizeUntrusted before untrusted = when [
  * => allow @sanitize(@input)
]

/var untrusted @userInput = "<script>alert('xss')</script>Hello"
/show @userInput                           # Output: Hello (sanitized)