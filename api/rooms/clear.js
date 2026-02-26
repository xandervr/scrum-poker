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
