const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const rooms = {}; 
let waitingPlayer = null; 

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    socket.on('create_room', (roomCode) => {
        socket.join(roomCode);
        rooms[roomCode] = { player1Socket: socket, players: [socket.id] };
        console.log(`Room ${roomCode} created by ${socket.id}`);
    });

    socket.on('join_room', (roomCode) => {
        if (rooms[roomCode] && rooms[roomCode].players.length === 1) {
            socket.join(roomCode);
            rooms[roomCode].players.push(socket.id);
            
            const p1Socket = rooms[roomCode].player1Socket;
            const p2Socket = socket;
           
            p1Socket.emit('start_game', { roomCode: roomCode, role: 1 });
            p2Socket.emit('start_game', { roomCode: roomCode, role: 2 });
            
            console.log(`${socket.id} joined room ${roomCode}. Game starting!`);
        } else {
            socket.emit('room_error', 'Room is full or does not exist.');
        }
    });

    socket.on('find_random_match', () => {
        if (waitingPlayer && waitingPlayer !== socket) {
            const roomCode = 'MATCH_' + Math.random().toString(36).substring(2, 8);
            socket.join(roomCode);
            waitingPlayer.join(roomCode);
            
            rooms[roomCode] = { players: [waitingPlayer.id, socket.id] };

            waitingPlayer.emit('start_game', { roomCode: roomCode, role: 1 });
            socket.emit('start_game', { roomCode: roomCode, role: 2 });
            
            console.log(`Random match started in ${roomCode}`);
            waitingPlayer = null; 
        } else {
            waitingPlayer = socket;
            console.log(`${socket.id} is waiting for a random match...`);
        }
    });

    socket.on('cancel_search', () => {
        if (waitingPlayer === socket) {
            waitingPlayer = null;
            console.log(`${socket.id} cancelled their search.`);
        }
    });

    socket.on('make_move', (data) => {
        socket.to(data.roomCode).emit('opponent_moved', data);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        if (waitingPlayer === socket) waitingPlayer = null;
        for (const roomCode in rooms) {
            if (rooms[roomCode].players.includes(socket.id)) {
                socket.to(roomCode).emit('opponent_disconnected');
                delete rooms[roomCode]; 
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});