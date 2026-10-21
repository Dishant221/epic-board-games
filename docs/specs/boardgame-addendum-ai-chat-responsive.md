# 🎲 PlayBoard Arena — Addendum: AI Players, Voice/Text Chat & Responsive Design

---

## 🤖 AI Player System

### Overview
Every game supports **"Play vs AI"** mode. User picks difficulty before starting. AI runs **server-side on Cloudflare Workers AI** (for complex games) and **client-side via Wasm** (for simple games) to keep latency low.

### Difficulty Levels

| Level | Behavior | Target Audience |
|-------|----------|-----------------|
| **Easy** | Makes random valid moves. Occasionally makes "mistakes" on purpose. 30% optimal play | Kids, casual players, learning the game |
| **Medium** | Uses basic heuristics + 1-2 move lookahead. 60% optimal play | Regular players who want a challenge |
| **Hard** | Full algorithm (Minimax, MCTS, or neural). 90%+ optimal play. Plays near-perfectly | Competitive players, practice mode |
| **Impossible** | Perfect play where solvable (Tic Tac Toe, Connect4). Near-GM level for Chess | Bragging rights, "can you beat it?" |

### AI Engine Per Game

```
┌───────────────────────────────────────────────────────────────────┐
│ Game              │ AI Algorithm            │ Runs Where           │
├───────────────────┼─────────────────────────┼──────────────────────┤
│ Tic Tac Toe       │ Minimax (perfect)       │ Client Wasm          │
│ Connect 4         │ Minimax + Alpha-Beta    │ Client Wasm          │
│ Chess             │ Minimax + Alpha-Beta    │ Workers AI / Wasm    │
│                   │ + piece-square tables   │                      │
│ Checkers          │ Minimax + Alpha-Beta    │ Client Wasm          │
│ Snakes & Ladders  │ Random (dice game)      │ Client Wasm          │
│ Epic Business     │ Heuristic decision tree │ Worker (server-side)  │
│ (Monopoly-style)  │ (buy/trade/mortgage AI) │                      │
│ Sudoku            │ N/A (single player)     │ —                    │
│ Crossword         │ Hint system only        │ —                    │
│ Word Puzzle       │ N/A (single player)     │ —                    │
│ Epic Puzzle       │ N/A (single player)     │ —                    │
│ Flappy Bird       │ N/A (single player)     │ —                    │
│ Mahjong           │ Hint system only        │ —                    │
└───────────────────┴─────────────────────────┴──────────────────────┘
```

### Rust/Wasm AI Module Structure

```rust
// rust-game-engine/src/ai/mod.rs

pub mod tic_tac_toe_ai;
pub mod connect4_ai;
pub mod chess_ai;
pub mod checkers_ai;
pub mod monopoly_ai;
pub mod snake_ladder_ai;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub enum AIDifficulty {
    Easy,
    Medium,
    Hard,
    Impossible,
}

#[wasm_bindgen]
pub struct AIPlayer {
    difficulty: AIDifficulty,
    think_delay_ms: u32,       // Fake "thinking" delay for UX
    mistake_rate: f32,          // % chance of suboptimal move
}

#[wasm_bindgen]
impl AIPlayer {
    #[wasm_bindgen(constructor)]
    pub fn new(difficulty: AIDifficulty) -> AIPlayer {
        let (think_delay_ms, mistake_rate) = match difficulty {
            AIDifficulty::Easy       => (500,  0.70),   // 70% mistakes
            AIDifficulty::Medium     => (1000, 0.40),   // 40% mistakes
            AIDifficulty::Hard       => (1500, 0.10),   // 10% mistakes
            AIDifficulty::Impossible => (2000, 0.00),   // 0% mistakes
        };
        AIPlayer { difficulty, think_delay_ms, mistake_rate }
    }

    pub fn get_think_delay(&self) -> u32 {
        self.think_delay_ms
    }
}
```

### Chess AI (Minimax + Alpha-Beta Pruning)

```rust
// rust-game-engine/src/ai/chess_ai.rs

#[wasm_bindgen]
pub struct ChessAI {
    difficulty: AIDifficulty,
    max_depth: u8,
}

#[wasm_bindgen]
impl ChessAI {
    #[wasm_bindgen(constructor)]
    pub fn new(difficulty: AIDifficulty) -> ChessAI {
        let max_depth = match difficulty {
            AIDifficulty::Easy       => 1,    // 1-ply: looks 1 move ahead
            AIDifficulty::Medium     => 3,    // 3-ply: decent play
            AIDifficulty::Hard       => 5,    // 5-ply: strong amateur
            AIDifficulty::Impossible => 7,    // 7-ply: near-GM with eval tables
        };
        ChessAI { difficulty, max_depth }
    }

    pub fn get_best_move(&self, board_fen: &str) -> String {
        // Minimax with alpha-beta pruning
        // Returns UCI notation (e.g., "e2e4")
        // Uses piece-square tables for position evaluation
        // On Easy: randomly picks from top-5 moves (not always best)
        todo!()
    }
}
```

### Monopoly AI (Heuristic Decision Engine)

```rust
// rust-game-engine/src/ai/monopoly_ai.rs

#[wasm_bindgen]
impl MonopolyAI {
    // Decision: should AI buy this property?
    pub fn should_buy(&self, property_cost: u32, ai_cash: u32,
                       owned_in_group: u8, total_in_group: u8) -> bool {
        match self.difficulty {
            Easy => {
                // Random: 50% chance to buy if affordable
                ai_cash > property_cost && random_bool(0.5)
            }
            Medium => {
                // Buy if can afford and keeps 200+ reserve
                ai_cash > property_cost + 200
            }
            Hard | Impossible => {
                // Strategic: prioritize completing color groups
                // Factor in: group completion %, monopoly value, cash reserves
                let group_progress = owned_in_group as f32 / total_in_group as f32;
                let reserve_ratio = ai_cash as f32 / property_cost as f32;
                group_progress > 0.3 && reserve_ratio > 1.5
            }
        }
    }

    // Decision: should AI accept a trade?
    pub fn evaluate_trade(&self, offering_value: u32,
                           receiving_value: u32) -> bool { ... }

    // Decision: should AI build houses?
    pub fn should_build(&self, cash: u32, property_group_complete: bool) -> bool { ... }

    // Decision: should AI mortgage?
    pub fn should_mortgage(&self, cash: u32, rent_owed: u32) -> bool { ... }
}
```

### AI Player UX Flow

```
User clicks "Play Snake & Ladder"
  → Mode Selection Modal:
    ┌─────────────────────────────────────┐
    │  How do you want to play?           │
    │                                     │
    │  🌐 Online Multiplayer              │
    │     Match with real players          │
    │                                     │
    │  🤖 Play vs AI                      │
    │     ┌──────┐ ┌──────┐ ┌──────┐     │
    │     │ Easy │ │Medium│ │ Hard │      │
    │     │  😊  │ │  🤔  │ │  😈  │     │
    │     └──────┘ └──────┘ └──────┘     │
    │                                     │
    │  👥 Play with Friends               │
    │     Invite from your friends list   │
    └─────────────────────────────────────┘

If "Play vs AI":
  → Select number of AI opponents (1-3)
  → Select difficulty per AI (can mix: 1 Easy + 1 Hard)
  → Game starts instantly (no matchmaking wait)
  → AI "thinks" for 0.5-2s (animated thinking indicator)
  → AI makes move → client animates
```

### AI Player Visual Identity

```
Each AI player gets a unique persona:
  - AI Easy:   "Buddy" 🐶 (friendly dog avatar, casual moves)
  - AI Medium: "Nova" 🤖 (robot avatar, calculated moves)
  - AI Hard:   "Titan" 👹 (demon avatar, aggressive moves)
  - AI Impossible: "Oracle" 🔮 (mystic avatar, perfect moves)

AI players show:
  - Animated "thinking..." bubble (dots animation)
  - Reaction emojis after moves (😊 on good move, 😤 on being captured)
  - No text chat (but pre-set emote reactions)
```

### AI Database Additions

```sql
-- Add to game_players table
ALTER TABLE game_players ADD COLUMN is_ai INTEGER DEFAULT 0;
ALTER TABLE game_players ADD COLUMN ai_difficulty TEXT;  -- easy, medium, hard, impossible
ALTER TABLE game_players ADD COLUMN ai_persona TEXT;     -- buddy, nova, titan, oracle

-- AI games don't count toward ranked leaderboard
-- But DO count toward achievements (e.g., "Beat Hard AI at Chess")
ALTER TABLE game_sessions ADD COLUMN has_ai_players INTEGER DEFAULT 0;
```

### Updated Rust Project Structure

```
rust-game-engine/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── games/
│   │   ├── mod.rs
│   │   ├── snake_ladder.rs
│   │   ├── chess.rs
│   │   ├── checkers.rs
│   │   ├── connect4.rs
│   │   ├── tic_tac_toe.rs
│   │   ├── sudoku.rs
│   │   ├── monopoly.rs
│   │   ├── crossword.rs
│   │   └── word_puzzle.rs
│   ├── ai/                          ← NEW
│   │   ├── mod.rs                   # AIDifficulty enum, AIPlayer struct
│   │   ├── minimax.rs               # Generic minimax + alpha-beta
│   │   ├── mcts.rs                  # Monte Carlo Tree Search (for Monopoly)
│   │   ├── tic_tac_toe_ai.rs        # Perfect play via minimax
│   │   ├── connect4_ai.rs           # Alpha-beta with eval function
│   │   ├── chess_ai.rs              # Minimax + piece-square tables
│   │   ├── checkers_ai.rs           # Minimax + position eval
│   │   ├── monopoly_ai.rs           # Heuristic decision tree
│   │   └── snake_ladder_ai.rs       # Random (dice game, no strategy)
│   └── utils.rs
└── tests/
    ├── ai_tests.rs                  ← NEW
    └── integration_tests.rs
```

---

## 🎙️ Voice & Text Chat System

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     IN-GAME COMMUNICATION                        │
│                                                                  │
│   ┌─────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│   │  Text Chat   │    │  Voice Chat  │    │  Quick Emotes     │  │
│   │  (WebSocket) │    │  (WebRTC)    │    │  (WebSocket)      │  │
│   │              │    │              │    │                   │  │
│   │  Via Durable │    │  Peer-to-Peer│    │  Pre-set emoji    │  │
│   │  Objects     │    │  + TURN/STUN │    │  reactions sent   │  │
│   │  (existing)  │    │  via CF      │    │  via game room    │  │
│   └─────────────┘    └──────────────┘    └───────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Text Chat — In-Game

**Already built into Durable Object GameRoom. Enhanced version:**

```typescript
// Enhanced message types in GameRoom Durable Object
interface ChatMessage {
  type: 'CHAT';
  payload: {
    messageType: 'text' | 'emote' | 'system';
    content: string;
    senderId: string;
    senderName: string;
    senderAvatar: string;
    timestamp: number;
  };
}

// Emote shortcuts (no typing needed)
const QUICK_EMOTES = [
  { id: 'gg',      emoji: '🏆', text: 'Good game!' },
  { id: 'nice',    emoji: '👍', text: 'Nice move!' },
  { id: 'hurry',   emoji: '⏰', text: 'Hurry up!' },
  { id: 'oops',    emoji: '😅', text: 'Oops!' },
  { id: 'laugh',   emoji: '😂', text: 'Haha!' },
  { id: 'angry',   emoji: '😤', text: 'Grr!' },
  { id: 'hi',      emoji: '👋', text: 'Hello!' },
  { id: 'bye',     emoji: '✌️', text: 'See ya!' },
  { id: 'think',   emoji: '🤔', text: 'Hmm...' },
  { id: 'wow',     emoji: '😮', text: 'Wow!' },
];
```

### Text Chat UI Component

```typescript
// src/components/games/shared/InGameChat.tsx

interface InGameChatProps {
  gameRoomWs: WebSocket;
  players: Player[];
  isCollapsed: boolean;
}

export function InGameChat({ gameRoomWs, players, isCollapsed }: InGameChatProps) {
  // Features:
  // - Collapsible chat panel (bottom-right on desktop, slide-up on mobile)
  // - Message list with auto-scroll
  // - Input field with send button
  // - Quick emote bar (horizontal scroll of emoji buttons)
  // - "Player is typing..." indicator
  // - Profanity filter (client-side + server-side validation)
  // - Max 200 chars per message
  // - Rate limit: 5 messages per 10 seconds
  // - Unread message badge when collapsed
  // - System messages: "Player joined", "Player left", "Player's turn"
}
```

### Voice Chat — WebRTC Architecture

```
┌──────────┐         ┌──────────────────┐         ┌──────────┐
│ Player A │ ◄──────►│  Cloudflare TURN │◄───────► │ Player B │
│ Browser  │  WebRTC │  Server (Calls)  │  WebRTC  │ Browser  │
│          │  P2P    │                  │  P2P     │          │
└──────────┘  Audio  │  Signaling via   │  Audio   └──────────┘
                     │  Durable Object  │
                     │  WebSocket       │
                     └──────────────────┘

Signaling Flow:
1. Player A clicks "Enable Voice" → browser requests mic permission
2. Player A creates RTCPeerConnection with STUN/TURN config
3. Player A creates SDP offer → sends via WebSocket to GameRoom DO
4. GameRoom DO relays offer to Player B
5. Player B creates SDP answer → sends back via WebSocket
6. ICE candidates exchanged via WebSocket
7. Direct P2P audio stream established
8. If P2P fails → falls back through TURN relay
```

### Voice Chat Implementation

```typescript
// src/lib/voice-chat.ts

interface VoiceChatConfig {
  gameRoomWs: WebSocket;
  localPlayerId: string;
  remotePlayers: string[];
}

export class VoiceChatManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private isMuted: boolean = false;
  private isDeafened: boolean = false;

  // STUN/TURN servers
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: 'turn:turn.cloudflare.com:3478',
        username: '', // Dynamic credentials from Worker API
        credential: '',
      },
    ],
  };

  async startVoice(): Promise<void> {
    // Request microphone access
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
      video: false,
    });

    // Create peer connection for each remote player
    for (const playerId of this.remotePlayers) {
      await this.createPeerConnection(playerId);
    }
  }

  private async createPeerConnection(remotePlayerId: string): Promise<void> {
    const pc = new RTCPeerConnection(this.rtcConfig);

    // Add local audio track
    this.localStream?.getAudioTracks().forEach(track => {
      pc.addTrack(track, this.localStream!);
    });

    // Handle incoming audio
    pc.ontrack = (event) => {
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play();
      // Attach volume control per player
    };

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.gameRoomWs.send(JSON.stringify({
          type: 'VOICE_ICE_CANDIDATE',
          payload: {
            targetPlayerId: remotePlayerId,
            candidate: event.candidate,
          },
        }));
      }
    };

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.gameRoomWs.send(JSON.stringify({
      type: 'VOICE_OFFER',
      payload: {
        targetPlayerId: remotePlayerId,
        sdp: offer,
      },
    }));

    this.peerConnections.set(remotePlayerId, pc);
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.localStream?.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });
    // Broadcast mute status to other players
    this.gameRoomWs.send(JSON.stringify({
      type: 'VOICE_MUTE_STATUS',
      payload: { muted: this.isMuted },
    }));
    return this.isMuted;
  }

  toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;
    // Mute all remote audio elements
    return this.isDeafened;
  }

  setPlayerVolume(playerId: string, volume: number): void {
    // Individual volume control per player (0.0 to 1.0)
  }

  disconnect(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
  }
}
```

### Voice Chat Signaling in Durable Object

```typescript
// Addition to workers/game-room.ts

async webSocketMessage(ws: WebSocket, message: string) {
  const { type, payload } = JSON.parse(message);

  switch (type) {
    // ... existing game messages ...

    case 'VOICE_OFFER': {
      // Relay SDP offer to target player
      const targetWs = this.players.get(payload.targetPlayerId);
      targetWs?.send(JSON.stringify({
        type: 'VOICE_OFFER',
        payload: {
          fromPlayerId: this.getPlayerId(ws),
          sdp: payload.sdp,
        },
      }));
      break;
    }

    case 'VOICE_ANSWER': {
      // Relay SDP answer back
      const targetWs = this.players.get(payload.targetPlayerId);
      targetWs?.send(JSON.stringify({
        type: 'VOICE_ANSWER',
        payload: {
          fromPlayerId: this.getPlayerId(ws),
          sdp: payload.sdp,
        },
      }));
      break;
    }

    case 'VOICE_ICE_CANDIDATE': {
      // Relay ICE candidate
      const targetWs = this.players.get(payload.targetPlayerId);
      targetWs?.send(JSON.stringify({
        type: 'VOICE_ICE_CANDIDATE',
        payload: {
          fromPlayerId: this.getPlayerId(ws),
          candidate: payload.candidate,
        },
      }));
      break;
    }

    case 'VOICE_MUTE_STATUS': {
      // Broadcast mute status to all players
      this.broadcast(JSON.stringify({
        type: 'VOICE_MUTE_STATUS',
        payload: {
          playerId: this.getPlayerId(ws),
          muted: payload.muted,
        },
      }), ws);
      break;
    }
  }
}
```

### Voice + Text Chat UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  GAME BOARD (full screen)                                   │
│                                                             │
│  ┌──────────────────────┐                                   │
│  │ Player Avatars (top) │                                   │
│  │ 🔊 🔇 🎤 🔴          │  ← Voice indicators per player   │
│  │ P1  P2  P3  P4       │     🔊 = speaking (green pulse)  │
│  └──────────────────────┘     🔇 = muted                   │
│                               🎤 = mic on                   │
│                               🔴 = voice off                │
│                                                             │
│                                                             │
│                          ┌──────────────────────────────┐   │
│                          │  💬 Chat Panel (collapsible)  │   │
│                          │                              │   │
│                          │  P1: Nice move!              │   │
│                          │  P2: 😂                      │   │
│                          │  SYSTEM: P3's turn           │   │
│                          │                              │   │
│                          │  ┌─────────────────┐ [Send]  │   │
│                          │  │ Type message... │         │   │
│                          │  └─────────────────┘         │   │
│                          │                              │   │
│                          │  Quick: 👍 🏆 ⏰ 😅 😂 😤     │   │
│                          └──────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────┐                           │
│  │ Voice Controls (bottom-left) │                           │
│  │ [🎤 Mute] [🔇 Deafen] [⚙️]  │                           │
│  └──────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### Chat Safety & Moderation

```typescript
// Server-side message validation in Durable Object

const PROFANITY_LIST: string[] = [/* loaded from KV */];
const MAX_MESSAGE_LENGTH = 200;
const RATE_LIMIT = { messages: 5, windowSec: 10 };

function validateChatMessage(content: string, playerId: string): {
  valid: boolean;
  filtered: string;
  reason?: string;
} {
  // 1. Length check
  if (content.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, filtered: '', reason: 'Message too long' };
  }

  // 2. Rate limit check (per player, tracked in DO state)
  if (isRateLimited(playerId)) {
    return { valid: false, filtered: '', reason: 'Slow down!' };
  }

  // 3. Profanity filter (replace with ***)
  let filtered = content;
  for (const word of PROFANITY_LIST) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  }

  // 4. Spam detection (repeated chars, all caps)
  if (/(.)\1{5,}/.test(content)) {
    return { valid: false, filtered: '', reason: 'No spam' };
  }

  return { valid: true, filtered };
}
```

### Voice Chat — Cloudflare Calls API (TURN)

```typescript
// src/api/voice/turn-credentials.ts
// Generate short-lived TURN credentials for each game session

export async function onRequest({ request, env }) {
  const { gameSessionId, userId } = await request.json();

  // Verify user is in this game session
  const isPlayer = await env.DB.prepare(
    'SELECT 1 FROM game_players WHERE game_session_id = ? AND user_id = ?'
  ).bind(gameSessionId, userId).first();

  if (!isPlayer) return new Response('Unauthorized', { status: 403 });

  // Generate TURN credentials via Cloudflare Calls API
  const turnCredentials = await fetch(
    'https://rtc.live.cloudflare.com/v1/turn/keys/' + env.TURN_KEY_ID + '/credentials/generate',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.TURN_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 86400 }), // 24 hour TTL
    }
  );

  const creds = await turnCredentials.json();

  return Response.json({
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: creds.iceServers.urls,
        username: creds.iceServers.username,
        credential: creds.iceServers.credential,
      },
    ],
  });
}
```

---

## 📱 Responsive Design System — Every Screen Size

### Breakpoint Strategy

```css
/* tailwind.config.mjs — Custom breakpoints */
export default {
  theme: {
    screens: {
      'xs':     '320px',    /* Small phones (iPhone SE) */
      'sm':     '375px',    /* Standard phones (iPhone 14) */
      'md':     '768px',    /* Tablets portrait (iPad) */
      'lg':     '1024px',   /* Tablets landscape / small laptops */
      'xl':     '1280px',   /* Laptops */
      '2xl':    '1536px',   /* Large desktops */
      '3xl':    '1920px',   /* Ultra-wide / 4K */

      /* Height-based (games need this) */
      'short':  { 'raw': '(max-height: 600px)' },   /* Landscape phones */
      'tall':   { 'raw': '(min-height: 800px)' },    /* Tall screens */
    }
  }
}
```

### Device-Specific Game Layouts

```
┌─────────────────────────────────────────────────────────────────┐
│ DESKTOP (1024px+)                                               │
│                                                                 │
│  ┌─────────┐ ┌─────────────────────────────┐ ┌──────────────┐  │
│  │ Players │ │                             │ │   Chat +     │  │
│  │ Panel   │ │      GAME BOARD             │ │   Voice      │  │
│  │ (left)  │ │      (center, large)        │ │   Controls   │  │
│  │         │ │                             │ │   (right)    │  │
│  │ Score   │ │                             │ │              │  │
│  │ Timer   │ │                             │ │              │  │
│  └─────────┘ └─────────────────────────────┘ └──────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ HUD Bar: Turn indicator | Timer | Score | Quick Emotes     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ TABLET PORTRAIT (768px)                 │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Players Bar (horizontal, top)   │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │       GAME BOARD                │    │
│  │       (full width)              │    │
│  │                                 │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ HUD: Score | Timer | Dice      │    │
│  └─────────────────────────────────┘    │
│  ┌────────────────┐ ┌────────────┐     │
│  │ Chat (toggle)  │ │ Voice (🎤) │     │
│  └────────────────┘ └────────────┘     │
│  ┌─────────────────────────────────┐    │
│  │ Bottom Nav: Home|Games|Friends  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘

┌───────────────────────────┐
│ MOBILE PORTRAIT (375px)   │
│                           │
│ ┌───────────────────────┐ │
│ │ P1 🟢  P2 🟡  P3 🔴  │ │  ← Compact player strip
│ └───────────────────────┘ │
│ ┌───────────────────────┐ │
│ │                       │ │
│ │    GAME BOARD         │ │  ← Full width, touch-optimized
│ │    (pinch to zoom     │ │     Pinch-zoom on complex boards
│ │     on complex games) │ │
│ │                       │ │
│ └───────────────────────┘ │
│ ┌───────────────────────┐ │
│ │ 🎲 [Roll] Score: 42  │ │  ← Floating action button
│ └───────────────────────┘ │
│ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐     │
│ │💬│ │🎤│ │👍│ │😂│ │⏰│  │  ← Icon-only toolbar
│ └─┘ └─┘ └─┘ └─┘ └─┘     │
│ ┌───────────────────────┐ │
│ │ 🏠  🎮  👥  🔔  👤   │ │  ← Bottom tab nav
│ └───────────────────────┘ │
└───────────────────────────┘

┌──────────────────────────────────────────────────┐
│ MOBILE LANDSCAPE (short + wide)                  │
│                                                  │
│ ┌────┐ ┌──────────────────────────────┐ ┌─────┐ │
│ │ P1 │ │                              │ │ 🎲  │ │
│ │ P2 │ │       GAME BOARD             │ │Dice │ │
│ │ P3 │ │       (maximized)            │ │     │ │
│ │ P4 │ │                              │ │Score│ │
│ │    │ │                              │ │ 💬  │ │
│ └────┘ └──────────────────────────────┘ └─────┘ │
└──────────────────────────────────────────────────┘
```

### Per-Game Responsive Adaptations

```typescript
// src/utils/game-responsive.ts

interface GameLayout {
  boardSize: { width: number; height: number };
  dicePosition: 'corner' | 'bottom-center' | 'floating';
  chatPosition: 'sidebar' | 'overlay' | 'bottom-sheet';
  playerPanel: 'sidebar' | 'top-bar' | 'compact-strip';
  controlSize: 'full' | 'compact' | 'icon-only';
}

export function getGameLayout(
  screenWidth: number,
  screenHeight: number,
  gameType: string
): GameLayout {
  const isMobile = screenWidth < 768;
  const isTablet = screenWidth >= 768 && screenWidth < 1024;
  const isLandscape = screenWidth > screenHeight;

  if (isMobile) {
    return {
      boardSize: { width: screenWidth - 16, height: screenWidth - 16 },  // Square, full width
      dicePosition: 'floating',           // FAB button
      chatPosition: 'bottom-sheet',       // Slide-up panel
      playerPanel: 'compact-strip',       // Horizontal mini avatars
      controlSize: 'icon-only',           // Just icons, no text
    };
  }

  if (isTablet) {
    return {
      boardSize: { width: screenWidth - 32, height: screenWidth - 32 },
      dicePosition: 'bottom-center',
      chatPosition: 'overlay',            // Toggleable overlay
      playerPanel: 'top-bar',
      controlSize: 'compact',
    };
  }

  // Desktop
  return {
    boardSize: { width: Math.min(screenHeight - 100, 700), height: Math.min(screenHeight - 100, 700) },
    dicePosition: 'corner',               // Bottom-right corner
    chatPosition: 'sidebar',              // Always visible right panel
    playerPanel: 'sidebar',               // Left panel
    controlSize: 'full',                  // Full text labels
  };
}
```

### Three.js Responsive Canvas

```typescript
// src/lib/responsive-canvas.ts

export function setupResponsiveCanvas(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  container: HTMLElement
) {
  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 2); // Cap at 2x for performance

    renderer.setSize(width, height);
    renderer.setPixelRatio(pixelRatio);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Adjust camera distance based on screen size
    if (width < 768) {
      camera.position.z = 12;   // Closer on mobile (bigger board)
      camera.fov = 65;          // Wider FOV on mobile
    } else if (width < 1024) {
      camera.position.z = 10;
      camera.fov = 55;
    } else {
      camera.position.z = 8;
      camera.fov = 45;
    }
    camera.updateProjectionMatrix();
  }

  // Resize on window resize + orientation change
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => {
    setTimeout(resize, 100);  // Delay for orientation animation
  });

  // Initial sizing
  resize();

  return resize;
}
```

### Touch Controls for Mobile

```typescript
// src/lib/touch-controls.ts

export function setupTouchControls(canvas: HTMLCanvasElement) {
  let lastTouchDistance = 0;
  let lastTouchCenter = { x: 0, y: 0 };

  // Pinch to zoom (for complex boards: Chess, Monopoly)
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (lastTouchDistance > 0) {
        const scale = distance / lastTouchDistance;
        // Apply zoom to camera
        camera.zoom = Math.max(0.5, Math.min(3, camera.zoom * scale));
        camera.updateProjectionMatrix();
      }
      lastTouchDistance = distance;
    }
  }, { passive: false });

  // Tap to select (pieces, cells, tiles)
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      // Raycasting for 3D object selection
      handleTap(touch.clientX, touch.clientY);
    }
  });

  // Long press for context menu (piece info, property details)
  let longPressTimer: number;
  canvas.addEventListener('touchstart', (e) => {
    longPressTimer = setTimeout(() => {
      handleLongPress(e.touches[0].clientX, e.touches[0].clientY);
    }, 500);
  });
  canvas.addEventListener('touchend', () => clearTimeout(longPressTimer));
  canvas.addEventListener('touchmove', () => clearTimeout(longPressTimer));

  // Swipe for navigation (puzzle pieces, card scrolling)
  // Uses Hammer.js or custom gesture detection
}
```

### Puzzle Game — Mobile-Specific Layout

```
DESKTOP:
┌──────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────┐ │
│ │                                              │ │
│ │          PUZZLE CANVAS (large)               │ │
│ │                                              │ │
│ │                                              │ │
│ └──────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────┐ │
│ │ ◄ 🧩 🧩 🧩 🧩 🧩 🧩 🧩 🧩 🧩 🧩 🧩 🧩 ► │ │  ← Scrollable piece strip
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘

MOBILE:
┌─────────────────────────┐
│ ┌─────────────────────┐ │
│ │                     │ │
│ │  PUZZLE CANVAS      │ │  ← Pinch to zoom
│ │  (touch to place)   │ │     Drag to pan
│ │                     │ │
│ │                     │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ 🧩🧩🧩🧩🧩🧩🧩🧩  │ │  ← Horizontal swipeable strip
│ │ (swipe ← →)        │ │     Tap piece → tap canvas to place
│ └─────────────────────┘ │
│ [Hint] [Rotate] [Undo]  │  ← Action buttons
└─────────────────────────┘
```

### Monopoly / Epic Business — Mobile Layout

```
MOBILE:
┌─────────────────────────┐
│ 💰 12,500 credits       │  ← Your cash (always visible)
│ ┌─────────────────────┐ │
│ │                     │ │
│ │  BOARD              │ │  ← Pinch zoom, drag to pan
│ │  (zoomable)         │ │     Tap property for details
│ │                     │ │
│ └─────────────────────┘ │
│ ┌──────┐ ┌──────┐       │
│ │ 🎲🎲 │ │ 🏠   │       │  ← Dice button + Property quick-view
│ │ Roll │ │ Mine │       │
│ └──────┘ └──────┘       │
│                         │
│ ┌─────────────────────┐ │
│ │ 💬  🤝  📊  ⚙️      │ │  ← Chat | Trade | Stats | Settings
│ └─────────────────────┘ │
│                         │
│ Property detail card    │  ← Slides up as bottom sheet
│ pops up as bottom sheet │     when tapping a property
└─────────────────────────┘
```

### Global Responsive Components

```typescript
// src/components/common/ResponsiveGameWrapper.tsx
// Wraps every game with responsive detection + layout switching

export function ResponsiveGameWrapper({ children, gameType }: Props) {
  const [screenSize, setScreenSize] = useState(getScreenSize());
  const [orientation, setOrientation] = useState(getOrientation());
  const layout = getGameLayout(screenSize.width, screenSize.height, gameType);

  useEffect(() => {
    const handleResize = debounce(() => {
      setScreenSize(getScreenSize());
      setOrientation(getOrientation());
    }, 100);

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return (
    <GameLayoutContext.Provider value={layout}>
      <div className={cn(
        'game-wrapper w-full h-full',
        screenSize.width < 768 && 'mobile-game',
        screenSize.width >= 768 && screenSize.width < 1024 && 'tablet-game',
        screenSize.width >= 1024 && 'desktop-game',
        orientation === 'landscape' && 'landscape-game',
      )}>
        {/* Orientation lock suggestion for complex games */}
        {screenSize.width < 768 && orientation === 'portrait' &&
         ['chess', 'epic_business', 'checkers'].includes(gameType) && (
          <OrientationSuggestion message="Rotate your device for a better experience" />
        )}

        {children}

        {/* Mobile-only: floating action buttons */}
        {screenSize.width < 768 && (
          <MobileGameToolbar
            onChat={() => openBottomSheet('chat')}
            onVoice={() => toggleVoice()}
            onEmotes={() => openBottomSheet('emotes')}
          />
        )}
      </div>
    </GameLayoutContext.Provider>
  );
}
```

### CSS Utilities for Game Responsiveness

```css
/* src/styles/game-responsive.css */

/* Safe area for notched phones (iPhone, etc.) */
.game-wrapper {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Prevent pull-to-refresh during gameplay */
.game-wrapper {
  overscroll-behavior: none;
  touch-action: none;  /* Disable browser gestures inside game canvas */
}

/* Fullscreen game mode (mobile) */
.game-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 50;
}

/* Hide scrollbar but allow scroll (puzzle piece strip) */
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Landscape phone: maximize board */
@media (max-height: 500px) and (orientation: landscape) {
  .player-panel { display: none; }          /* Hide player panel */
  .game-hud { font-size: 0.75rem; }        /* Shrink HUD */
  .game-board { height: 100vh !important; } /* Full height */
}

/* High DPI screens: sharper canvas */
@media (-webkit-min-device-pixel-ratio: 2) {
  canvas { image-rendering: crisp-edges; }
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .game-animation { animation: none !important; }
  .dice-roll { transition: none !important; }
}
```

### Performance Optimizations by Device

```typescript
// src/lib/performance-tier.ts

export type PerformanceTier = 'low' | 'medium' | 'high';

export function detectPerformanceTier(): PerformanceTier {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

  if (!gl) return 'low';

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : '';

  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as any).deviceMemory || 2;  // GB
  const isMobile = /Android|iPhone|iPad/.test(navigator.userAgent);

  if (isMobile && memory <= 2) return 'low';
  if (isMobile && memory <= 4) return 'medium';
  if (cores >= 8 && memory >= 8) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

export function getGraphicsSettings(tier: PerformanceTier) {
  switch (tier) {
    case 'low':
      return {
        shadows: false,
        antialiasing: false,
        particleCount: 50,
        textureQuality: 'low',         // 256px textures
        animationFPS: 30,
        pixelRatio: 1,
        postProcessing: false,
      };
    case 'medium':
      return {
        shadows: true,
        antialiasing: false,
        particleCount: 200,
        textureQuality: 'medium',      // 512px textures
        animationFPS: 60,
        pixelRatio: Math.min(devicePixelRatio, 1.5),
        postProcessing: false,
      };
    case 'high':
      return {
        shadows: true,
        antialiasing: true,
        particleCount: 500,
        textureQuality: 'high',        // 1024px textures
        animationFPS: 60,
        pixelRatio: Math.min(devicePixelRatio, 2),
        postProcessing: true,          // Bloom, SSAO
      };
  }
}
```

---

## 📁 New Files Added to Project Structure

```
src/
├── lib/
│   ├── voice-chat.ts              ← NEW: WebRTC voice chat manager
│   ├── touch-controls.ts          ← NEW: Mobile touch gestures
│   ├── responsive-canvas.ts       ← NEW: Three.js responsive sizing
│   ├── performance-tier.ts        ← NEW: Device capability detection
│   └── game-responsive.ts         ← NEW: Layout calculator per device
│
├── components/
│   ├── games/shared/
│   │   ├── InGameChat.tsx         ← ENHANCED: Text + emotes
│   │   ├── VoiceControls.tsx      ← NEW: Mute/deafen/volume UI
│   │   ├── VoiceIndicator.tsx     ← NEW: Speaking animation per player
│   │   ├── MobileGameToolbar.tsx  ← NEW: Bottom icon toolbar (mobile)
│   │   ├── BottomSheet.tsx        ← NEW: Slide-up panel (mobile chat/trade)
│   │   ├── OrientationSuggestion.tsx ← NEW: "Rotate device" banner
│   │   ├── ResponsiveGameWrapper.tsx ← NEW: Wraps all games
│   │   └── AIPlayerBadge.tsx      ← NEW: AI avatar + difficulty indicator
│   ├── lobby/
│   │   ├── GameModeSelector.tsx   ← NEW: Online / vs AI / Friends modal
│   │   └── AIDifficultyPicker.tsx ← NEW: Easy/Medium/Hard/Impossible
│
├── api/
│   └── voice/
│       └── turn-credentials.ts    ← NEW: TURN server credential generator
│
├── styles/
│   └── game-responsive.css        ← NEW: Mobile/tablet game CSS

rust-game-engine/
├── src/
│   └── ai/                        ← NEW: Entire AI module
│       ├── mod.rs
│       ├── minimax.rs
│       ├── mcts.rs
│       ├── tic_tac_toe_ai.rs
│       ├── connect4_ai.rs
│       ├── chess_ai.rs
│       ├── checkers_ai.rs
│       ├── monopoly_ai.rs
│       └── snake_ladder_ai.rs
```

---

## 🗺️ Updated Roadmap Additions

### Insert after Phase 2 (Multiplayer Infra):

**Phase 2.5 — AI Engine (Week 4-5)**
- [ ] Rust AI module scaffold (AIDifficulty enum, AIPlayer struct)
- [ ] Minimax + alpha-beta generic implementation
- [ ] Tic Tac Toe AI (perfect play — validates AI pipeline)
- [ ] Connect 4 AI (alpha-beta + eval function)
- [ ] Game mode selector UI (Online / vs AI / Friends)
- [ ] AI difficulty picker UI
- [ ] AI "thinking" animation + persona avatars
- [ ] AI turn execution loop in Durable Object

### Insert after Phase 3 (First 3 Games):

**Phase 3.5 — Voice & Text Chat (Week 7-8)**
- [ ] Enhanced text chat in GameRoom DO (emotes, rate limiting, profanity filter)
- [ ] Chat UI component (collapsible panel + bottom sheet for mobile)
- [ ] Quick emote bar
- [ ] WebRTC voice chat manager
- [ ] TURN credential API via Cloudflare Calls
- [ ] Voice controls UI (mute, deafen, volume per player)
- [ ] Speaking indicator animation on player avatars
- [ ] Voice permission handling + fallback

### Insert after Phase 6 (Social Features):

**Phase 6.5 — Responsive & Performance (Week 16-17)**
- [ ] Performance tier detection
- [ ] Graphics settings per tier (low/medium/high)
- [ ] Three.js responsive canvas for all 3D games
- [ ] Touch controls (pinch zoom, tap select, long press, swipe)
- [ ] Mobile game layouts for all 12 games
- [ ] Tablet layouts for all 12 games
- [ ] Landscape phone layout optimization
- [ ] Bottom sheet components (chat, trade panel, property details)
- [ ] Safe area handling (notched phones)
- [ ] Orientation suggestion banners
- [ ] Pull-to-refresh prevention in game mode
- [ ] Reduced motion support
- [ ] Test on: iPhone SE, iPhone 15, Pixel 8, iPad, iPad Pro, Galaxy Tab, 4K desktop
