# Security Options on All Directives Test

This tests security options on various directives.

## @add with security
@text greeting = "Hello, secure world!"
@add (5m) trust always @greeting
@add (live) trust verify "./dynamic-content.md"
@add (static) "https://example.com/content.md"#overview

## @path with security
@path (1h) trust always configPath = "./config"
@path (30m) projectPath = @PROJECTPATH/src

## @text with security (on RHS)
@text (24h) cachedTemplate = @add (1h) "./template.md"
@text dynamicMsg = @run (live) trust verify [echo "Dynamic message"]

## @exec with trust
@exec trust always safeCmd() = [(echo "Safe command")]
@exec trust verify checkCmd(file) = [(cat @file)]
@exec trust never dangerousCmd() = [(rm -rf /)]

## URL imports with security
@import (7d) trust verify { content } from "https://api.example.com/data.mld"

## Combined examples
@add (30s) trust always @configPath/settings.json
@run trust verify @checkCmd("test.txt")