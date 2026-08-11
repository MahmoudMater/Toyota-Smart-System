import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  AgentDispatchClient,
  DataPacket_Kind,
  RoomServiceClient,
} from 'livekit-server-sdk';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';

export interface LiveKitJoinInfo {
  url: string;
  token: string;
  room: string;
  adapter: 'bey';
}

export const KIOSK_SPEAK_TOPIC = 'kiosk.speak';
export const AGENT_NAME_DEFAULT = 'tamkeen-avatar';

@Injectable()
export class LiveKitService {
  private readonly rooms: RoomServiceClient | null;
  private readonly dispatch: AgentDispatchClient | null;
  private readonly url: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly agentName: string;
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LiveKitService.name);
    this.url = this.config.get('LIVEKIT_URL', { infer: true }) || '';
    this.apiKey = this.config.get('LIVEKIT_API_KEY', { infer: true }) || '';
    this.apiSecret =
      this.config.get('LIVEKIT_API_SECRET', { infer: true }) || '';
    this.agentName =
      this.config.get('LIVEKIT_AGENT_NAME', { infer: true }) ||
      AGENT_NAME_DEFAULT;
    const adapter = this.config.get('AVATAR_ADAPTER', { infer: true });
    this.enabled =
      adapter === 'bey' && !!(this.url && this.apiKey && this.apiSecret);

    if (this.enabled) {
      this.rooms = new RoomServiceClient(this.url, this.apiKey, this.apiSecret);
      this.dispatch = new AgentDispatchClient(
        this.url,
        this.apiKey,
        this.apiSecret,
      );
    } else {
      this.rooms = null;
      this.dispatch = null;
      if (adapter === 'bey') {
        this.logger.warn(
          'AVATAR_ADAPTER=bey but LIVEKIT_URL/API_KEY/SECRET incomplete — avatar stays canvas',
        );
      }
    }
  }

  isBeyEnabled(): boolean {
    return this.enabled;
  }

  roomName(gateId: string, sessionId: string): string {
    return `kiosk-${gateId}-${sessionId}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  async ensureRoomAndAgent(params: {
    gateId: string;
    sessionId: string;
  }): Promise<LiveKitJoinInfo | null> {
    if (!this.enabled || !this.rooms || !this.dispatch) return null;

    const room = this.roomName(params.gateId, params.sessionId);
    try {
      await this.rooms.createRoom({
        name: room,
        emptyTimeout: 60 * 30,
        maxParticipants: 8,
      });
    } catch (err) {
      // Room may already exist — ignore conflict-style errors
      this.logger.debug({ err, room }, 'livekit.room.create');
    }

    try {
      const existing = await this.dispatch.listDispatch(room);
      const hasAgent = existing.some((d) => d.agentName === this.agentName);
      if (!hasAgent) {
        await this.dispatch.createDispatch(room, this.agentName, {
          metadata: JSON.stringify({
            sessionId: params.sessionId,
            gateId: params.gateId,
          }),
        });
        this.logger.info({ room, agent: this.agentName }, 'livekit.agent.dispatch');
      }
    } catch (err) {
      this.logger.error({ err, room }, 'livekit.agent.dispatch.failed');
      throw new ServiceUnavailableException(
        'Failed to dispatch LiveKit avatar agent. Is avatar-agent running?',
      );
    }

    const token = await this.mintBrowserToken(room, params.sessionId);
    return { url: this.url, token, room, adapter: 'bey' };
  }

  async mintBrowserToken(room: string, sessionId: string): Promise<string> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('LiveKit avatar is not enabled');
    }
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: `kiosk-ui-${sessionId}`,
      name: 'Kiosk UI',
      ttl: '2h',
    });
    at.addGrant({
      roomJoin: true,
      room,
      canSubscribe: true,
      canPublish: false,
      canPublishData: true,
    });
    return at.toJwt();
  }

  async speak(params: {
    gateId: string;
    sessionId: string;
    text: string;
    lang: string;
  }): Promise<void> {
    if (!this.enabled || !this.rooms || !params.text?.trim()) return;

    const room = this.roomName(params.gateId, params.sessionId);
    const payload = new TextEncoder().encode(
      JSON.stringify({
        type: KIOSK_SPEAK_TOPIC,
        text: params.text,
        lang: params.lang || 'en',
        sessionId: params.sessionId,
      }),
    );

    try {
      await this.rooms.sendData(room, payload, DataPacket_Kind.RELIABLE, {
        topic: KIOSK_SPEAK_TOPIC,
      });
      this.logger.info(
        { room, chars: params.text.length, lang: params.lang },
        'livekit.kiosk.speak',
      );
    } catch (err) {
      this.logger.error({ err, room }, 'livekit.kiosk.speak.failed');
    }
  }
}
