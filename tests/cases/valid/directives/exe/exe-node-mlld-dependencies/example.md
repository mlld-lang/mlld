# Test Node.js Access to mlld Dependencies

This test verifies that Node.js execution can access mlld's own dependencies like gray-matter.

## Test gray-matter dependency

/exe @parseMarkdown(content) = node {
  const matter = require('gray-matter');
  const result = matter(content);
  return {
    data: result.data,
    content: result.content.trim()
  };
}

/var @testContent = `---
title: Test Document
author: Test User
date: 2024-01-15
---

This is the content of the document.`

/var @parsed = @parseMarkdown(@testContent)

## Results

/show `Title: @parsed.data.title`
/show `Author: @parsed.data.author`
/show `Content: @parsed.content`

## Test other common dependencies

/exe @testLodash() = node {
  // Test if lodash is available (it's a dependency of mlld)
  try {
    const _ = require('lodash');
    return _.capitalize('hello world');
  } catch (e) {
    return 'Lodash not available';
  }
}

/var @lodashResult = @testLodash()
/show `Lodash test: @lodashResult`