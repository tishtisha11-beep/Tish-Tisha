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

    socket.on('create_room', (data) => {
        socket.join(data.roomCode);
        rooms[data.roomCode] = { player1Socket: socket, players: [socket.id], time: data.time, p1Name: data.playerName };
        console.log(`Room ${data.roomCode} created with ${data.time}s timer.`);
    });

    socket.on('join_room', (data) => {
        const roomCode = data.roomCode;
        if (rooms[roomCode] && rooms[roomCode].players.length === 1) {
            socket.join(roomCode);
            rooms[roomCode].players.push(socket.id);
            rooms[roomCode].p2Name = data.playerName; 
            
            const p1Socket = rooms[roomCode].player1Socket;
            const p2Socket = socket;
            const gameTime = rooms[roomCode].time;
            
            p1Socket.emit('start_game', { roomCode: roomCode, role: 1, time: gameTime, opponentName: rooms[roomCode].p2Name });
            p2Socket.emit('start_game', { roomCode: roomCode, role: 2, time: gameTime, opponentName: rooms[roomCode].p1Name });
        } else {
            socket.emit('room_error', 'Room is full or does not exist.');
        }
    });

    socket.on('find_random_match', (data) => {
        if (waitingPlayer && waitingPlayer !== socket) {
            const roomCode = 'MATCH_' + Math.random().toString(36).substring(2, 8);
            socket.join(roomCode);
            waitingPlayer.join(roomCode);
            rooms[roomCode] = { players: [waitingPlayer.id, socket.id] };

            const gameTime = waitingPlayer.timePreference || 60;
            const p1Name = waitingPlayer.playerName;
            const p2Name = data.playerName;

            waitingPlayer.emit('start_game', { roomCode: roomCode, role: 1, time: gameTime, opponentName: p2Name });
            socket.emit('start_game', { roomCode: roomCode, role: 2, time: gameTime, opponentName: p1Name });
            
            waitingPlayer = null; 
        } else {
            socket.timePreference = data.timePreference;
            socket.playerName = data.playerName; 
            waitingPlayer = socket;
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

    socket.on('force_restart', (roomCode) => {
        socket.to(roomCode).emit('opponent_forced_restart');
    });

    socket.on('send_chat', (data) => {
      
        socket.to(data.roomCode).emit('receive_chat', data.message);
    });

   
    socket.on('request_rematch', (roomCode) => {
        if (rooms[roomCode]) {
            rooms[roomCode].rematchRequests = (rooms[roomCode].rematchRequests || 0) + 1;
            socket.to(roomCode).emit('opponent_wants_rematch');

          
            if (rooms[roomCode].rematchRequests === 2) {
                rooms[roomCode].rematchRequests = 0; 
                io.in(roomCode).emit('rematch_accepted'); 
            }
        }
    });

    socket.on('leave_room', (roomCode) => {
        socket.leave(roomCode);
        socket.to(roomCode).emit('opponent_disconnected');
        if (rooms[roomCode]) {
            rooms[roomCode].players = rooms[roomCode].players.filter(id => id !== socket.id);
            if(rooms[roomCode].players.length === 0) delete rooms[roomCode];
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        if (waitingPlayer === socket) waitingPlayer = null;
        
        for (const roomCode in rooms) {
            if (rooms[roomCode].players.includes(socket.id)) {
                socket.to(roomCode).emit('opponent_disconnected');
                
                rooms[roomCode].players = rooms[roomCode].players.filter(id => id !== socket.id);
               
                if (rooms[roomCode].players.length === 0) {
                    delete rooms[roomCode]; 
                } else {
                    rooms[roomCode].rematchRequests = 0; 
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});