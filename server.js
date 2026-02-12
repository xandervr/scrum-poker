const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory rooms: code → { scrumMaster, participants: Map<socketId, {name, vote}>, revealed }
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function getRoomState(room) {
  const participants = [];
  for (const [id, p] of room.participants) {
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

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('create-room', (name, callback) => {
    const code = generateCode();
    const room = {
      scrumMaster: null, // assigned when creator joins via join-room
      creatorName: name,
      participants: new Map(),
      revealed: false,
    };
    rooms.set(code, room);
    callback({ code });
  });

  socket.on('join-room', (code, name, callback) => {
    code = code.toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return callback({ error: 'Room not found' });

    // First person to join becomes scrum master (the creator)
    if (room.scrumMaster === null) {
      room.scrumMaster = socket.id;
    }

    room.participants.set(socket.id, { name, vote: null });
    currentRoom = code;
    socket.join(code);
    callback({ code, state: getRoomState(room) });
    socket.to(code).emit('room-update', getRoomState(room));
  });

  socket.on('vote', (value) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.revealed) return;
    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.vote = value;
      io.to(currentRoom).emit('room-update', getRoomState(room));
    }
  });

  socket.on('reveal', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.scrumMaster !== socket.id) return;
    room.revealed = true;
    io.to(currentRoom).emit('room-update', getRoomState(room));
  });

  socket.on('clear', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.scrumMaster !== socket.id) return;
    room.revealed = false;
    for (const p of room.participants.values()) {
      p.vote = null;
    }
    io.to(currentRoom).emit('room-update', getRoomState(room));
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.participants.delete(socket.id);

    if (room.participants.size === 0) {
      rooms.delete(currentRoom);
    } else {
      // Transfer scrum master if they left
      if (room.scrumMaster === socket.id) {
        room.scrumMaster = room.participants.keys().next().value;
      }
      io.to(currentRoom).emit('room-update', getRoomState(room));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Scrum Poker running on http://localhost:${PORT}`);
});
