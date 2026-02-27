import * as fs from 'fs';
import type { StreamEvent } from '../stream-bus';
import type { StreamSink } from './interfaces';

export interface RawJsonMirrorSinkOptions {
  showJson?: boolean;
  appendJson?: string;
  stderrWriter?: NodeJS.WriteStream;
  now?: Date;
}

function defaultAppendJsonPath(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-stream.jsonl`;
}

function resolveAppendJsonPath(appendJson: string | undefined, now: Date): string | null {
  if (appendJson === undefined) {
    return null;
  }
  if (appendJson.trim().length > 0) {
    return appendJson;
  }
  return defaultAppendJsonPath(now);
}

/**
 * Mirrors raw streaming chunks for debugging workflows:
 * - `showJson`: writes raw chunks to stderr
 * - `appendJson`: appends raw chunks to a JSONL file
 */
export class RawJsonMirrorSink implements StreamSink {
  private readonly mirrorToStderr: boolean;
  private readonly stderrWriter: NodeJS.WriteStream;
  private readonly appendStream: fs.WriteStream | null;

  constructor(options: RawJsonMirrorSinkOptions = {}) {
    this.mirrorToStderr = options.showJson === true;
    this.stderrWriter = options.stderrWriter ?? process.stderr;
    const appendPath = resolveAppendJsonPath(options.appendJson, options.now ?? new Date());
    this.appendStream = appendPath ? fs.createWriteStream(appendPath, { flags: 'a' }) : null;
  }

  handle(event: StreamEvent): void {
    if (event.type !== 'CHUNK' || event.source !== 'stdout') {
      return;
    }
    if (!event.chunk) {
      return;
    }

    if (this.mirrorToStderr) {
      this.stderrWriter.write(event.chunk);
    }
    if (this.appendStream) {
      this.appendStream.write(event.chunk);
    }
  }

  stop(): void {
    this.appendStream?.end();
  }
}
