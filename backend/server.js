const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
}));
app.use(express.json());

// socket.io for real-time connections
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// game state management
const gameRooms = new Map();
const players = new Map();

class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.gameState = 'waiting';
        this.currentPieces = this.generateNewPieces();
        this.leaderboard = [];
        this.maxPlayers = 2;
        this.currentTurn = null;
    }

    generateNewPieces() {
        const shapes = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];
        const colors = ["#CAADFF", "#FFADC7", "#F4C8A6", "#a8dadc", "#e2f0cb", "#e9f5db"];

        return Array.from({ length: 3 }, () => ({
            shape: shapes[Math.floor(Math.random() * shapes.length)],
            color: colors[Math.floor(Math.random() * colors.length)],
            id: Math.random().toString(36).substr(2, 9)
        }));
    }

    addPlayer(socketId, playerName) {
        if (this.players.size >= this.maxPlayers) return false;

        const newPlayer = {
            id: socketId,
            name: playerName,
            score: 0,
            grid: Array.from({ length: 20 }, () => Array(10).fill(null)),
            isAlive: true,
            linesCleared: 0,
            isReady: false
        };

        this.players.set(socketId, newPlayer);

        // If this is the first player, set them as the current turn
        if (this.players.size === 1) {
            this.currentTurn = socketId;
        }

        this.updateLeaderboard();
        return true;
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        this.updateLeaderboard();

        if (this.players.size === 0) {
            return true;
        }
        return false;
    }

    updatePlayerScore(socketId, score, linesCleared) {
        const player = this.players.get(socketId);
        if (player) {
            player.score = score;
            player.linesCleared = linesCleared;
            this.updateLeaderboard();
        }
    }

    updateLeaderboard() {
        this.leaderboard = Array.from(this.players.values())
            .sort((a, b) => b.score - a.score)
            .map((player, index) => ({
                rank: index + 1,
                name: player.name,
                score: player.score,
                linesCleared: player.linesCleared,
                isAlive: player.isAlive
            }));
    }

    startGame() {
        if (this.players.size < 2) return false;
        
        // Check if all players are ready
        const allReady = Array.from(this.players.values()).every(player => player.isReady);
        if (!allReady) return false;
        
        this.gameState = 'playing';
        this.currentPieces = this.generateNewPieces();
        this.currentTurn = Array.from(this.players.keys())[0]; // Start with the first player
        return true;
    }
    
    // Switch turns between players
    switchTurn() {
        const playerIds = Array.from(this.players.keys());
        const currentIndex = playerIds.indexOf(this.currentTurn);
        const nextIndex = (currentIndex + 1) % playerIds.length;
        this.currentTurn = playerIds[nextIndex];
        return this.currentTurn;
    }
    
    // Validate a move
    isValidMove(playerId, piece, position) {
        const player = this.players.get(playerId);
        if (!player) return false;
        
        // Check if it's the player's turn
        if (this.currentTurn !== playerId) return false;
        
        // Check boundaries
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x] === 0) continue;
                
                const boardX = position.x + x;
                const boardY = position.y + y;
                
                // Check if position is within grid bounds
                if (boardX < 0 || boardX >= 10 || boardY < 0 || boardY >= 20) {
                    return false;
                }
                
                // Check for collision with existing pieces
                if (player.grid[boardY][boardX] !== null) {
                    return false;
                }
            }
        }
        return true;
    }
    
    // Update player's grid with a new piece
    updatePlayerGrid(playerId, piece, position) {
        const player = this.players.get(playerId);
        if (!player) return false;
        
        // Add the piece to the player's grid
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x] === 0) continue;
                
                const boardX = position.x + x;
                const boardY = position.y + y;
                
                // Only update if within bounds
                if (boardX >= 0 && boardX < 10 && boardY >= 0 && boardY < 20) {
                    player.grid[boardY][boardX] = piece.color;
                }
            }
        }
        
        // Check for completed lines
        this.checkLines(player);
        
        // Update leaderboard
        this.updateLeaderboard();
        
        return true;
    }
    
    // Check for completed lines and update score
    checkLines(player) {
        let linesCleared = 0;
        
        // Check each row from bottom to top
        for (let y = 19; y >= 0; y--) {
            if (player.grid[y].every(cell => cell !== null)) {
                // Remove the line
                player.grid.splice(y, 1);
                // Add a new empty line at the top
                player.grid.unshift(Array(10).fill(null));
                linesCleared++;
                y++; // Check the same row again since we moved everything down
            }
        }
        
        if (linesCleared > 0) {
            // Update score based on lines cleared
            const linePoints = [0, 100, 300, 500, 800]; // Points for 0-4 lines
            const points = linesCleared < linePoints.length ? linePoints[linesCleared] : 800;
            
            player.score += points;
            player.linesCleared += linesCleared;
            
            // Check for win condition (example: first to clear 10 lines)
            if (player.linesCleared >= 10) {
                this.gameState = 'ended';
                // You might want to handle game end logic here
            }
        }
    }
    
    // Get current game state
    getState() {
        return {
            id: this.id,
            gameState: this.gameState,
            players: Array.from(this.players.values()),
            currentPieces: this.currentPieces,
            leaderboard: this.leaderboard,
            playerCount: this.players.size,
            maxPlayers: this.maxPlayers,
            currentPlayerId: this.currentTurn
        };
    }

    getGameData() {
        return {
            id: this.id,
            gameState: this.gameState,
            players: Array.from(this.players.values()),
            currentPieces: this.currentPieces,
            leaderboard: this.leaderboard,
            playerCount: this.players.size,
            maxPlayers: this.maxPlayers
        };
    }
}

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);
    
    // Handle player ready state
    socket.on('player-ready', ({ roomId }) => {
        const room = gameRooms.get(roomId);
        if (room) {
            const player = room.players.get(socket.id);
            if (player) {
                player.isReady = true;
                io.to(roomId).emit('game-state', room.getState());
                
                // If all players are ready, start the game
                const allReady = Array.from(room.players.values()).every(p => p.isReady);
                if (allReady && room.players.size >= 2) {
                    if (room.startGame()) {
                        io.to(roomId).emit('game-started', room.getState());
                    }
                }
            }
        }
    });
    
    // Handle piece placement
    socket.on('place-piece', ({ roomId, piece, position }) => {
        const room = gameRooms.get(roomId);
        if (room && room.gameState === 'playing' && room.currentTurn === socket.id) {
            // Validate the move
            if (room.isValidMove(socket.id, piece, position)) {
                // Update the player's grid
                if (room.updatePlayerGrid(socket.id, piece, position)) {
                    // Get the updated game state
                    const gameState = room.getState();
                    
                    // Switch turns
                    const nextPlayerId = room.switchTurn();
                    
                    // Emit the updated game state to all players
                    io.to(roomId).emit('game-state', gameState);
                    io.to(roomId).emit('turn-changed', { 
                        currentPlayer: nextPlayerId,
                        gameState: room.getState()
                    });
                    
                    console.log(`Player ${socket.id} placed piece. Next turn: ${nextPlayerId}`);
                }
            }
        }
    });

    // join or create a room
    socket.on('join-room', (data) => {
        const { roomId, playerName } = data;

        let room = gameRooms.get(roomId);
        if (!room) {
            room = new GameRoom(roomId);
            gameRooms.set(roomId, room);
        }

        if (room.addPlayer(socket.id, playerName)) {
            socket.join(roomId);
            players.set(socket.id, { roomId, playerName });

            // Get the current game state
            const gameState = room.getState();
            
            // send initial game state to the player with their ID
            socket.emit('game-state', {
                ...gameState,
                currentPlayerId: socket.id,  // Let the client know their own ID
                playerName                   // Include the player's name in the initial state
            });

            // notify other players
            socket.to(roomId).emit('player-joined', {
                playerName,
                playerId: socket.id,
                playerCount: room.players.size,
                gameState: room.getState()
            });

            // update all players with new game state
            io.to(roomId).emit('game-state', room.getState());

            console.log(`Player ${playerName} (${socket.id}) joined room ${roomId}`, gameState);
        } else {
            socket.emit('join-error', 'Room is full');
        }
    });

    // handle piece placement
    socket.on('piece-placed', (data) => {
        const playerData = players.get(socket.id);
        if (!playerData) return;

        const room = gameRooms.get(playerData.roomId);
        if (!room) return;

        const { score, linesCleared, grid } = data;

        // update player data
        room.updatePlayerScore(socket.id, score, linesCleared);
        const player = room.players.get(socket.id);
        if (player) {
            player.grid = grid;
        }

        // check if new pieces should be generated
        if (data.piecesUsed >= 2) {
            room.currentPieces = room.generateNewPieces();
        }

        // broadcast updated game state
        io.to(playerData.roomId).emit('game-state', room.getGameData());
    });

    // handle game over
    socket.on('game-over', (data) => {
        const playerData = players.get(socket.id);
        if (!playerData) return;

        const room = gameRooms.get(playerData.roomId);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (player) {
            player.isAlive = false;
            room.updateLeaderboard();
        }

        // check if all players are eliminated
        const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
        if (alivePlayers.length <= 1) {
            room.gameState = 'ended';
        }

        io.to(playerData.roomId).emit('game-state', room.getGameData());
    });

    // start game
    socket.on('start-game', () => {
        const playerData = players.get(socket.id);
        if (!playerData) return;

        const room = gameRooms.get(playerData.roomId);
        if (!room) return;

        room.startGame();
        io.to(playerData.roomId).emit('game-started', room.getGameData());
    });

    // restart game
    socket.on('restart-game', () => {
        const playerData = players.get(socket.id);
        if (!playerData) return;

        const room = gameRooms.get(playerData.roomId);
        if (!room) return;

        // reset all players
        room.players.forEach(player => {
            player.score = 0;
            player.linesCleared = 0;
            player.isAlive = true;
            player.grid = Array.from({ length: 12 }, () => Array(10).fill(null));
        });

        room.gameState = 'waiting';
        room.currentPieces = room.generateNewPieces();
        room.updateLeaderboard();

        io.to(playerData.roomId).emit('game-restarted', room.getGameData());
    });

    // handle disconnect
    socket.on('disconnect', () => {
        const playerData = players.get(socket.id);
        if (playerData) {
            const room = gameRooms.get(playerData.roomId);
            if (room) {
                const shouldDeleteRoom = room.removePlayer(socket.id);

                if (shouldDeleteRoom) {
                    gameRooms.delete(playerData.roomId);
                } else {
                    // notify remaining players
                    socket.to(playerData.roomId).emit('player-left', {
                        playerName: playerData.playerName,
                        playerCount: room.players.size
                    });

                    // update game state
                    io.to(playerData.roomId).emit('game-state', room.getGameData());
                }
            }
            players.delete(socket.id);
        }
        console.log(`User disconnected: ${socket.id}`);
    });

    // get room list
    socket.on('get-rooms', () => {
        const roomList = Array.from(gameRooms.values()).map(room => ({
            id: room.id,
            playerCount: room.players.size,
            maxPlayers: room.maxPlayers,
            gameState: room.gameState
        }));
        socket.emit('room-list', roomList);
    });
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});