import * as fs from 'fs';
import * as path from 'path';

export interface StatsEvent {
  module: string;
  event: 'import' | 'cache-hit' | 'update' | 'install';
  timestamp: string;
  mlldVersion: string;
  anonymous?: boolean;
}

export interface AggregatedStats {
  modules: Record<string, {
    imports: number;
    cacheHits: number;
    updates: number;
    installs: number;
    lastUsed: string;
  }>;
  period: {
    start: string;
    end: string;
  };
  mlldVersion: string;
}

export class StatsCollector {
  private readonly statsFile: string;
  private readonly enabled: boolean;

  constructor(
    private readonly basePath: string,
    enabled = true
  ) {
    this.statsFile = path.join(basePath, 'stats', 'usage.jsonl');
    this.enabled = enabled;
  }

  async track(module: string, event: StatsEvent['event']): Promise<void> {
    if (!this.enabled) return;

    const stats: StatsEvent = {
      module,
      event,
      timestamp: new Date().toISOString(),
      mlldVersion: this.getMlldVersion(),
      anonymous: true
    };

    try {
      const dir = path.dirname(this.statsFile);
      await fs.promises.mkdir(dir, { recursive: true });
      
      // Append as JSON Lines
      await fs.promises.appendFile(
        this.statsFile,
        JSON.stringify(stats) + '\n'
      );
    } catch {
      // Silently ignore stats collection errors
    }
  }

  async getStats(): Promise<StatsEvent[]> {
    try {
      const content = await fs.promises.readFile(this.statsFile, 'utf8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  async aggregateStats(since?: Date): Promise<AggregatedStats> {
    const events = await this.getStats();
    const filtered = since 
      ? events.filter(e => new Date(e.timestamp) > since)
      : events;

    const modules: AggregatedStats['modules'] = {};

    for (const event of filtered) {
      if (!modules[event.module]) {
        modules[event.module] = {
          imports: 0,
          cacheHits: 0,
          updates: 0,
          installs: 0,
          lastUsed: event.timestamp
        };
      }

      const stats = modules[event.module];
      switch (event.event) {
        case 'import':
          stats.imports++;
          break;
        case 'cache-hit':
          stats.cacheHits++;
          break;
        case 'update':
          stats.updates++;
          break;
        case 'install':
          stats.installs++;
          break;
      }

      // Update last used
      if (new Date(event.timestamp) > new Date(stats.lastUsed)) {
        stats.lastUsed = event.timestamp;
      }
    }

    const timestamps = filtered.map(e => new Date(e.timestamp));
    const period = {
      start: timestamps.length > 0 ? new Date(Math.min(...timestamps.map(d => d.getTime()))).toISOString() : new Date().toISOString(),
      end: timestamps.length > 0 ? new Date(Math.max(...timestamps.map(d => d.getTime()))).toISOString() : new Date().toISOString()
    };

    return {
      modules,
      period,
      mlldVersion: this.getMlldVersion()
    };
  }

  async clearStats(): Promise<void> {
    try {
      await fs.promises.unlink(this.statsFile);
    } catch {
      // File might not exist
    }
  }

  async exportForSharing(): Promise<AggregatedStats> {
    // Aggregate all stats for sharing
    const stats = await this.aggregateStats();
    
    // Remove any potentially identifying information
    for (const module of Object.values(stats.modules)) {
      // Round timestamps to nearest hour for privacy
      const date = new Date(module.lastUsed);
      date.setMinutes(0, 0, 0);
      module.lastUsed = date.toISOString();
    }

    return stats;
  }

  private getMlldVersion(): string {
    try {
      const packageJson = require('../../../package.json');
      return packageJson.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // Check if telemetry is enabled
  isEnabled(): boolean {
    return this.enabled;
  }

  // Get stats file size
  async getStatsSize(): Promise<number> {
    try {
      const stats = await fs.promises.stat(this.statsFile);
      return stats.size;
    } catch {
      return 0;
    }
  }
}