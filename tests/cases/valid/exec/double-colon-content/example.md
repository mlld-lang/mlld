# Double Colon Template Test

This test verifies that double colon syntax works correctly with:
- Colons in content (URLs, times, ratios)
- Backticks (both single and triple)
- @var interpolation

## Setup variables
/var @name = "Alice"
/var @lang = "JavaScript"
/var @port = "8080"

## Basic content with colons
/exe @url(@protocol, @domain) = ::@protocol://@domain:@port::
/exe @time(@hour, @minute) = ::Meeting at @hour:@minute PM::
/exe @ratio(@width, @height) = ::The aspect ratio is @width:@height::

## Content with backticks
/exe @simpleCode(@cmd) = ::Run `@cmd` to start::
/exe @codeBlock(@language, @code) = ::Here's the @language code:
```@language
@code
```
Done!::

## Mixed content
/exe @mixed(@link, @cmd) = ::Visit @link and run `@cmd` to test::

## Test outputs

/show "=== URLs ==="
/show @url("https", "example.com")
/show @url("http", "localhost")

/show "\n=== Times ==="
/show @time("3", "30")
/show @time("12", "00")

/show "\n=== Ratios ==="
/show @ratio("16", "9")
/show @ratio("4", "3")

/show "\n=== Code Commands ==="
/show @simpleCode("npm install")
/show @simpleCode("pip install -r requirements.txt")

/show "\n=== Code Blocks ==="
/show @codeBlock(@lang, "console.log('Hello @name!');")
/show ""
/show @codeBlock("python", "print('Hello @name!')")

/show "\n=== Mixed Content ==="
/show @mixed("https://example.com:3000", "node server.js")