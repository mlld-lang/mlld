// SIGN AND VERIFY DIRECTIVES
// Implements /sign and /verify parsing for signature management

SignKeyword
  = "/"? "sign"

VerifyKeyword
  = "/"? "verify"

SignTailPart
  = "by" __ name:StringLiteral {
      return { signedBy: name };
    }
  / "with" __ method:BaseIdentifier {
      return { method };
    }

SignTail
  = parts:(_ part:SignTailPart { return part; })+ {
      const result = {};
      for (const part of parts) {
        if (part.signedBy !== undefined) {
          result.signedBy = part.signedBy;
        }
        if (part.method !== undefined) {
          result.method = part.method;
        }
      }
      return result;
    }

SlashSign
  = DirectiveContext SignKeyword _ "@" id:BaseIdentifier tail:SignTail? ending:StandardDirectiveEnding? {
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      const values = { identifier: [idNode] };
      const raw = {};
      const meta = {};

      if (tail && tail.method) {
        const methodNode = helpers.createNode(NodeType.Text, { content: tail.method, location: location() });
        values.method = [methodNode];
        raw.method = tail.method;
      }
      if (tail && tail.signedBy) {
        const signerNode = helpers.createNode(NodeType.Text, { content: tail.signedBy, location: location() });
        values.signedBy = [signerNode];
        raw.signedBy = tail.signedBy;
      }
      if (ending && ending.comment) {
        meta.comment = ending.comment;
      }

      return helpers.createStructuredDirective(
        DirectiveKind.sign,
        'sign',
        values,
        raw,
        meta,
        location(),
        'sign'
      );
    }

SlashVerify
  = DirectiveContext VerifyKeyword _ "@" id:BaseIdentifier ending:StandardDirectiveEnding? {
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      const values = { identifier: [idNode] };
      const meta = {};

      if (ending && ending.comment) {
        meta.comment = ending.comment;
      }

      return helpers.createStructuredDirective(
        DirectiveKind.verify,
        'verify',
        values,
        {},
        meta,
        location(),
        'verify'
      );
    }
