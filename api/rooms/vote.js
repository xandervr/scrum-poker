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
