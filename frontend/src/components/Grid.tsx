import { useEffect, useRef, useState, type JSX } from 'react';
import type { Socket } from 'socket.io-client';
import io from 'socket.io-client';
import styles from '../styles/Grid.module.css';

const ROWS = 10;
const COLS = 10;

type GridCell = string | null;

type Player = { id: string; name: string; score: number };

type Piece = { id: string; shape: number[][]; color: string };

type ServerState = {
  id: string;
  gameState: 'playing' | 'waiting' | 'ended';
  grid: GridCell[][];
  players: Player[];
  playerCount: number;
  maxPlayers: number;
  activePlayerId?: string | null;
  turnEndsAt?: number;
  turnDurationMs?: number;
};

interface GridProps {
  playerName: string;
  roomId: string;
}

const Grid: React.FC<GridProps> = ({ playerName, roomId }) => {
  const socketRef = useRef<Socket | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<ServerState>({
    id: roomId,
    gameState: 'playing',
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    players: [],
    playerCount: 0,
    maxPlayers: 8,
    activePlayerId: null,
    turnEndsAt: 0,
    turnDurationMs: 30000,
  });

  const [me, setMe] = useState<string>('');
  const [piece, setPiece] = useState<Piece | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const awaitingPlacementRef = useRef(false);
  const dragImageRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const isSafariRef = useRef(false);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // connect socket
  useEffect(() => {
    const socket = io('http://localhost:3000', { transports: ['websocket'] });
    socketRef.current = socket;

    const onGameState = (s: ServerState) => setState(s);
    const onPiece = (p: Piece) => {
      setRotation(0);
      setPiece(p);
    };
    const onPlacement = (res: { ok: boolean; reason?: string }) => {
      awaitingPlacementRef.current = false;
      if (res.ok) {
        setErrorMsg('');
        // server advances turn; clear current piece and wait for next assignment if we become active again
        setPiece(null);
      } else {
        setErrorMsg(res.reason || 'Invalid placement');
        // keep current piece so the user can try again
      }
    };

    socket.on('connect', () => {
      setMe(socket.id ?? '');
      socket.emit('join-room', { playerName, roomId });
      // Request assigned piece; server will only respond if it's our turn
      socket.emit('request-piece', { roomId });
    });
    socket.on('game-state', onGameState);
    socket.on('piece', onPiece);
    socket.on('placement-result', onPlacement);

    return () => {
      socket.off('game-state', onGameState);
      socket.off('piece', onPiece);
      socket.off('placement-result', onPlacement);
      socket.disconnect();
    };
  }, [playerName, roomId]);

  // keyboard: R to rotate
  useEffect(() => {
    // detect Safari once on mount
    isSafariRef.current = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setRotation((r) => (r + 1) % 4);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Countdown for active player's turn
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!state.turnEndsAt) { setRemainingMs(0); return; }
      const ms = Math.max(0, state.turnEndsAt - Date.now());
      setRemainingMs(ms);
    }, 200);
    return () => window.clearInterval(id);
  }, [state.turnEndsAt]);

  // Pre-render drag image when piece or rotation changes (improves Safari reliability)
  useEffect(() => {
    if (!piece) { dragImageRef.current = null; return; }
    try {
      const { mat } = getRotatedWithAnchor(piece.shape, rotation);
      const rows = mat.length;
      const cols = mat[0].length;
      const cell = 20;
      const gap = 2;
      const pad = 4;
      const w = cols * cell + (cols - 1) * gap + pad * 2;
      const h = rows * cell + (rows - 1) * gap + pad * 2;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            if (!mat[y][x]) continue;
            const rx = pad + x * (cell + gap);
            const ry = pad + y * (cell + gap);
            ctx.fillStyle = piece.color;
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1;
            ctx.fillRect(rx, ry, cell, cell);
            ctx.strokeRect(rx + 0.5, ry + 0.5, cell - 1, cell - 1);
          }
        }
        // Prefer an Image element for Safari
        const img = new Image();
        img.onload = () => { dragImageRef.current = img; };
        img.src = canvas.toDataURL('image/png');
        // Fallback to canvas immediately until image loads
        dragImageRef.current = canvas;
      }
    } catch {
      dragImageRef.current = null;
    }
  }, [piece, rotation]);

  // drag & drop helpers
  const startDrag = (e: React.DragEvent) => {
    if (!piece) return;
    const isMyTurn = state.activePlayerId === me;
    if (!isMyTurn) return;
    // Provide multiple mime types to ensure drag starts across browsers
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'piece' }));
    e.dataTransfer.setData('text/plain', 'piece');
    e.dataTransfer.effectAllowed = 'move';
    // Ensure previous canceled drags don't block new attempts
    awaitingPlacementRef.current = false;

    // Create a clean drag image of just the rotated piece (no container box)
    const img = dragImageRef.current;
    if (img && !isSafariRef.current) {
      // Align cursor with the top-left of the rotated matrix (matches server expectation)
      const { cell, gap, pad } = getRotatedWithAnchor(piece.shape, rotation);
      const offsetX = pad + 0 * (cell + gap);
      const offsetY = pad + 0 * (cell + gap);
      e.dataTransfer.setDragImage(img, offsetX, offsetY);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    // Always prevent default so the grid is a valid drop target
    e.preventDefault();
    const isMyTurn = state.activePlayerId === me;
    e.dataTransfer.dropEffect = piece && isMyTurn ? 'move' : 'none';
    if (!piece || !gridRef.current || !isMyTurn) return;
    const { x, y } = getGridCoordsFromEvent(e, gridRef.current, piece.shape, rotation);
    setHoverPos({ x, y });
  };

  const onDragEnd = () => {
    // If the drag is canceled (no drop), allow another attempt
    awaitingPlacementRef.current = false;
  };

  const onDrop = (e: React.DragEvent) => {
    if (!piece || !gridRef.current || !socketRef.current) return;
    const isMyTurn = state.activePlayerId === me;
    if (!isMyTurn) return;
    e.preventDefault();
    const { x, y, mat } = getGridCoordsFromEvent(e, gridRef.current, piece.shape, rotation, true);
    setHoverPos({ x, y });
    if (!canPlaceClient(state.grid, mat, x, y)) {
      setErrorMsg('invalid-placement');
      return;
    }
    if (awaitingPlacementRef.current) return;
    awaitingPlacementRef.current = true;
    socketRef.current.emit('place-item', { roomId, piece, x, y, rotation });
  };

  // Safari-friendly fallback: click to place piece at the clicked cell
  const onGridClick = (e: React.MouseEvent) => {
    if (!piece || !gridRef.current || !socketRef.current) return;
    const isMyTurn = state.activePlayerId === me;
    if (!isMyTurn) return;
    if (awaitingPlacementRef.current) return;
    const { x, y, mat } = getGridCoordsFromEvent(e, gridRef.current, piece.shape, rotation, true);
    setHoverPos({ x, y });
    if (!canPlaceClient(state.grid, mat, x, y)) {
      setErrorMsg('invalid-placement');
      return;
    }
    awaitingPlacementRef.current = true;
    socketRef.current.emit('place-item', { roomId, piece, x, y, rotation });
  };

  const onGridMouseLeave = () => setHoverPos(null);

  const rotate = () => setRotation((r) => (r + 1) % 4);
  const reset = () => socketRef.current?.emit('reset', { roomId });
  const newPiece = () => {
    const isMyTurn = state.activePlayerId === me;
    if (!isMyTurn) return;
    socketRef.current?.emit('request-piece', { roomId });
  };

  const renderCells = () => {
    const cells: JSX.Element[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const color = state.grid[y]?.[x] || undefined;
        cells.push(
          <div
            key={`c-${x}-${y}`}
            className={styles.cell}
            style={color ? { backgroundColor: color } : undefined}
          />
        );
      }
    }
    return cells;
  };

  return (
    <div className={styles.gameContainer}>
      <div className={styles.gameArea}>
        <div className={styles.gridContainer}>
          {/* Turn/timer header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 4 }}>
            <div>
              <strong>Turn: </strong> {state.activePlayerId === me ? 'You' : (state.players.find(p => p.id === state.activePlayerId)?.name || '-')}
            </div>
            <br></br>
            <div>
              <strong>Time left: </strong> {Math.ceil(remainingMs / 1000)}s
            </div>
          </div>
          <div
            className={styles.gameGrid}
            ref={gridRef}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onClick={onGridClick}
            onMouseLeave={onGridMouseLeave}
            onMouseMove={(e) => {
              const isMyTurn = state.activePlayerId === me;
              if (!piece || !gridRef.current || !isMyTurn) return;
              const { x, y } = getGridCoordsFromEvent(e, gridRef.current, piece.shape, rotation);
              setHoverPos({ x, y });
            }}
          >
            {renderCells()}
            <div className={styles.overlayLayer}>
              {piece && hoverPos && state.activePlayerId === me && (() => {
                const { mat } = getRotatedWithAnchor(piece.shape, rotation);
                const ok = canPlaceClient(state.grid, mat, hoverPos.x, hoverPos.y);
                const overlay: JSX.Element[] = [];
                for (let ry = 0; ry < mat.length; ry++) {
                  for (let rx = 0; rx < mat[0].length; rx++) {
                    if (!mat[ry][rx]) continue;
                    const idx = (hoverPos.y + ry) * COLS + (hoverPos.x + rx);
                    overlay.push(
                      <div
                        key={`ov-${idx}`}
                        className={styles.cellOverlay}
                        style={{
                          gridColumnStart: hoverPos.x + rx + 1,
                          gridRowStart: hoverPos.y + ry + 1,
                          backgroundColor: ok ? 'rgba(46, 204, 113, 0.45)' : 'rgba(231, 76, 60, 0.45)'
                        }}
                      />
                    );
                  }
                }
                return <>{overlay}</>;
              })()}
            </div>
          </div>
          {errorMsg && <div style={{ color: '#e94560' }}>{errorMsg}</div>}
        </div>

        <div className={styles.gameInfo}>
          <h3>Score: {state.players.find((p) => p.id === me)?.score ?? 0}</h3>
          <div className={styles.sectionTitle}>Your Piece</div>
          <div className={styles.playersList}>
            <div className={styles.nextPiece}
                 style={{ cursor: piece && state.activePlayerId === me ? 'grab' : 'not-allowed' }}
                 title={!piece ? 'No piece yet' : (state.activePlayerId === me ? 'Drag onto the grid' : 'Wait for your turn')}>
              {!piece ? (
                <span>No piece</span>
              ) : (
                <>
                  {isSafariRef.current && (
                    <div style={{ color: '#a8a8a8', fontSize: 12, marginBottom: 6 }}></div>
                  )}
                  <PiecePreview
                    piece={piece}
                    rotation={rotation}
                    onDragStart={state.activePlayerId === me ? startDrag : undefined}
                    onDragEnd={onDragEnd}
                    draggableEnabled={!isSafariRef.current && state.activePlayerId === me}
                  />
                </>
              )}
            </div>
          </div>

          <div className={styles.sectionTitle}>Players</div>
          <div className={styles.playersList}>
            {state.players.map((p) => {
              const dotColor = colorFromString(p.id);
              return (
                <div key={p.id} className={styles.player}>
                  <span className={styles.playerName}>
                    <span style={{
                      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                      backgroundColor: dotColor
                    }} />
                    {p.name} {p.id === me && <span className={styles.youBadge}>(You)</span>}
                  </span>
                  <span className={styles.playerScore}>{p.score}</span>
                </div>
              );
            })}
          </div>

          <div className={styles.controls}>
            <button className={styles.controlButton} onClick={rotate} disabled={state.activePlayerId !== me}>Rotate (R)</button>
            <button className={styles.controlButton} onClick={newPiece} disabled={state.activePlayerId !== me}>New Piece</button>
            <button className={styles.controlButton} onClick={reset}>Reset Grid</button>
          </div>
        </div>
      </div>
    </div>
  );
};

function rotateMatrix(shape: number[][], times: number) {
  let m = shape.map((r) => r.slice());
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

function getRotatedWithAnchor(shape: number[][], rotation: number) {
  const mat = rotateMatrix(shape, rotation);
  // anchor at the top-left filled cell in the rotated matrix
  let minX = Infinity, minY = Infinity;
  for (let y = 0; y < mat.length; y++) {
    for (let x = 0; x < mat[0].length; x++) {
      if (mat[y][x]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
      }
    }
  }
  const anchorX = isFinite(minX) ? minX : 0;
  const anchorY = isFinite(minY) ? minY : 0;
  // constants used for drag image drawing
  const cell = 20;
  const gap = 2;
  const pad = 4;
  return { mat, anchorX, anchorY, cell, gap, pad };
}

// Client-side validator mirrors server's canPlace
function canPlaceClient(grid: (string | null)[][], shape: number[][], x: number, y: number) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  for (let ry = 0; ry < shape.length; ry++) {
    for (let rx = 0; rx < shape[ry].length; rx++) {
      if (!shape[ry][rx]) continue;
      const gx = x + rx;
      const gy = y + ry;
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
      if (grid[gy][gx] !== null) return false;
    }
  }
  return true;
}

// Convert pointer coordinates to grid indices, accounting for padding and borders
function getGridCoordsFromEvent(
  e: { clientX: number; clientY: number },
  gridEl: HTMLDivElement,
  shape: number[][],
  rotation: number,
  _clamp: boolean = true,
) {
  const rect = gridEl.getBoundingClientRect();
  const cs = window.getComputedStyle(gridEl);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const padT = parseFloat(cs.paddingTop) || 0;
  const padB = parseFloat(cs.paddingBottom) || 0;
  const bL = parseFloat(cs.borderLeftWidth) || 0;
  const bR = parseFloat(cs.borderRightWidth) || 0;
  const bT = parseFloat(cs.borderTopWidth) || 0;
  const bB = parseFloat(cs.borderBottomWidth) || 0;

  const contentW = rect.width - padL - padR - bL - bR;
  const contentH = rect.height - padT - padB - bT - bB;
  const cellW = contentW / COLS;
  const cellH = contentH / ROWS;

  let x = Math.floor((e.clientX - rect.left - bL - padL) / cellW);
  let y = Math.floor((e.clientY - rect.top - bT - padT) / cellH);

  const { mat } = getRotatedWithAnchor(shape, rotation);
  const maxX = COLS - mat[0].length;
  const maxY = ROWS - mat.length;
  x = Math.max(0, Math.min(maxX, x));
  y = Math.max(0, Math.min(maxY, y));
  return { x, y, mat };
}

const PiecePreview: React.FC<{
  piece: Piece;
  rotation: number;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  draggableEnabled?: boolean;
}> = ({ piece, rotation, onDragStart, onDragEnd, draggableEnabled = true }) => {
  const rotated = rotateMatrix(piece.shape, rotation);
  return (
    <div
      className={`${styles.piecePreview} ${styles.draggable}`}
      draggable={draggableEnabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {rotated.map((row, y) => (
        <div key={y} className={styles.pieceRow}>
          {row.map((v, x) => (
            <div
              key={`${x}-${y}`}
              className={`${styles.pieceCell} ${v ? 'filled' : ''} ${styles.draggable}`}
              style={v ? { backgroundColor: piece.color } : undefined}
              draggable={draggableEnabled}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

function colorFromString(s: string) {
  const colors = ['#4cc9f0', '#e94560', '#f4c8a6', '#a8dadc', '#caadff', '#ffd166'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export default Grid;