// --- Basic Tokens ---

Identifier
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_]* {
    return first + rest.join('');
  }

SpecialPathChar "Special Path Character"
  = "." / "~"

BacktickSequence "Backtick Sequence"
  = backticks:"`"+ &{
    return backticks.length >= 3 && backticks.length <= 5;
  } { 
    return backticks;
  }

// --- Path Component Tokens ---

PathSeparatorToken "Path Separator"
  = "/" { return helpers.createNode(NodeType.PathSeparator, { value: "/" }, location()); }

DotSeparatorToken "Dot Separator"
  = "." { return helpers.createNode(NodeType.DotSeparator, { value: "." }, location()); }

SectionMarkerToken "Section Marker"
  = [ \t]* "#" { return helpers.createNode(NodeType.SectionMarker, { value: "#" }, location()); }
