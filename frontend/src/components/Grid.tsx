import React, { useState, useRef, useEffect, useCallback } from "react";
import type { JSX } from 'react';
import styles from "../styles/Grid.module.css";
import { type Socket, io } from "socket.io-client";

// Shape definitions for the pieces
const SHAPES = {
  I: [
    [1, 1, 1, 1]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1]
  ]
} as const;

type ShapeType = keyof typeof SHAPES;

const ROWS = 20;
const COLS = 10;

// Position type will be defined when needed

interface Player {
  id: string;
  name: string;
  score: number;
  grid: (string | null)[][];
  isAlive: boolean;
  linesCleared: number;
  isReady?: boolean;
  ready?: boolean;
}

interface ServerPiece {
  shape: string;
  color: string;
  id: string;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  linesCleared: number;
  isAlive: boolean;
}

interface GameState {
  id: string;
  gameState: 'waiting' | 'playing' | 'ended';
  players: Player[];
  currentPieces: ServerPiece[];
  leaderboard: LeaderboardEntry[];
  playerCount: number;
  maxPlayers: number;
  currentTurn?: string | null;
  currentPiece?: {
    shape: number[][];
    position: { x: number; y: number };
    color: string;
  } | null;
  lockedCells?: Array<{ x: number; y: number; color: string }>;
  winner?: string;
}

interface GridProps {
  playerName: string;
  roomId: string;
}

const Grid: React.FC<GridProps> = ({ playerName, roomId }): JSX.Element => {
  // State management with proper types
  const [gameState, setGameState] = useState<GameState>({
    id: '',
    gameState: 'waiting',
    players: [],
    currentPieces: [],
    leaderboard: [],
    playerCount: 0,
    maxPlayers: 2,
    currentTurn: null,
    currentPiece: null,
    lockedCells: []
  });
  
  const [lockedCells, setLockedCells] = useState<Array<{ x: number; y: number; color: string }>>([]);
  const [currentPiece, setCurrentPiece] = useState<{ 
    shape: number[][]; 
    position: { x: number; y: number }; 
    color: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [score, setScore] = useState<number>(0);
  const [, setLinesCleared] = useState<number>(0);

  // Initialize socket connection and state
  useEffect(() => {
    const socket = io('http://localhost:3000');
    socketRef.current = socket;

    const handleGameStateUpdate = (state: Partial<GameState>): void => {
      console.log('Game state updated:', state);
      setGameState(prev => ({
        ...prev,
        ...state,
        currentTurn: state.currentTurn ?? prev.currentTurn ?? null,
        currentPiece: state.currentPiece ?? prev.currentPiece ?? null,
        lockedCells: state.lockedCells ?? prev.lockedCells ?? []
      }));

      // Update current player ID if available
      if (state.currentTurn) {
        setCurrentPlayerId(state.currentTurn);
      }
    };

    const handlePlayerUpdate = (player: Player): void => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => p.id === player.id ? { ...p, ...player } : p)
      }));
    };

    socket.on('connect', () => {
      console.log('Connected to server');
      socket.emit('join-room', { playerName, roomId });
    });

    // Set up event listeners
    socket.on('game-state', handleGameStateUpdate);
    socket.on('player-update', handlePlayerUpdate);
    
    // Cleanup on unmount
    return (): void => {
      socket.off('game-state', handleGameStateUpdate);
      socket.off('player-update', handlePlayerUpdate);
      socket.disconnect();
    };
  }, [playerName, roomId]);
  
  // Get the other player's name

  // Player info section
  
  // Predefined colors for pieces

  useEffect(() => {
    const newSocket = io('http://localhost:3000');
    socketRef.current = newSocket;

    const handleGameStateUpdate = (state: any) => {
      console.log('Game state updated:', state);
      setGameState(state);
      
      // Update local state based on the current player's grid
      const currentPlayer = state.players.find((p: any) => p.id === newSocket.id);
      if (currentPlayer) {
        const cells: { x: number; y: number; color: string }[] = [];
        currentPlayer.grid.forEach((row: any[], y: number) => {
          row.forEach((cell, x) => {
            if (cell) {
              cells.push({ x, y, color: cell });
            }
          });
        });
        setLockedCells(cells);
        // Score and lines cleared are now part of the game state
      }
      
      // Update current player ID if available
      if (state.currentPlayerId) {
        setCurrentPlayerId(state.currentPlayerId);
      }
    };

    newSocket.on('connect', () => {
      console.log('Connected to server');
      newSocket.emit('join-room', { playerName, roomId });
    });

    // Handle game state updates
    newSocket.on('game-state', (state: any) => {
      handleGameStateUpdate(state);
    });
    
    // Handle game started event
    newSocket.on('game-started', (state: any) => {
      console.log('Game started:', state);
      handleGameStateUpdate(state);
      
      // Reset local state
      setLockedCells([]);
      setScore(0);
      setLinesCleared(0);
      
      // Generate initial piece if available
      if (state.currentPieces && state.currentPieces.length > 0) {
        const piece = state.currentPieces[0];
        setCurrentPiece({
          shape: SHAPES[piece.shape as ShapeType].map(row => [...row]),
          position: { x: 4, y: 0 },
          color: piece.color
        });
      }
    });

    // Handle turn changes
    newSocket.on('turn-changed', ({ currentPlayer, gameState: updatedState }: { currentPlayer: string, gameState: any }) => {
      console.log('Turn changed to player:', currentPlayer);
      setCurrentPlayerId(currentPlayer);
      if (updatedState) {
        handleGameStateUpdate(updatedState);
      }
    });

    // Handle game ended
    newSocket.on('game-ended', (winner: string) => {
      console.log('Game ended, winner:', winner);
      setGameState(prev => ({
        ...prev,
        gameState: 'ended',
        winner
      }));
    });

    // Handle player ready updates
    newSocket.on('player-ready-update', ({ playerId, isReady }: { playerId: string, isReady: boolean }) => {
      console.log(`Player ${playerId} ready: ${isReady}`);
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(player => 
          player.id === playerId ? { ...player, isReady } : player
        )
      }));
    });

    // Handle join errors
    newSocket.on('join-error', (error: string) => {
      console.error('Failed to join room:', error);
    });

    // Handle player joined
    newSocket.on('player-joined', (data: { playerName: string, playerCount: number, gameState?: any }) => {
      console.log(`Player ${data.playerName} joined the room`);
      if (data.gameState) {
        handleGameStateUpdate(data.gameState);
      }
    });

    // Clean up on unmount
    return () => {
      console.log('Disconnecting socket');
      newSocket.disconnect();
    };
  }, [roomId, playerName]);

  // Generate a random piece

  // Check if a position is valid for the current piece

  // Handle mouse down on a piece

  // Handle mouse up event
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !currentPiece) return;
    
    const gridElement = gridRef.current;
    if (!gridElement) return;
    
    const rect = gridElement.getBoundingClientRect();
    if (!rect) return;
    
    const gridX = Math.floor((e.clientX - rect.left - dragOffset.x) / 25);
    const gridY = Math.floor((e.clientY - rect.top - dragOffset.y) / 25);
    
    // Emit the piece placement to the server
    if (socketRef.current) {
      socketRef.current.emit('place-piece', {
        x: gridX,
        y: gridY,
        roomId
      });
    }
    
    setIsDragging(false);
  }, [currentPiece, dragOffset.x, dragOffset.y, isDragging, roomId]);

  // Handle starting the game

  // Handle mouse down on grid
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    if (!currentPiece) return;
    
    const gridElement = gridRef.current;
    if (!gridElement) return;
    
    const rect = gridElement.getBoundingClientRect();
    if (!rect) return;
    
    const offsetY = e.clientY - rect.top - currentPiece.position.y * 25;
    
    setDragOffset({ x: 0, y: offsetY });
    setIsDragging(true);
  }, [currentPiece]);

  // Render the game grid with proper TypeScript types
  const renderGrid = useCallback((): JSX.Element => {
    const gridCells: JSX.Element[] = [];
    
    // Create empty grid with proper typing
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = lockedCells.find(cell => cell.x === x && cell.y === y);
        
        // Check if current cell is part of the current piece
        if (currentPiece) {
          const { shape, position, color } = currentPiece;
          const localX = x - position.x;
          const localY = y - position.y;
          
          if (
            localY >= 0 && 
            localY < shape.length && 
            localX >= 0 && 
            localX < shape[localY].length && 
            shape[localY][localX]
          ) {
            gridCells.push(
              <div 
                key={`${x}-${y}`}
                className={`${styles.cell} ${styles.currentPiece}`}
                style={{
                  gridColumn: x + 1,
                  gridRow: y + 1,
                  backgroundColor: color,
                  border: '1px solid #fff'
                }}
              />
            );
            continue;
          }
        }
        
        if (cell) {
          gridCells.push(
            <div 
              key={`${x}-${y}`}
              className={`${styles.cell} ${styles[cell.color]}`}
              style={{
                gridColumn: x + 1,
                gridRow: y + 1,
                backgroundColor: cell.color,
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            />
          );
        } else {
          gridCells.push(
            <div 
              key={`${x}-${y}`}
              className={styles.cell}
              style={{
                gridColumn: x + 1,
                gridRow: y + 1,
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            />
          );
        }
      }
    }
    
    return (
      <div 
        ref={gridRef}
        className={styles.grid}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {gridCells}
      </div>
    );
  }, [lockedCells, currentPiece, handleMouseDown, handleMouseUp]);

  // Handle game restart
  const handleRestart = useCallback((): void => {
    if (socketRef.current) {
      socketRef.current.emit('restart-game');
      setScore(0);
      setLinesCleared(0);
      setLockedCells([]);
      setCurrentPiece(null);
    }
  }, []);

  return (
    <div className={styles.gridContainer}>
      {/* Left Panel - Game Info */}
      <div className={styles.leftPanel}>
        <div className={styles.gameInfo}>
          <h2>Room: {roomId}</h2>
          <div className={styles.playersList}>
            <h3>Players:</h3>
            {gameState.players.length > 0 ? (
              gameState.players.map((player) => (
                <div key={player.id} className={`${styles.playerItem} ${player.id === currentPlayerId ? styles.currentPlayer : ''}`}>
                  {player.name} {player.id === currentPlayerId && '(You)'}
                </div>
              ))
            ) : (
              <div className={styles.noPlayers}>No players yet</div>
            )}
          </div>
          
          {/* Current Player Status */}
          <div className={styles.playerStatus}>
            {currentPlayerId === socketRef.current?.id ? '(Your turn)' : '(Waiting...)'}
          </div>
        </div>
      </div>

      {/* Main Game Grid */}
      <div className={styles.grid} ref={gridRef}>
        {renderGrid()}
        
        {/* Game Over Overlay */}
        {gameState.gameState === 'ended' && (
          <div className={styles.overlay}>
            <div className={styles.overlayContent}>
              <h2>Game Over!</h2>
              <p>
                {gameState.winner === socketRef.current?.id 
                  ? 'You won!' 
                  : `${gameState.players.find(p => p.id === gameState.winner)?.name || 'Player'} won!`}
              </p>
              <button onClick={handleRestart} className={styles.button}>
                Play Again
              </button>
            </div>
          </div>
        )}
        
        {/* Waiting to Start Overlay */}
        {gameState.gameState === 'waiting' && (
          <div className={styles.overlay}>
            <div className={styles.overlayContent}>
              <h2>Waiting for players...</h2>
              <p>
                {gameState.gameState === 'waiting' 
                  ? 'Waiting for the game to start...' 
                  : `Your score: ${score}`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Leaderboard */}
      <div className={styles.rightPanel}>
        <div className={styles.sectionTitle}>LEADERBOARD</div>
        <div className={styles.leaderboard}>
          {gameState.leaderboard.length > 0 ? (
            gameState.leaderboard.map((entry) => (
              <div key={entry.rank} className={styles.leaderboardEntry}>
                <span className={styles.rank}>#{entry.rank}</span>
                <span className={styles.leaderboardName}>{entry.name}</span>
                <span className={styles.leaderboardScore}>{entry.score}</span>
              </div>
            ))
          ) : (
            <div className={styles.noPlayers}>No players yet</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Grid;