/**
 * Tamkeen kiosk speaker agent — Beyond Presence avatar + ElevenLabs TTS.
 * Nest owns dialogue; this worker only speaks on `kiosk.speak` data packets.
 */
import {
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as bey from '@livekit/agents-plugin-bey';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import { RoomEvent } from '@livekit/rtc-node';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Prefer middleware/.env (shared with Nest)
loadDotenv({ path: resolve(process.cwd(), '../.env') });
loadDotenv({ path: resolve(process.cwd(), '.env') });

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || 'tamkeen-avatar';
const AVATAR_ID =
  process.env.BEY_AVATAR_ID || '694c83e2-8895-4a98-bd16-56332ca3f449';
const SPEAK_TOPIC = 'kiosk.speak';
// LiveKit's ElevenLabs plugin uses WS multi-stream-input — eleven_v3 returns 403 there.
// Nest HTTP TTS can keep ELEVENLABS_TTS_MODEL_ID=eleven_v3; avatar needs a streaming model.
const AVATAR_TTS_MODEL =
  process.env.ELEVENLABS_AVATAR_TTS_MODEL_ID ||
  process.env.ELEVENLABS_TTS_MODEL_ID ||
  'eleven_flash_v2_5';
const STREAMING_TTS_MODELS = new Set([
  'eleven_flash_v2_5',
  'eleven_flash_v2',
  'eleven_turbo_v2_5',
  'eleven_turbo_v2',
  'eleven_multilingual_v2',
  'eleven_multilingual_v1',
  'eleven_monolingual_v1',
]);

function resolveAvatarTtsModel(requested: string): string {
  if (requested === 'eleven_v3' || !STREAMING_TTS_MODELS.has(requested)) {
    console.warn(
      JSON.stringify({
        msg: 'avatar-agent.tts.model_fallback',
        requested,
        using: 'eleven_flash_v2_5',
        reason:
          'eleven_v3 (and non-streaming models) fail WebSocket multi-stream-input with 403',
      }),
    );
    return 'eleven_flash_v2_5';
  }
  return requested;
}

/** Strip eleven_v3 audio tags so flash/turbo does not speak "[speaking clearly]" literally. */
function forStreamingTts(text: string): string {
  return text
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\.\.\.\s*/g, '... ')
    .trim();
}

function parseSpeakPayload(raw: Uint8Array): { text: string; lang?: string } | null {
  try {
    const msg = JSON.parse(new TextDecoder().decode(raw)) as {
      type?: string;
      text?: string;
      lang?: string;
    };
    if (msg.type && msg.type !== SPEAK_TOPIC) return null;
    if (!msg.text?.trim()) return null;
    return { text: forStreamingTts(msg.text), lang: msg.lang };
  } catch {
    return null;
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const voiceId = process.env.ELEVENLABS_TTS_VOICE_ID || '';
    const apiKey = process.env.ELEVENLABS_API_KEY || '';
    if (!voiceId || !apiKey) {
      throw new Error(
        'ELEVENLABS_API_KEY and ELEVENLABS_TTS_VOICE_ID are required for avatar-agent',
      );
    }

    const model = resolveAvatarTtsModel(AVATAR_TTS_MODEL);

    const session = new voice.AgentSession({
      tts: new elevenlabs.TTS({
        apiKey,
        voiceId,
        model,
      }),
    });

    const avatar = new bey.AvatarSession({
      avatarId: AVATAR_ID,
      apiKey: process.env.BEY_API_KEY,
    });
    await avatar.start(session, ctx.room);

    await session.start({
      agent: new voice.Agent({
        instructions:
          'You are a silent kiosk speaker. Never generate replies on your own. Only speak when session.say is invoked.',
      }),
      room: ctx.room,
    });

    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic && topic !== SPEAK_TOPIC) return;
      const parsed = parseSpeakPayload(payload);
      if (!parsed) return;
      console.info(
        JSON.stringify({
          msg: 'kiosk.speak',
          chars: parsed.text.length,
          lang: parsed.lang || 'en',
        }),
      );
      try {
        session.say(parsed.text, { allowInterruptions: true });
      } catch (err) {
        console.error('session.say failed', err);
      }
    };

    ctx.room.on(RoomEvent.DataReceived, onData);
    ctx.addShutdownCallback(async () => {
      ctx.room.off(RoomEvent.DataReceived, onData);
    });

    console.info(
      JSON.stringify({
        msg: 'avatar-agent.ready',
        room: ctx.room.name,
        avatarId: AVATAR_ID,
        agentName: AGENT_NAME,
        ttsModel: model,
      }),
    );
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
  }),
);
