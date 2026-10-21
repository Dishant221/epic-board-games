// WebRTC mesh voice chat. Signaling goes through the GameRoom Durable Object
// WebSocket; media flows P2P, falling back to Cloudflare TURN when P2P fails.

import type { RoomServerMessage } from '@ebg/game-core/protocol';
import { api } from './api';

export interface VoiceChatConfig {
  gameRoomWs: WebSocket;
  roomId: string;
  localPlayerId: string;
  remotePlayers: string[];
  /** Called with the set of player ids currently speaking. */
  onSpeaking?: (speaking: Set<string>) => void;
}

const STUN_ONLY: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] };

export class VoiceChatManager {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteAudio = new Map<string, HTMLAudioElement>();
  private volumes = new Map<string, number>();
  private localStream: MediaStream | null = null;
  private rtcConfig: RTCConfiguration = STUN_ONLY;
  private audioCtx: AudioContext | null = null;
  private analysers = new Map<string, AnalyserNode>();
  private meterTimer: number | undefined;
  private isMuted = false;
  private isDeafened = false;
  private readonly onMessage = (ev: MessageEvent) => void this.handleSignal(ev);

  constructor(private readonly config: VoiceChatConfig) {}

  async startVoice(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Voice chat is not supported in this browser');
    // Short-lived TURN credentials are minted per room by the Worker.
    try {
      this.rtcConfig = await api<RTCConfiguration>('/api/voice/turn-credentials', { body: { roomId: this.config.roomId } });
    } catch {
      this.rtcConfig = STUN_ONLY;
    }
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      video: false,
    });
    this.audioCtx = new AudioContext();
    this.watchLevel(this.config.localPlayerId, this.localStream);
    this.config.gameRoomWs.addEventListener('message', this.onMessage);
    this.send({ type: 'VOICE_STATE', payload: { voice: 'on' } });

    // Glare avoidance: only the peer with the smaller id sends the offer.
    for (const playerId of this.config.remotePlayers) {
      if (this.config.localPlayerId < playerId) await this.createPeerConnection(playerId, true);
    }
    this.meterTimer = window.setInterval(() => this.reportSpeaking(), 150);
  }

  private send(msg: unknown) {
    if (this.config.gameRoomWs.readyState === WebSocket.OPEN) this.config.gameRoomWs.send(JSON.stringify(msg));
  }

  private async createPeerConnection(remotePlayerId: string, initiator: boolean): Promise<RTCPeerConnection> {
    this.peerConnections.get(remotePlayerId)?.close();
    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(remotePlayerId, pc);

    this.localStream?.getAudioTracks().forEach((track) => pc.addTrack(track, this.localStream!));

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      const audio = this.remoteAudio.get(remotePlayerId) ?? new Audio();
      audio.srcObject = stream;
      audio.volume = this.volumes.get(remotePlayerId) ?? 1;
      audio.muted = this.isDeafened;
      void audio.play().catch(() => {});
      this.remoteAudio.set(remotePlayerId, audio);
      this.watchLevel(remotePlayerId, stream);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({ type: 'VOICE_ICE_CANDIDATE', payload: { targetPlayerId: remotePlayerId, candidate: event.candidate.toJSON() } });
      }
    };

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send({ type: 'VOICE_OFFER', payload: { targetPlayerId: remotePlayerId, sdp: offer } });
    }
    return pc;
  }

  private async handleSignal(ev: MessageEvent) {
    let msg: RoomServerMessage;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    try {
      switch (msg.type) {
        case 'VOICE_OFFER': {
          const pc = await this.createPeerConnection(msg.payload.fromPlayerId, false);
          await pc.setRemoteDescription(msg.payload.sdp as RTCSessionDescriptionInit);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.send({ type: 'VOICE_ANSWER', payload: { targetPlayerId: msg.payload.fromPlayerId, sdp: answer } });
          break;
        }
        case 'VOICE_ANSWER':
          await this.peerConnections.get(msg.payload.fromPlayerId)?.setRemoteDescription(msg.payload.sdp as RTCSessionDescriptionInit);
          break;
        case 'VOICE_ICE_CANDIDATE':
          await this.peerConnections.get(msg.payload.fromPlayerId)?.addIceCandidate(msg.payload.candidate as RTCIceCandidateInit);
          break;
      }
    } catch (err) {
      console.warn('voice signaling error', err);
    }
  }

  /** A newly joined player turned voice on: connect to them. */
  async connectTo(playerId: string) {
    if (this.localStream && !this.peerConnections.has(playerId) && this.config.localPlayerId < playerId) {
      await this.createPeerConnection(playerId, true);
    }
  }

  private watchLevel(playerId: string, stream: MediaStream) {
    if (!this.audioCtx) return;
    const source = this.audioCtx.createMediaStreamSource(stream);
    const analyser = this.audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    this.analysers.set(playerId, analyser);
  }

  private reportSpeaking() {
    const speaking = new Set<string>();
    const buf = new Uint8Array(128);
    for (const [id, analyser] of this.analysers) {
      if (id === this.config.localPlayerId && this.isMuted) continue;
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      if (avg > 18) speaking.add(id);
    }
    this.config.onSpeaking?.(speaking);
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.localStream?.getAudioTracks().forEach((track) => (track.enabled = !this.isMuted));
    this.send({ type: 'VOICE_MUTE_STATUS', payload: { muted: this.isMuted } });
    return this.isMuted;
  }

  toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;
    this.remoteAudio.forEach((a) => (a.muted = this.isDeafened));
    return this.isDeafened;
  }

  /** Individual volume per player, 0.0–1.0. */
  setPlayerVolume(playerId: string, volume: number): void {
    const v = Math.max(0, Math.min(1, volume));
    this.volumes.set(playerId, v);
    const audio = this.remoteAudio.get(playerId);
    if (audio) audio.volume = v;
  }

  disconnect(): void {
    window.clearInterval(this.meterTimer);
    this.config.gameRoomWs.removeEventListener('message', this.onMessage);
    this.send({ type: 'VOICE_STATE', payload: { voice: 'off' } });
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.remoteAudio.forEach((a) => (a.srcObject = null));
    this.remoteAudio.clear();
    this.analysers.clear();
    void this.audioCtx?.close();
    this.audioCtx = null;
    this.localStream = null;
  }
}
