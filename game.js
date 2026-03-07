const socket = io(); 
let myRoomCode = null;
let isOnlineGame = false;
let myOnlineRole = null;


const canvas = document.getElementById('fireworksCanvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas); resizeCanvas();

function fireworkBurst(x, y) {
    for (let i = 0; i < 60; i++) {
        particles.push({
            x: x, y: y, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
            life: 1, color: `hsl(${Math.random() * 360}, 100%, 60%)`
        });
    }
}
function triggerVictoryFireworks() {
    fireworkBurst(window.innerWidth * 0.3, window.innerHeight * 0.3);
    setTimeout(() => fireworkBurst(window.innerWidth * 0.7, window.innerHeight * 0.4), 300);
    setTimeout(() => fireworkBurst(window.innerWidth * 0.5, window.innerHeight * 0.2), 600);
}
function animateFireworks() {
    requestAnimationFrame(animateFireworks);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p, index) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.015; 
        ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
        if (p.life <= 0) particles.splice(index, 1);
    });
    ctx.globalAlpha = 1;
}
animateFireworks();


const sounds = {
    drop: new Audio('drop.mp3'), slide: new Audio('slide.mp3'),
    error: new Audio('error.mp3'), win: new Audio('win.mp3'), boo: new Audio('boo.mp3')
};
sounds.drop.volume = 0.6; sounds.slide.volume = 0.4; sounds.error.volume = 0.4; 
sounds.win.volume = 0.7; sounds.boo.volume = 0.8;

function playSound(type) {
    let soundInstance = sounds[type].cloneNode();
    soundInstance.volume = sounds[type].volume;
    soundInstance.play().catch(e => console.log("Waiting for user interaction..."));
}
function hapticVibrate(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }


let masterScores = JSON.parse(localStorage.getItem('tishMasterScores')) || { pve: { tri: 0, sq: 0 }, local: { tri: 0, sq: 0 }, online: { tri: 0, sq: 0 } };

function updateScoreboardUI() {
    let mode = modeSelect.value;
    if (mode === 'invite') mode = 'online'; 
    document.getElementById('score-tri').innerText = masterScores[mode].tri;
    document.getElementById('score-sq').innerText = masterScores[mode].sq;
    let title = "Local Matches";
    if (mode === 'pve') title = "Vs Computer Score";
    if (mode === 'online') title = "Online Matches";
    document.getElementById('score-title').innerText = title;
}

function addScore(winnerShape) {
    let mode = modeSelect.value;
    if (mode === 'invite') mode = 'online';
    if (winnerShape === 1) masterScores[mode].tri++;
    else if (winnerShape === 2) masterScores[mode].sq++;
    localStorage.setItem('tishMasterScores', JSON.stringify(masterScores));
    updateScoreboardUI();
}


const modeSelect = document.getElementById('mode-select');
const shapeSelect = document.getElementById('shape-select');
const inviteContainer = document.getElementById('invite-container');
const overlay = document.getElementById('online-overlay');
const overlayText = document.getElementById('overlay-text');
const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const resetBtn = document.getElementById('reset-btn');
const abortBtn = document.getElementById('abort-btn');
const newRandomBtn = document.getElementById('new-random-btn');

function handleModeChange() {
    if (overlay.style.display === 'flex') {
        cancelOnline();
    }
    if (gamePhase !== 'INIT') {
        resetGame();
        return; 
    }
    let mode = modeSelect.value;
    shapeSelect.style.display = (mode === 'pve') ? 'inline-block' : 'none';
    inviteContainer.style.display = (mode === 'invite') ? 'block' : 'none';
    
    actionBtn.style.display = (mode === 'invite') ? 'none' : 'block';
    
    document.getElementById('link-copied-msg').style.display = 'none';
    updateScoreboardUI();
}
function copyInviteLink() {
    initAudio(); 
    let selectedTime = parseInt(timeSelect.value); 
    
    myRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    let link = window.location.origin + "?room=" + myRoomCode;
    
    navigator.clipboard.writeText(link).then(() => {
        overlay.style.display = 'flex';
        overlayText.innerText = "Link copied! Waiting for friend to join...";
        
        socket.emit('create_room', { roomCode: myRoomCode, time: selectedTime, playerName: window.myPlayerName });
    }).catch(() => {
        overlay.style.display = 'flex';
        overlayText.innerText = `Room: ${myRoomCode} - Waiting for friend...`;
        socket.emit('create_room', { roomCode: myRoomCode, time: selectedTime });
    });
}


window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const joinRoomCode = urlParams.get('room');
    
    if (joinRoomCode) {
        modeSelect.value = 'invite';
        handleModeChange();
      
        overlay.style.display = 'flex';
        overlayText.innerText = "Joining friend's room...";
        
        socket.emit('join_room', { roomCode: joinRoomCode, playerName: window.myPlayerName });
        
        window.history.pushState({}, document.title, window.location.pathname);
    }
};


const connections = {
    0: [1, 3],       1: [0, 2, 4],    2: [1, 5],
    3: [0, 4, 6],    4: [1, 3, 5, 7], 5: [2, 4, 8],
    6: [3, 7],       7: [6, 4, 8],    8: [7, 5]
};
const winLines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8]];

let board = [0,0,0, 0,0,0, 0,0,0]; 
let currentPlayer = 1; 
let gamePhase = 'INIT'; 
let selectedIndex = null;
let timerInterval = null;
let timeLeft = 0;
let piecesDropped = { 1: 0, 2: 0 };
let isVsComputer = false;
let humanShape = 1; 
let cpuShape = 2;

const statusDiv = document.getElementById('status-bar');
const actionBtn = document.getElementById('action-btn');
const timerDisplay = document.getElementById('timer-display');
const timeSelect = document.getElementById('time-select');
const cells = document.querySelectorAll('.cell');


function handleActionBtn() {
    initAudio(); 
    let mode = modeSelect.value;
    let selectedTime = parseInt(timeSelect.value); 
    
    if (gamePhase === 'OVER') {
        if (isOnlineGame) {
            actionBtn.innerText = "Waiting for opponent...";
            actionBtn.disabled = true;
            socket.emit('request_rematch', myRoomCode);
        } else {
            resetGame(); 
        }
        return;
    }

    if (mode === 'online') {
        overlay.style.display = 'flex';
        overlayText.innerText = "Searching for random player...";
        
        socket.emit('find_random_match', { timePreference: selectedTime, playerName: window.myPlayerName }); 
        
        return;
    } 

    if (gamePhase === 'INIT') startSetupPhase(false);
    else if (gamePhase === 'READY') startPlayPhase();
}

function cancelOnline() { 
    overlay.style.display = 'none'; 
    socket.emit('cancel_search'); 
    if (myRoomCode) {
        socket.emit('leave_room', myRoomCode);
        myRoomCode = null;
    }
    window.history.pushState({}, document.title, window.location.pathname);
}


socket.on('start_game', (data) => {
    overlay.style.display = 'none';
    isOnlineGame = true;
    myRoomCode = data.roomCode;
    myOnlineRole = data.role; 
    
    let oppName = data.opponentName || "Random";
    document.getElementById('score-title').innerText = "Vs " + oppName;
    
    chatContainer.style.display = 'flex';
    chatMessages.innerHTML = `<div style="text-align:center; color:#888; font-size:0.8rem; margin-top:5px;">Chat connected with ${oppName}</div>`;
    

    timeSelect.value = data.time.toString();
    timeLeft = data.time;
    updateTimerUI();
    
    modeSelect.disabled = true; shapeSelect.disabled = true; timeSelect.disabled = true;
    actionBtn.style.display = 'block'; 

    startSetupPhase(true); 
    
    let shapeName = myOnlineRole === 1 ? "Triangle (Red)" : "Square (Blue)";
    let firstMoveMsg = myOnlineRole === 1 ? "Your turn to drop!" : "Waiting for opponent...";
    updateStatus(`Game Found! You are ${shapeName}. ${firstMoveMsg}`);
    playSound('win');
});

socket.on('opponent_moved', (data) => {
    if (data.action === 'drop') {
        board[data.index] = currentPlayer;
        piecesDropped[currentPlayer]++;
        playSound('drop');
        drawBoard();
        checkSetupComplete();
    } else if (data.action === 'slide') {
        executeSlideAnimation(data.from, data.to, false); 
    }
});

socket.on('opponent_disconnected', () => {
    appendChatMessage("Opponent left the room.", 'other');
    updateStatus("Opponent Disconnected! You win.", true);
    playSound('win');
    setTimeout(() => {
        resetGame();
    }, 3000); 
});

socket.on('room_error', (msg) => {
    updateStatus(msg, true);
    cancelOnline();
    setTimeout(() => { resetGame(); }, 2000);
});

socket.on('opponent_wants_rematch', () => {
    if (gamePhase === 'OVER') {
        updateStatus("Opponent wants a rematch! Click Accept to agree.");
        actionBtn.innerText = "✅ Accept Rematch";
        actionBtn.style.backgroundColor = '#f1c40f';
        actionBtn.style.color = 'black';
    }
});

socket.on('rematch_accepted', () => {
    stopTimer();
    
    board = [0,0,0, 0,0,0, 0,0,0]; 
    selectedIndex = null; 
    piecesDropped = { 1: 0, 2: 0 };
    
    drawBoard(); 
   
    myOnlineRole = (myOnlineRole === 1) ? 2 : 1;
    
    timeLeft = parseInt(timeSelect.value);
    updateTimerUI();
    
    startSetupPhase(true); 
    
    let shapeName = myOnlineRole === 1 ? "Triangle (Red)" : "Square (Blue)";
    let firstMoveMsg = myOnlineRole === 1 ? "Your turn to drop!" : "Waiting for opponent...";
    
    statusDiv.style.background = '#3d3d4a';
    statusDiv.style.color = 'white';
    statusDiv.style.borderColor = '#555';
    updateStatus(`Rematch! You are ${shapeName}. ${firstMoveMsg}`);
});

function startSetupPhase(isOnline = false) {
    gamePhase = 'DROP';
    isVsComputer = (!isOnline && modeSelect.value === 'pve');
    if (isVsComputer) {
        humanShape = parseInt(shapeSelect.value);
        cpuShape = (humanShape === 1) ? 2 : 1;
    }

    currentPlayer = 1; 
    piecesDropped = { 1: 0, 2: 0 };
    
    if (isOnlineGame || isOnline) {
        modeSelect.disabled = true; 
        shapeSelect.disabled = true; 
        timeSelect.disabled = true;
    }
    
    actionBtn.innerText = isOnlineGame ? "Online Match Active" : "Setup in Progress...";
    actionBtn.disabled = true;
    actionBtn.style.backgroundColor = '#444';
    actionBtn.style.color = '#888';

    if (!isOnlineGame) {
        updateStatus(`Triangle's turn to drop.`);
    }
    
    if (isVsComputer && currentPlayer === cpuShape) setTimeout(cpuDropPhase, 600);

    abortBtn.style.display = 'block';
    newRandomBtn.style.display = 'none';
}

function startPlayPhase() {
    gamePhase = 'PLAY';
    currentPlayer = 1; 
    selectedIndex = null;
    
    actionBtn.innerText = "Rematch";
    actionBtn.disabled = true;
    actionBtn.style.backgroundColor = '#444';
    
    resetBtn.disabled = true;
    resetBtn.style.backgroundColor = '#444';
    resetBtn.style.color = '#888';
    
    abortBtn.style.display = 'block';
    abortBtn.disabled = false;
    
    timeLeft = parseInt(timeSelect.value);
    updateTimerUI();
    startTimer();
    
    if (isOnlineGame) {
        updateStatus(myOnlineRole === 1 ? "Your turn! Time is ticking." : "Waiting for opponent...");
    } else {
        updateStatus(`Game Started! Timer Running.`);
    }

    if (isVsComputer && currentPlayer === cpuShape) setTimeout(cpuMovePhase, 800);
}

function handleTap(index) {
    initAudio();
    if (gamePhase === 'INIT' || gamePhase === 'READY' || gamePhase === 'OVER') return;
    
    if (isOnlineGame && currentPlayer !== myOnlineRole) return;
    if (isVsComputer && currentPlayer === cpuShape) return;

    if (gamePhase === 'DROP') {
        if (board[index] !== 0) { playSound('error'); hapticVibrate(50); return; }

        board[index] = currentPlayer; 
        if (checkWin(currentPlayer)) {
            board[index] = 0; 
            playSound('error'); hapticVibrate(50);
            updateStatus("Illegal! Cannot form a line during setup.", true);
            return;
        }

        playSound('drop'); hapticVibrate(20);
        piecesDropped[currentPlayer]++;
        drawBoard();
        
        if (isOnlineGame) socket.emit('make_move', { roomCode: myRoomCode, action: 'drop', index: index });
        
        checkSetupComplete();
    }
    else if (gamePhase === 'PLAY') {
        if (board[index] === currentPlayer) {
            playSound('drop'); hapticVibrate(15);
            selectedIndex = index;
            drawBoard();
            updateStatus("Piece Selected");
        }
        else if (board[index] === 0 && selectedIndex !== null) {
            if (connections[selectedIndex].includes(index)) {
                executeSlideAnimation(selectedIndex, index, true);
            } else {
                playSound('error'); hapticVibrate(50);
                updateStatus("Must move Up, Down, Left, or Right!", true);
            }
        }
    }
}

function executeSlideAnimation(from, to, emitMove = true) {
    playSound('slide'); hapticVibrate(30);

    const cellFrom = document.getElementById('cell-' + from);
    const cellTo = document.getElementById('cell-' + to);
    const rF = cellFrom.getBoundingClientRect();
    const rT = cellTo.getBoundingClientRect();

    const ghost = document.createElement('div');
    ghost.className = `piece ${currentPlayer === 1 ? 'triangle' : 'square'}`;
    ghost.style.position = 'fixed'; ghost.style.left = rF.left + 'px'; ghost.style.top = rF.top + 'px';
    ghost.style.width = rF.width + 'px'; ghost.style.height = rF.height + 'px';
    ghost.style.zIndex = '100'; ghost.style.margin = '0';
    ghost.style.transition = 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)';
    document.body.appendChild(ghost);

    const playerWhoMoved = currentPlayer;
    board[to] = currentPlayer; board[from] = 0; selectedIndex = null;
    drawBoard();
    
    if (isOnlineGame && emitMove) {
        socket.emit('make_move', { roomCode: myRoomCode, action: 'slide', from: from, to: to });
    }
    
    const actualPiece = document.getElementById('cell-' + to).firstChild;
    if(actualPiece) actualPiece.style.opacity = '0';

    setTimeout(() => { ghost.style.left = rT.left + 'px'; ghost.style.top = rT.top + 'px'; }, 10);
    setTimeout(() => { ghost.remove(); if(actualPiece) actualPiece.style.opacity = '1'; finishMoveLogic(playerWhoMoved); }, 260);
}

function cpuDropPhase() {
    if (gamePhase !== 'DROP') return;
    let emptySpots = [];
    board.forEach((val, idx) => { if (val === 0) emptySpots.push(idx); });

    let validSpots = emptySpots.filter(spot => {
        board[spot] = cpuShape;
        let formsWin = checkWin(cpuShape);
        board[spot] = 0; return !formsWin;
    });

    if (validSpots.length === 0) validSpots = emptySpots;
    let chosenSpot = validSpots[Math.floor(Math.random() * validSpots.length)];
    
    board[chosenSpot] = cpuShape;
    playSound('drop'); piecesDropped[cpuShape]++;
    drawBoard(); checkSetupComplete();
}

function checkSetupComplete() {
    if (piecesDropped[1] === 3 && piecesDropped[2] === 3) {
        gamePhase = 'READY'; 
        if (isOnlineGame) {
            startPlayPhase();
        } else {
            actionBtn.disabled = false;
            actionBtn.innerText = "Start Game"; 
            actionBtn.style.backgroundColor = '#2ed573';
            actionBtn.style.color = 'black';
            updateStatus("Setup Complete! Click Start Game.");
        }
    } else {
        currentPlayer = (currentPlayer === 1) ? 2 : 1;
        let msg = `${getPlayerName()}'s turn to drop`;
        if (isOnlineGame && currentPlayer !== myOnlineRole) msg = "Waiting for opponent...";
        updateStatus(msg);
        if (isVsComputer && currentPlayer === cpuShape) setTimeout(cpuDropPhase, 600);
    }
}

function getWinMessage(winningShape) {
    if (isOnlineGame) return winningShape === myOnlineRole ? "YOU WIN ONLINE!" : "OPPONENT WINS!";
    if (isVsComputer) return winningShape === humanShape ? "YOU WIN!" : "COMPUTER WON!";
    return winningShape === 1 ? "TRIANGLE WINS!" : "SQUARE WINS!";
}

function handleWinAudioVisual(winningShape) {
    addScore(winningShape);
    let msg = getWinMessage(winningShape);
    
    let localPlayerWon = false;
    
    if (modeSelect.value === 'online' && isOnlineGame && winningShape === myOnlineRole) {
        localPlayerWon = true;
    } else if (modeSelect.value === 'pve' && isVsComputer && winningShape === humanShape) {
        localPlayerWon = true;
    }
    if (localPlayerWon && window.recordWin) {
        window.recordWin();
    }
    
    if ((isVsComputer && winningShape === cpuShape) || (isOnlineGame && winningShape !== myOnlineRole)) {
        playSound('boo');
    } else {
        playSound('win'); triggerVictoryFireworks(); 
    }
    return msg;
}

function finishMoveLogic(playerWhoMoved) {
    if (checkWin(playerWhoMoved)) {
        stopTimer();
        endGame(handleWinAudioVisual(playerWhoMoved), 'gold');
        return;
    }
    currentPlayer = (playerWhoMoved === 1) ? 2 : 1;
    if (!hasLegalMoves(currentPlayer)) {
        stopTimer(); playSound('error'); hapticVibrate([200, 100, 200]);
        endGame("DRAW! No moves left.", 'orange'); return;
    }
    
    let msg = `${getPlayerName()}'s turn`;
    if (isOnlineGame && currentPlayer !== myOnlineRole) msg = "Waiting for opponent...";
    updateStatus(msg);
    
    if (isVsComputer && currentPlayer === cpuShape && gamePhase === 'PLAY') setTimeout(cpuMovePhase, 500);
}

function cpuMovePhase() {
    if (gamePhase !== 'PLAY') return;
    let moves = [];
    board.forEach((val, from) => {
        if(val === cpuShape) connections[from].forEach(to => { if (board[to] === 0) moves.push({from, to}); });
    });
    if (moves.length === 0) return; 

    let bestMove = null;
    for (let move of moves) {
        board[move.to] = cpuShape; board[move.from] = 0;
        if (checkWin(cpuShape)) { bestMove = move; board[move.to] = 0; board[move.from] = cpuShape; break; }
        board[move.to] = 0; board[move.from] = cpuShape;
    }
    if (!bestMove) {
        let safeMoves = moves.filter(m => {
            board[m.to] = cpuShape; board[m.from] = 0; 
            let playerCanWin = false;
            board.forEach((val, pmf) => {
                if(val === humanShape) connections[pmf].forEach(pmt => {
                    if (board[pmt] === 0) {
                        board[pmt] = humanShape; board[pmf] = 0;
                        if (checkWin(humanShape)) playerCanWin = true;
                        board[pmt] = 0; board[pmf] = humanShape;
                    }
                });
            });
            board[m.to] = 0; board[m.from] = cpuShape; return !playerCanWin;
        });
        if (safeMoves.length > 0) {
            let centerMove = safeMoves.find(m => m.to === 4);
            bestMove = centerMove ? centerMove : safeMoves[Math.floor(Math.random() * safeMoves.length)];
        } 
    }
    if (!bestMove) {
        let centerMove = moves.find(m => m.to === 4);
        bestMove = centerMove ? centerMove : moves[Math.floor(Math.random() * moves.length)];
    }
    executeSlideAnimation(bestMove.from, bestMove.to, false);
}

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--; updateTimerUI();
        if (timeLeft <= 0) {
            stopTimer();
            let winningShape = (currentPlayer === 1) ? 2 : 1;
            endGame(`TIME'S UP! ${handleWinAudioVisual(winningShape)}`, 'orange');
        }
    }, 1000);
}
function stopTimer() { clearInterval(timerInterval); }
function updateTimerUI() {
    let m = Math.floor(timeLeft / 60); let s = timeLeft % 60;
    timerDisplay.innerText = (m < 10 ? "0"+m : m) + ":" + (s < 10 ? "0"+s : s);
    timerDisplay.style.color = timeLeft <= 10 ? '#ff4757' : '#888';
}

function checkWin(player) {
    for (let line of winLines) { if (board[line[0]] === player && board[line[1]] === player && board[line[2]] === player) return true; }
    return false;
}

function hasLegalMoves(player) {
    for (let i = 0; i < 9; i++) { if (board[i] === player) { for (let n of connections[i]) { if (board[n] === 0) return true; } } }
    return false;
}

function drawBoard() {
    cells.forEach((cell, i) => {
        cell.innerHTML = '';
        if (board[i] !== 0) {
            const p = document.createElement('div');
            p.className = `piece ${board[i] === 1 ? 'triangle' : 'square'} ${i === selectedIndex ? 'selected' : ''}`;
            cell.appendChild(p);
        }
    });
}

function updateStatus(msg, isError = false) {
    statusDiv.innerText = msg;
    statusDiv.style.borderColor = isError ? '#ff4757' : '#666';
    statusDiv.style.color = isError ? '#ff4757' : 'white';
}

function getPlayerName() {
    if (isOnlineGame) return currentPlayer === myOnlineRole ? "Your" : "Opponent's";
    if (isVsComputer && currentPlayer === cpuShape) return "Computer's";
    return currentPlayer === 1 ? "Triangle's" : "Square's";
}

function endGame(msg, color) {
    gamePhase = 'OVER';
    statusDiv.innerText = msg;
    statusDiv.style.background = color;
    statusDiv.style.color = 'black';
    statusDiv.style.borderColor = color;

    if(document.getElementById('reset-btn')) {
        document.getElementById('reset-btn').disabled = false;
        document.getElementById('reset-btn').style.backgroundColor = '#ffa502';
        document.getElementById('reset-btn').style.color = 'black';
    }
    if(document.getElementById('abort-btn')) document.getElementById('abort-btn').style.display = 'none';

    
    if (isOnlineGame) {
        actionBtn.innerText = "🔄 Request Rematch";
        actionBtn.disabled = false;
        actionBtn.style.backgroundColor = '#27ae60';
        actionBtn.style.color = 'white';
        
        if (modeSelect.value === 'online' && document.getElementById('new-random-btn')) {
            document.getElementById('new-random-btn').style.display = 'block';
        }
    } else {
        
        actionBtn.innerText = "Play Again";
        actionBtn.disabled = false;
        actionBtn.style.backgroundColor = '#3498db';
        actionBtn.style.color = 'white';
    }
}
    

function resetGame() {
    stopTimer(); board = [0,0,0,0,0,0,0,0,0]; gamePhase = 'INIT';
    selectedIndex = null; piecesDropped = { 1: 0, 2: 0 };
    
    isOnlineGame = false; myRoomCode = null; myOnlineRole = null;

    statusDiv.style.background = '#3d3d4a'; statusDiv.style.color = 'white'; statusDiv.style.borderColor = '#555';
    updateStatus("Choose settings & Click Start Setup");
    
    actionBtn.innerText = "Start Setup"; actionBtn.disabled = false;
    actionBtn.style.backgroundColor = '#3498db'; actionBtn.style.color = 'white';

    modeSelect.disabled = false; shapeSelect.disabled = false; timeSelect.disabled = false; 
    
    let val = parseInt(timeSelect.value);
    let m = Math.floor(val / 60); let s = val % 60;
    timerDisplay.innerText = (m < 10 ? "0"+m : m) + ":" + (s < 10 ? "0"+s : s);
    timerDisplay.style.color = "#888";
    
    handleModeChange(); drawBoard(); cancelOnline();
    
    chatContainer.style.display = 'none';
    chatMessages.innerHTML = ''; 
    
    resetBtn.disabled = false;
    resetBtn.style.backgroundColor = '#ffa502';
    resetBtn.style.color = 'black';
    
    abortBtn.style.display = 'none';
    newRandomBtn.style.display = 'none';
}

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
let audioCtx;
document.body.addEventListener('click', initAudio, { once: true });

handleModeChange();
shapeSelect.addEventListener('change', () => {
    if (gamePhase !== 'INIT') resetGame();
});

timeSelect.addEventListener('change', () => {
     let val = parseInt(timeSelect.value);
     let m = Math.floor(val / 60); let s = val % 60;
     timerDisplay.innerText = (m < 10 ? "0"+m : m) + ":" + (s < 10 ? "0"+s : s);
     
     if (gamePhase !== 'INIT') resetGame();
});

let initialTimeVal = parseInt(timeSelect.value);
let initialM = Math.floor(initialTimeVal / 60); let initialS = initialTimeVal % 60;
timerDisplay.innerText = (initialM < 10 ? "0"+initialM : initialM) + ":" + (initialS < 10 ? "0"+initialS : initialS);


function openModal(id) { 
    document.getElementById(id).style.display = 'flex'; 
}
function closeModal(id) { 
    document.getElementById(id).style.display = 'none'; 
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay') && event.target.id !== 'username-modal') {
        event.target.style.display = "none";
    }
};

function sendChatMessage() {
    const msg = chatInput.value.trim();
    if (msg === '' || !isOnlineGame) return;
  
    appendChatMessage(msg, 'self');
   
    socket.emit('send_chat', { roomCode: myRoomCode, message: msg });
    
    chatInput.value = '';
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

socket.on('receive_chat', (msg) => {
    appendChatMessage(msg, 'other');
    if (sounds.drop) {
        let chatSound = sounds.drop.cloneNode();
        chatSound.volume = 0.2;
        chatSound.play().catch(e => {});
    }
});

function appendChatMessage(msg, sender) {
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    div.innerText = msg;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight; 
}

function abortGame() {
    if (confirm("Are you sure you want to abort the match? Your opponent will win.")) {
        if (isOnlineGame) socket.emit('leave_room', myRoomCode);
        resetGame();
    }
}

function findNewRandom() {
    if (isOnlineGame) socket.emit('leave_room', myRoomCode);
    resetGame();
    setTimeout(() => { handleActionBtn(); }, 300); 
}

function handleResetClick() {
    if (isOnlineGame) {
        if (confirm("Restart the match? This will clear the board for both players.")) {
            socket.emit('force_restart', myRoomCode);
            softReset();
        }
    } else {
        resetGame(); 
    }
}

function softReset() {
    stopTimer(); 
    board = [0,0,0, 0,0,0, 0,0,0]; 
    selectedIndex = null; 
    piecesDropped = { 1: 0, 2: 0 };
    gamePhase = 'INIT';
    
    drawBoard(); 
    
    timeLeft = parseInt(timeSelect.value);
    updateTimerUI();
    
    startSetupPhase(true); 
    
    let shapeName = myOnlineRole === 1 ? "Triangle (Red)" : "Square (Blue)";
    let firstMoveMsg = myOnlineRole === 1 ? "Your turn to drop!" : "Waiting for opponent...";
    
    statusDiv.style.background = '#3d3d4a';
    statusDiv.style.color = 'white';
    statusDiv.style.borderColor = '#555';
    updateStatus(`Match Restarted! You are ${shapeName}. ${firstMoveMsg}`);
    
    if (document.getElementById('reset-btn')) {
        document.getElementById('reset-btn').disabled = false;
        document.getElementById('reset-btn').style.backgroundColor = '#ffa502';
    }
}

socket.on('opponent_forced_restart', () => {
    softReset();
    updateStatus("Opponent restarted the board! Replace your shapes.", true);
    playSound('error'); 
});