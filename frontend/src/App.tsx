import { useState } from 'react';
import Grid from './components/Grid';

const App: React.FC = () => {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('default-room');
  const [joined, setJoined] = useState(false);

  if (!joined) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (playerName.trim()) setJoined(true); }}
          style={{ background: '#0f3460', padding: 20, borderRadius: 8, color: '#fff', minWidth: 320 }}
        >
          <h2 style={{ marginTop: 0 }}>Join Room</h2>
          <label>Name</label>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Your name"
            style={{ width: '100%', padding: 10, margin: '8px 0 16px', borderRadius: 6, border: '1px solid #2a3a5c', background: '#16213e', color: '#fff' }}
          />
          <label>Room ID</label>
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="default-room"
            style={{ width: '100%', padding: 10, margin: '8px 0 16px', borderRadius: 6, border: '1px solid #2a3a5c', background: '#16213e', color: '#fff' }}
          />
          <button type="submit" style={{ width: '100%', padding: 12, background: '#e94560', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Join</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <Grid playerName={playerName} roomId={roomId} />
    </div>
  );
};

export default App;
