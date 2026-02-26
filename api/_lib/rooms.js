import Redis from 'ioredis';

const ROOM_TTL = 60 * 60 * 24; // 24 hours
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let redis;
export function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL);
  }
  return redis;
}

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
  const data = await getRedis().get(`room:${code}`);
  return data ? JSON.parse(data) : null;
}

export async function setRoom(code, room) {
  room.updatedAt = Date.now();
  await getRedis().set(`room:${code}`, JSON.stringify(room), 'EX', ROOM_TTL);
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
