import { VariableMetadataUtils } from '@core/types/variable';

type SerializedMetadata = ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>;

export class MetadataMapParser {
  extractMetadataMap(
    moduleObject: Record<string, any>
  ): Record<string, SerializedMetadata | undefined> | undefined {
    const container = (moduleObject as Record<string, any>).__metadata__;
    if (!container || typeof container !== 'object') {
      return undefined;
    }

    const result: Record<string, SerializedMetadata | undefined> = {};
    for (const [key, value] of Object.entries(container)) {
      result[key] = value as SerializedMetadata;
    }
    return result;
  }
}
