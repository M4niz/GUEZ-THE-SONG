import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Only initialize Supabase if keys are present.
// Otherwise, we fallback to a native BroadcastChannel for local development testing.
export const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

export type GameEvent =
  | { type: 'join'; playerId: string; name: string }
  | { type: 'game_start' }
  | { type: 'round_start'; roundNo: number; songId: string; options: string[]; startAt: number; roundType: string }
  | { type: 'answer'; playerId: string; optionIndex: number; tMs: number }
  | { type: 'round_end'; correctIndex: number; scores: Record<string, number>; streaks: Record<string, number> }
  | { type: 'final'; scores: Record<string, number> };

type EventHandler = (payload: any) => void;

class RealtimeAdapter {
  private channelName: string;
  private sbChannel: RealtimeChannel | null = null;
  private bcChannel: BroadcastChannel | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();

  constructor(roomCode: string) {
    this.channelName = `room:${roomCode}`;

    if (supabase) {
      console.log(`[Realtime] Connecting to Supabase room: ${this.channelName}`);
      this.sbChannel = supabase.channel(this.channelName);

      this.sbChannel.on('broadcast', { event: '*' }, (payload) => {
        this.triggerLocal(payload.event, payload.payload);
      });

      // Presence reports tabs that vanish without saying goodbye (closed, crashed, offline)
      this.sbChannel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
        (leftPresences as any[]).forEach(p => this.triggerLocal('presence_leave', p));
      });

      this.sbChannel.subscribe((status) => {
        console.log(`[Realtime] Supabase status: ${status}`);
        if (status === 'SUBSCRIBED') {
          this.triggerLocal('system_connected', {});
        }
      });

    } else {
      console.log(`[Realtime] Supabase keys missing. Falling back to BroadcastChannel for local testing: ${this.channelName}`);
      this.bcChannel = new BroadcastChannel(this.channelName);
      this.bcChannel.onmessage = (event) => {
        if (event.data && event.data.event && event.data.payload) {
          this.triggerLocal(event.data.event, event.data.payload);
        }
      };
      setTimeout(() => {
        this.triggerLocal('system_connected', {});
      }, 0);
    }
  }

  public on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)?.push(handler);
  }

  public off(event: string, handler: EventHandler) {
    const arr = this.handlers.get(event);
    if (arr) {
      this.handlers.set(event, arr.filter(h => h !== handler));
    }
  }

  private triggerLocal(event: string, payload: any) {
    const arr = this.handlers.get(event);
    if (arr) {
      arr.forEach(h => h(payload));
    }
  }

  public broadcast(event: string, payload: any) {
    if (this.sbChannel) {
      this.sbChannel.send({
        type: 'broadcast',
        event,
        payload
      });
    } else if (this.bcChannel) {
      this.bcChannel.postMessage({ event, payload });
    }

    // BroadcastChannel doesn't send to the sender. Supabase broadcast doesn't either.
    // If the sender needs to process its own event (like host acting as a player),
    // the application logic should handle that directly, but for 'join' and 'answer',
    // it's strictly client -> host.
  }

  /** Announce this client on the channel's presence list (Supabase only) */
  public track(meta: Record<string, unknown>) {
    this.sbChannel?.track(meta).catch(e => console.warn('[Realtime] track failed', e));
  }

  public cleanup() {
    this.handlers.clear();
    // Give a final 'leave'/'host_left' broadcast a moment to flush before the channel closes
    const sb = this.sbChannel;
    const bc = this.bcChannel;
    window.setTimeout(() => {
      if (sb) supabase?.removeChannel(sb);
      if (bc) bc.close();
    }, 400);
  }
}

export default RealtimeAdapter;
