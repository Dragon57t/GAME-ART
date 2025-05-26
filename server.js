const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game variables
const waitingPlayers = [];
const activeRooms = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Find player
  socket.on('find_player', () => {
    console.log(`Player ${socket.id} is looking for a game`);
    
    // Check if player is already in waiting list
    if (waitingPlayers.includes(socket.id)) {
      return;
    }
    
    // Check if there's another player waiting
    if (waitingPlayers.length > 0) {
      const opponentId = waitingPlayers.shift();
      const roomId = `room_${Date.now()}`;
      
      // Create a new room
      activeRooms[roomId] = {
        players: [opponentId, socket.id],
        active: true
      };
      
      // Join both players to the room
      socket.join(roomId);
      io.sockets.sockets.get(opponentId).join(roomId);
      
      // Notify players that game has started
      io.to(opponentId).emit('game_start', { roomId, playerNumber: 1 });
      socket.emit('game_start', { roomId, playerNumber: 2 });
      
      console.log(`Game started in room ${roomId} between ${opponentId} and ${socket.id}`);
    } else {
      // Add player to waiting list
      waitingPlayers.push(socket.id);
      console.log(`Player ${socket.id} added to waiting list`);
    }
  });
  
  // Cancel search
  socket.on('cancel_search', () => {
    const index = waitingPlayers.indexOf(socket.id);
    if (index !== -1) {
      waitingPlayers.splice(index, 1);
      console.log(`Player ${socket.id} canceled search`);
    }
  });
  
  // Leave game
  socket.on('leave_game', (data) => {
    const { roomId } = data;
    
    if (roomId && activeRooms[roomId]) {
      // Notify other player
      socket.to(roomId).emit('player_left');
      
      // Remove room
      delete activeRooms[roomId];
      console.log(`Player ${socket.id} left room ${roomId}`);
    }
  });
  
  // Drawing events
  socket.on('draw_start', (data) => {
    const { roomId, x, y, color, size, tool } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_start', { x, y, color, size, tool });
    }
  });
  
  socket.on('draw_move', (data) => {
    const { roomId, x0, y0, x1, y1, color, size, tool } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_move', { x0, y0, x1, y1, color, size, tool });
    }
  });
  
  socket.on('draw_end', (data) => {
    const { roomId } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_end');
    }
  });
  
  socket.on('clear_canvas', (data) => {
    const { roomId } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('clear_canvas');
    }
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove from waiting list if present
    const waitingIndex = waitingPlayers.indexOf(socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }
    
    // Check if player is in an active room
    for (const roomId in activeRooms) {
      const room = activeRooms[roomId];
      const playerIndex = room.players.indexOf(socket.id);
      
      if (playerIndex !== -1) {
        // Notify other player
        socket.to(roomId).emit('player_left');
        
        // Remove room
        delete activeRooms[roomId];
        console.log(`Room ${roomId} closed due to player ${socket.id} disconnection`);
        break;
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
