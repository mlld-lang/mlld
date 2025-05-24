# Services and Methods Using AST Node Signatures

The following list captures every service method that currently accepts or returns
`MeldNode` (or more specific node types) from `@core/syntax/types`. These
signatures will need updating when the new `ASTNode` union is introduced.

## ParserService
- `IParserService.parseString(content: string, options?): Promise<MeldNode[]>`
- `IParserService.parseFile(filePath: string): Promise<MeldNode[]>`
- `IParserService.parse(content: string, filePath?): Promise<MeldNode[]>`
- `IParserService.parseWithLocations(content: string, filePath?): Promise<MeldNode[]>`
- `IParserServiceClient.parseString(content: string, options?): Promise<MeldNode[]>`
- `IParserServiceClient.parseFile(filePath: string): Promise<MeldNode[]>`

## InterpreterService
- `IInterpreterService.interpret(nodes: MeldNode[], options?, initialState?): Promise<IStateService>`
- `IInterpreterService.interpretNode(node: MeldNode, state: IStateService, options?): Promise<[IStateService, DirectiveResult | undefined]>`
- `IInterpreterServiceClient.interpret(nodes: MeldNode[], options?, initialState?, circularityService?): Promise<IStateService>`

## ResolutionService
- `IResolutionService.resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>`
- `IResolutionService.resolveNodes(nodes: InterpolatableValue, context: ResolutionContext): Promise<string>`
- `IResolutionServiceClient.resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>`
- `IResolutionServiceClient.resolveNodes(nodes: InterpolatableValue, context: ResolutionContext): Promise<string>`

## OutputService
- `IOutputService.convert(nodes: MeldNode[], state: IStateService, format: string, options?): Promise<string>`
- `IOutputService.registerConverter(converter: (nodes: MeldNode[], state: IStateService, options?) => Promise<string>)`

## StateService
- `IStateService.getNodes(): MeldNode[]`
- `IStateService.getTransformedNodes(): MeldNode[]`
- `IStateService.setTransformedNodes(nodes: MeldNode[]): Promise<void>`
- `IStateService.transformNode(index: number, replacement: MeldNode | MeldNode[] | undefined): Promise<void>`
- `IStateService.addNode(node: MeldNode): Promise<void>`

This inventory should be consulted when updating method signatures to use the
new discriminated union type.
