# Vercel Migration Design

## Problem

The app uses Socket.IO which requires a persistent server process. Vercel is serverless — each request is a stateless function invocation. Socket.IO connections fail with "Session ID unknown" because there's no shared memory or persistent connection.

## Solution: SSE + Vercel KV

Replace Socket.IO with Server-Sent Events (SSE) from a Vercel Edge Function that polls Vercel KV for changes. Mutations go through serverless API routes.

## Architecture

```
Browser                     Vercel
┌─────────┐   POST /api/rooms/*        ┌──────────────┐
│         │ ──────────────────────────► │ Serverless   │──► KV
│ Client  │                             │ Functions    │
│         │   GET /api/rooms/stream     └──────────────┘
│         │ ──────────────────────────► ┌──────────────┐
│         │ ◄────── SSE (text/stream) ──│ Edge Function │──► KV (poll loop)
└─────────┘                             └──────────────┘
```

## KV Data Model

- Key: `room:{code}`, TTL: 24 hours
- Value:
  ```json
  {
    "scrumMaster": "player-id",
    "revealed": false,
    "updatedAt": 1234567890,
    "participants": {
      "player-id": { "name": "Alice", "vote": null }
    }
  }
  ```
- Player identity: `crypto.randomUUID()` stored in `sessionStorage` (replaces socket.id)

## API Routes

| Route | Runtime | Purpose |
|---|---|---|
| POST /api/rooms/create | Serverless | Generate room code, init state in KV |
| POST /api/rooms/join | Serverless | Add participant to room |
| POST /api/rooms/vote | Serverless | Update participant's vote |
| POST /api/rooms/reveal | Serverless | Set revealed: true (SM only) |
| POST /api/rooms/clear | Serverless | Reset votes (SM only) |
| GET /api/rooms/stream | Edge | SSE loop, poll KV ~500ms, push on change |

All POST endpoints receive `{ roomCode, playerId }` plus action-specific data.

## SSE Stream Behavior

- Edge Function, polls KV every ~500ms
- Sends full room state on first connect
- Subsequent pushes only when `updatedAt` changes
- Exits after ~25s (client auto-reconnects via EventSource before 30s edge timeout)

## Frontend Changes

- Remove socket.io, replace with fetch() for mutations + EventSource for stream
- Rendering logic unchanged (renderParticipants, renderCards, updateControls, updateResults)
- HTML and CSS unchanged

## Project Structure

```
api/rooms/{create,join,vote,reveal,clear,stream}.js
public/{index.html,room.html,app.js,style.css}
package.json (@vercel/kv replaces express/socket.io)
vercel.json (route config)
```

`server.js` deleted.
