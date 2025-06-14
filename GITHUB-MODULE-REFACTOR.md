# GitHub Module Refactoring Guide

## Overview

Now that shadow environments are working, we can dramatically improve the GitHub API module and similar modules. This guide shows how to refactor modules to be cleaner, more maintainable, and more readable using the new `@exec js = { ... }` syntax.

## Current State (Without Shadow Envs)

Our GitHub API module currently has massive duplication:

```mlld
# github-api-simple.mld - Every function repeats the same fetch logic

@exec getPRData(owner, repo, prNumber, token) = @run js [(async () => {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }
  
  return await response.json();
})()]

@exec getPRFiles(owner, repo, prNumber, token) = @run js [(async () => {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }
  
  return await response.json();
})()]

# ... and so on for EVERY function
```

## Refactored Version (With Shadow Envs)

```mlld
---
name: github-api
author: mlld-dev
description: Clean GitHub API utilities using shadow environments
mlld-version: ">=1.4.0"
---

# GitHub API Utilities

## Core Functions

>> Base GitHub API request handler
@exec githubFetch(endpoint, token, options) = @run js [(async () => {
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `https://api.github.com${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...((options && options.headers) || {})
    },
    ...options
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${error}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }
  return await response.text();
})()]

>> Parse GitHub response with error handling
@exec parseResponse(response) = @run js [(
  if (!response || typeof response === 'string') {
    return response;
  }
  
  // Handle common GitHub API patterns
  if (response.message && response.documentation_url) {
    throw new Error(`GitHub API: ${response.message}`);
  }
  
  return response;
)]

## Configure Shadow Environment

>> Make core functions available to all other JS functions
@exec js = { githubFetch, parseResponse }

## Pull Request Functions

>> Get PR data - now just 3 lines!
@exec getPRData(owner, repo, prNumber, token) = @run js [(async () => {
  const endpoint = `/repos/${owner}/${repo}/pulls/${prNumber}`;
  const data = await githubFetch(endpoint, token);
  return parseResponse(data);
})()]

>> Get PR files
@exec getPRFiles(owner, repo, prNumber, token) = @run js [(async () => {
  const endpoint = `/repos/${owner}/${repo}/pulls/${prNumber}/files`;
  const data = await githubFetch(endpoint, token);
  return parseResponse(data);
})()]

>> Create a PR review
@exec createReview(owner, repo, prNumber, event, body, token) = @run js [(async () => {
  const endpoint = `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`;
  
  const eventMap = {
    'approve': 'APPROVE',
    'request-changes': 'REQUEST_CHANGES',
    'comment': 'COMMENT'
  };
  
  const githubEvent = eventMap[event.toLowerCase()] || event.toUpperCase();
  
  const result = await githubFetch(endpoint, token, {
    method: 'POST',
    body: JSON.stringify({
      body: body,
      event: githubEvent
    })
  });
  
  return parseResponse(result);
})()]

>> Add a comment to PR
@exec addComment(owner, repo, prNumber, body, token) = @run js [(async () => {
  const endpoint = `/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  
  const result = await githubFetch(endpoint, token, {
    method: 'POST',
    body: JSON.stringify({ body })
  });
  
  return parseResponse(result);
})()]

## Repository Functions

>> Get repository info
@exec getRepo(owner, repo, token) = @run js [(async () => {
  const endpoint = `/repos/${owner}/${repo}`;
  const data = await githubFetch(endpoint, token);
  return parseResponse(data);
})()]

>> List repository collaborators
@exec listCollaborators(owner, repo, token) = @run js [(async () => {
  const endpoint = `/repos/${owner}/${repo}/collaborators`;
  const data = await githubFetch(endpoint, token);
  return parseResponse(data);
})()]

## User Functions

>> Get authenticated user
@exec getUser(token) = @run js [(async () => {
  const data = await githubFetch('/user', token);
  return parseResponse(data);
})()]

>> Check if user is collaborator
@exec isCollaborator(owner, repo, username, token) = @run js [(async () => {
  try {
    const endpoint = `/repos/${owner}/${repo}/collaborators/${username}`;
    await githubFetch(endpoint, token);
    return true;
  } catch (e) {
    if (e.message.includes('404')) {
      return false;
    }
    throw e;
  }
})()]
```

## Benefits of This Approach

### 1. **DRY Code**
- No more duplicating headers, error handling, URL construction
- Central `githubFetch` handles all common logic
- Each function focuses only on its unique aspects

### 2. **Better Error Handling**
- Consistent error messages
- Proper status code handling
- GitHub-specific error parsing in one place

### 3. **Easier Testing**
```mlld
# test-github-api.mld

@import { githubFetch, getPRData, createReview } from "./github-api.mld"

# Mock the base function for testing
@exec githubFetch(endpoint, token, options) = @run js [(
  // Return mock data based on endpoint
  if (endpoint.includes('/pulls/123')) {
    return { number: 123, title: 'Test PR', state: 'open' };
  }
  throw new Error('Not found');
)]

# Re-declare shadow env with mocked function
@exec js = { githubFetch }

# Now all functions use the mocked version!
@data pr = @getPRData("owner", "repo", "123", "fake-token")
@add "Mocked PR: @pr.title"
```

### 4. **Composability**
```mlld
# Higher-level functions can compose the basics
@exec reviewAndMerge(owner, repo, pr, token) = @run js [(async () => {
  // Uses multiple GitHub functions seamlessly
  const prData = await getPRData(owner, repo, pr, token);
  
  if (prData.mergeable) {
    await createReview(owner, repo, pr, 'approve', 'LGTM!', token);
    return await mergePR(owner, repo, pr, token);
  }
  
  return await createReview(owner, repo, pr, 'comment', 'Not mergeable', token);
})()]
```

## Refactoring Checklist

When refactoring a module to use shadow envs:

1. **Identify Common Patterns**
   - [ ] What code is duplicated across functions?
   - [ ] What setup/teardown is repeated?
   - [ ] What error handling is common?

2. **Extract Base Functions**
   - [ ] Create base utilities (like `githubFetch`)
   - [ ] Add parsing/validation helpers
   - [ ] Include error handling helpers

3. **Declare Shadow Environment**
   - [ ] Add `@exec js = { ... }` with all shared functions
   - [ ] Place it after base function definitions
   - [ ] Include only truly shared functions

4. **Simplify Existing Functions**
   - [ ] Remove duplicated code
   - [ ] Call base functions directly
   - [ ] Focus on function-specific logic

5. **Add Documentation**
   - [ ] Document what's in the shadow env
   - [ ] Explain base function parameters
   - [ ] Show example usage

## Other Modules That Need This

### 1. **HTTP Utilities**
```mlld
# Before: Every function sets up headers, handles errors
# After: Base httpRequest function, all others build on it

@exec httpRequest(url, options) = @run js [(/* base logic */)]
@exec js = { httpRequest }

@exec get(url, headers) = @run js [(
  return await httpRequest(url, { method: 'GET', headers });
)]
```

### 2. **File Processing**
```mlld
# Before: Each function reads files, handles errors separately
# After: Shared readJSON, writeJSON, processFile functions

@exec readJSON(path) = @run js [(/* read and parse */)]
@exec writeJSON(path, data) = @run js [(/* stringify and write */)]
@exec js = { readJSON, writeJSON }
```

### 3. **Data Transformation**
```mlld
# Before: Complex transformations duplicated
# After: Composable transformation functions

@exec normalize(data) = @run js [(/* normalization logic */)]
@exec validate(data, schema) = @run js [(/* validation logic */)]
@exec js = { normalize, validate }

@exec processData(input) = @run js [(
  const normalized = normalize(input);
  return validate(normalized, schema);
)]
```

## Next Steps

1. **Refactor github-api.mld** using this pattern
2. **Update registry review scripts** to use cleaner module
3. **Create template** for new modules using shadow envs
4. **Document pattern** in module development guide

## Questions for Implementation

1. Should we namespace shadow functions? (e.g., `gh.fetch` vs `fetch`)
2. How to handle forward references? (declare env before all functions?)
3. Best practices for testing modules with shadow envs?
4. Should imported functions automatically join shadow env?

This refactoring will make mlld modules much more maintainable and showcase the power of the shadow environment feature!