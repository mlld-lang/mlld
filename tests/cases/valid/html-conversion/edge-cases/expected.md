# HTML Edge Cases Test

This test verifies that the HTML to Markdown converter handles edge cases gracefully, including malformed HTML, special characters, and unusual formatting.

## Load malformed HTML with edge cases

# Edge Cases & Special Characters

## Testing Edge Cases

This paragraph has an unclosed tag

Another paragraph starts without closing the previous

## Special Characters & Entities

Testing & ampersand, <less than>, "quotes", and 'apostrophes'.

Unicode: café, naïve, 你好, 🚀 emoji support

This has **bold with *nested*** *italic* text.

Content with data attributes

Custom element content

This is a very long line that contains lots of text without any line breaks and it just keeps going and going and going to test how the converter handles extremely long lines of content that might cause issues with some parsers or converters that have line length limitations.

Visible content more visible content

She said, "He told me, 'This is a *test* of nested quotes.'"

Text with non-breaking spaces and multiple spaces.