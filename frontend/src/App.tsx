import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import Grid from './components/Grid';

// connect to backend
const socket: Socket = io('http://localhost:3000', {
  transports: ["websocket"],
});

const App: React.FC = () => {
  useEffect(() => {
    socket.on('connect', () => {
      console.log(`Connect to backend server: ${socket.id}`);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from socket.io server');
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>BoxFit</h1>
      <Grid />
    </div>
  );
}

export default App
