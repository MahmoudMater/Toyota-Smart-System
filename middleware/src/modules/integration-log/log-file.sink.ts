import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import type { Env } from '../../config/env.validation';
import type { Integration, IntegrationLogRecord } from './integrations';
import { INTEGRATIONS } from './integrations';

@Injectable()
export class LogFileSink implements OnModuleInit {
  private readonly sizes = new Map<string, number>();
  private dir = 'logs';
  private maxBytes = 10 * 1024 * 1024;
  private rotateKeep = 3;
  private enabled = true;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    this.enabled = this.config.get('INTEGRATION_LOG_ENABLED', { infer: true });
    if (!this.enabled) return;

    this.dir = this.config.get('INTEGRATION_LOG_DIR', { infer: true });
    const maxMb = this.config.get('INTEGRATION_LOG_MAX_FILE_MB', {
      infer: true,
    });
    this.maxBytes = Math.max(1, maxMb) * 1024 * 1024;
    this.rotateKeep = this.config.get('INTEGRATION_LOG_ROTATE_KEEP', {
      infer: true,
    });

    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  write(record: IntegrationLogRecord): void {
    if (!this.enabled) return;
    const line = `${record.pretty}\n`;
    this.append(record.integration, line);
    this.append('integrations', line);
  }

  /** Exposed for tests. */
  filePath(name: Integration | 'integrations'): string {
    return join(this.dir, `${name}.log`);
  }

  private append(name: Integration | 'integrations', line: string): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
    const path = this.filePath(name);
    let size = this.sizes.get(name);
    if (size == null) {
      size = existsSync(path) ? statSync(path).size : 0;
      this.sizes.set(name, size);
    }

    const lineBytes = Buffer.byteLength(line);
    if (size + lineBytes > this.maxBytes && size > 0) {
      this.rotate(name);
      size = 0;
    }

    appendFileSync(path, line);
    this.sizes.set(name, size + lineBytes);
  }

  private rotate(name: Integration | 'integrations'): void {
    const base = this.filePath(name);
    const oldest = `${base}.${this.rotateKeep}`;
    if (existsSync(oldest)) {
      try {
        unlinkSync(oldest);
      } catch {
        /* ignore */
      }
    }
    for (let i = this.rotateKeep - 1; i >= 1; i--) {
      const src = `${base}.${i}`;
      const dest = `${base}.${i + 1}`;
      if (existsSync(src)) {
        try {
          renameSync(src, dest);
        } catch {
          /* ignore */
        }
      }
    }
    if (existsSync(base)) {
      try {
        renameSync(base, `${base}.1`);
      } catch {
        /* ignore */
      }
    }
    this.sizes.set(name, 0);
  }

  /** Test helper: override max file size in bytes. */
  setMaxBytesForTests(bytes: number): void {
    this.maxBytes = bytes;
  }

  /** Test helper: seed tracked size for a file. */
  setSizeForTests(name: Integration | 'integrations', bytes: number): void {
    this.sizes.set(name, bytes);
  }

  /** All known integration file stems (for docs / UI). */
  static knownFiles(): string[] {
    return [...INTEGRATIONS, 'integrations'].map((n) => `${n}.log`);
  }
}
