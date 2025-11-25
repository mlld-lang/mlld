// EXPORT DIRECTIVE
// Parses `/export { ... }` declarations for module manifests

SlashExport
  = DirectiveContext "/export" _ "{" _ members:ExportMemberList _ "}" comment:InlineComment? {
const exports = members.map((member) => {
        const nodeLocation = member.identifier.location || location();
        const valueType = member.identifier.isGuard ? 'guardExport' : 'export';
        return helpers.createVariableReferenceNode(
          valueType,
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
  / DirectiveContext "/export" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing export list in /export directive. Expected: /export { name, other }", String.fromCharCode(123), location());
    }
  / DirectiveContext "/export" {
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
  = prefix:"@"? name:BaseIdentifier {
      const raw = prefix ? `@${name}` : name;
      return { name, raw, isGuard: Boolean(prefix), location: location() };
    }
