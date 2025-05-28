const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const crypto = require('crypto');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// In-memory database (in a real app, you would use a real database)
const users = {};
const sessions = {};

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Email validation function
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Generate a random session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Hash password (in a real app, use bcrypt)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// API Routes for Authentication
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  
  // Validate input
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
  }
  
  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'صيغة البريد الإلكتروني غير صحيحة' });
  }
  
  // Check if email already exists
  if (Object.values(users).some(user => user.email === email)) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل' });
  }
  
  // Create user
  const userId = crypto.randomBytes(16).toString('hex');
  const hashedPassword = hashPassword(password);
  
  users[userId] = {
    id: userId,
    name,
    email,
    password: hashedPassword,
    createdAt: new Date()
  };
  
  // Create session
  const sessionToken = generateSessionToken();
  sessions[sessionToken] = {
    userId,
    createdAt: new Date()
  };
  
  console.log(`User registered: ${email}`);
  
  // Return success with session token and user info
  res.status(201).json({
    success: true,
    message: 'تم إنشاء الحساب بنجاح',
    token: sessionToken,
    user: {
      id: userId,
      name,
      email
    }
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  }
  
  // Find user by email
  const user = Object.values(users).find(u => u.email === email);
  
  // Check if user exists and password is correct
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }
  
  // Create session
  const sessionToken = generateSessionToken();
  sessions[sessionToken] = {
    userId: user.id,
    createdAt: new Date()
  };
  
  console.log(`User logged in: ${email}`);
  
  // Return success with session token and user info
  res.status(200).json({
    success: true,
    message: 'تم تسجيل الدخول بنجاح',
    token: sessionToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
});

app.post('/api/logout', (req, res) => {
  const { token } = req.body;
  
  // Remove session
  if (token && sessions[token]) {
    delete sessions[token];
    console.log(`User logged out`);
  }
  
  res.status(200).json({
    success: true,
    message: 'تم تسجيل الخروج بنجاح'
  });
});

app.get('/api/validate-session', (req, res) => {
  const token = req.headers.authorization;
  
  if (!token || !sessions[token]) {
    return res.status(401).json({ success: false, message: 'جلسة غير صالحة' });
  }
  
  const userId = sessions[token].userId;
  const user = users[userId];
  
  if (!user) {
    delete sessions[token];
    return res.status(401).json({ success: false, message: 'مستخدم غير موجود' });
  }
  
  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
});

// Game variables
const waitingPlayers = [];
const activeRooms = {};
const playerData = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  // Authenticate socket
  socket.on('authenticate', (data) => {
    const { token } = data;
    
    if (token && sessions[token]) {
      const userId = sessions[token].userId;
      const user = users[userId];
      
      if (user) {
        // Store user data with socket
        playerData[socket.id] = {
          userId: user.id,
          name: user.name,
          email: user.email
        };
        
        console.log(`Socket ${socket.id} authenticated as ${user.name}`);
        socket.emit('authenticated', { name: user.name });
      }
    }
  });

  // Find player
  socket.on('find_player', () => {
    // Get player name from stored data or use default
    const playerName = playerData[socket.id] ? playerData[socket.id].name : 'لاعب';
    console.log(`Player ${playerName} (${socket.id}) is looking for a game`);
    
    // Check if player is already in waiting list
    if (waitingPlayers.includes(socket.id)) {
      return;
    }
    
    // Check if there's another player waiting
    if (waitingPlayers.length > 0) {
      const opponentId = waitingPlayers.shift();
      const roomId = `room_${Date.now()}`;
      
      // Get opponent name
      const opponentName = playerData[opponentId] ? playerData[opponentId].name : 'لاعب';
      
      // Create a new room
      activeRooms[roomId] = {
        players: [
          { id: opponentId, name: opponentName },
          { id: socket.id, name: playerName }
        ],
        active: true
      };
      
      // Join both players to the room
      socket.join(roomId);
      io.sockets.sockets.get(opponentId).join(roomId);
      
      // Notify players that game has started
      io.to(opponentId).emit('game_start', { 
        roomId, 
        playerNumber: 1,
        playerName: opponentName,
        opponentName: playerName
      });
      
      socket.emit('game_start', { 
        roomId, 
        playerNumber: 2,
        playerName: playerName,
        opponentName: opponentName
      });
      
      console.log(`Game started in room ${roomId} between ${opponentName} and ${playerName}`);
    } else {
      // Add player to waiting list
      waitingPlayers.push(socket.id);
      console.log(`Player ${playerName} (${socket.id}) added to waiting list`);
    }
  });
  
  // Cancel search
  socket.on('cancel_search', () => {
    const index = waitingPlayers.indexOf(socket.id);
    if (index !== -1) {
      waitingPlayers.splice(index, 1);
      const playerName = playerData[socket.id] ? playerData[socket.id].name : 'لاعب';
      console.log(`Player ${playerName} (${socket.id}) canceled search`);
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
      const playerName = playerData[socket.id] ? playerData[socket.id].name : 'لاعب';
      console.log(`Player ${playerName} (${socket.id}) left room ${roomId}`);
    }
  });
  
  // Update player name
  socket.on('update_name', (data) => {
    const { name, roomId } = data;
    
    // Update player data
    if (playerData[socket.id]) {
      playerData[socket.id].name = name;
      
      // Update user in database if authenticated
      const userId = playerData[socket.id].userId;
      if (userId && users[userId]) {
        users[userId].name = name;
      }
      
      // Update room data if in a room
      if (roomId && activeRooms[roomId]) {
        const room = activeRooms[roomId];
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          player.name = name;
          
          // Notify other player
          socket.to(roomId).emit('opponent_updated_name', { name });
        }
      }
      
      console.log(`Player ${socket.id} updated name to ${name}`);
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
  
  socket.on('draw_shape', (data) => {
    const { roomId, type, ...shapeData } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_shape', { type, ...shapeData });
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
    const playerName = playerData[socket.id] ? playerData[socket.id].name : 'لاعب';
    console.log(`Player ${playerName} (${socket.id}) disconnected`);
    
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
        console.log(`Room ${roomId} closed due to player ${playerName} (${socket.id}) disconnection`);
        break;
      }
    }
    
    // Clean up player data
    delete playerData[socket.id];
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
