// FILE / FILES DIRECTIVES
// File projection directives for workspace and filesystem writes.

FileKeyword
  = "/"? "file" ![a-zA-Z0-9_]

FilesKeyword
  = "/"? "files" ![a-zA-Z0-9_]

FileProjectionPathTarget "file/files path target"
  = path:OutputFilePath {
      return {
        type: 'path',
        path: path.parts || path.values,
        raw: path.raw,
        meta: path.meta || {}
      };
    }

FileProjectionResolverPath "file/files resolver path"
  = "/" chars:[^>]* {
      return chars.join('');
    }

FileProjectionResolverTarget "file/files resolver target"
  = "<" _ "@" resolver:BaseIdentifier path:FileProjectionResolverPath? _ ">" {
      return {
        type: 'resolver',
        resolver,
        path: path || '',
        raw: text()
      };
    }

FileProjectionTarget "file/files target"
  = FileProjectionResolverTarget
  / FileProjectionPathTarget

SlashFile "file directive"
  = DirectiveContext FileKeyword _ target:FileProjectionTarget _ "=" _ content:Expression ending:StandardDirectiveEnding {
      const values = {
        target,
        content: [content]
      };
      const raw = {
        target: target.raw,
        content: helpers.reconstructRawString([content])
      };
      const meta = {
        targetType: target.type,
        hasResolverTarget: target.type === 'resolver'
      };

      helpers.processPipelineEnding(values, raw, meta, ending);

      return helpers.createStructuredDirective(
        'file',
        'file',
        values,
        raw,
        meta,
        location(),
        'file'
      );
    }
  / DirectiveContext FileKeyword _ FileProjectionTarget _ !("=") {
      helpers.mlldError(
        'Missing "=" in file directive. Expected: file "path" = @content',
        '=',
        location()
      );
    }
  / DirectiveContext FileKeyword {
      helpers.mlldError(
        'Invalid file directive. Expected: file "path" = @content',
        '"path"',
        location()
      );
    }

SlashFiles "files directive"
  = DirectiveContext FilesKeyword _ target:FileProjectionTarget _ "=" _ entries:Expression ending:StandardDirectiveEnding {
      const values = {
        target,
        entries: [entries]
      };
      const raw = {
        target: target.raw,
        entries: helpers.reconstructRawString([entries])
      };
      const meta = {
        targetType: target.type,
        hasResolverTarget: target.type === 'resolver'
      };

      helpers.processPipelineEnding(values, raw, meta, ending);

      return helpers.createStructuredDirective(
        'files',
        'files',
        values,
        raw,
        meta,
        location(),
        'files'
      );
    }
  / DirectiveContext FilesKeyword _ FileProjectionTarget _ !("=") {
      helpers.mlldError(
        'Missing "=" in files directive. Expected: files "dir/" = [ { "file.txt": @content } ]',
        '=',
        location()
      );
    }
  / DirectiveContext FilesKeyword {
      helpers.mlldError(
        'Invalid files directive. Expected: files "dir/" = [ { "file.txt": @content } ]',
        '"dir/"',
        location()
      );
    }
