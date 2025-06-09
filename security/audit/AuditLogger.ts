import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@core/utils/logger';

/**
 * Types of audit events
 */
export enum AuditEventType {
  COMMAND_EXECUTION = 'command_execution',
  COMMAND_BLOCKED = 'command_blocked',
  PATH_ACCESS = 'path_access',
  PATH_BLOCKED = 'path_blocked',
  IMPORT_RESOLVED = 'import_resolved',
  IMPORT_APPROVED = 'import_approved',
  IMPORT_BLOCKED = 'import_blocked',
  POLICY_LOADED = 'policy_loaded',
  TAINT_TRACKED = 'taint_tracked'
}

/**
 * Audit event structure
 */
export interface AuditEvent {
  type: AuditEventType;
  details: Record<string, any>;
  timestamp?: string;
  user?: string;
  pid?: number;
}

/**
 * Audit log entry as written to file
 */
export interface AuditLogEntry {
  timestamp: string;
  event: AuditEventType;
  details: AuditEvent;
  user: string;
  pid: number;
}

/**
 * Audit logger for security events
 */
export class AuditLogger {
  private logPath: string;
  private writeStream?: fs.WriteStream;
  private initialized = false;
  
  constructor(logPath: string) {
    this.logPath = logPath;
  }
  
  /**
   * Initialize the audit logger
   */
  private async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.logPath);
      await fs.promises.mkdir(logDir, { recursive: true });
      
      // Open write stream in append mode
      this.writeStream = fs.createWriteStream(this.logPath, {
        flags: 'a',
        encoding: 'utf8'
      });
      
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize audit logger:', error);
      // Don't throw - audit logging failure shouldn't break the app
    }
  }
  
  /**
   * Log an audit event
   */
  async log(event: AuditEvent): Promise<void> {
    try {
      await this.init();
      
      const entry: AuditLogEntry = {
        timestamp: event.timestamp || new Date().toISOString(),
        event: event.type,
        details: event,
        user: event.user || process.env.USER || 'unknown',
        pid: event.pid || process.pid
      };
      
      // Write as JSON line
      const line = JSON.stringify(entry) + '\n';
      
      if (this.writeStream) {
        await new Promise<void>((resolve, reject) => {
          this.writeStream!.write(line, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else {
        // Fallback to sync append if stream failed
        await fs.promises.appendFile(this.logPath, line, 'utf8');
      }
    } catch (error) {
      logger.debug('Audit log write failed:', error);
      // Don't throw - audit logging failure shouldn't break the app
    }
  }
  
  /**
   * Rotate log files based on retention policy
   */
  async rotate(retentionDays: number): Promise<void> {
    try {
      // Close current stream
      if (this.writeStream) {
        await new Promise<void>((resolve) => {
          this.writeStream!.end(() => resolve());
        });
        this.writeStream = undefined;
        this.initialized = false;
      }
      
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      // Read existing log
      const content = await fs.promises.readFile(this.logPath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Filter entries newer than cutoff
      const retained: string[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditLogEntry;
          const entryDate = new Date(entry.timestamp);
          if (entryDate > cutoffDate) {
            retained.push(line);
          }
        } catch {
          // Skip malformed lines
        }
      }
      
      // Archive old log
      const archivePath = `${this.logPath}.${cutoffDate.toISOString().split('T')[0]}.archive`;
      await fs.promises.rename(this.logPath, archivePath);
      
      // Write retained entries to new log
      if (retained.length > 0) {
        await fs.promises.writeFile(this.logPath, retained.join('\n') + '\n', 'utf8');
      }
      
      logger.info(`Rotated audit log, archived to ${archivePath}`);
    } catch (error) {
      logger.error('Audit log rotation failed:', error);
    }
  }
  
  /**
   * Close the logger
   */
  async close(): Promise<void> {
    if (this.writeStream) {
      await new Promise<void>((resolve) => {
        this.writeStream!.end(() => resolve());
      });
      this.writeStream = undefined;
      this.initialized = false;
    }
  }
}