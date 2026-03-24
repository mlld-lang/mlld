# AST Selector - Code Text

Verify brace-syntax selector returns code content as text, not metadata JSON.

## Single class from Python shows code

class Greeter:
    def greet(self, name):
        return f"Hello, {name}"

## Multiple selections show joined code

export function createUser(name: string) {
  return { name };
}

export function deleteUser(id: number) {
  return id;
}
## Metadata fields still accessible

Greeter
class
