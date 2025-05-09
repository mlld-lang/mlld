# Meld Grammar Documentation Improvement Plan

This plan outlines a comprehensive approach to improving, standardizing, and maintaining the Meld grammar documentation, based on an extensive audit of the current state. The goal is to ensure complete, accurate, and user-friendly documentation that properly reflects the actual implementation.

## 1. Documentation Structure and Organization

### Current Issues
- Documentation is spread across multiple locations (`grammar/docs/`, `_spec/types/`, `docs/dev/`, various README files)
- Some subtype documentation remains separate despite plans to consolidate
- Inconsistency in documentation depth between directives
- Broken cross-references between documentation files

### Improvement Plan
1. **Create a Unified Documentation Structure**
   - Complete the consolidation of subtype documentation into main directive files
   - Ensure consistent navigation between documentation files
   - Implement a standardized directory structure for all documentation

2. **Documentation Index Creation**
   - Create a comprehensive index file linking all related documentation
   - Include cross-references to implementation files, tests, and examples
   - Organize by abstraction level (base, patterns, core, directives)

3. **README Standardization**
   - Update all README files to follow a consistent structure
   - Include purpose, components, and navigation links
   - Add "Usage in Higher Abstractions" section to show how each component is used

## 2. Documentation Content Standardization

### Current Issues
- Inconsistent documentation format between directive files
- Varying levels of detail for different directive types
- AST structure examples don't always match implementation
- Missing or incomplete documentation for some subtypes
- Deprecated syntax remains in documentation (e.g., `@embed` vs. `@add`)

### Improvement Plan
1. **Create a Standard Documentation Template**
   ```markdown
   # Directive Name
   
   ## Purpose
   [Brief overview of what this directive does and when to use it]
   
   ## Syntax Patterns
   ```meld
   @directive pattern1
   @directive pattern2
   ```
   
   ## Subtypes
   The directive has X subtypes:
   
   ### Subtype1
   #### Syntax
   [Specific syntax with all variants]
   
   #### AST Structure
   ```typescript
   // Full AST structure with all properties
   ```
   
   #### Values Object
   [Detailed explanation of values object properties]
   
   #### Raw Object
   [Explanation of raw text properties]
   
   #### Meta Properties
   [Explanation of metadata properties]
   
   #### Examples
   [Complete examples with syntax and resulting AST]
   
   ### Subtype2
   [Same structure as above]
   
   ## Handler Behavior
   [Explanation of how the directive is processed]
   
   ## Related Directives
   [List of related directives with links]
   ```

2. **AST Structure Accuracy Review**
   - Audit all AST examples against actual implementation
   - Update any outdated or incorrect examples
   - Include complete properties for values, raw, and meta objects
   - Add relevant comments explaining property purpose

3. **Example Standardization**
   - Include both simple and complex examples for each directive
   - Add edge case examples to demonstrate limitations
   - Provide examples of directive composition

4. **Terminology Standardization**
   - Create a glossary of standardized terms
   - Ensure consistent use of terms across all documentation
   - Replace any deprecated terminology (e.g., `@embed` → `@add`)

## 3. Implementation-Documentation Alignment

### Current Issues
- Implementation changes not always reflected in documentation
- Undocumented features exist in the implementation
- Some documented features are no longer supported
- Documentation examples don't always match test cases

### Improvement Plan
1. **Documentation-Implementation Verification Process**
   - Create a process to verify documentation against implementation
   - Update documentation as part of the implementation change process
   - Add tests that verify examples in documentation work as described

2. **Audit and Close Gaps**
   - Systematically review each directive implementation
   - Document all supported features and syntax variations
   - Remove or mark deprecated features
   - Add documentation for undocumented features

3. **Test Case Alignment**
   - Ensure test cases cover all documented features
   - Add examples from documentation to test suite
   - Reference test files in documentation

## 4. Code Comments and In-Line Documentation

### Current Issues
- Inconsistent comment style across grammar files
- Varying levels of detail in rule comments
- Some comments are outdated or no longer accurate
- Debugging statements mixed with documentation comments

### Improvement Plan
1. **Standardize File Header Format**
   ```peggy
   // DIRECTIVE NAME
   // Brief description of the directive's purpose
   
   /* 
   # Detailed Documentation
   
   The directive does X and is used for Y.
   It can be used in these forms:
   1. Form 1
   2. Form 2
   
   @see /grammar/docs/directive.md for complete documentation
   */
   ```

2. **Standardize Section Dividers**
   ```peggy
   // -------------------------------------------------------------
   // SECTION NAME
   // -------------------------------------------------------------
   ```

3. **Standardize Rule Comments**
   ```peggy
   // Rule purpose and brief description of what it handles
   RuleName "Human-readable description"
     = ...
   ```

4. **Update All Grammar Files**
   - Apply standardized comments to all grammar files
   - Ensure all rules have descriptive comments
   - Add links to relevant documentation

## 5. Implementation Plan and Timeline

### Phase 1: Audit and Planning (Week 1)
- Complete documentation audit for all directives
- Create standardized templates
- Define terminology glossary
- Set up documentation review process

### Phase 2: Structure and Standards (Week 2)
- Implement standardized directory structure
- Create documentation index
- Update README files
- Develop documentation verification process

### Phase 3: Content Updates (Weeks 3-4)
- **Priority Order for Directive Documentation Updates:**
  1. Import directive (most complex)
  2. Text directive
  3. Path directive
  4. Run directive
  5. Add directive
  6. Exec directive
  7. Data directive
- Apply standardized format to all directive documentation
- Verify AST examples against implementation
- Update all examples

### Phase 4: Code Comments and Cross-References (Week 5)
- Update all grammar file comments
- Add documentation links in code
- Create cross-references between related files
- Implement documentation verification tests

### Phase 5: Final Review and Publishing (Week 6)
- Conduct comprehensive review of all documentation
- Fix any remaining issues
- Publish updated documentation
- Set up ongoing maintenance process

## 6. Specific Directive Improvements

### Text Directive
- Update `@add` references (formerly `@embed`)
- Complete missing textTemplate documentation
- Update variable interpolation documentation
- Add complete AST examples for nested directives

### Run Directive
- Add documentation for command reference syntax
- Update command parameters documentation
- Clarify relationship with exec directive
- Add AST examples for all subtypes

### Import Directive
- Ensure selective import documentation is complete
- Clarify path resolution rules
- Document security restrictions
- Update AST examples for value fields

### Data Directive
- Document nested data structure handling
- Add examples of complex data structures
- Update directive composition examples
- Document metadata properties

### Add Directive (formerly Embed)
- Update all references from embed to add
- Ensure path handling documentation is complete
- Update AST structure examples
- Add security considerations

### Exec Directive (formerly Define)
- Update all references from define to exec
- Document command reference syntax
- Clarify relationship with run directive
- Add complete examples of code blocks

## 7. Documentation Testing and Maintenance

### Documentation Testing
- Create tests that verify documentation examples work
- Implement automated checks for documentation-code alignment
- Add tests for edge cases mentioned in documentation

### Ongoing Maintenance
- Add documentation requirements to PR template
- Implement documentation reviews as part of code reviews
- Create a process for regular documentation audits
- Track documentation issues separately from code issues

### Validation Processes
- Create a checklist for documentation validation
- Implement peer review process for documentation changes
- Add automated tests for broken links and references

## 8. Success Metrics

The documentation improvement effort will be considered successful when:

1. All directives have complete, standardized documentation
2. AST examples match actual implementation output
3. All subtype documentation is consolidated appropriately
4. Documentation is centrally indexed and cross-referenced
5. Code comments follow standardized format
6. Documentation is verified by tests
7. A maintenance process is established

This plan provides a comprehensive roadmap for systematically improving the Meld grammar documentation, ensuring it accurately reflects the implementation and provides clear guidance for both users and developers.