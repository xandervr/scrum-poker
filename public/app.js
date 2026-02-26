const CARD_VALUES = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '\u2615'];

const roomCode = new URLSearchParams(location.search).get('room');
const savedName = sessionStorage.getItem('poker-name');
const savedRoom = sessionStorage.getItem('poker-room');

if (!roomCode) {
  location.href = '/';
}

// Player identity
function getPlayerId() {
  let id = localStorage.getItem('poker-player-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('poker-player-id', id);
  }
  return id;
}

const playerId = getPlayerId();

// State
let isScrumMaster = false;
let selectedVote = null;
let revealed = false;
let currentScrumMaster = null;

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
const leaveBtn = document.getElementById('leave-btn');
const toast = document.getElementById('toast');

// Init
roomCodeDisplay.textContent = roomCode;
renderCards();

// --- API helpers ---

async function api(endpoint, body) {
  const res = await fetch(`/api/rooms/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode, playerId, ...body }),
  });
  return res.json();
}

// --- Join room on load ---

async function init() {
  if (savedRoom === roomCode && savedName) {
    const res = await api('join', { name: savedName });
    if (res.error) {
      showToast(res.error);
      setTimeout(() => location.href = '/', 1500);
      return;
    }
    updateRoom(res.state);
    startStream();
  } else {
    location.href = `/?room=${roomCode}`;
  }
}

// --- SSE stream ---

let eventSource = null;

function startStream() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/rooms/stream?room=${roomCode}`);

  eventSource.onmessage = (e) => {
    const state = JSON.parse(e.data);
    updateRoom(state);
  };

  eventSource.addEventListener('error', (e) => {
    // EventSource auto-reconnects on network errors.
    // Custom error events from our stream carry data.
    if (e.data) {
      const err = JSON.parse(e.data);
      showToast(err.error || 'Connection lost');
    }
  });
}

// --- Room state rendering ---

function updateRoom(state) {
  isScrumMaster = state.scrumMaster === playerId;
  revealed = state.revealed;

  // Reset selection on clear
  if (!revealed) {
    const myParticipant = state.participants.find(p => p.id === playerId);
    if (myParticipant && !myParticipant.hasVoted) {
      selectedVote = null;
    }
  }

  renderParticipants(state.participants);
  updateControls(state);
  updateResults(state);
  updateCardStates();
}

function renderParticipants(participants) {
  const fragment = document.createDocumentFragment();
  participants.forEach(p => {
    const isMe = p.id === playerId;
    const div = document.createElement('div');
    div.className = 'participant' + (p.hasVoted ? ' voted' : '') + (isMe ? ' is-me' : '');
    div.dataset.id = p.id;

    if (revealed && p.vote !== null) {
      const voteSpan = document.createElement('span');
      voteSpan.className = 'vote-value';
      voteSpan.textContent = p.vote;
      div.appendChild(voteSpan);
    } else {
      const indicator = document.createElement('span');
      indicator.className = 'vote-indicator';
      div.appendChild(indicator);
    }

    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    div.appendChild(nameSpan);

    if (p.id === currentScrumMaster) {
      const badge = document.createElement('span');
      badge.className = 'sm-badge';
      badge.textContent = 'SM';
      div.appendChild(badge);
    }

    fragment.appendChild(div);
  });
  participantsEl.replaceChildren(fragment);
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
    averageValue.textContent = '\u2014';
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
  const fragment = document.createDocumentFragment();
  CARD_VALUES.forEach(v => {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.value = v;
    div.textContent = v;
    fragment.appendChild(div);
  });
  cardsGrid.replaceChildren(fragment);

  cardsGrid.addEventListener('click', async (e) => {
    const card = e.target.closest('.card');
    if (!card || revealed) return;

    const value = card.dataset.value;
    if (selectedVote === value) {
      selectedVote = null;
      await api('vote', { vote: null });
    } else {
      selectedVote = value;
      await api('vote', { vote: value });
    }
    updateCardStates();
  });
}

// SM actions
revealBtn.addEventListener('click', () => api('reveal'));
clearBtn.addEventListener('click', () => {
  selectedVote = null;
  api('clear');
});

// Leave
function leaveRoom() {
  if (eventSource) eventSource.close();
  navigator.sendBeacon(
    `/api/rooms/leave`,
    new Blob([JSON.stringify({ roomCode, playerId })], { type: 'application/json' })
  );
}

leaveBtn.addEventListener('click', () => {
  leaveRoom();
  sessionStorage.removeItem('poker-room');
  location.href = '/';
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

// Start
init();
