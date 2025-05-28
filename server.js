const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// In-memory database (in a real app, you would use a real database)
const users = {};
const sessions = {};

// Animation data storage
const animations = {};

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

// Animation API Routes
app.post('/api/animation/save', (req, res) => {
  const token = req.headers.authorization;
  const { animationId, frames, fps } = req.body;
  
  if (!token || !sessions[token]) {
    return res.status(401).json({ success: false, message: 'جلسة غير صالحة' });
  }
  
  const userId = sessions[token].userId;
  
  if (!animationId || !frames || !Array.isArray(frames)) {
    return res.status(400).json({ success: false, message: 'بيانات الأنميشن غير صالحة' });
  }
  
  // Save animation data
  animations[animationId] = {
    id: animationId,
    userId,
    frames,
    fps: fps || 12,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  console.log(`Animation saved: ${animationId} by user ${userId}`);
  
  res.status(200).json({
    success: true,
    message: 'تم حفظ الأنميشن بنجاح',
    animationId
  });
});

app.get('/api/animation/load/:id', (req, res) => {
  const token = req.headers.authorization;
  const animationId = req.params.id;
  
  if (!token || !sessions[token]) {
    return res.status(401).json({ success: false, message: 'جلسة غير صالحة' });
  }
  
  if (!animations[animationId]) {
    return res.status(404).json({ success: false, message: 'الأنميشن غير موجود' });
  }
  
  res.status(200).json({
    success: true,
    animation: animations[animationId]
  });
});

app.post('/api/animation/export', async (req, res) => {
  const token = req.headers.authorization;
  const { frames, fps, format } = req.body;
  
  if (!token || !sessions[token]) {
    return res.status(401).json({ success: false, message: 'جلسة غير صالحة' });
  }
  
  if (!frames || !Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ success: false, message: 'بيانات الإطارات غير صالحة' });
  }
  
  try {
    if (format === 'gif') {
      // Create a unique filename
      const filename = `animation_${Date.now()}.gif`;
      const filePath = path.join(__dirname, 'public', 'exports', filename);
      
      // Ensure exports directory exists
      const dir = path.join(__dirname, 'public', 'exports');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Get dimensions from first frame
      const firstFrameData = frames[0].imageData;
      const img = new Image();
      const canvas = createCanvas(500, 500); // Default size
      const ctx = canvas.getContext('2d');
      
      // Create GIF encoder
      const encoder = new GIFEncoder(canvas.width, canvas.height);
      const stream = fs.createWriteStream(filePath);
      encoder.createReadStream().pipe(stream);
      
      encoder.start();
      encoder.setRepeat(0);  // 0 = repeat forever
      encoder.setDelay(1000 / (fps || 12));  // Frame delay in ms
      encoder.setQuality(10); // Quality, lower is better
      
      // Add each frame to the GIF
      for (const frame of frames) {
        // Draw the frame on canvas
        const frameImg = new Image();
        frameImg.src = frame.imageData;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
        
        // Add frame to GIF
        encoder.addFrame(ctx);
      }
      
      encoder.finish();
      
      // Return the URL to the exported GIF
      const exportUrl = `/exports/${filename}`;
      res.status(200).json({
        success: true,
        message: 'تم تصدير الأنميشن بنجاح',
        url: exportUrl
      });
    } else {
      return res.status(400).json({ success: false, message: 'صيغة التصدير غير مدعومة' });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تصدير الأنميشن' });
  }
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
        active: true,
        animation: {
          frames: [],
          currentFrame: 0,
          fps: 12,
          isPlaying: false,
          lastUpdate: Date.now()
        }
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
    const { roomId, x, y, color, size, tool, frameIndex } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_start', { x, y, color, size, tool, frameIndex });
    }
  });
  
  socket.on('draw_move', (data) => {
    const { roomId, x0, y0, x1, y1, color, size, tool, frameIndex } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_move', { x0, y0, x1, y1, color, size, tool, frameIndex });
    }
  });
  
  socket.on('draw_end', (data) => {
    const { roomId, frameIndex } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_end', { frameIndex });
    }
  });
  
  socket.on('draw_shape', (data) => {
    const { roomId, type, frameIndex, ...shapeData } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('draw_shape', { type, frameIndex, ...shapeData });
    }
  });
  
  socket.on('clear_canvas', (data) => {
    const { roomId, frameIndex } = data;
    if (roomId && activeRooms[roomId]) {
      socket.to(roomId).emit('clear_canvas', { frameIndex });
    }
  });
  
  // Animation events
  socket.on('animation_init', (data) => {
    const { roomId } = data;
    
    if (roomId && activeRooms[roomId]) {
      // Initialize animation data if not exists
      if (!activeRooms[roomId].animation) {
        activeRooms[roomId].animation = {
          frames: [],
          currentFrame: 0,
          fps: 12,
          isPlaying: false,
          lastUpdate: Date.now()
        };
      }
      
      // Send current animation state to the client
      socket.emit('animation_init_response', {
        animation: activeRooms[roomId].animation
      });
    }
  });
  
  socket.on('frame_add', (data) => {
    const { roomId, index, imageData } = data;
    
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      
      // Create new frame
      const newFrame = {
        id: crypto.randomBytes(8).toString('hex'),
        index: index !== undefined ? index : room.animation.frames.length,
        imageData,
        timestamp: Date.now()
      };
      
      // Add frame at specified index or at the end
      if (index !== undefined && index >= 0 && index <= room.animation.frames.length) {
        room.animation.frames.splice(index, 0, newFrame);
        
        // Update indices for frames after the inserted one
        for (let i = index + 1; i < room.animation.frames.length; i++) {
          room.animation.frames[i].index = i;
        }
      } else {
        room.animation.frames.push(newFrame);
      }
      
      // Notify other player
      socket.to(roomId).emit('frame_added', {
        frame: newFrame
      });
      
      console.log(`Frame added to room ${roomId} at index ${newFrame.index}`);
    }
  });
  
  socket.on('frame_update', (data) => {
    const { roomId, frameId, imageData } = data;
    
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      
      // Find frame by ID
      const frameIndex = room.animation.frames.findIndex(f => f.id === frameId);
      if (frameIndex !== -1) {
        // Update frame data
        room.animation.frames[frameIndex].imageData = imageData;
        room.animation.frames[frameIndex].timestamp = Date.now();
        
        // Notify other player
        socket.to(roomId).emit('frame_updated', {
          frameId,
          imageData
        });
        
        console.log(`Frame ${frameId} updated in room ${roomId}`);
      }
    }
  });
  
  socket.on('frame_delete', (data) => {
    const { roomId, frameId } = data;
    
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      
      // Find frame by ID
      const frameIndex = room.animation.frames.findIndex(f => f.id === frameId);
      if (frameIndex !== -1) {
        // Remove frame
        room.animation.frames.splice(frameIndex, 1);
        
        // Update indices for remaining frames
        for (let i = frameIndex; i < room.animation.frames.length; i++) {
          room.animation.frames[i].index = i;
        }
        
        // Adjust current frame if needed
        if (room.animation.currentFrame >= room.animation.frames.length) {
          room.animation.currentFrame = Math.max(0, room.animation.frames.length - 1);
        }
        
        // Notify other player
        socket.to(roomId).emit('frame_deleted', {
          frameId
        });
        
        console.log(`Frame ${frameId} deleted from room ${roomId}`);
      }
    }
  });
  
  socket.on('frame_reorder', (data) => {
    const { roomId, frameId, newIndex } = data;
    
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      
      // Find frame by ID
      const frameIndex = room.animation.frames.findIndex(f => f.id === frameId);
      if (frameIndex !== -1 && newIndex >= 0 && newIndex < room.animation.frames.length) {
        // Get the frame to move
        const frame = room.animation.frames[frameIndex];
        
        // Remove frame from current position
        room.animation.frames.splice(frameIndex, 1);
        
        // Insert frame at new position
        room.animation.frames.splice(newIndex, 0, frame);
        
        // Update indices for all frames
        for (let i = 0; i < room.animation.frames.length; i++) {
          room.animation.frames[i].index = i;
        }
        
        // Notify other player
        socket.to(roomId).emit('frame_reordered', {
          frameId,
          newIndex
        });
        
        console.log(`Frame ${frameId} moved from index ${frameIndex} to ${newIndex} in room ${roomId}`);
      }
    }
  });
  
  socket.on('animation_play', (data) => {
    const { roomId } = data;
    
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      
      // Update animation state
      room.animation.isPlaying = true;
      room.animation.lastUpdate = Date.now();
      
      // Notify other player
      socket.to(roomId).emit('animation_state_update', {
        isPlaying: true,
        currentFrame: room.animation.currentFrame
      });
      
      console.log(`Animation playback started in room ${roomId}`);
    }
  });
  
  socket.on('animation_pause', (data) => {
    const { roomId } = data;
    
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      
      // Update animation state
      room.animation.isPlaying = false;
      
      // Notify other player
      socket.to(roomId).emit('animation_state_update', {
        isPlaying: false,
        currentFrame: room.animation.currentFrame
      });
      
      console.log(`Animation playback paused in room ${roomId}`);
    }
  });
  
  socket.on('animation_set_frame', (data) => {
    const { roomId, frameIndex } = data;
    
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      
      // Validate frame index
      if (frameIndex >= 0 && frameIndex < room.animation.frames.length) {
        // Update current frame
        room.animation.currentFrame = frameIndex;
        
        // Notify other player
        socket.to(roomId).emit('animation_state_update', {
          isPlaying: room.animation.isPlaying,
          currentFrame: frameIndex
        });
        
        console.log(`Current frame set to ${frameIndex} in room ${roomId}`);
      }
    }
  });
  
  socket.on('animation_set_fps', (data) => {
    const { roomId, fps } = data;
    
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      
      // Update FPS
      room.animation.fps = fps;
      
      // Notify other player
      socket.to(roomId).emit('animation_fps_update', {
        fps
      });
      
      console.log(`Animation FPS set to ${fps} in room ${roomId}`);
    }
  });
  
  socket.on('animation_sync_request', (data) => {
    const { roomId } = data;
    
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      
      // Send full animation data to the client
      socket.emit('animation_sync_response', {
        animation: room.animation
      });
      
      console.log(`Animation sync requested by ${socket.id} in room ${roomId}`);
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
