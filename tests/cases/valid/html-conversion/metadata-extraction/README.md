# HTML Metadata Extraction Test

This test is currently configured to test URL metadata extraction, which requires network access and doesn't work in the test environment.

To properly test local HTML file metadata extraction, the test would need to be modified to:
1. Use a local HTML file (like the other HTML conversion tests)
2. Only test properties available for local files: title, description, html, text

The current test expects URL-specific properties (url, domain, status, contentType) which are not available for local files.

TODO: Create a separate test for local HTML metadata extraction or modify this test to work with local files.