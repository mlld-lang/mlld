# Variable Transformation Visualization

## Input

```

# Combined Example

## Object: {{user}}

## Properties:
- Name: {{user.name}}
- Bio: {{user.bio}}
- Skills: {{user.skills}}
- First Skill: {{user.skills.0}}

```

## Variables

- user: {"name":"Alice","bio":"Software developer\nWith multiple lines\nOf biography","skills":["JavaScript","TypeScript","Node.js"]}

## Transformation Mode

Disabled

## Expected Output

```

# Combined Example

## Object: {"name":"Alice","bio":"Software developer\nWith multiple lines\nOf biography","skills":["JavaScript","TypeScript","Node.js"]}

## Properties:
- Name: Alice
- Bio: Software developer
With multiple lines
Of biography
- Skills: ["JavaScript","TypeScript","Node.js"]
- First Skill: JavaScript

```
