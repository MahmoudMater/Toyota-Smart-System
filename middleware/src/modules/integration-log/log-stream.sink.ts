import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { Integration, IntegrationLogRecord } from './integrations';

const DEFAULT_CAPACITY = 500;

@Injectable()
export class LogStreamSink {
  private readonly buffers = new Map<string, IntegrationLogRecord[]>();
  private readonly capacity: number;
  private readonly emitter = new EventEmitter();

  constructor() {
    this.capacity = DEFAULT_CAPACITY;
    this.emitter.setMaxListeners(50);
  }

  write(record: IntegrationLogRecord): void {
    this.push('all', record);
    this.push(record.integration, record);
    this.emitter.emit('line', record);
  }

  backlog(integration: Integration | 'all' = 'all'): IntegrationLogRecord[] {
    return [...(this.buffers.get(integration) ?? [])];
  }

  onLine(listener: (record: IntegrationLogRecord) => void): () => void {
    this.emitter.on('line', listener);
    return () => {
      this.emitter.off('line', listener);
    };
  }

  private push(key: string, record: IntegrationLogRecord): void {
    let buf = this.buffers.get(key);
    if (!buf) {
      buf = [];
      this.buffers.set(key, buf);
    }
    buf.push(record);
    if (buf.length > this.capacity) {
      buf.splice(0, buf.length - this.capacity);
    }
  }
}
