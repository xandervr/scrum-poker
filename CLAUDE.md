# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Real-time Scrum Poker voting app. Vercel serverless backend with Vercel KV for state, SSE for real-time updates, vanilla JS frontend. No build step, no framework.

## Commands

- **Local dev**: `npm run dev` (runs `vercel dev`)
- **No test framework, linter, or build process configured**

## Architecture

**Backend** (`api/`): Vercel serverless functions for mutations, Edge Function for real-time SSE stream. Room state stored in Vercel KV as JSON under `room:{code}` keys with 24h TTL.

- `api/_lib/rooms.js` — Shared helpers: `generateCode`, `getRoom`, `setRoom`, `getRoomState`
- `api/rooms/create.js` — POST, creates room with caller as Scrum Master
- `api/rooms/join.js` — POST, adds participant to room
- `api/rooms/vote.js` — POST, updates participant's vote
- `api/rooms/reveal.js` — POST, reveals votes (SM only)
- `api/rooms/clear.js` — POST, resets all votes (SM only)
- `api/rooms/stream.js` — GET, Edge Function: polls KV every 500ms, pushes SSE events on change, exits after 25s (client auto-reconnects via EventSource)

**Frontend** (`public/`): Vanilla HTML/CSS/JS, no bundler.
- `index.html` — Landing page (create/join room), uses fetch for room creation
- `room.html` — Active voting room
- `app.js` — All client logic: fetch for mutations, EventSource for real-time updates, DOM API rendering
- `style.css` — Dark theme, mobile-first, CSS custom properties

**Player identity**: `crypto.randomUUID()` stored in `sessionStorage` (replaces socket.id from previous Socket.IO architecture).

**Key behavior**: Room creator is Scrum Master. Only SM can reveal/clear votes. Non-numeric votes (?, coffee) excluded from average. Rooms auto-expire after 24h via KV TTL.

## Deployment

Deployed to Vercel. Config in `vercel.json` (rewrites `/*` to `public/*`). Requires Vercel KV store connected to the project.
