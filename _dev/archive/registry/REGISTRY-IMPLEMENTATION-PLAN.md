# Mlld Registry Implementation Plan

## Option 1: "DNS for Gists" (Simplest)

Just a name mapping service + security advisories. Gists handle everything else.

### What We Need to Build

1. **Simple JSON Database** (GitHub repo)
   ```json
   {
     "registry": {
       "prompts/code-review": {
         "gist": "anthropics/a1f3e09a42db6c680b454f6f93efa9d8",
         "author": "anthropics",
         "description": "Code review prompt templates"
       },
       "utils/formatters": {
         "gist": "mlld-lang/b2f4e09a42db6c680b454f6f93efa9d8",
         "author": "mlld-lang",
         "description": "Common formatting utilities"
       }
     },
     "advisories": [
       {
         "id": "MLLD-2024-001",
         "affects": ["prompts/data-extractor"],
         "severity": "high",
         "description": "Potential data exposure"
       }
     ]
   }
   ```

2. **CLI Commands** (~200 lines)
   ```typescript
   // In cli/commands/registry.ts
   async function registryResolve(name: string) {
     const registry = await fetch('https://raw.githubusercontent.com/mlld-lang/registry/main/registry.json');
     const data = await registry.json();
     const entry = data.registry[name];
     if (!entry) throw new Error(`Unknown module: ${name}`);
     return `mlld://gist/${entry.gist}`;
   }
   ```

3. **Import Enhancement** (~100 lines)
   ```typescript
   // In interpreter/eval/import.ts
   if (importPath.startsWith('mlld://registry/')) {
     const name = importPath.slice('mlld://registry/'.length);
     importPath = await registryResolve(name);
   }
   ```

4. **Security Check** (~150 lines)
   ```typescript
   async function checkAdvisories(importName: string) {
     const registry = await fetch('https://raw.githubusercontent.com/mlld-lang/registry/main/registry.json');
     const { advisories } = await registry.json();
     const relevant = advisories.filter(a => a.affects.includes(importName));
     if (relevant.length > 0) {
       console.warn('⚠️  Security advisories found:');
       relevant.forEach(a => console.warn(`  ${a.severity}: ${a.description}`));
     }
   }
   ```

### Total Work: ~2 days
- 1 day: Core implementation
- 1 day: Testing & documentation

### How Users Register
```bash
# Submit PR to mlld-lang/registry repo with:
{
  "prompts/my-cool-prompt": {
    "gist": "myusername/gist-id-here",
    "author": "myusername",
    "description": "My cool prompt"
  }
}
```

---

## Option 2: Poor Man's Version (Gists + Local Features)

Adds lock files, caching, and approval flow - but still uses gists as backend.

### Additional Components

1. **Lock File Manager** (~300 lines)
   ```typescript
   class LockFile {
     async add(importPath: string, gistId: string) {
       const gistData = await fetchGist(gistId);
       const revision = gistData.history[0].version;
       const content = await fetchGistContent(gistId, revision);
       const hash = sha256(content);
       
       this.data.imports[importPath] = {
         resolved: `https://gist.githubusercontent.com/.../${revision}/...`,
         integrity: `sha256:${hash}`,
         gistRevision: revision,
         approvedAt: new Date().toISOString()
       };
     }
   }
   ```

2. **Cache System** (~200 lines)
   ```typescript
   class Cache {
     async get(importPath: string): Promise<string | null> {
       const lockEntry = this.lockFile.get(importPath);
       if (!lockEntry) return null;
       
       const cachePath = this.getCachePath(lockEntry);
       try {
         return await fs.readFile(cachePath, 'utf8');
       } catch {
         return null;
       }
     }
   }
   ```

3. **Approval UI** (~150 lines)
   ```typescript
   async function approveImport(path: string, content: string) {
     console.log(`\n⚠️  New import: ${path}`);
     console.log('─'.repeat(50));
     console.log(content.slice(0, 500));
     if (content.length > 500) console.log('... (truncated)');
     console.log('─'.repeat(50));
     
     const answer = await prompt('Approve this import? [y/N]: ');
     return answer.toLowerCase() === 'y';
   }
   ```

4. **CLI Commands** (~400 lines)
   - `mlld install` - Install from lock file
   - `mlld update [name]` - Update imports
   - `mlld audit` - Check advisories
   - `mlld cache clean` - Clear cache

### Total Work: ~1 week
- 2 days: Lock file & cache system
- 2 days: Approval flow & UI
- 2 days: CLI commands
- 1 day: Testing & edge cases

---

## Option 3: Full Registry (Future)

A proper package registry with versioning, search, stats, etc.

### Additional Infrastructure
- Web service (Node.js/Deno)
- Database (PostgreSQL)
- Storage (S3/CloudFlare R2)
- CDN for global distribution
- Web UI for browsing
- API for publishing

### Total Work: ~1 month
- Design & architecture
- Backend implementation
- Frontend UI
- CLI integration
- Migration from gist system

---

## Recommendation: Start with Option 1

**Why "DNS for Gists" is the right start:**

1. **Minimal Infrastructure**
   - Just a GitHub repo with JSON files
   - No servers, databases, or hosting costs
   - Community can help maintain via PRs

2. **Immediate Value**
   - Human-friendly names for imports
   - Security advisory system
   - Discovery mechanism

3. **Easy Migration Path**
   - When ready for Option 2, just add local features
   - Registry URLs stay the same
   - No breaking changes

4. **Implementation Steps:**
   ```bash
   # Day 1
   - Create mlld-lang/registry repo
   - Add registry.json with initial entries
   - Implement registry resolve in import.ts
   
   # Day 2  
   - Add advisory checking
   - Add `mlld registry search` command
   - Documentation & announcement
   ```

5. **Example Usage:**
   ```meld
   # Instead of:
   @import { reviewer } from "mlld://gist/anthropics/a1f3e09a42db6c680b454f6f93efa9d8"
   
   # Users can write:
   @import { reviewer } from "mlld://registry/prompts/code-review"
   ```

**This gets us 80% of the value with 20% of the work.**

Later, we can add lock files and caching without changing the registry concept - just enhancing the local experience.