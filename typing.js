const socket = io();
const BOARD_SIZE = 8;
let selectedPiece = null;
let player = null; // Will be 'P1' or 'P2' after game starts
let turn = 'P1';
let moveCount = 0;
let pieceKillCount = {};
let pieceHasAttacked = {};
let room = prompt("Enter room name:"); // Create or join a room

let player1General = '';
let player2General = '';

let terrain = [
    ['green', 'green', 'green', 'green', 'green', 'green', 'green', 'green'],
    ['green', 'green', 'green', 'green', 'green', 'green', 'green', 'green'],
    ['green', 'green', 'green', 'green', 'green', 'green', 'green', 'green'],
    ['green', 'green', 'blue', 'blue', 'blue', 'blue', 'green', 'green'],
    ['green', 'green', 'blue', 'blue', 'blue', 'blue', 'green', 'green'],
    ['green', 'green', 'green', 'green', 'green', 'green', 'green', 'green'],
    ['green', 'green', 'green', 'green', 'green', 'green', 'green', 'green'],
    ['green', 'green', 'green', 'green', 'green', 'green', 'green', 'green']
];

socket.emit('joinGame', room);

// Add images for all the pieces (if needed)
const pieceImages = {
    'P1': 'resources/images/p1.pawn.png',
    'P2': 'resources/images/p2_pawn.png',
    'H1': 'resources/images/p1_horse.png',
    'H2': 'resources/images/p2_horse.jpg',
    'A1': 'resources/images/p1_archer.png',
    'A2': 'resources/images/p2_a.png',
    'GA1': 'resources/images/p1_ga.png',
    'GA2': 'resources/images/p2_ga.png',
    'GP1': 'resources/images/p1_gp.png',
    'GP2': 'resources/images/p2_gp.png',
    'GH1': 'resources/images/p1_gh.png',
    'GH2': 'resources/images/p2_gh.png',
    'T1': 'resources/images/p1_t.png',
    'T2': 'resources/images/p2_t.png'
};

const towerHp = {
    'T1': 18,
    'T2': 20
};

let board = [
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '']
];

// Listen for the start of the game
socket.on('startGame', (gameState) => {
    board = gameState.board;
    turn = gameState.turn;
    player1General = gameState.player1General;
    player2General = gameState.player2General;
    player = player === null ? (gameState.turn === 'P1' ? 'P2' : 'P1') : player; // Assign player roles
    renderBoard();
    updatePlayerInfo();
});

socket.on('updateBoard', (gameState) => {
    board = gameState.board;
    turn = gameState.turn;
    renderBoard();
    updatePlayerInfo();
});

function renderBoard() {
    const gameBoard = document.getElementById('gameBoard');
    gameBoard.innerHTML = '';

    for (let row = 0; row < BOARD_SIZE; row++) {
        const tr = document.createElement('tr');
        for (let col = 0; col < BOARD_SIZE; col++) {
            const td = document.createElement('td');
            td.dataset.row = row;
            td.dataset.col = col;

            // Set terrain background
            td.style.backgroundColor = terrain[row][col];

            const piece = board[row][col];
            if (piece && pieceImages[piece]) {
                const img = document.createElement('img');
                img.src = pieceImages[piece];
                td.appendChild(img);
            } else if (piece) {
                td.innerText = piece;
                td.classList.add('piece');
            }

            td.onclick = () => onClick(row, col);
            tr.appendChild(td);
        }
        gameBoard.appendChild(tr);
    }
}

function onClick(row, col) {
    if (turn !== player) {
        alert("It's not your turn!");
        return;
    }

    const piece = board[row][col];

    if (selectedPiece) {
        moveOrAttack(row, col);
    } else if (piece && piece.endsWith(player[1])) {
        selectedPiece = { row, col };
    }
}

function moveOrAttack(row, col) {
    const selectedRow = selectedPiece.row;
    const selectedCol = selectedPiece.col;
    const piece = board[selectedRow][selectedCol];
    const targetPiece = board[row][col];

    if (targetPiece === '') {
        if (isValidMove(selectedRow, selectedCol, row, col)) {
            movePiece(selectedRow, selectedCol, row, col);
        }
    } else if (targetPiece.endsWith(player === 'P1' ? '2' : '1')) {
        if (isValidAttack(selectedRow, selectedCol, row, col)) {
            attackPiece(selectedRow, selectedCol, row, col);
        }
    }

    selectedPiece = null;
    renderBoard();
}

function isValidMove(fromRow, fromCol, toRow, toCol) {
    const piece = board[fromRow][fromCol];

    if (terrain[toRow][toCol] === 'blue') {
        alert("Can't move into water!");
        return false;
    }

    if (piece.startsWith('T')) {
        return false;
    }

    if (piece.startsWith('P') || piece.startsWith('GP') || piece.startsWith('A') || piece.startsWith('GA')) {
        return Math.abs(fromRow - toRow) <= 1 && Math.abs(fromCol - toCol) <= 1;
    }

    if (piece.startsWith('H') || piece.startsWith('GH')) {
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        return (rowDiff <= 3 && colDiff === 0) || (colDiff <= 3 && rowDiff === 0) || (rowDiff === colDiff && rowDiff <= 3);
    }

    return true;
}

function movePiece(fromRow, fromCol, toRow, toCol) {
    board[toRow][toCol] = board[fromRow][fromCol];
    board[fromRow][fromCol] = '';
    moveCount++;
    socket.emit('move', { fromRow, fromCol, toRow, toCol }); // Emit the move to server
    if (moveCount === 2) {
        endTurn();
    }
    updatePlayerInfo();
}

function isValidAttack(attRow, attCol, defRow, defCol) {
    const attacker = board[attRow][attCol];

    if (pieceHasAttacked[`${attRow},${attCol}`]) {
        alert("This unit has already attacked this turn!");
        return false;
    }

    if (attacker.startsWith('H') || attacker.startsWith('GH')) {
        return Math.abs(attRow - defRow) <= 1 && Math.abs(attCol - defCol) <= 1;
    } else if (attacker.startsWith('A')) {
        return Math.abs(attRow - defRow) <= 3 && attCol === defCol || attRow === defCol;
    } else if (attacker.startsWith('GA')) {
        return Math.abs(attRow - defRow) <= 4 && attCol === defCol || attRow === defCol;
    }

    return Math.abs(attRow - defRow) <= 1 && Math.abs(attCol - defCol) <= 1;
}

function attackPiece(attRow, attCol, defRow, defCol) {
    board[defRow][defCol] = ''; // Simulate attack by removing the target
    pieceHasAttacked[`${attRow},${attCol}`] = true;
    moveCount++;
    if (moveCount === 2) {
        endTurn();
    }
    socket.emit('move', { fromRow: attRow, fromCol: attCol, toRow: defRow, toCol: defCol }); // Emit attack to server
    updatePlayerInfo();
}

function endTurn() {
    moveCount = 0;
    pieceHasAttacked = {};
    turn = turn === 'P1' ? 'P2' : 'P1';
    updatePlayerInfo();
}

function updatePlayerInfo() {
    document.getElementById('player1-turn').innerText = (turn === 'P1') ? 'Yes' : 'No';
    document.getElementById('player2-turn').innerText = (turn === 'P2') ? 'Yes' : 'No';
    document.getElementById('player1-actions').innerText = (turn === 'P1') ? 2 - moveCount : 0;
    document.getElementById('player2-actions').innerText = (turn === 'P2') ? 2 - moveCount : 0;
}

function getGeneralType(player) {
    if (player === 'P1') {
        if (player1General.startsWith('GA')) return 'General Archer';
        if (player1General.startsWith('GP')) return 'General Pawn';
        if (player1General.startsWith('GH')) return 'General Horse';
    } else if (player === 'P2') {
        if (player2General.startsWith('GA')) return 'General Archer';
        if (player2General.startsWith('GP')) return 'General Pawn';
        if (player2General.startsWith('GH')) return 'General Horse';
    }
    return 'Unknown';
}

initializeBoard();
