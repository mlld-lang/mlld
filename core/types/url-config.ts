export interface ResolvedURLConfig {
  enabled: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  allowedProtocols: string[];
  maxSize: number;
  timeout: number;
  warnOnInsecureProtocol: boolean;
  cache: {
    enabled: boolean;
    defaultTTL: number;
    rules: Array<{
      pattern: RegExp;
      ttl: number;
    }>;
  };
}
