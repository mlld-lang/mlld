// AUTH DIRECTIVE
// auth @name = "ENV_VAR"
// auth @name = { from: "...", as: "ENV_VAR" }

AuthKeyword
  = "/"? "auth"

SlashAuth
  = DirectiveContext AuthKeyword _ name:AuthIdentifier _ "=" _ expr:AuthExpression {
      const nameNode = helpers.createNode(NodeType.Text, { content: name, location: location() });
      const values = {
        name: [nameNode],
        expr
      };

      return helpers.createStructuredDirective(
        DirectiveKind.auth,
        'auth',
        values,
        { name, expr },
        {},
        location(),
        'auth'
      );
    }

AuthExpression
  = str:DataString { return str; }
  / obj:DataObjectLiteral { return obj; }

AuthIdentifier
  = "@" name:BaseIdentifier {
      return name;
    }
