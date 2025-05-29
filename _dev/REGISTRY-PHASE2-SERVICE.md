# Registry Phase 2: mlld.ai Web Service

## Overview

A web service that enhances Phase 1 with:
1. **GitHub OAuth** - Sign in to manage your modules
2. **Web UI** - Browse, search, and manage modules
3. **CLI Integration** - `mlld publish` direct from terminal
4. **Analytics** - Real download stats and graphs
5. **API** - Powers everything, backwards compatible

**Key principle**: Gists remain the source of truth. We're just a pretty DNS + analytics layer.

## Architecture

### Tech Stack

- **Backend**: Node.js/Express (simple REST API)
- **Database**: PostgreSQL (just metadata, not content)
- **Frontend**: Next.js + Tailwind
- **Auth**: GitHub OAuth
- **Hosting**: Vercel + Supabase (~$50/month)

### What We Store

```sql
-- We DON'T store module content (that's in gists)
-- We DO store:

modules (
  name            -- "prompts/code-review"
  gist_id         -- "anthropics/abc123"
  gist_owner      -- GitHub username (for verification)
  description     -- Module description
  tags[]          -- For search
  author_id       -- Who registered it
  downloads       -- Counter
  created_at
)

downloads (
  module_id
  timestamp
  cli_version     -- For compatibility tracking
  country         -- From CloudFlare headers
  -- NO IP addresses or user tracking
)

users (
  github_id       -- From OAuth
  username
  avatar_url
  -- That's it, minimal data
)
```

## User Flows

### 1. Module Registration (Web)

```
1. User signs in with GitHub
2. Dashboard shows their gists
3. Click "Register" on any gist
4. Enter name (category/module) and tags
5. Done - immediately available as mlld://registry/category/module
```

### 2. Module Publishing (CLI)

```bash
# One-time auth
mlld auth login
# Opens browser, user approves, CLI gets token

# Publish flow
mlld publish my-prompts.mld

# What happens:
1. Creates/updates gist via GitHub API
2. Prompts for registry name
3. Registers via mlld.ai API
4. Shows URL to view stats
```

### 3. Module Usage

```meld
# New lock file syntax (no brackets, uses @ prefix)
@import { reviewer } from @prompts/code-review

# With TTL and trust in .mld files
@path api (5m) = [https://api.mlld.ai/v1] trust always
@path tools (static) = [@adamavenir/dev-tools] trust verify

# Behind the scenes:
1. CLI checks project mlld.lock.json
2. If not locked, calls mlld.ai API 
3. API returns gist info + tracks download
4. Module installed with default TTL from global policy
5. User can override with inline TTL/trust
```

## API Design

### Public Endpoints (No Auth)

```
GET  /api/registry/:name     # Get module info
POST /api/registry/:name/download  # Get info + track download
GET  /api/search?q=:query    # Search modules
GET  /api/stats/:name        # Public stats
GET  /api/advisories         # Security advisories
```

### Authenticated Endpoints

```
# Auth
POST /auth/device            # CLI device flow
GET  /auth/callback          # GitHub OAuth callback

# User modules
GET  /api/user/modules       # List my modules
GET  /api/user/gists         # Fetch my gists from GitHub
POST /api/user/modules       # Register new module
PUT  /api/user/modules/:name # Update module metadata
DELETE /api/user/modules/:name # Unregister

# Publishing
POST /api/publish            # Create gist + register
```

### Example API Usage

```typescript
// GET /api/registry/prompts/code-review
{
  "name": "@prompts/code-review",
  "gist": {
    "id": "a1f3e09a42db6c680b454f6f93efa9d8",
    "owner": "anthropics"
  },
  "resolved": "https://gist.githubusercontent.com/anthropics/a1f3e09a42db6c680b454f6f93efa9d8/raw/content.mld",
  "description": "Code review prompt templates",
  "tags": ["prompts", "code-review"],
  "author": {
    "username": "anthropics",
    "avatar_url": "..."
  },
  "stats": {
    "downloads_total": 15234,
    "downloads_week": 523,
    "downloads_day": 89
  },
  "recommendedTTL": "7d",
  "securityAdvisories": [],
  "created_at": "2024-01-15T10:00:00Z"
}
```

## Web UI Pages

### Landing Page (mlld.ai)

```
- Hero: "The registry for mlld modules"
- Search bar
- Popular modules
- Recent updates
- "Sign in with GitHub" button
```

### Module Page (mlld.ai/modules/prompts/code-review)

```
- Module name and description
- Install commands:
  mlld install @prompts/code-review
  mlld install @prompts/code-review --ttl 7d --trust verify
- Author info (GitHub profile link)
- Download stats graph
- Recommended TTL setting
- Trust level suggestions
- Tags
- "View on GitHub" → gist link
- Security advisories (if any)
- Example usage in .mld files
```

### Dashboard (mlld.ai/dashboard)

```
Two sections:

1. My Modules
   - List of registered modules
   - Download counts
   - Quick stats
   - Edit/delete buttons

2. Register New Module
   - List of your gists
   - One-click registration
   - Or paste gist URL
```

### Search (mlld.ai/search?q=prompt)

```
- Search by name, description, tags
- Filter by category
- Sort by downloads/recent
- Paginated results
```

## CLI Integration

### Auth Commands

```bash
# Browser-based auth
mlld auth login
# Opens mlld.ai/device?code=ABC123
# User approves
# CLI polls for completion

# Show auth status
mlld auth status
# Logged in as @username

# Logout
mlld auth logout
```

### Publishing Commands

```bash
# Publish new module
mlld publish prompts.mld --name prompts/my-assistant
# ✓ Created gist: gist.github.com/username/abc123
# ✓ Registered: mlld://registry/prompts/my-assistant
# ✓ View stats: mlld.ai/modules/prompts/my-assistant

# Update existing module
mlld publish prompts.mld --update prompts/my-assistant
# ✓ Updated gist
# ✓ Module updated

# Just create gist (no registry)
mlld publish prompts.mld --gist-only
```

### Stats Command

```bash
# View your modules' stats
mlld stats
┌─────────────────────────┬───────┬───────┬────────┐
│ Module                  │ Today │ Week  │ Total  │
├─────────────────────────┼───────┼───────┼────────┤
│ prompts/code-review     │ 23    │ 156   │ 1,234  │
│ utils/json-formatter    │ 45    │ 302   │ 5,678  │
└─────────────────────────┴───────┴───────┴────────┘

# Detailed stats for a module
mlld stats prompts/code-review --detailed
```

## Implementation Plan

### Week 1: Backend + API

1. GitHub OAuth setup
2. Database schema
3. Core API endpoints
4. Download tracking
5. Search implementation

### Week 2: Frontend

1. Landing page
2. Module pages  
3. Search/browse
4. Dashboard
5. Auth flow

### Week 3: CLI Integration

1. Auth commands
2. Publishing flow
3. Stats commands
4. Update Phase 1 resolver to use API

### Week 4: Polish + Launch

1. Documentation
2. Migration tools
3. Beta testing
4. Performance optimization
5. Launch!

## Privacy & Ethics

1. **Minimal data collection**
   - No user tracking
   - No IP storage
   - Only aggregate stats

2. **Transparent analytics**
   - All stats are public
   - Module authors see same data as everyone

3. **GitHub as source of truth**
   - We never store module content
   - Gists can be deleted anytime
   - We're just a discovery layer

## Costs

**Monthly:**
- Vercel Pro: $20
- Supabase Starter: $25
- Domain: $1
- Total: ~$46/month

**Scaling:**
- Free tier handles ~50k API calls/month
- $0.50 per additional 10k calls
- Should handle 1000s of modules easily

## Success Metrics

**Month 1:**
- 100 modules registered
- 10 active publishers
- 5,000 downloads tracked

**Month 3:**
- 500 modules
- 50 active publishers
- 50,000 downloads tracked
- First corporate user

**Month 6:**
- 1,000 modules
- 100 active publishers
- 200,000 downloads tracked
- Sustainable growth