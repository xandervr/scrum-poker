import { generateCode, setRoom } from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, name } = req.body;
  if (!playerId || !name) return res.status(400).json({ error: 'Missing playerId or name' });

  const code = await generateCode();
  const room = {
    scrumMaster: playerId,
    revealed: false,
    updatedAt: Date.now(),
    participants: {
      [playerId]: { name, vote: null },
    },
  };

  await setRoom(code, room);
  return res.json({ code });
}
