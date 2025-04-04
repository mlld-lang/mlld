  it('should initialize transformed nodes when enabling transformation', () => {
    const node: MeldNode = { type: 'Text', content: 'test' };
    service.addNode(node);
    expect(service.getTransformedNodes()).toEqual([node]); // Transformed should equal original initially
  });

  it('should add nodes to both arrays when transformation is enabled', () => {
    const node: MeldNode = { type: 'Text', content: 'test content' }; // Added content
    service.addNode(node);
    expect(service.getNodes()).toEqual([node]);
    // Check transformed nodes immediately after adding, should match
    expect(service.getTransformedNodes()).toEqual([node]); 
  });

  it('should transform nodes only when enabled', () => {
    const original: MeldNode = { type: 'Text', content: 'original' };
    const transformed: MeldNode = { type: 'Text', content: 'transformed' };
    service.addNode(original);
    
    // Attempt transform (transformation is always on)
    service.transformNode(original, transformed);
    expect(service.getTransformedNodes()).toEqual([transformed]); // Should reflect transformation
    expect(service.getNodes()).toEqual([original]); // Original nodes remain unchanged
  });

  it('should throw when transforming non-existent node', () => {
    const nonExistent: MeldNode = { type: 'Text', content: 'ghost' }; // Added content
    const transformed: MeldNode = { type: 'Text', content: 'transformed' };
    // Expect transformNode to handle non-existent node gracefully or throw specific error
    expect(() => service.transformNode(nonExistent, transformed)).toThrow(/original node not found/);
  });

  it('should preserve transformation state when cloning', () => {
    const node: MeldNode = { type: 'Text', content: 'clone test' }; // Added content
    service.addNode(node);
    service.transformNode(node, { type: 'Text', content: 'transformed clone' });

    const clone = service.clone();
    expect(clone.isTransformationEnabled()).toBe(true);
    expect(clone.getTransformedNodes()).toEqual([{ type: 'Text', content: 'transformed clone' }]);
  });

  it('should handle immutability correctly with transformations', () => {
    const original: MeldNode = { type: 'Text', content: 'immutable test' }; // Added content
    service.addNode(original);
    service.makeImmutable();

    const transformed: MeldNode = { type: 'Text', content: 'transformed immutable' };
    // Expect transformNode on immutable state to throw or handle appropriately
    expect(() => service.transformNode(original, transformed)).toThrow(/Cannot modify immutable state/);
  }); 