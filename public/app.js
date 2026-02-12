const socket = io();
const CARD_VALUES = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '\u2615'];

const roomCode = new URLSearchParams(location.search).get('room');
const savedName = sessionStorage.getItem('poker-name');
const savedRoom = sessionStorage.getItem('poker-room');

if (!roomCode) {
  location.href = '/';
}

// State
let myId = null;
let isScrumMaster = false;
let selectedVote = null;
let revealed = false;

// DOM
const roomCodeDisplay = document.getElementById('room-code-display');
const participantsEl = document.getElementById('participants');
const cardsGrid = document.getElementById('cards-grid');
const smControls = document.getElementById('sm-controls');
const revealBtn = document.getElementById('reveal-btn');
const clearBtn = document.getElementById('clear-btn');
const resultsBanner = document.getElementById('results-banner');
const averageValue = document.getElementById('average-value');
const shareBtn = document.getElementById('share-btn');
const toast = document.getElementById('toast');

// Init
roomCodeDisplay.textContent = roomCode;
renderCards();

// Connect to room
socket.on('connect', () => {
  myId = socket.id;

  if (savedRoom === roomCode && savedName) {
    socket.emit('join-room', roomCode, savedName, handleJoin);
  } else {
    // No saved session — redirect to landing with room code pre-filled
    location.href = `/?room=${roomCode}`;
  }
});

function handleJoin(res) {
  if (res.error) {
    showToast(res.error);
    setTimeout(() => location.href = '/', 1500);
    return;
  }
  updateRoom(res.state);
}

// Real-time updates
socket.on('room-update', updateRoom);

function updateRoom(state) {
  isScrumMaster = state.scrumMaster === myId;
  revealed = state.revealed;

  renderParticipants(state.participants);
  updateControls(state);
  updateResults(state);
  updateCardStates();
}

function renderParticipants(participants) {
  participantsEl.innerHTML = participants.map(p => {
    const isMe = p.id === myId;
    const classes = ['participant'];
    if (p.hasVoted) classes.push('voted');
    if (isMe) classes.push('is-me');

    const smBadge = isScrumMasterId(p.id) ? '<span class="sm-badge">SM</span>' : '';
    const voteDisplay = revealed && p.vote !== null
      ? `<span class="vote-value">${escapeHtml(p.vote)}</span>`
      : `<span class="vote-indicator"></span>`;

    return `<div class="${classes.join(' ')}" data-id="${p.id}">
      ${voteDisplay}
      <span>${escapeHtml(p.name)}</span>
      ${smBadge}
    </div>`;
  }).join('');
}

let currentScrumMaster = null;
function isScrumMasterId(id) {
  return id === currentScrumMaster;
}

function updateControls(state) {
  currentScrumMaster = state.scrumMaster;

  if (isScrumMaster) {
    smControls.classList.remove('hidden');
    if (state.revealed) {
      revealBtn.classList.add('hidden');
      clearBtn.classList.remove('hidden');
    } else {
      revealBtn.classList.remove('hidden');
      clearBtn.classList.add('hidden');
    }
  } else {
    smControls.classList.add('hidden');
  }
}

function updateResults(state) {
  if (state.revealed && state.average !== null) {
    resultsBanner.classList.remove('hidden');
    averageValue.textContent = state.average;
  } else if (state.revealed) {
    resultsBanner.classList.remove('hidden');
    averageValue.textContent = '—';
  } else {
    resultsBanner.classList.add('hidden');
  }
}

function updateCardStates() {
  document.querySelectorAll('.card').forEach(card => {
    card.classList.toggle('selected', card.dataset.value === selectedVote);
    card.classList.toggle('disabled', revealed);
  });
}

function renderCards() {
  cardsGrid.innerHTML = CARD_VALUES.map(v =>
    `<div class="card" data-value="${escapeHtml(v)}">${escapeHtml(v)}</div>`
  ).join('');

  cardsGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card || revealed) return;

    const value = card.dataset.value;
    if (selectedVote === value) {
      // Deselect
      selectedVote = null;
      socket.emit('vote', null);
    } else {
      selectedVote = value;
      socket.emit('vote', value);
    }
    updateCardStates();
  });
}

// SM actions
revealBtn.addEventListener('click', () => socket.emit('reveal'));
clearBtn.addEventListener('click', () => {
  selectedVote = null;
  socket.emit('clear');
});

// Share
shareBtn.addEventListener('click', () => {
  const url = `${location.origin}/?room=${roomCode}`;
  if (navigator.share) {
    navigator.share({ title: 'Scrum Poker', text: `Join my Scrum Poker room: ${roomCode}`, url });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('Link copied!'));
  } else {
    showToast(`Share: ${url}`);
  }
});

// Toast
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

// Reset selection on clear
socket.on('room-update', (state) => {
  if (!state.revealed) {
    const myParticipant = state.participants.find(p => p.id === myId);
    if (myParticipant && myParticipant.vote === null) {
      selectedVote = null;
    }
  }
});

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
