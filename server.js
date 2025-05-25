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
      const player1 = waitingPlayer;
      const player2 = socket;

      player1.emit("startGame");
      player2.emit("startGame");

      player1.opponent = player2;
      player2.opponent = player1;

      waitingPlayer = null;
      console.log("بدأت جلسة رسم جماعي بين", player1.id, "و", player2.id);
    } else {
      waitingPlayer = socket;
      socket.emit("waiting");
      console.log("لاعب ينتظر خصم:", socket.id);
    }
  });

  socket.on("draw", (data) => {
    if (socket.opponent) {
      socket.opponent.emit("draw", data);
    }
  });

  socket.on("disconnect", () => {
    console.log("لاعب خرج:", socket.id);

    if (waitingPlayer === socket) {
      waitingPlayer = null;
    }

    if (socket.opponent) {
      socket.opponent.emit("opponentLeft");
      socket.opponent.opponent = null;
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});
