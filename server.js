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
const canvasStates = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Find player
  socket.on('find_player', (data) => {
    console.log(`Player ${socket.id} is looking for a game`);
    
    // Store user data with the socket
    socket.userData = data.userData || { username: 'زائر' };
    
    // Check if player is already in waiting list
    if (waitingPlayers.includes(socket.id)) {
      return;
    }
    
    // Check if there's another player waiting
    if (waitingPlayers.length > 0) {
      const opponentId = waitingPlayers.shift();
      const opponentSocket = io.sockets.sockets.get(opponentId);
      const roomId = `room_${Date.now()}`;
      
      // Create a new room
      activeRooms[roomId] = {
        players: [
          { id: opponentId, userData: opponentSocket.userData },
          { id: socket.id, userData: socket.userData }
        ],
        active: true
      };
      
      // Join both players to the room
      socket.join(roomId);
      opponentSocket.join(roomId);
      
      // Initialize canvas state for the room
      canvasStates[roomId] = null;
      
      // Notify players that game has started
      io.to(opponentId).emit('game_start', { 
        roomId, 
        playerNumber: 1,
        players: activeRooms[roomId].players
      });
      
      socket.emit('game_start', { 
        roomId, 
        playerNumber: 2,
        players: activeRooms[roomId].players
      });
      
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
      delete canvasStates[roomId];
      console.log(`Player ${socket.id} left room ${roomId}`);
    }
  });
  
  // Drawing events
  socket.on('draw_start', (data) => {
    const { roomId, x, y, color, size, opacity, tool, userData } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_start', { x, y, color, size, opacity, tool, userData });
    }
  });
  
  socket.on('draw_move', (data) => {
    const { roomId, x0, y0, x1, y1, color, size, opacity, tool } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_move', { x0, y0, x1, y1, color, size, opacity, tool });
    }
  });
  
  socket.on('draw_end', (data) => {
    const { roomId } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_end');
    }
  });
  
  socket.on('draw_shape', (data) => {
    const { roomId, startX, startY, endX, endY, color, size, opacity, tool } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_shape', { startX, startY, endX, endY, color, size, opacity, tool });
    }
  });
  
  socket.on('draw_text', (data) => {
    const { roomId, x, y, text, color, size, opacity } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_text', { x, y, text, color, size, opacity });
    }
  });
  
  socket.on('draw_fill', (data) => {
    const { roomId, x, y, color } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_fill', { x, y, color });
    }
  });
  
  socket.on('clear_canvas', (data) => {
    const { roomId } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('clear_canvas');
      // Update canvas state
      canvasStates[roomId] = null;
    }
  });
  
  // Canvas state management for undo/redo
  socket.on('canvas_state_change', (data) => {
    const { roomId, dataUrl } = data;
    if (roomId && activeRooms[roomId]) {
      // Update stored canvas state
      canvasStates[roomId] = dataUrl;
      // Broadcast to other players
      socket.to(roomId).emit('canvas_state_change', { dataUrl });
    }
  });
  
  // Request current canvas state
  socket.on('request_canvas_state', (data) => {
    const { roomId } = data;
    if (roomId && activeRooms[roomId] && canvasStates[roomId]) {
      socket.emit('canvas_state_update', { dataUrl: canvasStates[roomId] });
    }
  });
  
  // Update canvas state
  socket.on('canvas_state_update', (data) => {
    const { roomId, dataUrl } = data;
    if (roomId && activeRooms[roomId]) {
      canvasStates[roomId] = dataUrl;
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
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        // Notify other player
        socket.to(roomId).emit('player_left');
        
        // Remove room
        delete activeRooms[roomId];
        delete canvasStates[roomId];
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
