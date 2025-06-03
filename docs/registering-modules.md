# Registering Mlld Modules

This guide explains how to register your mlld modules in the public registry so others can easily import and use them.

## Quick Start

1. **Create a Gist** with your mlld module
2. **Fork** the [mlld-lang/registry](https://github.com/mlld-lang/registry) repository  
3. **Add your module** to your registry file
4. **Submit a PR**

## Step-by-Step Guide

### 1. Create Your Module

First, create your mlld module and save it as a GitHub Gist:

```bash
# Using GitHub CLI
gh gist create my-awesome-module.mld --public

# Or create manually at gist.github.com
```

Your module might look like:

```meld
@text description = "Utilities for JSON processing"

@exec format_json(data) = @run [(jq . <<< "@data")]
@exec minify_json(data) = @run [(jq -c . <<< "@data")]

@text example_usage = [[
# Format JSON
@run @format_json('{"name":"test","value":123}')

# Minify JSON  
@run @minify_json('{
  "name": "test",
  "value": 123
}')
]]
```

### 2. Fork the Registry

1. Go to [github.com/mlld-lang/registry](https://github.com/mlld-lang/registry)
2. Click "Fork" to create your own copy
3. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/registry.git
   cd registry
   ```

### 3. Create Your Registry Directory

If this is your first module, create a directory with your GitHub username:

```bash
mkdir YOUR_USERNAME
```

### 4. Add Your Module

Create or update `YOUR_USERNAME/registry.json`:

```json
{
  "version": "1.0.0",
  "updated": "2024-05-28T00:00:00Z",
  "author": "YOUR_USERNAME",
  "modules": {
    "json-utils": {
      "gist": "YOUR_GIST_ID",
      "description": "Utilities for JSON processing",
      "tags": ["json", "utils", "formatting"],
      "created": "2024-05-28T00:00:00Z"
    }
  }
}
```

To find your gist ID:
- From the gist URL: `https://gist.github.com/YOUR_USERNAME/a1f3e09a42db6c680b454f6f93efa9d8`
- The ID is: `a1f3e09a42db6c680b454f6f93efa9d8`

### 5. Submit Your Pull Request

```bash
git add YOUR_USERNAME/registry.json
git commit -m "Add json-utils module"
git push origin main
```

Then create a PR from your fork to the main registry repository.

## Module Naming Guidelines

- **Keep it simple**: `json-utils`, not `my-awesome-json-utility-library`
- **Use lowercase**: `code-review`, not `CodeReview`  
- **Use hyphens**: `test-runner`, not `test_runner` or `testrunner`
- **Be descriptive**: `markdown-parser` is better than `parser`
- **Avoid prefixes**: Just `logger`, not `mlld-logger`

## Usage

Once your PR is merged, anyone can use your module:

```meld
@import { format_json, minify_json } from "mlld://YOUR_USERNAME/json-utils"

@text data = '{"hello": "world", "test": true}'
@run @format_json(@data)
```

## Adding Multiple Modules

You can register multiple modules in your registry:

```json
{
  "version": "1.0.0",
  "updated": "2024-05-28T00:00:00Z",
  "author": "YOUR_USERNAME",
  "modules": {
    "json-utils": {
      "gist": "a1f3e09a42db6c680b454f6f93efa9d8",
      "description": "JSON processing utilities",
      "tags": ["json", "utils"],
      "created": "2024-05-28T00:00:00Z"
    },
    "test-runner": {
      "gist": "b2f4e09a42db6c680b454f6f93efa9d8",
      "description": "Simple test runner for mlld",
      "tags": ["testing", "cli"],
      "created": "2024-05-29T00:00:00Z"
    },
    "markdown-tools": {
      "gist": "c3f5e09a42db6c680b454f6f93efa9d8",
      "description": "Markdown processing tools",
      "tags": ["markdown", "docs"],
      "created": "2024-05-30T00:00:00Z"
    }
  }
}
```

## Updating Modules

When you update your gist:

1. Update the `updated` timestamp in your registry
2. Users with lock files will continue using their locked version
3. Users can run `mlld registry update YOUR_USERNAME/module-name` to get the latest

## Security Advisories

If you discover a security issue in one of your modules:

1. Fix the issue in your gist
2. Create or update `YOUR_USERNAME/advisories.json`:
   ```json
   {
     "version": "1.0.0",
     "author": "YOUR_USERNAME",
     "advisories": [
       {
         "id": "2024-001",
         "created": "2024-05-28T00:00:00Z",
         "severity": "medium",
         "affects": ["json-utils"],
         "gists": ["a1f3e09a42db6c680b454f6f93efa9d8"],
         "type": "code-injection",
         "description": "Unescaped user input in JSON processing",
         "recommendation": "Update to latest version"
       }
     ]
   }
   ```
3. Submit a PR with the advisory

## Best Practices

1. **Write clear descriptions** - Help users understand what your module does
2. **Use meaningful tags** - Make your modules discoverable
3. **Document your module** - Include usage examples in the gist
4. **Version your updates** - Update timestamps when you change modules
5. **Test before publishing** - Ensure your module works correctly
6. **Keep modules focused** - One purpose per module

## Examples

See the `adamavenir/` directory in the registry for examples of properly structured modules.

## FAQ

**Q: Can I register private gists?**  
A: No, only public gists can be registered.

**Q: Can I register someone else's gist?**  
A: No, you should only register gists you own.

**Q: How do I remove a module?**  
A: Submit a PR removing it from your registry.json.

**Q: Can I change a module name?**  
A: It's better to add a new module and deprecate the old one to avoid breaking imports.

**Q: How long does it take for my module to be available?**  
A: As soon as your PR is merged, the module is available immediately.

## Getting Help

- Check existing modules for examples
- Open an issue in the registry repo
- Join the mlld community discussions
- Email: registry@mlld-lang.org