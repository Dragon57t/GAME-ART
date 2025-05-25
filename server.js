const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, "public")));

let waitingPlayer = null;

io.on("connection", (socket) => {
  console.log("لاعب متصل:", socket.id);

  socket.on("findOpponent", () => {
    if (waitingPlayer) {
      const playerA = waitingPlayer;
      const playerB = socket;

      playerA.emit("startDrawing");
      playerB.emit("startDrawing");

      playerA.opponent = playerB;
      playerB.opponent = playerA;

      waitingPlayer = null;

      console.log("بدأت جلسة رسم بين", playerA.id, "و", playerB.id);
    } else {
      waitingPlayer = socket;
      socket.emit("waiting");
    }
  });

  socket.on("draw", (data) => {
    if (socket.opponent) {
      socket.opponent.emit("draw", data);
    }
  });

  socket.on("clearCanvas", () => {
    if (socket.opponent) {
      socket.opponent.emit("clearCanvas");
    }
  });

  socket.on("disconnect", () => {
    console.log("لاعب خرج:", socket.id);
    if (waitingPlayer === socket) waitingPlayer = null;
    if (socket.opponent) socket.opponent.emit("opponentLeft");
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});
