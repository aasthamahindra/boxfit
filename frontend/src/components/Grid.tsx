import React, { useState, useCallback } from "react";
import Cell from "./Cell";
import styles from "../styles/Grid.module.css";
import { getRandomShape, COLORS } from "../constants/shapes";

const ROWS = 12;
const COLS = 10;
const CELL_SIZE = 20;

type Position = { x: number; y: number };
type Piece = { shape: number[][]; position: Position; color: string };

/* helpers to convert between list of cells and a matrix */
const listToMatrix = (locks: { x: number; y: number; color: string }[]) => {
  const m: (string | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  locks.forEach(({ x, y, color }) => {
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) m[y][x] = color;
  });
  return m;
};

const matrixToList = (m: (string | null)[][]) => {
  const out: { x: number; y: number; color: string }[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = m[y][x];
      if (c) out.push({ x, y, color: c });
    }
  }
  return out;
};

const Grid: React.FC = () => {
  const createNewPiece = (): Piece => ({
    shape: getRandomShape(),
    position: { x: 4, y: 0 },
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  });

  const [activePiece, setActivePiece] = useState<Piece>(createNewPiece());
  const [lockedCells, setLockedCells] = useState<{ x: number; y: number; color: string }[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const checkCollision = useCallback(
    (shape: number[][], position: Position, locks: { x: number; y: number }[] = lockedCells) => {
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (!shape[y][x]) continue;

          const newX = position.x + x;
          const newY = position.y + y;

          // out of bounds
          if (newX < 0 || newX >= COLS || newY >= ROWS) return true;

          // collides with locked block
          if (locks.some((c) => c.x === newX && c.y === newY)) return true;
        }
      }
      return false;
    },
    [lockedCells]
  );

  /** clear full rows in a matrix and return a new matrix */
  const clearFullRowsMatrix = (m: (string | null)[][]) => {
    const keep = m.filter((row) => row.some((cell) => cell === null));
    const cleared = ROWS - keep.length;
    const topEmpty = Array.from({ length: cleared }, () => Array(COLS).fill(null));
    return { newMatrix: [...topEmpty, ...keep], cleared };
  };

  const lockPiece = useCallback(
    (piece?: Piece) => {
      const p = piece ?? activePiece;
      if (!p) return;

      // Merge piece into matrix
      const matrix = listToMatrix(lockedCells);
      p.shape.forEach((row, dy) =>
        row.forEach((cell, dx) => {
          if (!cell) return;
          const y = p.position.y + dy;
          const x = p.position.x + dx;
          if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
            matrix[y][x] = p.color;
          }
        })
      );

      const { newMatrix, cleared } = clearFullRowsMatrix(matrix);

      if (cleared > 0) {
        const points = cleared === 1 ? 100 : cleared === 2 ? 300 : cleared === 3 ? 500 : 800;
        setScore((prev) => prev + points);
      }

      const newLocks = matrixToList(newMatrix);
      setLockedCells(newLocks);

      // if new piece collides immediately -> game over
      const nextPiece = createNewPiece();
      if (checkCollision(nextPiece.shape, nextPiece.position, newLocks)) {
        setGameOver(true);
        return;
      }
      setActivePiece(nextPiece);
    },
    [activePiece, lockedCells, checkCollision]
  );

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (gameOver) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - activePiece.position.x * CELL_SIZE,
      y: e.clientY - activePiece.position.y * CELL_SIZE,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const gridX = Math.round((e.clientX - dragOffset.x) / CELL_SIZE);
    const gridY = Math.round((e.clientY - dragOffset.y) / CELL_SIZE);
    if (!checkCollision(activePiece.shape, { x: gridX, y: gridY })) {
      setActivePiece((prev) => ({ ...prev, position: { x: gridX, y: gridY } }));
    }
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    // Snap & lock the piece
    lockPiece(activePiece);
  };

  // Restart game
  const handleRestart = () => {
    setActivePiece(createNewPiece());
    setLockedCells([]);
    setScore(0);
    setGameOver(false);
  };

  const grid = Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) => {
      let color: string | null = null;
      activePiece.shape.forEach((shapeRow, dy) => {
        shapeRow.forEach((cell, dx) => {
          if (cell && activePiece.position.x + dx === col && activePiece.position.y + dy === row) {
            color = activePiece.color;
          }
        });
      });
      if (!color) {
        const lock = lockedCells.find((c) => c.x === col && c.y === row);
        if (lock) color = lock.color;
      }
      return <Cell key={`${row}-${col}`} filled={!!color} color={color || undefined} />;
    })
  );

  return (
    <div>
      {gameOver && (
        <div style={{ marginBottom: 12, color: "#f66", fontWeight: 700 }}>
          Game Over
          <button
            onClick={handleRestart}
            style={{
              marginLeft: 12,
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #999",
              cursor: "pointer",
            }}
          >
            Restart
          </button>
        </div>
      )}
      <div style={{ marginBottom: 8, fontWeight: 600 }}>Score: {score}</div>
      <div
        className={styles.grid}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {grid}
      </div>
    </div>
  );
};

export default Grid;