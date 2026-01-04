// WORKING DIRECTORY PATH PATTERN
// Parses :path suffixes for cmd/sh/bash/js/python executors

WorkingDirPath "working directory path"
  = ":" _? parts:UnquotedPath {
      const rawPath = helpers.reconstructRawString(parts);
      return {
        parts,
        raw: rawPath,
        meta: helpers.createPathMetadata(rawPath, parts)
      };
    }
