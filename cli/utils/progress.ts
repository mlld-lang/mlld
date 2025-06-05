import chalk from 'chalk';

export interface ProgressOptions {
  style?: 'emoji' | 'text';
  verbose?: boolean;
}

export class ProgressIndicator {
  private current: string | null = null;
  private options: Required<ProgressOptions>;

  constructor(options: ProgressOptions = {}) {
    this.options = {
      style: options.style || 'emoji',
      verbose: options.verbose || false
    };
  }

  start(message: string): void {
    this.current = message;
    if (this.options.style === 'emoji') {
      process.stdout.write(`⏳ ${message}...`);
    } else {
      process.stdout.write(`[..] ${message}...`);
    }
  }

  update(message: string): void {
    if (this.current) {
      // Clear current line and write new message
      process.stdout.write('\r\x1b[K');
    }
    this.start(message);
  }

  succeed(message: string): void {
    if (this.current) {
      process.stdout.write('\r\x1b[K');
    }
    
    if (this.options.style === 'emoji') {
      console.log(`✅ ${chalk.green(message)}`);
    } else {
      console.log(`[✓] ${chalk.green(message)}`);
    }
    this.current = null;
  }

  fail(message: string): void {
    if (this.current) {
      process.stdout.write('\r\x1b[K');
    }
    
    if (this.options.style === 'emoji') {
      console.log(`❌ ${chalk.red(message)}`);
    } else {
      console.log(`[✗] ${chalk.red(message)}`);
    }
    this.current = null;
  }

  warn(message: string): void {
    if (this.current) {
      process.stdout.write('\r\x1b[K');
    }
    
    if (this.options.style === 'emoji') {
      console.log(`⚠️  ${chalk.yellow(message)}`);
    } else {
      console.log(`[!] ${chalk.yellow(message)}`);
    }
    this.current = null;
  }

  info(message: string): void {
    if (this.options.verbose) {
      if (this.current) {
        process.stdout.write('\r\x1b[K');
        console.log(`ℹ️  ${chalk.cyan(message)}`);
        this.start(this.current);
      } else {
        console.log(`ℹ️  ${chalk.cyan(message)}`);
      }
    }
  }

  finish(): void {
    if (this.current) {
      process.stdout.write('\r\x1b[K');
      this.current = null;
    }
  }
}

export class MultiProgress {
  private tasks: Map<string, { message: string; status: 'pending' | 'running' | 'done' | 'failed' }> = new Map();
  private options: Required<ProgressOptions>;

  constructor(options: ProgressOptions = {}) {
    this.options = {
      style: options.style || 'emoji',
      verbose: options.verbose || false
    };
  }

  addTask(id: string, message: string): void {
    this.tasks.set(id, { message, status: 'pending' });
    this.render();
  }

  startTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'running';
      this.render();
    }
  }

  completeTask(id: string, finalMessage?: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'done';
      if (finalMessage) {
        task.message = finalMessage;
      }
      this.render();
    }
  }

  failTask(id: string, errorMessage?: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'failed';
      if (errorMessage) {
        task.message = errorMessage;
      }
      this.render();
    }
  }

  private render(): void {
    // Clear screen and render all tasks
    process.stdout.write('\r\x1b[K');
    
    for (const [id, task] of this.tasks) {
      const icon = this.getStatusIcon(task.status);
      const color = this.getStatusColor(task.status);
      console.log(`${icon} ${color(task.message)}`);
    }
    
    // Move cursor back up
    if (this.tasks.size > 0) {
      process.stdout.write(`\x1b[${this.tasks.size}A`);
    }
  }

  private getStatusIcon(status: string): string {
    if (this.options.style === 'emoji') {
      switch (status) {
        case 'pending': return '⏸️ ';
        case 'running': return '⏳';
        case 'done': return '✅';
        case 'failed': return '❌';
        default: return '❓';
      }
    } else {
      switch (status) {
        case 'pending': return '[⏸]';
        case 'running': return '[..]';
        case 'done': return '[✓]';
        case 'failed': return '[✗]';
        default: return '[?]';
      }
    }
  }

  private getStatusColor(status: string): (text: string) => string {
    switch (status) {
      case 'pending': return chalk.gray;
      case 'running': return chalk.cyan;
      case 'done': return chalk.green;
      case 'failed': return chalk.red;
      default: return chalk.white;
    }
  }

  finish(): void {
    // Move cursor to end and clear
    if (this.tasks.size > 0) {
      process.stdout.write(`\x1b[${this.tasks.size}B`);
    }
    process.stdout.write('\r\x1b[K');
  }
}