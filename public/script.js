const socket = io();
let playerNumber;
let turn;
let board = [];
let roomId = null;
let selectedPiece = null;
let actionCount = 0; // Track 2 actions per turn
let previousAttacker = null;  // Track previous attacker to prevent two attacks from the same unit
let unitHasAttacked = {};  // Track which units have attacked in this turn

// Join a room when the player clicks the join button
function joinRoom() {
    roomId = document.getElementById('roomInput').value.trim();
    if (roomId) {
        const generalChoice = prompt("Choose your General: 'GW' for General Warrior");
        if (generalChoice === 'GW') {
            socket.emit('joinRoom', { roomId, general: generalChoice });
        } else {
            alert("Invalid choice, please select 'GW'");
        }
    }
}

// Receive player number and initial board state after joining
socket.on('playerNumber', (data) => {
    playerNumber = data.playerNumber;
    board = data.board;
    turn = data.turn;
    actionCount = 0;

    if (data.general) {
        // Place the General Warrior on the board
        if (playerNumber === 'P1') {
            board[0][3].unit = `P1_${data.general}`;  // Player 1's General Warrior
        } else {
            board[7][4].unit = `P2_${data.general}`;  // Player 2's General Warrior
        }
    }

    renderBoard();
    alert(`You are Player ${playerNumber}`);
});

// When both players have joined, the game starts and the board is set
socket.on('gameStart', (boardData) => {
    board = boardData;
    renderBoard();
    alert('Game started!');
});

// Update the board state after a move
socket.on('updateBoard', (data) => {
    board = data.board;
    turn = data.turn;
    actionCount = 0;  // Reset action count after turn switch
    unitHasAttacked = {};  // Reset attack tracking after turn switch
    renderBoard();
    document.getElementById('turnInfo').textContent = `It's ${turn === 'P1' ? 'Player 1' : 'Player 2'}'s turn`;
});

// Handle attack result
socket.on('attackHit', (message) => {
    alert(message);
});

// Handle counter-attack result
socket.on('counterAttack', (message) => {
    alert(message);
});

// Handle missed attacks
socket.on('attackMiss', (message) => {
    alert(message);
});

// Notify if it's not the player's turn
socket.on('notYourTurn', () => {
    alert('It is not your turn!');
});

function onClick(row, col) {
    console.log(`Clicked cell: (${row}, ${col})`);
    if (turn !== playerNumber) {
        alert('Not your turn!');
        return;
    }

    const piece = board[row][col].unit;
    console.log(`Clicked piece: ${piece}`);

    if (!selectedPiece && piece.startsWith(playerNumber)) {
        selectedPiece = { row, col };
        console.log(`Selected piece: ${piece} at (${row}, ${col})`);
    } else if (selectedPiece) {
        const from = selectedPiece;
        const to = { row, col };
        console.log(`Attempting move from (${from.row}, ${from.col}) to (${to.row}, ${to.col})`);

        if (actionCount < 2) {
            const attackingUnit = `${from.row},${from.col}`;  // Unique ID for the attacking unit

            if (!board[to.row][to.col].unit) {
                // Move piece logic
                if (isValidMove(board[from.row][from.col], from.row, from.col, to.row, to.col)) {
                    makeMove(from, to);
                    actionCount++;
                } else {
                    console.log(`Invalid move from (${from.row}, ${from.col}) to (${to.row}, ${to.col})`);
                }
            } else if (board[to.row][to.col].unit.startsWith(playerNumber === 'P1' ? 'P2' : 'P1') || board[to.row][to.col].unit === 'T1' || board[to.row][to.col].unit === 'T2') {
                // Attack logic, including Towers
                if (unitHasAttacked[attackingUnit]) {
                    alert('This unit has already attacked this turn!');
                    return;
                }

                if (isValidAttack(board[from.row][from.col], from.row, from.col, to.row, to.col)) {
                    console.log(`Attacking opponent's piece: ${board[to.row][to.col].unit}`);
                    makeMove(from, to);  // Handle attacks with the same makeMove method
                    actionCount++;

                    // Mark this unit as having attacked
                    unitHasAttacked[attackingUnit] = true;
                } else {
                    console.log(`Invalid attack from (${from.row}, ${from.col}) to (${to.row}, ${to.col})`);
                }
            }

            if (actionCount === 2) {
                endTurn();
            }
        } else {
            alert('You have already performed 2 actions this turn.');
        }

        selectedPiece = null;  // Deselect after action
    }
}

// Validate if the move is correct for Warrior (W), Horse (H), Archer (A), General Warrior (GW), or Towers
function isValidMove(pieceData, fromRow, fromCol, toRow, toCol) {
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);
    const destination = board[toRow][toCol].terrain;  // Access the destination terrain

    // Prevent units from stepping on water
    if (destination === 'water') {
        console.log('Cannot move onto water terrain!');
        return false;
    }

    const piece = pieceData.unit;

    // Warrior (W), General Warrior (GW), and Towers can't move
    if (piece.startsWith('T1') || piece.startsWith('T2')) {
        return false; // Towers can't move
    }

    if (piece.startsWith('P1_W') || piece.startsWith('P2_W') || 
        piece.startsWith('P1_GW') || piece.startsWith('P2_GW')) {
        return rowDiff <= 1 && colDiff <= 1;
    }

    // Horse (H) can move up to 3 spaces in a straight line (including diagonal)
    if (piece.startsWith('P1_H') || piece.startsWith('P2_H')) {
        return (rowDiff <= 3 && colDiff === 0) ||  // Straight vertical
               (colDiff <= 3 && rowDiff === 0) ||  // Straight horizontal
               (rowDiff === colDiff && rowDiff <= 3);  // Diagonal
    }

    // Archer (A) can move 1 space in any direction
    if (piece.startsWith('P1_A') || piece.startsWith('P2_A')) {
        return rowDiff <= 1 && colDiff <= 1;
    }

    return false;
}

// Make a move and notify the server
function makeMove(from, to) {
    socket.emit('makeMove', { roomId, player: playerNumber, move: { from, to } });
    selectedPiece = null;  // Deselect after the move
}

// Validate if the attack is valid
function isValidAttack(pieceData, fromRow, fromCol, toRow, toCol) {
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    let ignoreAvoidance = false;

    // Check if the attacker is standing on red terrain
    if (board[fromRow][fromCol].terrain === 'red') {
        ignoreAvoidance = true;
        console.log('Attacking from red terrain: Ignoring avoidance!');
    }

    const piece = pieceData.unit;

    // General Warrior (GW), Warrior (W), and Towers attack logic (adjacent pieces, 1 space away in any direction)
    if (piece.startsWith('P1_W') || piece.startsWith('P2_W') ||
        piece.startsWith('P1_GW') || piece.startsWith('P2_GW') ||
        piece.startsWith('T1') || piece.startsWith('T2')) {
        return rowDiff <= 1 && colDiff <= 1;
    }

    // Archer (A) attack logic: attack up to 3 spaces away in straight lines (no diagonal attacks)
    if (piece.startsWith('P1_A') || piece.startsWith('P2_A')) {
        return (rowDiff === 0 && colDiff <= 3) ||  // Horizontal attack
               (colDiff === 0 && rowDiff <= 3);  // Vertical attack
    }

    // Horse (H) attack logic (adjacent pieces, 1 space away in any direction)
    if (piece.startsWith('P1_H') || piece.startsWith('P2_H')) {
        return rowDiff <= 1 && colDiff <= 1;
    }

    return false;
}

// End the turn
function endTurn() {
    actionCount = 0;  // Reset the action count for the next turn
    unitHasAttacked = {};  // Reset the attack tracker for the new turn
    previousAttacker = null;  // Reset the previous attacker
    selectedPiece = null;  // Deselect the current piece
    socket.emit('endTurn', { roomId, player: playerNumber });
}

// Render the board in the HTML
function renderBoard() {
    const gameBoard = document.getElementById('gameBoard');
    gameBoard.innerHTML = '';

    for (let row = 0; row < board.length; row++) {
        const tr = document.createElement('tr');
        for (let col = 0; col < board[row].length; col++) {
            const td = document.createElement('td');
            td.classList.add('board-cell');

            const terrainType = board[row][col].terrain;  // Get terrain type
            const unitType = board[row][col].unit;  // Get unit type

            // Set terrain background based on terrain type
            if (terrainType === 'water') {
                td.classList.add('water-terrain');
            } else if (terrainType === 'red') {
                td.classList.add('red-terrain');
            } else {
                td.classList.add('normal-terrain');
            }

            // Display unit image based on unit type
            if (unitType) {
                const unitImage = document.createElement('img');
                unitImage.src = getImageForUnit(unitType);  // Set the image source based on the unit
                unitImage.classList.add('unit-image');  // Optional: Add a class for styling
                td.appendChild(unitImage);
            }

            td.onclick = () => onClick(row, col);  // Add click handler
            tr.appendChild(td);
        }
        gameBoard.appendChild(tr);
    }
}


// Helper function to return the image path for a given unit type
function getImageForUnit(unitType) {
    const unitImages = {
        'P1_W': '/resources/images/p1.pawn.png',
        'P2_W': '/resources/images/p2_pawn.png',
        'P1_H': '/resources/images/p1_horse.png',
        'P2_H': '/resources/images/p2_horse.jpg',
        'P1_A': '/resources/images/p1_archer.png',
        'P2_A': '/resources/images/p2_a.png',
        'P1_GW': '/resources/images/p1_gp.png',  // Example: General Warrior image for Player 1
        'P2_GW': '/resources/images/p2_gp.png',  // Example: General Warrior image for Player 2
        'T1': '/resources/images/p1_t.png',        // Example: Tower 1 image
        'T2': '/resources/images/p2_t.png'         // Example: Tower 2 image
        // Add other units as needed
    };
    return unitImages[unitType] || '';  // Return the image URL or an empty string if no unit
}


// Attach the joinRoom function to the join button
document.getElementById('joinButton').onclick = joinRoom;
