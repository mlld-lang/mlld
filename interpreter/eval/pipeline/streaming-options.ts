export type StreamingOutputFormat = 'text' | 'json' | 'ansi';

export interface StreamingVisibility {
  showThinking?: boolean;
  showTools?: boolean;
  showMetadata?: boolean;
  showCustom?: boolean;
  showAll?: boolean;
}

export interface StreamingOptions {
  enabled?: boolean;
  format?: StreamingOutputFormat;
  visibility?: StreamingVisibility;
  accumulate?: boolean;
  keepRawEvents?: boolean;
  streamFormat?: string;
  ansiEnabled?: boolean;
}

export const defaultStreamingOptions: StreamingOptions = {
  enabled: true,
  format: 'text',
  visibility: {
    showThinking: false,
    showTools: false,
    showMetadata: false,
    showCustom: false,
    showAll: false
  },
  accumulate: true,
  keepRawEvents: false,
  ansiEnabled: true
};
