// Simplified FOR LOOP DIRECTIVE for testing
SlashForSimple "for directive simple"
  = DirectiveContext "/for" _ "@item" _ "in" _ "[" _ "]" {
      return {
        type: 'test',
        message: 'Simple for matched!'
      };
    }