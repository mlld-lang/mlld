export class TextExtractor {
  static extract(nodes: any[]): string {
    let text = '';
    for (const node of nodes) {
      if (node.type === 'Text' && node.content) {
        text += node.content;
      } else if (node.content) {
        text += node.content;
      } else if (node.value) {
        text += node.value;
      } else if (node.values && Array.isArray(node.values)) {
        text += this.extract(node.values);
      }
    }
    return text.trim();
  }
  
  static extractFromNode(node: any): string {
    if (!node) return '';
    
    if (typeof node === 'string') return node;
    if (typeof node === 'number' || typeof node === 'boolean') return String(node);
    
    if (node.content) return node.content;
    if (node.value) return String(node.value);
    if (node.identifier) return node.identifier;
    if (node.name) return node.name;
    
    if (Array.isArray(node)) {
      return this.extract(node);
    }
    
    return '';
  }
}