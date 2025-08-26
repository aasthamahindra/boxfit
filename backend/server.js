const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

// socket.io for real-time connections
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 5000,
  maxHttpBufferSize: 1e6,
  serveClient: false,
});

// Track connections to prevent memory leaks
const activeConnections = new Set();

// Handle server errors (do not crash process)
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Game state
const gameRooms = new Map();
const players = new Map(); // socketId -> { roomId, playerName }

const GRID_ROWS = 10;
const GRID_COLS = 10;
const COLORS = ['#CAADFF', '#FFADC7', '#F4C8A6', '#a8dadc', '#e2f0cb', '#e9f5db'];

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  L: [[1, 0], [1, 0], [1, 1]],
  J: [[0, 1], [0, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
};

function rotateMatrix(matrix, times = 0) {
  let m = matrix.map((row) => row.slice());
  for (let t = 0; t < (times % 4 + 4) % 4; t++) {
    const rows = m.length, cols = m[0].length;
    const r = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        r[x][rows - 1 - y] = m[y][x];
      }
    }
    m = r;
  }
  return m;
}

function randomPiece() {
  const keys = Object.keys(SHAPES);
  const key = keys[Math.floor(Math.random() * keys.length)];
  return {
    id: Math.random().toString(36).slice(2, 9),
    shape: SHAPES[key],
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map(); // socketId -> { id, name, score }
    this.grid = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
    this.gameState = 'playing'; // collaborative by default
    this.maxPlayers = 8;
    this.lastActivity = Date.now();
  }

  addPlayer(socketId, playerName) {
    if (this.players.size >= this.maxPlayers) return false;
    this.players.set(socketId, { id: socketId, name: playerName, score: 0 });
    this.touch();
    return true;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.touch();
    return this.players.size === 0;
  }

  touch() { this.lastActivity = Date.now(); }

  canPlace(shape, x, y) {
    for (let ry = 0; ry < shape.length; ry++) {
      for (let rx = 0; rx < shape[ry].length; rx++) {
        if (!shape[ry][rx]) continue;
        const gx = x + rx;
        const gy = y + ry;
        if (gx < 0 || gy < 0 || gx >= GRID_COLS || gy >= GRID_ROWS) return false;
        if (this.grid[gy][gx] !== null) return false;
      }
    }
    return true;
  }

  placePiece({ socketId, shape, color, x, y }) {
    if (!this.players.has(socketId)) return { ok: false, reason: 'not-in-room' };
    if (!this.canPlace(shape, x, y)) return { ok: false, reason: 'invalid-placement' };
    let filled = 0;
    for (let ry = 0; ry < shape.length; ry++) {
      for (let rx = 0; rx < shape[ry].length; rx++) {
        if (!shape[ry][rx]) continue;
        this.grid[y + ry][x + rx] = color;
        filled += 1;
      }
    }
    const p = this.players.get(socketId);
    p.score += filled; // simple scoring: +1 per filled cell
    this.touch();
    return { ok: true, filled };
  }

  reset() {
    this.grid = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
    for (const p of this.players.values()) p.score = 0;
    this.touch();
  }

  state() {
    return {
      id: this.id,
      gameState: this.gameState,
      grid: this.grid,
      players: Array.from(this.players.values()),
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
    };
  }
}

// Clean up inactive rooms periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000;
  for (const [roomId, room] of gameRooms.entries()) {
    if (room.players.size === 0 || now - room.lastActivity > timeout) {
      gameRooms.delete(roomId);
      console.log(`Cleaned room ${roomId}`);
    }
  }
}, 5 * 60 * 1000);

io.on('connection', (socket) => {
  activeConnections.add(socket.id);
  console.log(`Connected: ${socket.id} (active: ${activeConnections.size})`);

  socket.on('disconnect', (reason) => {
    activeConnections.delete(socket.id);
    const pdata = players.get(socket.id);
    if (pdata) {
      const room = gameRooms.get(pdata.roomId);
      if (room) {
        const remove = room.removePlayer(socket.id);
        if (remove) gameRooms.delete(pdata.roomId);
        else socket.to(pdata.roomId).emit('game-state', room.state());
      }
      players.delete(socket.id);
    }
    console.log(`Disconnected: ${socket.id} (${reason})`);
  });

  socket.on('error', (err) => {
    console.error('Socket error', err);
  });

  socket.on('join-room', ({ playerName, roomId }) => {
    if (!playerName || !roomId) {
      socket.emit('join-error', { message: 'Player name and room ID are required' });
      return;
    }
    if (!gameRooms.has(roomId)) gameRooms.set(roomId, new GameRoom(roomId));
    const room = gameRooms.get(roomId);
    if (!room.addPlayer(socket.id, playerName)) {
      socket.emit('room-full', { message: 'Room is full', roomId, maxPlayers: room.maxPlayers });
      return;
    }
    players.set(socket.id, { roomId, playerName });
    socket.join(roomId);
    socket.emit('game-state', room.state());
    socket.to(roomId).emit('game-state', room.state());
  });

  socket.on('request-piece', ({ roomId }) => {
    const pdata = players.get(socket.id);
    if (!pdata || pdata.roomId !== roomId) return;
    socket.emit('piece', randomPiece());
  });

  socket.on('place-item', ({ roomId, piece, x, y, rotation }) => {
    const pdata = players.get(socket.id);
    if (!pdata || pdata.roomId !== roomId) return;
    const room = gameRooms.get(roomId);
    if (!room) return;
    const rotated = rotateMatrix(piece.shape, rotation || 0);
    const res = room.placePiece({ socketId: socket.id, shape: rotated, color: piece.color, x, y });
    socket.emit('placement-result', res);
    if (res.ok) io.to(roomId).emit('game-state', room.state());
  });

  socket.on('reset', ({ roomId }) => {
    const pdata = players.get(socket.id);
    if (!pdata || pdata.roomId !== roomId) return;
    const room = gameRooms.get(roomId);
    if (!room) return;
    room.reset();
    io.to(roomId).emit('game-state', room.state());
  });
});

server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});