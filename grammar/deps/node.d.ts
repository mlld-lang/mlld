declare module 'crypto' {
  export function randomUUID(): string;
}
declare const process: { env: Record<string, string | undefined> };
