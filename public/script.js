const socket = io();
let playerNumber;
let turn;
let board = [];
let roomId = null;
let selectedPiece = null;
let actionCount = 0; // Track 2 actions per turn
let previousAttacker = null;  // Track previous attacker to prevent two attacks from the same unit
let unitHasAttacked = {};  // Track which units have attacked in this turn
const backgroundSound = document.getElementById('backgroundSound');
const missSound = document.getElementById('missSound');
const stepSound = document.getElementById('stepSound');
const dieSound = document.getElementById('dieSound');
const horseMoveSound = document.getElementById('horseMoveSound');
const counterSound = document.getElementById('counterAttack');
const youWin = document.getElementById('youWin');
const mageMove = document.getElementById('mageMove');
const spell = document.getElementById('spell');
const towerHit = document.getElementById('towerHit');
const towerExplotion = document.getElementById('towerExplotion');
// Join a room when the player clicks the join button
function joinRoom() {
    roomId = document.getElementById('roomInput').value.trim();
    if (roomId) {
        backgroundSound.loop = true;
        backgroundSound.volume=0.1;
        backgroundSound.play().then(() => {
            // Audio is now unlocked for future use
            console.log("Audio unlocked for future use");
        }).catch((error) => {
            // Handle errors (if autoplay restrictions are still in place)
            console.log("Audio was not allowed to play:", error);
        });
        const generalChoice = prompt("Choose your General: 'GW' for General Warrior");
        if (generalChoice === 'GW') {
            socket.emit('joinRoom', { roomId, general: generalChoice });
        } else {
            alert("Invalid choice, please select 'GW'");
        }
    }
}

// Function to save the game state to localStorage
function saveGameState() {
    const gameState = {
        board: board,
        turn: turn,
        playerNumber: playerNumber,
        actionCount: actionCount,
        unitHasAttacked: unitHasAttacked,
    };
    localStorage.setItem('gameState', JSON.stringify(gameState));
}

// Save game state before the page unloads or on manual save
window.addEventListener('beforeunload', saveGameState);

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
socket.on('attackHit', (data) => {
    const { message, attackingPiece } = data;  // Correctly extract data properties

    // Check if the attacking piece is a Mage (P1_M or P2_M)
    if (attackingPiece.startsWith('P1_M') || attackingPiece.startsWith('P2_M')) {
        spell.play();  // Play mage attack sound if Mage is attacking
    } else {
        dieSound.play();  // Play default attack sound
    }
    
    alert(message);
});

// Handle tower damaged event
socket.on('towerDamaged', (message) => {
    alert(message);  // You can display this message or update a UI element to show the tower's health.
    towerHit.play();

});

// Handle tower destroyed event
socket.on('towerDestroyed', (message) => {
    alert(message);  // You can display a message or remove the tower visually from the board.
    towerExplotion.play();
});

// Handle counter-attack result
socket.on('counterAttack', (message) => {
    counterSound.play();
    alert(message);
});

// Handle missed attacks
socket.on('attackMiss', (message) => {
    alert(message);
    playOnMiss();
});

// Notify if it's not the player's turn
socket.on('notYourTurn', () => {
    alert('It is not your turn!');
});

// Handle game over event
socket.on('gameOver', (message) => {
    alert(message);
    // Optionally, you can disable further moves and reload the page to start a new game
    youWin.play();
    location.reload();
});

let unitHasMoved = {};  // Track which units have moved this turn

function onClick(row, col) {
    console.log(`Clicked cell: (${row}, ${col})`);

    // Deselect previous selected piece (if any)
    if (selectedPiece) {
        const previousSelectedCell = document.querySelector('.selected-cell');
        if (previousSelectedCell) {
            previousSelectedCell.classList.remove('selected-cell');
        }
    }

    if (turn !== playerNumber) {
        alert('Not your turn!');
        return;
    }

    const piece = board[row][col].unit;
    console.log(`Clicked piece: ${piece}`);

    const attackingUnit = `${selectedPiece?.row},${selectedPiece?.col}`;  // Unique ID for the attacking unit

    if (!selectedPiece && piece.startsWith(playerNumber)) {
        selectedPiece = { row, col };
        console.log(`Selected piece: ${piece} at (${row}, ${col})`);

        // Add selected-cell class to the selected square
        const selectedCell = document.querySelector(`tr:nth-child(${row + 1}) td:nth-child(${col + 1})`);
        selectedCell.classList.add('selected-cell');

    } else if (selectedPiece) {
        const from = selectedPiece;
        const to = { row, col };
        console.log(`Attempting move from (${from.row}, ${from.col}) to (${to.row}, ${to.col})`);

        if (actionCount < 2) {
            // Check if the unit has already attacked
            if (unitHasAttacked[attackingUnit] && board[to.row][to.col].unit.startsWith(playerNumber === 'P1' ? 'P2' : 'P1')) {
                alert('This unit has already attacked this turn!');
                return;
            }

            if (!board[to.row][to.col].unit) {
                // Move piece logic
                if (isValidMove(board[from.row][from.col], from.row, from.col, to.row, to.col)) {
                    makeMove(from, to);
                    actionCount++;
                    unitHasMoved[attackingUnit] = true;

                    // Deselect the cell after move
                    const selectedCell = document.querySelector(`tr:nth-child(${from.row + 1}) td:nth-child(${from.col + 1})`);
                    selectedCell.classList.remove('selected-cell');
                } else {
                    console.log(`Invalid move from (${from.row}, ${from.col}) to (${to.row}, ${to.col})`);
                }
            } else if (board[to.row][to.col].unit.startsWith(playerNumber === 'P1' ? 'P2' : 'P1')) {
                // Attack logic, including Towers
                if (isValidAttack(board[from.row][from.col], from.row, from.col, to.row, to.col)) {
                    console.log(`Attacking opponent's piece: ${board[to.row][to.col].unit}`);
                    makeMove(from, to);  // Handle attacks with the same makeMove method
                    actionCount++;

                    // Mark this unit as having attacked
                    unitHasAttacked[attackingUnit] = true;

                    // Deselect the cell after attack
                    const selectedCell = document.querySelector(`tr:nth-child(${from.row + 1}) td:nth-child(${from.col + 1})`);
                    selectedCell.classList.remove('selected-cell');
                } else {
                    console.log(`Invalid attack from (${from.row}, ${from.col}) to (${to.row}, ${to.col})`);
                }
            }

            // Allow unit to move after attacking
            if (unitHasAttacked[attackingUnit] && !unitHasMoved[attackingUnit] && actionCount < 2) {
                console.log(`Unit can still move after attacking`);
                selectedPiece = from;  // Set the unit as still selected for a move
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
    if (piece.startsWith('P1_T') || piece.startsWith('P2_T')) {
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

      //Mage can move 1 space in any direction
      if (piece.startsWith('P1_M') || piece.startsWith('P2_M')) {
        return rowDiff <= 1 && colDiff <= 1;
    }


    return false;
}

// Make a move and notify the server
function makeMove(from, to) {
    socket.emit('makeMove', { roomId, player: playerNumber, move: { from, to } });
    const movingPiece = board[from.row][from.col].unit;

    // Check if the moving piece is a Horse or Mage
    if (movingPiece.startsWith('P1_H') || movingPiece.startsWith('P2_H')) {
        horseMoveSound.play();  // Play horse move sound
    } else if (movingPiece.startsWith('P1_M') || movingPiece.startsWith('P2_M')) {
        mageMove.play();  // Play mage move sound
    } else {
        stepSound.play();  // Play regular move sound for all other units
    }


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
        piece.startsWith('P1_T') || piece.startsWith('P2_T')) {
        return rowDiff <= 1 && colDiff <= 1;
    }

    // Archer (A) attack logic: attack up to 3 spaces away in straight lines (no diagonal attacks)
    if (piece.startsWith('P1_A') || piece.startsWith('P2_A')) {
        return (rowDiff === 0 && colDiff <= 3) ||  // Horizontal attack
               (colDiff === 0 && rowDiff <= 3);  // Vertical attack
    }
     // Archer (A) attack logic: attack up to 3 spaces away in straight lines (no diagonal attacks)
     if (piece.startsWith('P1_M') || piece.startsWith('P2_M')) {
        return (rowDiff === 0 && colDiff <= 2) ||  // Horizontal attack
               (colDiff === 0 && rowDiff <= 2);  // Vertical attack
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
    unitHasAttacked = {};
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

            // Display unit image based on unit type, including tower health
            if (unitType) {
                const unitImage = document.createElement('img');
                unitImage.src = getImageForUnit(unitType);  // Set the image source based on the unit
                unitImage.classList.add('unit-image');  // Optional: Add a class for styling
                td.appendChild(unitImage);

                // Display tower HP if it's a tower
                if (unitType === 'P1_T' || unitType === 'P2_T') {
                    const tower = board[row][col];
                    if (tower.hp) {
                        const hpDisplay = document.createElement('div');
                        hpDisplay.textContent = `HP: ${tower.hp}`;
                        td.appendChild(hpDisplay);
                    }
                }
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
        'P1_T': '/resources/images/p1_t.png',        // Example: Tower 1 image
        'P2_T': '/resources/images/p2_t.png',         // Example: Tower 2 image
        'P1_GA': '/resources/images/p1_ga.png',
        'P2_GA': '/resources/images/p2_ga.png',
        'P1_GH': '/resources/images/p2_gh.png',
        'P2_GH': '/resources/images/p1_archer.png',
        'P1_M': '/resources/images/p1_mage.png',
        'P2_M': '/resources/images/p2_mage.png'
        // Add other units as needed
    };
    return unitImages[unitType] || '';  // Return the image URL or an empty string if no unit
}

// Example: Play sound when a move or attack occurs
function playOnMiss(){
    missSound.play()
}


// Attach the joinRoom function to the join button
document.getElementById('joinButton').onclick = joinRoom;
