# Test Output Directive - Variable Output

/text @message = "This is the content to output"
/data @config = { "name": "test-app", "version": "2.0.0", "features": ["auth", "api", "ui"] }

/output @message [message.txt]
/output @config [config.json]

Document continues after output directives.