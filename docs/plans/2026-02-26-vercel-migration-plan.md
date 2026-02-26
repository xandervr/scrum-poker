# Vercel Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate scrum poker from Express/Socket.IO to Vercel serverless with SSE + Vercel KV for instant real-time updates.

**Architecture:** Static frontend served by Vercel, mutations via serverless API routes writing to Vercel KV, real-time via SSE from an Edge Function polling KV every 500ms. Player identity via client-generated UUIDs stored in sessionStorage.

**Tech Stack:** Vercel serverless functions, Vercel Edge Runtime, Vercel KV (@vercel/kv), vanilla JS, EventSource API.

---

### Task 1: Project Setup

**Files:**
- Modify: `package.json`
- Create: `vercel.json`
- Delete: `server.js`, `Dockerfile`, `fly.toml`, `.dockerignore`

**Step 1: Update package.json**

Replace contents of `package.json`:

```json
{
  "name": "scrum-poker",
  "version": "2.0.0",
  "description": "Mobile-first scrum poker web app",
  "private": true,
  "scripts": {
    "dev": "vercel dev"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@vercel/kv": "^3.0.0"
  }
}
```

**Step 2: Create vercel.json**

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/public/$1" }
  ]
}
```

This serves static files from `public/` at the root URL while keeping API routes under `api/`.

**Step 3: Delete old server files**

```bash
rm server.js Dockerfile fly.toml .dockerignore
```

**Step 4: Install dependencies**

```bash
npm install
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: swap to Vercel project structure with @vercel/kv"
```

---

### Task 2: KV Helper Module

**Files:**
- Create: `api/_lib/rooms.js`

**Step 1: Create the shared helper**

Create `api/_lib/rooms.js`. The `_lib` prefix tells Vercel not to treat this as an API route.

```js
import { kv } from '@vercel/kv';

const ROOM_TTL = 60 * 60 * 24; // 24 hours
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function generateCode() {
  let code;
  let attempts = 0;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    attempts++;
    if (attempts > 10) break;
  } while (await getRoom(code));
  return code;
}

export async function getRoom(code) {
  return await kv.get(`room:${code}`);
}

export async function setRoom(code, room) {
  room.updatedAt = Date.now();
  await kv.set(`room:${code}`, room, { ex: ROOM_TTL });
}

export function getRoomState(room) {
  const participants = [];
  for (const [id, p] of Object.entries(room.participants)) {
    participants.push({
      id,
      name: p.name,
      vote: room.revealed ? p.vote : null,
      hasVoted: p.vote !== null,
    });
  }

  let average = null;
  if (room.revealed) {
    const numericVotes = participants
      .map(p => parseFloat(p.vote))
      .filter(v => !isNaN(v));
    if (numericVotes.length > 0) {
      average = Math.round((numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length) * 10) / 10;
    }
  }

  return {
    scrumMaster: room.scrumMaster,
    revealed: room.revealed,
    participants,
    average,
  };
}
```

**Step 2: Commit**

```bash
git add api/_lib/rooms.js
git commit -m "feat: add KV helper module for room state"
```

---

### Task 3: Create Room API Route

**Files:**
- Create: `api/rooms/create.js`

**Step 1: Write the endpoint**

```js
import { generateCode, setRoom } from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, name } = req.body;
  if (!playerId || !name) return res.status(400).json({ error: 'Missing playerId or name' });

  const code = await generateCode();
  const room = {
    scrumMaster: playerId,
    revealed: false,
    updatedAt: Date.now(),
    participants: {
      [playerId]: { name, vote: null },
    },
  };

  await setRoom(code, room);
  return res.json({ code });
}
```

**Step 2: Commit**

```bash
git add api/rooms/create.js
git commit -m "feat: add POST /api/rooms/create endpoint"
```

---

### Task 4: Join Room API Route

**Files:**
- Create: `api/rooms/join.js`

**Step 1: Write the endpoint**

```js
import { getRoom, setRoom, getRoomState } from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roomCode, playerId, name } = req.body;
  if (!roomCode || !playerId || !name) return res.status(400).json({ error: 'Missing fields' });

  const code = roomCode.toUpperCase().trim();
  const room = await getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  room.participants[playerId] = { name, vote: null };
  await setRoom(code, room);

  return res.json({ code, state: getRoomState(room) });
}
```

**Step 2: Commit**

```bash
git add api/rooms/join.js
git commit -m "feat: add POST /api/rooms/join endpoint"
```

---

### Task 5: Vote API Route

**Files:**
- Create: `api/rooms/vote.js`

**Step 1: Write the endpoint**

```js
import { getRoom, setRoom, getRoomState } from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roomCode, playerId, vote } = req.body;
  if (!roomCode || !playerId) return res.status(400).json({ error: 'Missing fields' });

  const code = roomCode.toUpperCase().trim();
  const room = await getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.revealed) return res.status(400).json({ error: 'Votes already revealed' });
  if (!room.participants[playerId]) return res.status(400).json({ error: 'Not in room' });

  room.participants[playerId].vote = vote;
  await setRoom(code, room);

  return res.json({ state: getRoomState(room) });
}
```

**Step 2: Commit**

```bash
git add api/rooms/vote.js
git commit -m "feat: add POST /api/rooms/vote endpoint"
```

---

### Task 6: Reveal API Route

**Files:**
- Create: `api/rooms/reveal.js`

**Step 1: Write the endpoint**

```js
import { getRoom, setRoom, getRoomState } from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roomCode, playerId } = req.body;
  if (!roomCode || !playerId) return res.status(400).json({ error: 'Missing fields' });

  const code = roomCode.toUpperCase().trim();
  const room = await getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.scrumMaster !== playerId) return res.status(403).json({ error: 'Not scrum master' });

  room.revealed = true;
  await setRoom(code, room);

  return res.json({ state: getRoomState(room) });
}
```

**Step 2: Commit**

```bash
git add api/rooms/reveal.js
git commit -m "feat: add POST /api/rooms/reveal endpoint"
```

---

### Task 7: Clear API Route

**Files:**
- Create: `api/rooms/clear.js`

**Step 1: Write the endpoint**

```js
import { getRoom, setRoom, getRoomState } from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roomCode, playerId } = req.body;
  if (!roomCode || !playerId) return res.status(400).json({ error: 'Missing fields' });

  const code = roomCode.toUpperCase().trim();
  const room = await getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.scrumMaster !== playerId) return res.status(403).json({ error: 'Not scrum master' });

  room.revealed = false;
  for (const p of Object.values(room.participants)) {
    p.vote = null;
  }
  await setRoom(code, room);

  return res.json({ state: getRoomState(room) });
}
```

**Step 2: Commit**

```bash
git add api/rooms/clear.js
git commit -m "feat: add POST /api/rooms/clear endpoint"
```

---

### Task 8: SSE Stream Edge Function

**Files:**
- Create: `api/rooms/stream.js`

**Step 1: Write the edge function**

```js
import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

function getRoomState(room) {
  const participants = [];
  for (const [id, p] of Object.entries(room.participants)) {
    participants.push({
      id,
      name: p.name,
      vote: room.revealed ? p.vote : null,
      hasVoted: p.vote !== null,
    });
  }

  let average = null;
  if (room.revealed) {
    const numericVotes = participants
      .map(p => parseFloat(p.vote))
      .filter(v => !isNaN(v));
    if (numericVotes.length > 0) {
      average = Math.round((numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length) * 10) / 10;
    }
  }

  return {
    scrumMaster: room.scrumMaster,
    revealed: room.revealed,
    participants,
    average,
  };
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const roomCode = searchParams.get('room');
  if (!roomCode) {
    return new Response('Missing room param', { status: 400 });
  }

  const code = roomCode.toUpperCase().trim();
  const encoder = new TextEncoder();
  let lastUpdatedAt = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const MAX_DURATION = 25000;
      const POLL_INTERVAL = 500;
      const start = Date.now();

      while (Date.now() - start < MAX_DURATION) {
        try {
          const room = await kv.get(`room:${code}`);
          if (!room) {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Room not found' })}\n\n`));
            controller.close();
            return;
          }

          if (room.updatedAt !== lastUpdatedAt) {
            lastUpdatedAt = room.updatedAt;
            const state = getRoomState(room);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Server error' })}\n\n`));
          controller.close();
          return;
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

Note: `getRoomState` is duplicated here because Edge Functions can't share imports with Node.js serverless modules. This is intentional.

**Step 2: Commit**

```bash
git add api/rooms/stream.js
git commit -m "feat: add SSE stream edge function for real-time updates"
```

---

### Task 9: Rewrite Frontend - index.html

**Files:**
- Modify: `public/index.html`

**Step 1: Replace the script section**

Remove the `<script src="/socket.io/socket.io.js"></script>` tag (line 41) and replace the entire inline `<script>` block (lines 42-98) with:

```html
  <script>
    const nameInput = document.getElementById('name');
    const codeInput = document.getElementById('room-code');
    const errorEl = document.getElementById('error');

    const urlCode = new URLSearchParams(location.search).get('room');
    if (urlCode) codeInput.value = urlCode.toUpperCase();

    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    function showError(msg) {
      errorEl.textContent = msg;
      setTimeout(() => errorEl.textContent = '', 3000);
    }

    function getName() {
      const name = nameInput.value.trim();
      if (!name) { showError('Please enter your name'); nameInput.focus(); return null; }
      return name;
    }

    function getPlayerId() {
      let id = sessionStorage.getItem('poker-player-id');
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem('poker-player-id', id);
      }
      return id;
    }

    document.getElementById('create-btn').addEventListener('click', async () => {
      const name = getName();
      if (!name) return;
      try {
        const res = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: getPlayerId(), name }),
        });
        const data = await res.json();
        if (data.error) return showError(data.error);
        sessionStorage.setItem('poker-name', name);
        sessionStorage.setItem('poker-room', data.code);
        location.href = `/room.html?room=${data.code}`;
      } catch (e) {
        showError('Failed to create room');
      }
    });

    document.getElementById('join-btn').addEventListener('click', () => {
      const name = getName();
      if (!name) return;
      const code = codeInput.value.trim().toUpperCase();
      if (!code || code.length !== 4) { showError('Enter a 4-letter room code'); return; }
      sessionStorage.setItem('poker-name', name);
      sessionStorage.setItem('poker-room', code);
      location.href = `/room.html?room=${code}`;
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (codeInput.value.trim()) document.getElementById('join-btn').click();
        else document.getElementById('create-btn').click();
      }
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('join-btn').click();
    });
  </script>
```

Note: `errorEl.textContent` is used (not innerHTML) so user input is safely rendered as text.

**Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: rewrite index.html to use fetch API instead of Socket.IO"
```

---

### Task 10: Rewrite Frontend - app.js

**Files:**
- Modify: `public/app.js`

**Step 1: Full rewrite of app.js**

Replace the entire file. Key changes from original:
- `socket.id` replaced with `playerId` from `sessionStorage`
- `socket.emit(...)` replaced with `fetch('/api/rooms/...')`
- `socket.on('room-update', ...)` replaced with `EventSource`
- All rendering functions preserved with same logic
- Note: `escapeHtml()` uses a temporary DOM element with `textContent` (safe, not innerHTML-based injection)

```js
const CARD_VALUES = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '\u2615'];

const roomCode = new URLSearchParams(location.search).get('room');
const savedName = sessionStorage.getItem('poker-name');
const savedRoom = sessionStorage.getItem('poker-room');

if (!roomCode) {
  location.href = '/';
}

// Player identity
function getPlayerId() {
  let id = sessionStorage.getItem('poker-player-id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('poker-player-id', id);
  }
  return id;
}

const playerId = getPlayerId();

// State
let isScrumMaster = false;
let selectedVote = null;
let revealed = false;
let currentScrumMaster = null;

// DOM
const roomCodeDisplay = document.getElementById('room-code-display');
const participantsEl = document.getElementById('participants');
const cardsGrid = document.getElementById('cards-grid');
const smControls = document.getElementById('sm-controls');
const revealBtn = document.getElementById('reveal-btn');
const clearBtn = document.getElementById('clear-btn');
const resultsBanner = document.getElementById('results-banner');
const averageValue = document.getElementById('average-value');
const shareBtn = document.getElementById('share-btn');
const toast = document.getElementById('toast');

// Init
roomCodeDisplay.textContent = roomCode;
renderCards();

// --- API helpers ---

async function api(endpoint, body) {
  const res = await fetch(`/api/rooms/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode, playerId, ...body }),
  });
  return res.json();
}

// --- Join room on load ---

async function init() {
  if (savedRoom === roomCode && savedName) {
    const res = await api('join', { name: savedName });
    if (res.error) {
      showToast(res.error);
      setTimeout(() => location.href = '/', 1500);
      return;
    }
    updateRoom(res.state);
    startStream();
  } else {
    location.href = `/?room=${roomCode}`;
  }
}

// --- SSE stream ---

let eventSource = null;

function startStream() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/rooms/stream?room=${roomCode}`);

  eventSource.onmessage = (e) => {
    const state = JSON.parse(e.data);
    updateRoom(state);
  };

  eventSource.addEventListener('error', (e) => {
    // EventSource auto-reconnects on network errors.
    // Custom error events from our stream carry data.
    if (e.data) {
      const err = JSON.parse(e.data);
      showToast(err.error || 'Connection lost');
    }
  });
}

// --- Room state rendering ---

function updateRoom(state) {
  isScrumMaster = state.scrumMaster === playerId;
  revealed = state.revealed;

  // Reset selection on clear
  if (!revealed) {
    const myParticipant = state.participants.find(p => p.id === playerId);
    if (myParticipant && !myParticipant.hasVoted) {
      selectedVote = null;
    }
  }

  renderParticipants(state.participants);
  updateControls(state);
  updateResults(state);
  updateCardStates();
}

function renderParticipants(participants) {
  const fragment = document.createDocumentFragment();
  participants.forEach(p => {
    const isMe = p.id === playerId;
    const div = document.createElement('div');
    div.className = 'participant' + (p.hasVoted ? ' voted' : '') + (isMe ? ' is-me' : '');
    div.dataset.id = p.id;

    if (revealed && p.vote !== null) {
      const voteSpan = document.createElement('span');
      voteSpan.className = 'vote-value';
      voteSpan.textContent = p.vote;
      div.appendChild(voteSpan);
    } else {
      const indicator = document.createElement('span');
      indicator.className = 'vote-indicator';
      div.appendChild(indicator);
    }

    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    div.appendChild(nameSpan);

    if (p.id === currentScrumMaster) {
      const badge = document.createElement('span');
      badge.className = 'sm-badge';
      badge.textContent = 'SM';
      div.appendChild(badge);
    }

    fragment.appendChild(div);
  });
  participantsEl.replaceChildren(fragment);
}

function updateControls(state) {
  currentScrumMaster = state.scrumMaster;

  if (isScrumMaster) {
    smControls.classList.remove('hidden');
    if (state.revealed) {
      revealBtn.classList.add('hidden');
      clearBtn.classList.remove('hidden');
    } else {
      revealBtn.classList.remove('hidden');
      clearBtn.classList.add('hidden');
    }
  } else {
    smControls.classList.add('hidden');
  }
}

function updateResults(state) {
  if (state.revealed && state.average !== null) {
    resultsBanner.classList.remove('hidden');
    averageValue.textContent = state.average;
  } else if (state.revealed) {
    resultsBanner.classList.remove('hidden');
    averageValue.textContent = '\u2014';
  } else {
    resultsBanner.classList.add('hidden');
  }
}

function updateCardStates() {
  document.querySelectorAll('.card').forEach(card => {
    card.classList.toggle('selected', card.dataset.value === selectedVote);
    card.classList.toggle('disabled', revealed);
  });
}

function renderCards() {
  const fragment = document.createDocumentFragment();
  CARD_VALUES.forEach(v => {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.value = v;
    div.textContent = v;
    fragment.appendChild(div);
  });
  cardsGrid.replaceChildren(fragment);

  cardsGrid.addEventListener('click', async (e) => {
    const card = e.target.closest('.card');
    if (!card || revealed) return;

    const value = card.dataset.value;
    if (selectedVote === value) {
      selectedVote = null;
      await api('vote', { vote: null });
    } else {
      selectedVote = value;
      await api('vote', { vote: value });
    }
    updateCardStates();
  });
}

// SM actions
revealBtn.addEventListener('click', () => api('reveal'));
clearBtn.addEventListener('click', () => {
  selectedVote = null;
  api('clear');
});

// Share
shareBtn.addEventListener('click', () => {
  const url = `${location.origin}/?room=${roomCode}`;
  if (navigator.share) {
    navigator.share({ title: 'Scrum Poker', text: `Join my Scrum Poker room: ${roomCode}`, url });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('Link copied!'));
  } else {
    showToast(`Share: ${url}`);
  }
});

// Toast
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

// Start
init();
```

**Step 2: Commit**

```bash
git add public/app.js
git commit -m "feat: rewrite app.js to use fetch + EventSource instead of Socket.IO"
```

---

### Task 11: Remove Socket.IO from room.html

**Files:**
- Modify: `public/room.html`

**Step 1: Remove the Socket.IO script tag**

In `public/room.html`, remove line 43:
```html
  <script src="/socket.io/socket.io.js"></script>
```

**Step 2: Commit**

```bash
git add public/room.html
git commit -m "chore: remove Socket.IO script tag from room.html"
```

---

### Task 12: Local Testing

**Step 1: Verify project structure**

```bash
ls api/rooms/
# Expected: create.js  join.js  vote.js  reveal.js  clear.js  stream.js
ls api/_lib/
# Expected: rooms.js
ls public/
# Expected: index.html  room.html  app.js  style.css
```

**Step 2: Run locally**

```bash
npx vercel dev
```

Open http://localhost:3000, create a room, open a second browser tab, join the same room. Verify:
- Creating a room works
- Joining a room works
- Voting shows up in real-time on the other tab
- Reveal/Clear works (SM only)
- Share button works

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during local testing"
```

---

### Task 13: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update to reflect new architecture**

Update `CLAUDE.md` to document the Vercel + KV architecture, new API routes, SSE stream, and `vercel dev` command.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Vercel architecture"
```
