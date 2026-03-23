/var @serverSpec = `node @base/tests/cases/feat/dynamic-mcp-tool-collection/dynamic-mcp-tool-collection-fake-server.cjs`
/var tools trusted @dynamicTools = mcp @serverSpec
/var @hasTrustedLabel = @dynamicTools.mx.labels.includes("trusted")
/var @hasEchoDescription = @dynamicTools.echo.description == "Echo input"
/var @hasInternalAlias = @dynamicTools.createEvent.mlld.includes("__mcp_dynamicTools_createEvent")

/show @hasTrustedLabel
/show @hasEchoDescription
/show @hasInternalAlias
