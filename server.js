
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Available rooms and waiting players
let waitingPlayers = [];
let rooms = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Handle user searching for a match
    socket.on('findMatch', (userData) => {
        console.log(`${socket.id} is searching for a match`);

        // If user was already waiting, remove from waiting list
        waitingPlayers = waitingPlayers.filter(player => player.id !== socket.id);

        // Check if there are waiting players
        if (waitingPlayers.length > 0) {
            // Match with the first waiting player
            const opponent = waitingPlayers.shift();
            const roomId = `${socket.id}-${opponent.id}`;

            // Create a new room
            rooms[roomId] = {
                players: [socket.id, opponent.id],
                drawData: []
            };

            // Join both players to the room
            socket.join(roomId);
            io.sockets.sockets.get(opponent.id)?.join(roomId);

            // Notify both players about the match
            io.to(roomId).emit('matchFound', { roomId });
            console.log(`Match found: ${socket.id} and ${opponent.id} in room ${roomId}`);
        } else {
            // Add to waiting list
            waitingPlayers.push({
                id: socket.id,
                userData: userData || {}
            });
            socket.emit('waiting');
            console.log(`${socket.id} added to waiting list`);
        }
    });

    // Handle drawing data
    socket.on('draw', (data) => {
        const roomId = findRoomByPlayerId(socket.id);
        if (roomId) {
            // Store draw data for reconnection scenarios
            rooms[roomId].drawData.push(data);

            // Broadcast drawing data to the other player in the room
            socket.to(roomId).emit('draw', data);
        }
    });

    // Handle clear canvas
    socket.on('clearCanvas', () => {
        const roomId = findRoomByPlayerId(socket.id);
        if (roomId) {
            rooms[roomId].drawData = [];
            socket.to(roomId).emit('clearCanvas');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Remove from waiting list if they were waiting
        waitingPlayers = waitingPlayers.filter(player => player.id !== socket.id);

        // Notify opponent if they were in a room
        const roomId = findRoomByPlayerId(socket.id);
        if (roomId) {
            socket.to(roomId).emit('opponentLeft');
            delete rooms[roomId];
        }
    });

    // Cancel search
    socket.on('cancelSearch', () => {
        waitingPlayers = waitingPlayers.filter(player => player.id !== socket.id);
        socket.emit('searchCancelled');
        console.log(`${socket.id} cancelled their search`);
    });
});

// Helper function to find room by player ID
function findRoomByPlayerId(playerId) {
    for (const roomId in rooms) {
        if (rooms[roomId].players.includes(playerId)) {
            return roomId;
        }
    }
    return null;
}

// Define routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
