import { getRoom, getRoomState } from '../_lib/rooms.js';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');

  const roomCode = req.query.room;
  if (!roomCode) return res.status(400).end('Missing room param');

  const code = roomCode.toUpperCase().trim();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const MAX_DURATION = 55000;
  const POLL_INTERVAL = 500;
  const start = Date.now();
  let lastUpdatedAt = 0;

  while (Date.now() - start < MAX_DURATION) {
    try {
      const room = await getRoom(code);
      if (!room) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Room not found' })}\n\n`);
        res.end();
        return;
      }

      if (room.updatedAt !== lastUpdatedAt) {
        lastUpdatedAt = room.updatedAt;
        const state = getRoomState(room);
        res.write(`data: ${JSON.stringify(state)}\n\n`);
      }
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Server error' })}\n\n`);
      res.end();
      return;
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  res.end();
}
