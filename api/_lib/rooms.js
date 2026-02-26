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
