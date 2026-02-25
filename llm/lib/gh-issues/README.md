# gh-issues

GitHub Issues API tools via `gh` CLI.

## Setup

Authenticate with one of:

```bash
gh auth login                     # interactive (recommended)
export GITHUB_TOKEN=ghp_...       # env var
mlld keychain add GITHUB_TOKEN    # mlld keychain (use auth directive in your script)
```

## tldr

```mlld
import { @listIssues, @getIssue, @createIssue } from @mlld/gh-issues

var @issues = @listIssues("owner", "repo") | @parse
show `Found @issues.length issues`

var @issue = @getIssue("owner", "repo", 42) | @parse
show `#@issue.number @issue.title`

var @new = @createIssue("owner", "repo", "Bug report", "Details here") | @parse
show `Created #@new.number`
```

## Exports

| Function | Labels | Description |
|----------|--------|-------------|
| `@listIssues(owner, repo)` | `net:r` | List open issues |
| `@getIssue(owner, repo, number)` | `net:r` | Get single issue |
| `@createIssue(owner, repo, title, body)` | `net:rw` | Create issue |
| `@addComment(owner, repo, number, comment)` | `net:rw` | Add comment |
| `@closeIssue(owner, repo, number)` | `net:rw` | Close issue |
| `@searchIssues(query)` | `net:r` | Search issues |
| `@tools` | | MCP tools collection |

## Serve as MCP tools

```bash
mlld mcp modules/gh-issues/index.mld --tools-collection @tools
```

## License

CC0 - Public Domain
