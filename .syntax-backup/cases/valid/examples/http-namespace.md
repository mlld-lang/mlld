# HTTP utility functions with namespace-style access
# Demonstrates complex data objects with exec command references
# Commands are stored as lazy references and only executed when called

@exec get(url) = [(curl -s "@url")]
@exec post(url, data) = [(curl -s -X POST -H "Content-Type: application/json" -d '@data' "@url")]
@exec auth_get(url, token) = [(curl -s -H "Authorization: Bearer @token" "@url")]
@exec auth_post(url, token, data) = [(curl -s -X POST -H "Authorization: Bearer @token" -H "Content-Type: application/json" -d '@data' "@url")]

# Create HTTP namespace with lazy command references
# Critical: @get, @post, etc. are stored as references, not executed immediately
@data http = {
  get: @get,
  post: @post,
  auth: {
    get: @auth_get,
    post: @auth_post
  }
}

@path url = "https://httpbin.org/get"
@text token = "test-token-123"
@data payload = { "message": "hello world" }

# Test namespace-style function calls
# These commands are executed only when @run is called, not when stored in @data
@run @http.get(@url)
@run @http.auth.post(@url, @token, @payload)