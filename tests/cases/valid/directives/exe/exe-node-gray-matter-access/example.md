# Test Node.js Direct Access to gray-matter

This test verifies that Node.js can directly import and use gray-matter from mlld's dependencies.

## Test 1: Direct require of gray-matter

/exe @parseMarkdown(@content) = node {
  const matter = require('gray-matter');
  const result = matter(content);
  return {
    data: result.data,
    content: result.content.trim()
  };
}

/var @testDoc = `---
title: Test Document
author: John Doe
date: 2024-01-01
---

# Hello World

This is the main content.`

/var @parsed = @parseMarkdown(@testDoc)
/show `Title: @parsed.data.title`
/show `Author: @parsed.data.author`
/show `Content: @parsed.content`

## Test 2: Using gray-matter options

/exe @parseWithOptions(@content) = node {
  const matter = require('gray-matter');
  const result = matter(content, {
    excerpt: true,
    excerpt_separator: '<!-- more -->'
  });
  return {
    data: result.data,
    excerpt: result.excerpt || 'No excerpt',
    content: result.content.trim()
  };
}

/var @docWithExcerpt = `---
title: Blog Post
---

This is the excerpt.

<!-- more -->

This is the full content that comes after the excerpt.`

/var @withExcerpt = @parseWithOptions(@docWithExcerpt)
/show `Blog title: @withExcerpt.data.title`
/show `Excerpt: @withExcerpt.excerpt`

## Test 3: Module version check

/exe @checkGrayMatterVersion() = node {
  try {
    // The gray-matter module itself has a version property we can check
    const matter = require('gray-matter');
    // If that doesn't work, at least confirm we loaded it
    return matter ? 'gray-matter loaded successfully' : 'gray-matter not loaded';
  } catch (e) {
    return `Could not load gray-matter: ${e.message}`;
  }
}

/var @version = @checkGrayMatterVersion()
/show @version