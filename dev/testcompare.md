===== BEFORE =====


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 23 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  services/pipeline/OutputService/OutputService.test.ts > OutputService > Markdown Output > should convert text nodes to markdown
AssertionError: expected 'Hello world\n\n' to be 'Hello world\n' // Object.is equality

- Expected
+ Received

  Hello world

+

 ❯ services/pipeline/OutputService/OutputService.test.ts:263:22
    261| 
    262|       const output = await service.convert(nodes, state, 'markdown');
    263|       expect(output).toBe('Hello world\n');
       |                      ^
    264|     });
    265| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/23]⎯

 FAIL  services/pipeline/OutputService/OutputService.test.ts > OutputService > Markdown Output > should handle directive nodes according to type
AssertionError: expected '[run directive output placeholder]\n' to be 'echo test\n' // Object.is equality

- Expected
+ Received

- echo test
+ [run directive output placeholder]


 ❯ services/pipeline/OutputService/OutputService.test.ts:279:22
    277|       ];
    278|       output = await service.convert(execNodes, state, 'markdown');
    279|       expect(output).toBe('echo test\n');
       |                      ^
    280|     });
    281| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/23]⎯

 FAIL  services/pipeline/OutputService/OutputService.test.ts > OutputService > Markdown Output > should respect preserveFormatting option
AssertionError: expected '\n  Hello  \n  World  \n\n' to be '\n  Hello  \n  World  \n' // Object.is equality

- Expected
+ Received


    Hello  
    World  

+

 ❯ services/pipeline/OutputService/OutputService.test.ts:309:25
    307|         preserveFormatting: true
    308|       });
    309|       expect(preserved).toBe('\n  Hello  \n  World  \n');
       |                         ^
    310| 
    311|       const cleaned = await service.convert(nodes, state, 'markdown'…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/23]⎯

 FAIL  services/pipeline/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should handle directives according to type
AssertionError: expected '[run directive output placeholder]' to contain 'echo test'

Expected: "echo test"
Received: "[run directive output placeholder]"

 ❯ services/pipeline/OutputService/OutputService.test.ts:351:22
    349|       ];
    350|       output = await service.convert(execNodes, state, 'llm');
    351|       expect(output).toContain('echo test');
       |                      ^
    352|     });
    353| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/23]⎯

 FAIL  services/pipeline/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should use transformed nodes when transformation is enabled
AssertionError: expected 'test output\n\n' to be 'test output\n' // Object.is equality

- Expected
+ Received

  test output

+

 ❯ services/pipeline/OutputService/OutputService.test.ts:388:22
    386| 
    387|       const output = await service.convert(originalNodes, state, 'ma…
    388|       expect(output).toBe('test output\n');
       |                      ^
    389|     });
    390| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/23]⎯

 FAIL  services/pipeline/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle mixed content in transformation mode
AssertionError: expected 'Before\n\ntest output\n\nAfter\n\n' to be 'Before\ntest output\nAfter\n' // Object.is equality

- Expected
+ Received

  Before
+
  test output
+
  After

+

 ❯ services/pipeline/OutputService/OutputService.test.ts:408:22
    406| 
    407|       const output = await service.convert(originalNodes, state, 'ma…
    408|       expect(output).toBe('Before\ntest output\nAfter\n');
       |                      ^
    409|     });
    410| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/23]⎯

 FAIL  services/pipeline/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle definition directives in non-transformation mode
AssertionError: expected 'Before\n\nAfter\n\n' to be 'Before\nAfter\n' // Object.is equality

- Expected
+ Received

  Before
+
  After

+

 ❯ services/pipeline/OutputService/OutputService.test.ts:419:22
    417| 
    418|       const output = await service.convert(nodes, state, 'markdown');
    419|       expect(output).toBe('Before\nAfter\n');
       |                      ^
    420|     });
    421| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/23]⎯

 FAIL  services/pipeline/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should show placeholders for execution directives in non-transformation mode
AssertionError: expected 'Before\n\n[run directive output place…' to be 'Before\necho test\nAfter\n' // Object.is equality

- Expected
+ Received

  Before
- echo test
+
+ [run directive output placeholder]
  After

+

 ❯ services/pipeline/OutputService/OutputService.test.ts:430:22
    428| 
    429|       const output = await service.convert(nodes, state, 'markdown');
    430|       expect(output).toBe('Before\necho test\nAfter\n');
       |                      ^
    431|     });
    432| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/23]⎯

 FAIL  services/pipeline/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes
AssertionError: expected 'Before\n\n[run directive output place…' to contain 'echo test'

- Expected
+ Received

- echo test
+ Before
+
+ [run directive output placeholder]
+ After

 ❯ services/pipeline/OutputService/OutputService.test.ts:457:22
    455|       let output = await service.convert(originalNodes, state, 'llm'…
    456|       expect(output).toContain('Before');
    457|       expect(output).toContain('echo test');
       |                      ^
    458|       expect(output).toContain('After');
    459| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/23]⎯

 FAIL  services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > basic command execution > should execute simple commands
AssertionError: expected "spy" to be called with arguments: [ 'stdout', 'test output' ]

Received: 



Number of calls: 0

 ❯ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:108:38
    106|         expect.objectContaining({ cwd: '/workspace' })
    107|       );
    108|       expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', …
       |                                      ^
    109|       expect(result.state).toBe(clonedState);
    110|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/23]⎯

 FAIL  services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > basic command execution > should handle commands with variables
AssertionError: expected "spy" to be called with arguments: [ 'stdout', 'Hello World' ]

Received: 



Number of calls: 0

 ❯ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:138:38
    136|         expect.objectContaining({ cwd: '/workspace' })
    137|       );
    138|       expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', …
       |                                      ^
    139|       expect(result.state).toBe(clonedState);
    140|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/23]⎯

 FAIL  services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > basic command execution > should handle commands with path variables
AssertionError: expected "spy" to be called with arguments: [ 'stdout', 'file contents' ]

Received: 



Number of calls: 0

 ❯ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:168:38
    166|         expect.objectContaining({ cwd: '/workspace' })
    167|       );
    168|       expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', …
       |                                      ^
    169|       expect(result.state).toBe(clonedState);
    170|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/23]⎯

 FAIL  services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > output handling > should handle stdout and stderr
AssertionError: expected "spy" to be called with arguments: [ 'stderr', 'error output' ]

Received: 



Number of calls: 0

 ❯ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:251:38
    249| 
    250|       expect(stateService.clone).toHaveBeenCalled();
    251|       expect(clonedState.setTextVar).toHaveBeenCalledWith('stderr', …
       |                                      ^
    252|       expect(result.state).toBe(clonedState);
    253|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/23]⎯

 FAIL  services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > working directory handling > should use workspace root as default cwd
AssertionError: expected "spy" to be called with arguments: [ 'stdout', '/workspace' ]

Received: 



Number of calls: 0

 ❯ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:317:38
    315|         expect.objectContaining({ cwd: '/workspace' })
    316|       );
    317|       expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', …
       |                                      ^
    318|       expect(result.state).toBe(clonedState);
    319|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/23]⎯

 FAIL  services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > working directory handling > should respect custom working directory
AssertionError: expected "spy" to be called with arguments: [ 'stdout', '/custom/dir' ]

Received: 



Number of calls: 0

 ❯ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:351:38
    349|         expect.objectContaining({ cwd: '/custom/dir' })
    350|       );
    351|       expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', …
       |                                      ^
    352|       expect(result.state).toBe(clonedState);
    353|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/23]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Service Management > should create services in correct initialization order
AssertionError: expected "initialize" to be called with arguments: [ Any<Object>, Any<Object>, …(6) ]

Received: 



Number of calls: 0

 ❯ api/api.test.ts:39:23
     37|       
     38|       // Verify directive.initialize was called with services in cor…
     39|       expect(initSpy).toHaveBeenCalledWith(
       |                       ^
     40|         expect.any(Object), // validation
     41|         expect.any(Object), // state

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/23]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Transformation Mode > should enable transformation through options
AssertionError: expected '' to contain 'test'

- Expected
+ Received

- test

 ❯ api/api.test.ts:83:22
     81|       // In transformation mode, directives should be replaced
     82|       expect(result).not.toContain('[run directive output placeholde…
     83|       expect(result).toContain('test');
       |                      ^
     84|     });
     85| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/23]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Transformation Mode > should respect existing transformation state
AssertionError: expected '' to contain 'test'

- Expected
+ Received

- test

 ❯ api/api.test.ts:100:22
     98|       // Should still be in transformation mode
     99|       expect(result).not.toContain('[run directive output placeholde…
    100|       expect(result).toContain('test');
       |                      ^
    101|     });
    102|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/23]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Format Conversion > should handle execution directives correctly
AssertionError: expected '' to contain '[run directive output placeholder]'

- Expected
+ Received

- [run directive output placeholder]

 ❯ api/api.test.ts:160:22
    158| 
    159|       // Verify result
    160|       expect(result).toContain('[run directive output placeholder]');
       |                      ^
    161|       
    162|       // Verify debug data

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/23]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives
AssertionError: expected '' to contain 'Some text content'

- Expected
+ Received

- Some text content

 ❯ api/api.test.ts:187:22
    185|       
    186|       // Text content should be preserved
    187|       expect(result).toContain('Some text content');
       |                      ^
    188|       expect(result).toContain('More text');
    189|       

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[20/23]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline
AssertionError: expected '' to contain '[run directive output placeholder]'

- Expected
+ Received

- [run directive output placeholder]

 ❯ api/api.test.ts:245:22
    243|       
    244|       // Execution directive should show placeholder
    245|       expect(result).toContain('[run directive output placeholder]');
       |                      ^
    246|       
    247|       // Text content should be preserved

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[21/23]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode
AssertionError: expected '' to contain 'Content'

- Expected
+ Received

- Content

 ❯ api/api.test.ts:274:22
    272|       
    273|       // Text content should be preserved
    274|       expect(result).toContain('Content');
       |                      ^
    275|       
    276|       // Run directive should be transformed (if transformation is w…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[22/23]⎯

 FAIL  services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts > RunDirectiveHandler Transformation > transformation behavior > should preserve error handling during transformation
AssertionError: expected [Function] to throw error including 'Failed to execute command: Command fa…' but got 'Directive error (undefined): Failed t…'

Expected: "Failed to execute command: Command failed"
Received: "Directive error (undefined): Failed to execute command"

 ❯ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts:152:7
    150|       vi.mocked(fileSystemService.executeCommand).mockRejectedValue(…
    151| 
    152|       await expect(handler.execute(node, context)).rejects.toThrow('…
       |       ^
    153|     });
    154|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[23/23]⎯


===== AFTER =====