# Mlld Registry Service Implementation Plan

## Overview

A full registry service at mlld.ai that provides:
- GitHub OAuth login
- Web UI for managing gist registrations
- CLI integration for publishing
- Analytics and stats tracking
- API for programmatic access

## Architecture

### Tech Stack

**Backend (api.mlld.ai)**
- Node.js/Express or Deno/Hono
- PostgreSQL for data
- Redis for caching/sessions
- GitHub OAuth App
- JWT for API auth

**Frontend (mlld.ai)**
- Next.js or SvelteKit
- Tailwind CSS
- GitHub-style UI

**Infrastructure**
- Vercel/Railway for hosting
- Supabase or Neon for PostgreSQL
- Upstash Redis
- CloudFlare for CDN

### Database Schema

```sql
-- Users (from GitHub OAuth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id INTEGER UNIQUE NOT NULL,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  avatar_url TEXT,
  access_token TEXT, -- Encrypted
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Registered modules
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL, -- e.g., "prompts/code-review"
  gist_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id),
  description TEXT,
  tags TEXT[], -- Array of tags
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_name (name),
  INDEX idx_user (user_id),
  INDEX idx_tags (tags)
);

-- Version tracking
CREATE TABLE module_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES modules(id),
  gist_revision VARCHAR(255) NOT NULL,
  content_hash VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Download stats
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES modules(id),
  ip_hash VARCHAR(64), -- Hashed IP for privacy
  user_agent TEXT,
  cli_version VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_module_time (module_id, created_at)
);

-- Security advisories
CREATE TABLE advisories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_id VARCHAR(50) UNIQUE, -- MLLD-2024-001
  module_ids UUID[], -- Affected modules
  severity VARCHAR(20),
  type VARCHAR(50),
  description TEXT,
  recommendation TEXT,
  reporter_id UUID REFERENCES users(id),
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- API tokens for CLI
CREATE TABLE api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  token_hash VARCHAR(64) UNIQUE,
  name VARCHAR(255),
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
```

## Implementation Phases

### Phase 1: Backend API (Week 1)

#### 1.1 Core API Setup
```typescript
// API Endpoints
POST   /auth/github          // OAuth flow
POST   /auth/logout
GET    /auth/me

GET    /api/modules          // List/search modules
GET    /api/modules/:name    // Get module details
POST   /api/modules          // Register new module
PUT    /api/modules/:name    // Update module
DELETE /api/modules/:name    // Unregister module

GET    /api/modules/:name/stats    // Download stats
POST   /api/modules/:name/download // Track download

GET    /api/user/modules     // User's modules
GET    /api/user/gists       // Fetch user's gists from GitHub

POST   /api/tokens           // Create CLI token
GET    /api/tokens           // List tokens
DELETE /api/tokens/:id       // Revoke token

GET    /api/advisories       // Security advisories
POST   /api/advisories       // Submit advisory (auth required)
```

#### 1.2 GitHub OAuth Integration
```typescript
// OAuth App Settings
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REDIRECT_URI = 'https://mlld.ai/auth/callback';

// OAuth flow
app.get('/auth/github', (req, res) => {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: 'read:user,gist',
    state: generateState()
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Exchange code for token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code
    })
  });
  
  const { access_token } = await tokenResponse.json();
  
  // Get user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  
  const githubUser = await userResponse.json();
  
  // Create/update user in database
  const user = await upsertUser({
    github_id: githubUser.id,
    username: githubUser.login,
    email: githubUser.email,
    avatar_url: githubUser.avatar_url,
    access_token: encrypt(access_token)
  });
  
  // Create session
  const token = generateJWT(user);
  res.cookie('token', token, { httpOnly: true, secure: true });
  res.redirect('/dashboard');
});
```

#### 1.3 Module Registration API
```typescript
// Register a module
app.post('/api/modules', authenticate, async (req, res) => {
  const { name, gist_id, description, tags } = req.body;
  
  // Validate name format (category/name)
  if (!isValidModuleName(name)) {
    return res.status(400).json({ error: 'Invalid module name format' });
  }
  
  // Verify user owns the gist
  const gist = await fetchGist(gist_id, req.user.access_token);
  if (gist.owner.id !== req.user.github_id) {
    return res.status(403).json({ error: 'You do not own this gist' });
  }
  
  // Check if name is taken
  const existing = await db.modules.findByName(name);
  if (existing) {
    return res.status(409).json({ error: 'Module name already taken' });
  }
  
  // Create module
  const module = await db.modules.create({
    name,
    gist_id,
    user_id: req.user.id,
    description,
    tags
  });
  
  // Track initial version
  await trackGistVersion(module.id, gist);
  
  res.json(module);
});

// Download tracking
app.post('/api/modules/:name/download', async (req, res) => {
  const module = await db.modules.findByName(req.params.name);
  if (!module) return res.status(404).json({ error: 'Module not found' });
  
  // Track download (privacy-preserving)
  await db.downloads.create({
    module_id: module.id,
    ip_hash: hashIP(req.ip),
    user_agent: req.headers['user-agent'],
    cli_version: req.headers['x-mlld-version']
  });
  
  // Return gist info for CLI
  res.json({
    gist_id: module.gist_id,
    name: module.name,
    description: module.description
  });
});
```

### Phase 2: Web UI (Week 2)

#### 2.1 Pages & Routes

```
mlld.ai/
├── /                    # Landing page
├── /explore             # Browse all modules
├── /auth/github         # GitHub OAuth
├── /dashboard           # User's modules
├── /modules/:name       # Module details page
├── /new                 # Register new module
├── /settings            # Account settings
├── /docs                # API documentation
└── /advisories          # Security advisories
```

#### 2.2 Dashboard UI
```jsx
// Dashboard - Select gists to register
function Dashboard() {
  const [gists, setGists] = useState([]);
  const [myModules, setMyModules] = useState([]);
  
  useEffect(() => {
    // Fetch user's gists from GitHub
    fetchUserGists().then(setGists);
    // Fetch user's registered modules
    fetchMyModules().then(setMyModules);
  }, []);
  
  return (
    <div className="container">
      <h1>My Modules</h1>
      
      <section className="my-modules">
        {myModules.map(module => (
          <ModuleCard key={module.id} module={module}>
            <StatsWidget moduleId={module.id} />
          </ModuleCard>
        ))}
      </section>
      
      <section className="register-new">
        <h2>Register a Gist</h2>
        <GistSelector gists={gists} onSelect={handleRegister} />
      </section>
    </div>
  );
}

// Module registration form
function RegisterModule({ gist }) {
  const [formData, setFormData] = useState({
    name: '',
    description: gist.description || '',
    tags: []
  });
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate name format
    if (!formData.name.match(/^[a-z0-9-]+\/[a-z0-9-]+$/)) {
      alert('Name must be in format: category/name');
      return;
    }
    
    const response = await fetch('/api/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        gist_id: gist.id
      })
    });
    
    if (response.ok) {
      window.location.href = `/modules/${formData.name}`;
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        pattern="^[a-z0-9-]+/[a-z0-9-]+$"
        placeholder="category/module-name"
        value={formData.name}
        onChange={e => setFormData({...formData, name: e.target.value})}
        required
      />
      {/* ... rest of form ... */}
    </form>
  );
}
```

#### 2.3 Module Details Page
```jsx
function ModulePage({ name }) {
  const [module, setModule] = useState(null);
  const [stats, setStats] = useState(null);
  
  return (
    <div className="module-page">
      <header>
        <h1>{module.name}</h1>
        <p>{module.description}</p>
        <div className="meta">
          <img src={module.author.avatar_url} />
          <span>by {module.author.username}</span>
          <span>•</span>
          <span>{stats.downloads} downloads this week</span>
        </div>
      </header>
      
      <section className="usage">
        <h2>Usage</h2>
        <CodeBlock>
          {`@import { * } from "mlld://registry/${module.name}"`}
        </CodeBlock>
      </section>
      
      <section className="stats">
        <h2>Statistics</h2>
        <DownloadChart data={stats.timeline} />
      </section>
      
      {advisories.length > 0 && (
        <section className="advisories">
          <h2>⚠️ Security Advisories</h2>
          {advisories.map(advisory => (
            <AdvisoryCard key={advisory.id} advisory={advisory} />
          ))}
        </section>
      )}
    </div>
  );
}
```

### Phase 3: CLI Integration (Week 3)

#### 3.1 CLI Authentication
```typescript
// mlld auth login
export async function loginCommand() {
  // Generate device code
  const deviceCode = generateDeviceCode();
  
  console.log('Opening browser to authenticate...');
  console.log(`Or visit: https://mlld.ai/device?code=${deviceCode}`);
  
  // Open browser
  open(`https://mlld.ai/device?code=${deviceCode}`);
  
  // Poll for completion
  const token = await pollForToken(deviceCode);
  
  // Save token
  await saveCredentials(token);
  console.log('✓ Authenticated successfully');
}

// mlld auth token
export async function createTokenCommand() {
  const creds = await loadCredentials();
  if (!creds) {
    console.error('Not authenticated. Run: mlld auth login');
    return;
  }
  
  const name = await prompt('Token name: ');
  
  const response = await fetch('https://api.mlld.ai/api/tokens', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${creds.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  });
  
  const { token } = await response.json();
  console.log(`\nAPI Token: ${token}`);
  console.log('Save this token - it won\'t be shown again');
}
```

#### 3.2 Publishing Flow
```typescript
// mlld publish [file]
export async function publishCommand(file: string) {
  const creds = await loadCredentials();
  if (!creds) {
    console.error('Not authenticated. Run: mlld auth login');
    return;
  }
  
  // Read the file
  const content = await fs.readFile(file, 'utf8');
  
  // Extract metadata from comments
  const metadata = extractMetadata(content);
  
  // Create or update gist
  console.log('Creating gist...');
  const gist = await createOrUpdateGist({
    description: metadata.description || `Published from ${file}`,
    files: {
      [path.basename(file)]: { content }
    }
  }, creds.token);
  
  console.log(`✓ Gist created: ${gist.html_url}`);
  
  // Prompt for registry name
  const name = await prompt('Registry name (category/name): ');
  const tags = await prompt('Tags (comma-separated): ');
  
  // Register in registry
  console.log('Registering module...');
  const response = await fetch('https://api.mlld.ai/api/modules', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${creds.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      gist_id: gist.id,
      description: metadata.description,
      tags: tags.split(',').map(t => t.trim())
    })
  });
  
  if (response.ok) {
    console.log(`✓ Module registered: mlld://registry/${name}`);
    console.log(`View at: https://mlld.ai/modules/${name}`);
  } else {
    const error = await response.json();
    console.error(`Failed to register: ${error.message}`);
  }
}

// mlld update [name]
export async function updateCommand(name: string) {
  // Similar flow - update existing gist
}
```

#### 3.3 Registry Commands
```typescript
// Update registry resolver to use API
async function resolveRegistryImport(importPath: string): Promise<string> {
  const moduleName = importPath.replace('mlld://registry/', '');
  
  // Check cache first
  const cached = await cache.get(`registry:${moduleName}`);
  if (cached && cached.age < 3600000) {
    return cached.gist_id;
  }
  
  // Fetch from API (includes download tracking)
  const response = await fetch(`https://api.mlld.ai/api/modules/${moduleName}/download`, {
    method: 'POST',
    headers: {
      'X-Mlld-Version': VERSION,
      'User-Agent': `mlld-cli/${VERSION}`
    }
  });
  
  if (!response.ok) {
    throw new MlldImportError(`Module not found: ${moduleName}`);
  }
  
  const data = await response.json();
  
  // Cache it
  await cache.set(`registry:${moduleName}`, data);
  
  return `mlld://gist/${data.gist_id}`;
}

// mlld registry stats [name]
export async function statsCommand(name: string) {
  const response = await fetch(`https://api.mlld.ai/api/modules/${name}/stats`);
  const stats = await response.json();
  
  console.log(`\nModule: ${name}`);
  console.log(`Total downloads: ${stats.total_downloads}`);
  console.log(`This week: ${stats.downloads_this_week}`);
  console.log(`This month: ${stats.downloads_this_month}`);
  
  // Show download graph
  showDownloadGraph(stats.daily);
}
```

## Security Considerations

1. **Rate Limiting**
   - API: 100 requests/minute per IP
   - Downloads: 1000/hour per module
   - Registration: 10 modules/day per user

2. **Validation**
   - Module names: alphanumeric + hyphens only
   - No path traversal in names
   - Gist ownership verification
   - Content scanning for malicious patterns

3. **Privacy**
   - IP addresses hashed for stats
   - No PII in download tracking
   - Optional anonymous usage

## Deployment Plan

### Week 4: Launch Preparation

1. **Infrastructure Setup**
   - Deploy to Vercel/Railway
   - Configure PostgreSQL (Supabase)
   - Set up Redis (Upstash)
   - Configure GitHub OAuth App

2. **Migration Tools**
   ```bash
   # Import existing registry.json
   mlld-admin import-legacy registry.json
   
   # Bulk verify gist ownership
   mlld-admin verify-gists
   ```

3. **Documentation**
   - API docs at mlld.ai/docs
   - Migration guide for existing users
   - Publishing tutorial

4. **Beta Testing**
   - Invite core contributors
   - Test publishing flow
   - Gather feedback

### Success Metrics

1. **Adoption**
   - 100 modules registered in first month
   - 1000 downloads/week
   - 50 active publishers

2. **Performance**
   - Registry resolution < 100ms (cached)
   - API response time < 200ms
   - 99.9% uptime

3. **Security**
   - Zero security incidents
   - < 1% false positive advisories
   - All advisories reviewed < 24h

## Cost Estimate

**Monthly Costs:**
- Vercel Pro: $20
- Supabase: $25 (starter)
- Upstash Redis: $10
- Domain: $1
- **Total: ~$56/month**

## Future Enhancements

1. **Organizations** - Team namespaces
2. **Verified Publishers** - Blue checkmarks
3. **Private Modules** - Paid tier
4. **Module Insights** - Advanced analytics
5. **API Rate Limits** - Paid increased limits
6. **Webhooks** - For CI/CD integration