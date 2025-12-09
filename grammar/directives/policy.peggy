// POLICY DIRECTIVE
// /policy @name = union(@a, @b)

PolicyKeyword
  = "/"? "policy"

SlashPolicy
  = DirectiveContext PolicyKeyword _ name:PolicyIdentifier _ "=" _ expr:PolicyExpression {
      const nameNode = helpers.createNode(NodeType.Text, { content: name, location: location() });
      const values = {
        name: [nameNode],
        expr
      };

      return helpers.createStructuredDirective(
        DirectiveKind.policy,
        'policy',
        values,
        { name, expr },
        {},
        location(),
        'policy'
      );
    }

PolicyExpression
  = UnionCall

UnionCall
  = "union" _ "(" _ args:UnionArgs? _ ")" {
      return {
        type: 'union',
        args: args || [],
        location: location()
      };
    }

UnionArgs
  = first:UnionArg rest:(CommaSpace arg:UnionArg { return arg; })* {
      return [first, ...rest];
    }

UnionArg
  = ref:PolicyIdentifier {
      return {
        type: 'ref',
        name: ref,
        location: location()
      };
    }

PolicyIdentifier
  = "@" name:BaseIdentifier {
      return name;
    }
