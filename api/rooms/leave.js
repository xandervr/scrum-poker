import { getRoom, setRoom, getRoomState } from '../_lib/rooms.js';
import { getRedis } from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roomCode, playerId } = req.body;
  if (!roomCode || !playerId) return res.status(400).json({ error: 'Missing fields' });

  const code = roomCode.toUpperCase().trim();
  const room = await getRoom(code);
  if (!room) return res.json({ ok: true });

  delete room.participants[playerId];

  const remainingIds = Object.keys(room.participants);
  if (remainingIds.length === 0) {
    await getRedis().del(`room:${code}`);
    return res.json({ ok: true });
  }

  // Transfer scrum master if they left
  if (room.scrumMaster === playerId) {
    room.scrumMaster = remainingIds[0];
  }

  await setRoom(code, room);
  return res.json({ ok: true });
}
