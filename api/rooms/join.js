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
