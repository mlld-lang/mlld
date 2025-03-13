# Variable Transformation Visualization

## Input

```

# User Profile

Name: {{users.0.name}}
Age: {{users.0.age}}
First Hobby: {{users.0.hobbies.0}}
Second Hobby: {{users.0.hobbies.1}}

## Friends

First Friend: {{users.0.friends.0.name}} ({{users.0.friends.0.age}})
Second Friend: {{users.0.friends.1.name}} ({{users.0.friends.1.age}})

```

## Variables

- users: [{"name":"Alice","age":30,"hobbies":["reading","hiking"],"friends":[{"name":"Bob","age":32},{"name":"Charlie","age":28}]}]

## Transformation Mode

Disabled

## Expected Output

```

# User Profile

Name: Alice
Age: 30
First Hobby: reading
Second Hobby: hiking

## Friends

First Friend: Bob (32)
Second Friend: Charlie (28)

```
