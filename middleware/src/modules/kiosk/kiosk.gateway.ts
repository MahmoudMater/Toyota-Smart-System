import { Inject, forwardRef } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
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
import { DomainEvents } from '../../events/domain-events';
import type { CheckinDisplayPayload } from '../../events/domain-events';
import { CheckinService } from '../checkin/checkin.service';
import { KioskService } from './kiosk.service';
import { PublicSession, SessionInput } from './state-machine';

export const gateRoom = (gateId: string) => `gate:${gateId}`;

@WebSocketGateway({
  cors: { origin: true },
  namespace: '/kiosk',
})
export class KioskGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(forwardRef(() => KioskService))
    private readonly kioskService: KioskService,
    private readonly checkin: CheckinService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(KioskGateway.name);
  }

  handleConnection(client: Socket): void {
    this.logger.info({ socketId: client.id }, 'kiosk.socket.connected');
  }

  handleDisconnect(client: Socket): void {
    this.logger.info({ socketId: client.id }, 'kiosk.socket.disconnected');
  }

  @SubscribeMessage('kiosk.join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { gateId?: string },
  ) {
    const gateId = (body?.gateId || 'gate-1').trim();
    const room = gateRoom(gateId);
    void client.join(room);
    this.logger.info(
      { socketId: client.id, gateId, room },
      'kiosk.socket.join',
    );
    const display = await this.checkin.getDisplay(gateId);
    client.emit('checkin.display', display);
    return { ok: true, gateId, room, display };
  }

  @SubscribeMessage('session.input')
  async handleInput(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: SessionInput & { sessionId: string; correlationId?: string },
  ) {
    this.logger.info(
      { socketId: client.id, sessionId: body.sessionId, source: body.source },
      'kiosk.socket.session.input',
    );
    const session = await this.kioskService.handleSessionInput(
      body.sessionId,
      {
        source: body.source,
        text: body.text,
        choice: body.choice,
        phone_digits: body.phone_digits,
      },
      body.correlationId,
    );
    return { ok: !!session, session };
  }

  @OnEvent(DomainEvents.CheckinDisplayUpdated)
  onCheckinDisplay(display: CheckinDisplayPayload): void {
    this.pushCheckinDisplay(display);
  }

  pushCheckinDisplay(display: CheckinDisplayPayload): void {
    const room = gateRoom(display.gateId);
    this.logger.info(
      {
        gateId: display.gateId,
        room,
        mode: display.mode,
      },
      'kiosk.socket.checkin.display',
    );
    this.server?.to(room).emit('checkin.display', display);
  }

  /** @deprecated Voice UI path — kept for unused session tooling. */
  pushSession(gateId: string, session: PublicSession): void {
    const room = gateRoom(gateId);
    this.server?.to(room).emit('session.update', session);
  }
}
