/**
 * Variable Resolution Visualization Test
 *
 * This test creates visualizations of the variable resolution process,
 * including object property access and newline handling.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock the visualization function since we don't have the actual implementation yet
const mockVisualizeVariableTransformation = async (
  input: string,
  variables: Record<string, any>,
  filePath: string,
  enableTransformation: boolean = false
): Promise<void> => {
  // Create a simple visualization document
  const visualization = `# Variable Transformation Visualization

## Input

\`\`\`
${input}
\`\`\`

## Variables

${Object.entries(variables).map(([key, value]) => 
  `- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`
).join('\n')}

## Transformation Mode

${enableTransformation ? 'Enabled' : 'Disabled'}

## Expected Output

\`\`\`
${input.replace(/\{\{([^{}]+)\}\}/g, (match, variable) => {
  const parts = variable.split('.');
  const varName = parts[0];
  
  if (variables[varName]) {
    if (parts.length === 1) {
      return typeof variables[varName] === 'object' 
        ? JSON.stringify(variables[varName]) 
        : variables[varName];
    } else {
      let value = variables[varName];
      for (let i = 1; i < parts.length; i++) {
        if (value && typeof value === 'object') {
          value = value[parts[i]];
        } else {
          value = undefined;
          break;
        }
      }
      return value !== undefined 
        ? (typeof value === 'object' ? JSON.stringify(value) : value)
        : match;
    }
  }
  
  return match;
})}
\`\`\`
`;

  // Create directory if it doesn't exist
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write the visualization to file
  fs.writeFileSync(filePath, visualization, 'utf8');
};

describe('Variable Resolution Visualization', () => {
  // Create output directory
  const outputDir = path.resolve(process.cwd(), 'tests', 'debug-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  it('should visualize simple object property access', async () => {
    const input = 'Hello, {{user.name}}! Your ID is {{user.id}}.';
    const variables = {
      user: { name: 'Alice', id: 123 }
    };
    
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'simple-object-property.md')
    );
    
    // Verify the file was created
    expect(fs.existsSync(path.join(outputDir, 'simple-object-property.md'))).toBe(true);
  });
  
  it('should visualize nested object property access', async () => {
    const input = 'App: {{config.app.name}} v{{config.app.version}} - Environment: {{config.env}}';
    const variables = {
      config: {
        app: {
          name: 'Meld',
          version: '1.0.0',
          features: ['text', 'data', 'path']
        },
        env: 'test'
      }
    };
    
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'nested-object-property.md')
    );
    
    // Verify the file was created
    expect(fs.existsSync(path.join(outputDir, 'nested-object-property.md'))).toBe(true);
  });
  
  it('should visualize array access', async () => {
    const input = 'First fruit: {{fruits.0}}, Second: {{fruits.1}}, Count: {{fruits.length}}';
    const variables = {
      fruits: ['apple', 'banana', 'cherry']
    };
    
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'array-access.md')
    );
    
    // Verify the file was created
    expect(fs.existsSync(path.join(outputDir, 'array-access.md'))).toBe(true);
  });
  
  it('should visualize complex nested objects and arrays', async () => {
    const input = `
# User Profile

Name: {{users.0.name}}
Age: {{users.0.age}}
First Hobby: {{users.0.hobbies.0}}
Second Hobby: {{users.0.hobbies.1}}

## Friends

First Friend: {{users.0.friends.0.name}} ({{users.0.friends.0.age}})
Second Friend: {{users.0.friends.1.name}} ({{users.0.friends.1.age}})
`;
    
    const variables = {
      users: [
        {
          name: 'Alice',
          age: 30,
          hobbies: ['reading', 'hiking'],
          friends: [
            { name: 'Bob', age: 32 },
            { name: 'Charlie', age: 28 }
          ]
        }
      ]
    };
    
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'complex-nested-access.md')
    );
    
    // Verify the file was created
    expect(fs.existsSync(path.join(outputDir, 'complex-nested-access.md'))).toBe(true);
  });
  
  it('should visualize text with newlines', async () => {
    const input = `
# Document with Newlines

{{content}}

After the content.
`;
    
    const variables = {
      content: 'Line 1\nLine 2\nLine 3'
    };
    
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'newline-handling.md')
    );
    
    // Verify the file was created
    expect(fs.existsSync(path.join(outputDir, 'newline-handling.md'))).toBe(true);
  });
  
  it('should visualize combined newlines and object properties', async () => {
    const input = `
# Combined Example

## Object: {{user}}

## Properties:
- Name: {{user.name}}
- Bio: {{user.bio}}
- Skills: {{user.skills}}
- First Skill: {{user.skills.0}}
`;
    
    const variables = {
      user: {
        name: 'Alice',
        bio: 'Software developer\nWith multiple lines\nOf biography',
        skills: ['JavaScript', 'TypeScript', 'Node.js']
      }
    };
    
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'combined-properties-newlines.md')
    );
    
    // Verify the file was created
    expect(fs.existsSync(path.join(outputDir, 'combined-properties-newlines.md'))).toBe(true);
  });
  
  it('should visualize transformation mode differences', async () => {
    const input = `
# User Profile

## Basic Info
User: {{user}}
Name: {{user.name}}
Age: {{user.age}}

## Complex Info
User Skills: {{user.skills}}
First Skill: {{user.skills.0}}
Bio: {{user.bio}}
`;
    
    const variables = {
      user: {
        name: 'Alice',
        age: 30,
        skills: ['JavaScript', 'TypeScript', 'Node.js'],
        bio: 'Software developer\nWith experience\nIn web development'
      }
    };
    
    // Standard mode
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'standard-mode.md'),
      false
    );
    
    // Transformation mode
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'transformation-mode.md'),
      true
    );
    
    // Verify both files were created
    expect(fs.existsSync(path.join(outputDir, 'standard-mode.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'transformation-mode.md'))).toBe(true);
  });
  
  it('should visualize the formatting issue with "The greeting is" pattern', async () => {
    const input = `
# Greeting Example

The greeting is: {{greeting}}

Explanation: {{explanation}}
`;
    
    const variables = {
      greeting: 'Hello, World!',
      explanation: 'This demonstrates how variable formatting affects surrounding text.'
    };
    
    // Standard mode
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'greeting-standard.md'),
      false
    );
    
    // Transformation mode
    await mockVisualizeVariableTransformation(
      input,
      variables,
      path.join(outputDir, 'greeting-transformation.md'),
      true
    );
    
    // Verify both files were created
    expect(fs.existsSync(path.join(outputDir, 'greeting-standard.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'greeting-transformation.md'))).toBe(true);
  });
});