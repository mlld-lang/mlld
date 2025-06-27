# Working Demo

/var @greeting = "Hello from Meld!"
/var @config = {
  "name": "Meld Demo",
  "version": "1.0.0",
  "features": ["templates", "imports", "data structures"]
}

## Basic Text
/show @greeting

## Data Access
Project: @add @config.name
Version: @add @config.version

## Command Example
/var @date = run {date +%Y-%m-%d}
Today's date: @add @date

## Template Example
/var @summary = ::
=== {{config.name}} ===
Version: {{config.version}}
Features: {{config.features.0}}, {{config.features.1}}, {{config.features.2}}
Date: {{date}}
::

/show @summary