import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PinoLogger } from 'nestjs-pino';
import { Server, Socket } from 'socket.io';
import { INTEGRATIONS, isIntegration } from './integrations';
import type { Integration, IntegrationLogRecord } from './integrations';
import { LogStreamSink } from './log-stream.sink';

type SubscribeTarget = Integration | 'all';

@WebSocketGateway({
  cors: { origin: true },
  namespace: '/logs',
})
export class LogsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly unsubscribers = new Map<string, () => void>();

  constructor(
    private readonly stream: LogStreamSink,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LogsGateway.name);
  }

  handleConnection(client: Socket): void {
    this.logger.info({ socketId: client.id }, 'logs.socket.connected');
  }

  handleDisconnect(client: Socket): void {
    const unsub = this.unsubscribers.get(client.id);
    if (unsub) {
      unsub();
      this.unsubscribers.delete(client.id);
    }
    this.logger.info({ socketId: client.id }, 'logs.socket.disconnected');
  }

  @SubscribeMessage('logs.subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { integration?: string },
  ) {
    const raw = (body?.integration || 'all').trim().toLowerCase();
    const target: SubscribeTarget =
      raw === 'all' || isIntegration(raw) ? raw : 'all';

    const prev = this.unsubscribers.get(client.id);
    if (prev) {
      prev();
      this.unsubscribers.delete(client.id);
    }

    const backlog = this.stream.backlog(target);
    client.emit('logs.backlog', {
      integration: target,
      integrations: INTEGRATIONS,
      lines: backlog.map(serializeLine),
    });

    const unsub = this.stream.onLine((record) => {
      if (target !== 'all' && record.integration !== target) return;
      client.emit('logs.line', serializeLine(record));
    });
    this.unsubscribers.set(client.id, unsub);

    this.logger.info(
      { socketId: client.id, integration: target, backlog: backlog.length },
      'logs.socket.subscribe',
    );
    return { ok: true, integration: target, backlog: backlog.length };
  }

  @SubscribeMessage('logs.list')
  handleList() {
    return { integrations: INTEGRATIONS };
  }
}

function serializeLine(record: IntegrationLogRecord) {
  return {
    at: record.at,
    integration: record.integration,
    kind: record.kind,
    op: record.op,
    status: record.status,
    durationMs: record.durationMs,
    correlationId: record.correlationId,
    pretty: record.pretty,
  };
}
