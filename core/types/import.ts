/**
 * Import directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import { ImportValues, ImportWildcardNode, ImportReferenceNode } from './values';
import { ImportRaw } from './raw';
import { ImportMeta } from './meta';
import { TimeDurationNode } from './primitives';
import { WithClause } from './run';
import { ImportType, DataLabel } from './security';

/**
 * Base Import directive node
 */
export interface ImportDirectiveNode extends TypedDirectiveNode<'import', 'importAll' | 'importSelected' | 'importNamespace' | 'importPolicy'> {
  values: ImportValues;
  raw: ImportRaw;
  meta: ImportMeta;
}

/**
 * Import All directive - wildcard imports
 */
export interface ImportAllDirectiveNode extends ImportDirectiveNode {
  subtype: 'importAll';
  values: {
    imports: [ImportWildcardNode]; // Always a single-item array with '*'
    namespace?: ImportValues['namespace'];
    path: ImportValues['path'];
    importType?: ImportType;
    cachedDuration?: TimeDurationNode;
    withClause?: WithClause;
    securityLabels?: DataLabel[];
  };
}

/**
 * Import Selected directive - specific imports
 */
export interface ImportSelectedDirectiveNode extends ImportDirectiveNode {
  subtype: 'importSelected';
  values: {
    imports: ImportReferenceNode[]; // One or more items
    namespace?: ImportValues['namespace'];
    path: ImportValues['path'];
    importType?: ImportType;
    cachedDuration?: TimeDurationNode;
    withClause?: WithClause;
    securityLabels?: DataLabel[];
  };
}

/**
 * Import Namespace directive - wildcard imports with alias
 */
export interface ImportNamespaceDirectiveNode extends ImportDirectiveNode {
  subtype: 'importNamespace';
  values: {
    imports: [ImportWildcardNode]; // Always a single-item array with '*' and alias
    namespace?: ImportValues['namespace'];
    path: ImportValues['path'];
    importType?: ImportType;
    cachedDuration?: TimeDurationNode;
    withClause?: WithClause;
    securityLabels?: DataLabel[];
  };
}

export interface ImportPolicyDirectiveNode extends ImportDirectiveNode {
  subtype: 'importPolicy';
  values: {
    imports: [ImportWildcardNode];
    namespace: ImportValues['namespace'];
    path: ImportValues['path'];
    importType?: ImportType;
    cachedDuration?: TimeDurationNode;
    withClause?: WithClause;
    securityLabels?: DataLabel[];
  };
}
