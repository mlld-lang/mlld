# Working Demo

/text @greeting = "Hello from Meld!"
/data @config = {
  "name": "Meld Demo",
  "version": "1.0.0",
  "features": ["templates", "imports", "data structures"]
}

## Basic Text
/add @greeting

## Data Access
Project: @add @config.name
Version: @add @config.version

## Command Example
/text @date = run {date +%Y-%m-%d}
Today's date: @add @date

## Template Example
/text @summary = [[
=== {{config.name}} ===
Version: {{config.version}}
Features: {{config.features.0}}, {{config.features.1}}, {{config.features.2}}
Date: {{date}}
]]

/add @summary