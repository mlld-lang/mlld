declare module 'meld-spec' {
  export interface Location {
    start: { line: number; column: number };
    end: { line: number; column: number };
  }

  export interface DirectiveNode {
    type: 'Directive';
    directive: {
      kind: DirectiveKind;
      [key: string]: any;
    };
    location?: Location;
  }

  export interface TextNode {
    type: 'Text';
    content: string;
    location?: Location;
  }

  export interface CodeFenceNode {
    type: 'CodeFence';
    content: string;
    language?: string;
    location?: Location;
  }

  export type MeldNode = DirectiveNode | TextNode | CodeFenceNode;
  export type DirectiveKind = 'text' | 'data' | 'run' | 'define' | 'path' | 'embed' | 'import';
} 