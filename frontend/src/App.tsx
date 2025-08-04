import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

// connect to backend
const socket: Socket = io('http://localhost:3000', {
  transports: ["websocket"],
});

function App() {
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
      <p>Check the console for socket status</p>
    </div>
  );
}

export default App
