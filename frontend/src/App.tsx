import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Grid from './components/Grid';

const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const playerName = 'Player';
  const roomId = 'default-room';
  
  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      transports: ["websocket"],
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log(`Connected to backend server: ${newSocket.id}`);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from socket.io server');
    });

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });

    // Clean up on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Simple form to set player name and room
  if (!socket) {
    return <div>Connecting to server...</div>;
  }

  return (
    <div className="app">
      <Grid playerName={playerName} roomId={roomId} />
    </div>
  );
}

export default App;
