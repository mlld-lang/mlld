# Double Colon Template Test

This test verifies that double colon syntax works correctly with:
- Colons in content (URLs, times, ratios)
- Backticks (both single and triple)
- @var interpolation

## Setup variables

## Basic content with colons

## Content with backticks

## Mixed content

## Test outputs

=== URLs ===
https://example.com:8080
http://localhost:8080

=== Times ===
Meeting at 3:30 PM
Meeting at 12:00 PM

=== Ratios ===
The aspect ratio is 16:9
The aspect ratio is 4:3

=== Code Commands ===
Run `npm install` to start
Run `pip install -r requirements.txt` to start

=== Code Blocks ===
Here's the JavaScript code:
```JavaScript
console.log("Hello Alice!");
```
Done!

Here's the python code:
```python
print("Hello Alice!")
```
Done!

=== Mixed Content ===
Visit https://example.com:3000 and run `node server.js` to test
