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
