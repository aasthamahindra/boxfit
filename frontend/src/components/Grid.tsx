import React, { useState, useEffect, useCallback } from "react";
import Cell from "./Cell";
import styles from "../styles/Grid.module.css";
import { getRandomShape, COLORS} from "../constants/shapes";

const ROWS = 20;
const COLS = 10;

type Position = { x: number; y: number };
type Piece = { shape: number[][]; position: Position; color: string };

/** helpers to convert between list of cells and a matrix */
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
  const [activePiece, setActivePiece] = useState<Piece>({
    shape: getRandomShape(),
    position: { x: 4, y: 0 },
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  });

  const [lockedCells, setLockedCells] = useState<{ x: number; y: number; color: string }[]>([]);
  const [gameOver, setGameOver] = useState(false);

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
    // keep rows that are not full
    const keep = m.filter((row) => row.some((cell) => cell === null));
    const cleared = ROWS - keep.length;
    const topEmpty = Array.from({ length: cleared }, () => Array(COLS).fill(null));
    return [...topEmpty, ...keep];
  };

  /** lock a piece and spawn a new one safely */
  const lockPiece = useCallback(
    (piece?: Piece) => {
      const p = piece ?? activePiece;
      if (!p) return;

      // Merge piece into matrix
      let matrix = listToMatrix(lockedCells);
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

      // clear full rows
      matrix = clearFullRowsMatrix(matrix);

      // update locked cells state
      const newLocks = matrixToList(matrix);
      setLockedCells(newLocks);

      // prepare new piece
      const nextPiece: Piece = {
        shape: getRandomShape(),
        position: { x: 4, y: 0 },
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };

      // if new piece collides immediately -> game over
      if (checkCollision(nextPiece.shape, nextPiece.position, newLocks)) {
        setGameOver(true);
        return;
      }
      setActivePiece(nextPiece);
    },
    [activePiece, lockedCells, checkCollision]
  );

  /** auto fall */
  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      const newPos = { x: activePiece.position.x, y: activePiece.position.y + 1 };
      if (!checkCollision(activePiece.shape, newPos)) {
        setActivePiece((prev) => ({ ...prev, position: newPos }));
      } else {
        // lock the current active piece exactly where it is
        lockPiece(activePiece);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [activePiece, checkCollision, lockPiece, gameOver]);

  /** keyboard controls */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (gameOver) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowDown") {
        const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const newPos = {
          x: activePiece.position.x + delta,
          y: activePiece.position.y + (e.key === "ArrowDown" ? 1 : 0),
        };

        if (!checkCollision(activePiece.shape, newPos)) {
          setActivePiece((prev) => ({ ...prev, position: newPos }));
        } else if (e.key === "ArrowDown") {
          // if moving down collides, lock where it currently is
          lockPiece(activePiece);
        }
      }

      if (e.code === "Space") {
        // hard drop: compute final position first, then lock using that exact piece
        let dropY = activePiece.position.y;
        while (!checkCollision(activePiece.shape, { x: activePiece.position.x, y: dropY + 1 })) {
          dropY += 1;
        }
        const dropped: Piece = { ...activePiece, position: { x: activePiece.position.x, y: dropY } };
        lockPiece(dropped);
      }
    },
    [activePiece, checkCollision, lockPiece, gameOver]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  /** render grid by overlaying activePiece on top of locked cells */
  const grid = Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) => {
      let color: string | null = null;

      // show active piece first so it appears above locks
      activePiece.shape.forEach((shapeRow, dy) => {
        shapeRow.forEach((cell, dx) => {
          if (
            cell &&
            activePiece.position.x + dx === col &&
            activePiece.position.y + dy === row
          ) {
            color = activePiece.color;
          }
        });
      });

      // then locked cells
      if (!color) {
        const lock = lockedCells.find((c) => c.x === col && c.y === row);
        if (lock) color = lock.color;
      }

      return <Cell key={`${row}-${col}`} filled={!!color} color={color || undefined} />;
    })
  );

  return (
    <div>
      {gameOver && <div style={{ marginBottom: 12, color: "#f66", fontWeight: 700 }}>Game Over</div>}
      <div className={styles.grid}>{grid}</div>
    </div>
  );
};

export default Grid;