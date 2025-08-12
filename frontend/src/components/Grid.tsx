import React, { useState, useEffect, useCallback } from "react";
import Cell from "./Cell";
import styles from "../styles/Grid.module.css";
import { getRandomShape } from "../constants/shapes";

const ROWS = 20;
const COLS = 10;

type Position = { x: number; y: number };

const COLORS = ["#CAADFF", "#FFADC7", "#F4C8A6", "#a8dadc", "#e2f0cb","#e9f5db"];


const Grid: React.FC = () => {
  const [activePiece, setActivePiece] = useState({
    shape: getRandomShape(),
    position: { x: 4, y: 0 } as Position,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]
  });

  const [lockedCells, setLockedCells] = useState<{ x: number; y: number; color: string }[]>([]);

  // collision detection
  const checkCollision = useCallback(
    (shape: number[][], position: Position) => {
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x]) {
            const newX = position.x + x;
            const newY = position.y + y;

            // out of bounds
            if (newX < 0 || newX >= COLS || newY >= ROWS) {
              return true;
            }

            // collides with locked block
            if (lockedCells.some(c => c.x === newX && c.y === newY)) {
              return true;
            }
          }
        }
      }
      return false;
    },
    [lockedCells]
  );

  // lock current piece
  const lockPiece = useCallback(() => {
    const newLocks = [...lockedCells];
    activePiece.shape.forEach((row, dy) => {
      row.forEach((cell, dx) => {
        if (cell) {
          newLocks.push({
            x: activePiece.position.x + dx,
            y: activePiece.position.y + dy,
            color: activePiece.color
          });
        }
      });
    });
    setLockedCells(newLocks);

    // spawn a new piece
    setActivePiece({
      shape: getRandomShape(),
      position: { x: 4, y: 0 },
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    });
  }, [activePiece, lockedCells]);

  // move piece down automatically
  useEffect(() => {
    const interval = setInterval(() => {
      const newPos = { ...activePiece.position, y: activePiece.position.y + 1 };

      if (!checkCollision(activePiece.shape, newPos)) {
        setActivePiece(prev => ({ ...prev, position: newPos }));
      } else {
        lockPiece();
      }
    }, 500); // falls every 500ms

    return () => clearInterval(interval);
  }, [activePiece, checkCollision, lockPiece]);

  // keyboard controls
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowDown") {
        const newPos = { ...activePiece.position };

        if (e.key === "ArrowLeft") newPos.x -= 1;
        if (e.key === "ArrowRight") newPos.x += 1;
        if (e.key === "ArrowDown") newPos.y += 1;

        if (!checkCollision(activePiece.shape, newPos)) {
          setActivePiece(prev => ({ ...prev, position: newPos }));
        }
      }

      // instant drop
      if (e.code === "Space") {
        const dropPos = { ...activePiece.position };
        while (!checkCollision(activePiece.shape, { ...dropPos, y: dropPos.y + 1 })) {
          dropPos.y += 1;
        }
        setActivePiece(prev => ({ ...prev, position: dropPos }));
        lockPiece();
      }
    },
    [activePiece, checkCollision, lockPiece]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // render grid
  const grid = Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) => {
      let color: string | null = null;

      // active piece cells
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

      // locked cells
      lockedCells.forEach(c => {
        if (c.x === col && c.y === row) {
          color = c.color;
        }
      });

      return <Cell key={`${row}-${col}`} filled={!!color} color={color || undefined} />;
    })
  );

  return <div className={styles.grid}>{grid}</div>;
};

export default Grid;