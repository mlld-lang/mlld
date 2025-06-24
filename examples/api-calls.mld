# API Call Abstraction Example

This example shows how to create reusable HTTP request commands using @exec and complex data.

## Define the API call commands

/exe @get(url) = {curl -s -X GET @url}
/exe @post(url, data) = {curl -s -X POST @url -H "Content-Type: application/json" -d '@data'}
/exe @put(url, data) = {curl -s -X PUT @url -H "Content-Type: application/json" -d '@data'}
/exe @delete(url) = {curl -s -X DELETE @url}

## Create a call object with all methods

/var @call = {
get: @get,
post: @post,
put: @put,
delete: @delete
}

## Use the API commands

### GET request
/run @call.get("https://api.example.com/users")

### POST request with data
/var @newUser = {"name": "John Doe", "email": "john@example.com"}
/run @call.post("https://api.example.com/users", @newUser)

### Or with inline data
/run @call.post("https://api.example.com/users", '{"name": "Jane Smith", "email": "jane@example.com"}')

## Even better: Create a full API client

/var @api = {
baseUrl: "https://api.example.com",
  
# Methods attached to the object
users: {
list: @get(@api.baseUrl + "/users"),
create: @post(@api.baseUrl + "/users"),
get: @exec(id) = run {curl -s @api.baseUrl/users/@id},
update: @exec(id, data) = run {curl -s -X PUT @api.baseUrl/users/@id -d '@data'},
delete: @exec(id) = run {curl -s -X DELETE @api.baseUrl/users/@id}
  }
}

## This could be in a module: @mlld/api

/var @module = [[
/exe @get(url, headers) = {curl -s -X GET @url {{headers ? "-H '" + headers + "'" : ""}}}
/exe @post(url, data, headers) = {curl -s -X POST @url -H "Content-Type: application/json" {{headers ? "-H '" + headers + "'" : ""}} -d '@data'}

/var @call = {
get: @get,
post: @post
}
]]