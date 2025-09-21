# Security Options on All Directives Test

This tests security options on various directives.

## @add with security
/var @greeting = "Hello, secure world!"
/show (5m) trust always @greeting
/show (live) trust verify "./dynamic-content.md"
/show (static) "https://example.com/content.md"#overview

## @path with security
/path (1h) trust always configPath = "./config"
/path (30m) projectPath = @base/src

## @text with security (on RHS)
/var (24h) cachedTemplate = @add (1h) "./template.md"
/var @dynamicMsg = run (live) trust verify {echo "Dynamic message"}

## @exec with trust
/exe trust always @safeCmd() = {echo "Safe command"}
/exe trust verify @checkCmd(file) = {cat @file}
/exe trust never @dangerousCmd() = {rm -rf /}

## URL imports with security
/import (7d) trust verify { content } from "https://api.example.com/data.mld"

## Combined examples
/show (30s) trust always @configPath/settings.json
/run trust verify @checkCmd("test.txt")