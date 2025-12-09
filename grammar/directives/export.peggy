// EXPORT DIRECTIVE
// Parses `/export { ... }` declarations for module manifests

ExportKeyword
  = "/"? "export"

SlashExport
  = DirectiveContext ExportKeyword _ "{" _ members:ExportMemberList _ "}" comment:InlineComment? {
const exports = members.map((member) => {
        const nodeLocation = member.identifier.location || location();
        return helpers.createVariableReferenceNode(
          'identifier',
          {
            identifier: member.identifier.name,
            ...(member.alias ? { alias: member.alias } : {})
          },
          nodeLocation
        );
      });

      const rawExports = members
        .map((member) => member.alias ? `${member.identifier.raw} as ${member.alias}` : member.identifier.raw)
        .join(', ');

      const meta = {
        exportCount: exports.length,
        isWildcard: false,
        ...(comment ? { comment } : {})
      };

      return helpers.createStructuredDirective(
        'export',
        'exportSelected',
        { exports },
        { exports: rawExports },
        meta,
        location()
      );
    }
  / DirectiveContext ExportKeyword _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing export list in /export directive. Expected: /export { name, other }", String.fromCharCode(123), location());
    }
  / DirectiveContext ExportKeyword {
      helpers.mlldError("Invalid /export syntax. Expected: /export { name, other }", String.fromCharCode(123), location());
    }

ExportMemberList
  = first:ExportMember rest:(CommaSpace member:ExportMember { return member; })* {
      return [first, ...rest];
    }
  / _ {
      return [];
    }

ExportMember
  = identifier:ExportIdentifier alias:(_ "as" _ aliasName:BaseIdentifier {
        return { name: aliasName, location: location() };
      })? {
      return {
        identifier,
        alias: alias ? alias.name : null
      };
    }

ExportIdentifier
  = "*" {
      return { name: '*', raw: '*', location: location() };
    }
  / prefix:"@"? name:BaseIdentifier {
      const raw = prefix ? `@${name}` : name;
      return { name, raw, location: location() };
    }
