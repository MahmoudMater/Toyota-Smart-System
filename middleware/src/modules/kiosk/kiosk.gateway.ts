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
import { PublicSession, SessionInput } from './state-machine';

export const gateRoom = (gateId: string) => `gate:${gateId}`;

@WebSocketGateway({
  cors: { origin: true },
  namespace: '/kiosk',
})
export class KioskGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private kioskService?: {
    handleSessionInput: (
      sessionId: string,
      input: SessionInput,
      correlationId?: string,
    ) => Promise<PublicSession | null>;
  };

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(KioskGateway.name);
  }

  /** Avoid circular DI: set by KioskModule after both are constructed. */
  bindService(service: {
    handleSessionInput: (
      sessionId: string,
      input: SessionInput,
      correlationId?: string,
    ) => Promise<PublicSession | null>;
  }): void {
    this.kioskService = service;
  }

  handleConnection(client: Socket): void {
    this.logger.info({ socketId: client.id }, 'kiosk.socket.connected');
  }

  handleDisconnect(client: Socket): void {
    this.logger.info({ socketId: client.id }, 'kiosk.socket.disconnected');
  }

  @SubscribeMessage('kiosk.join')
  handleJoin(
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
    return { ok: true, gateId, room };
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
    if (!this.kioskService) {
      return { ok: false, error: 'service_not_ready' };
    }
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

  pushSession(gateId: string, session: PublicSession): void {
    const room = gateRoom(gateId);
    this.logger.info(
      {
        gateId,
        room,
        sessionId: session.session_id,
        state: session.state,
      },
      'kiosk.socket.session.push',
    );
    this.server?.to(room).emit('session.update', session);
  }
}
