# Variable Transformation Visualization

## Input

```

# User Profile

## Basic Info
User: {{user}}
Name: {{user.name}}
Age: {{user.age}}

## Complex Info
User Skills: {{user.skills}}
First Skill: {{user.skills.0}}
Bio: {{user.bio}}

```

## Variables

- user: {"name":"Alice","age":30,"skills":["JavaScript","TypeScript","Node.js"],"bio":"Software developer\nWith experience\nIn web development"}

## Transformation Mode

Disabled

## Expected Output

```

# User Profile

## Basic Info
User: {"name":"Alice","age":30,"skills":["JavaScript","TypeScript","Node.js"],"bio":"Software developer\nWith experience\nIn web development"}
Name: Alice
Age: 30

## Complex Info
User Skills: ["JavaScript","TypeScript","Node.js"]
First Skill: JavaScript
Bio: Software developer
With experience
In web development

```
