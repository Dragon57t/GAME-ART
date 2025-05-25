const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const waitingUsers = [];

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("مستخدم متصل:", socket.id);

  socket.on("findOpponent", () => {
    if (waitingUsers.length > 0) {
      const opponent = waitingUsers.pop();
      const room = `${socket.id}#${opponent.id}`;
      socket.join(room);
      opponent.join(room);

      socket.room = room;
      opponent.room = room;

      socket.emit("startGame");
      opponent.emit("startGame");
    } else {
      waitingUsers.push(socket);
      socket.emit("waiting");
    }
  });

  socket.on("draw", (data) => {
    if (socket.room) {
      socket.to(socket.room).emit("draw", data);
    }
  });

  socket.on("clear", () => {
    if (socket.room) {
      socket.to(socket.room).emit("clear");
    }
  });

  socket.on("disconnect", () => {
    console.log("تم فصل المستخدم:", socket.id);
    const index = waitingUsers.indexOf(socket);
    if (index !== -1) {
      waitingUsers.splice(index, 1);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`السيرفر يعمل على http://localhost:${PORT}`);
});
