require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const BOARD_SIZE = 8;
let turnCounter = 0;
// Store the game state and rooms
const games = {};
let matchmakingQueue = [];
//const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Player = require('./models/Player'); // Ensure the path is correct
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const dbHost = process.env.DB_HOST;
const schedule = require('node-schedule');
let countdown = 0; // counter for event timer.
const gameTimers = {}; // Stores timers for each game
// Add bot account to matchmaking if no players are waiting


mongoose.connect(process.env.DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB connected!"))
.catch(err => console.error("MongoDB connection error:", err));

mongoose.connection.on('open', () => {
    console.log('Connected to MongoDB');
});
app.use(express.static('public'));

app.use(express.json()); // for parsing application/json


app.get('/player/:username', async (req, res) => {
    try {
        const player = await Player.findOne({ username: req.params.username });
        res.json(player);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    try {
        const existingPlayer = await Player.findOne({ username: trimmedUsername });
        if (existingPlayer) {
            return res.status(400).json({ message: "Username already exists." });
        }

        const newPlayer = new Player({
            username: trimmedUsername, 
            password: trimmedPassword  // Save password as plain text
        });
        await newPlayer.save();
        res.status(201).json({ message: "Registration successful", username: newPlayer.username });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    try {
        const player = await Player.findOne({ username: trimmedUsername });
        if (!player) {
            return res.status(404).json({ message: "User not found." });
        }

        // Compare plain text passwords directly
        if (trimmedPassword !== player.password) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        const generalUnlockMessage = await checkAndUnlockGeneral(username);
        
        res.json({
            message: "Login successful",
            username: player.username,
            rating: player.rating,
            gamesPlayed: player.gamesPlayed,
            ownedGenerals: player.ownedGenerals, // Send back the player's owned generals
            balance: player.balance,
            generalUnlockMessage: generalUnlockMessage !== 'No new general unlocked' ? generalUnlockMessage : null
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/player/:username', async (req, res) => {
    try {
        const player = await Player.findOne({ username: req.params.username });
        res.json({
            username: player.username,
            rating: player.rating,
            gamesPlayed: player.gamesPlayed,
            ownedGenerals: player.ownedGenerals,  // Return owned generals
            balance: player.balance
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// In your server.js or routes file
app.get('/top-rankings', async (req, res) => {
    try {
        const topPlayers = await Player.find({})
            .sort({ rating: -1 })  // Sort by rating descending
            .select('username rating ownedGenerals')
            .limit(50);  // Limit to top 10 players
        res.status(200).json(topPlayers);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching top rankings' });
    }
});


app.post('/update-game-result', async (req, res) => {
    const { winnerUsername, loserUsername } = req.body;

    try {
        const winner = await Player.findOne({ username: winnerUsername });
        const loser = await Player.findOne({ username: loserUsername });

        if (!winner || !loser) {
            return res.status(404).json({ message: "One or both players not found." });
        }

        const winnerNewRating = Math.min(1500, winner.rating + 50);
        const loserNewRating = Math.max(1200, loser.rating - 50);

        const updatedWinner = await Player.findOneAndUpdate(
            { username: winnerUsername },
            { $set: { rating: winnerNewRating }, $inc: { gamesPlayed: 1 } },
            { new: true }
        );

        const updatedLoser = await Player.findOneAndUpdate(
            { username: loserUsername },
            { $set: { rating: loserNewRating }, $inc: { gamesPlayed: 1 } },
            { new: true }
        );

        res.json({
            winner: { username: winnerUsername, newRating: updatedWinner.rating, gamesPlayed: updatedWinner.gamesPlayed },
            loser: { username: loserUsername, newRating: updatedLoser.rating, gamesPlayed: updatedLoser.gamesPlayed }
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to update player stats: " + error.message });
    }
});


// Route to get all generals and ownership status
app.get('/generals', async (req, res) => {
    const username = req.query.username;
    if (!username) {
        return res.status(400).json({ message: "Username is required" });
    }

    try {
        const player = await Player.findOne({ username: username });
        if (!player) {
            return res.status(404).json({ message: "User not found" });
        }

        // Define all available generals in the store
        const allGenerals = [
            { name: 'GW', price: 0 }, 
            { name: 'GH', price: 5 },
            { name: 'GA', price: 5 },
            { name: 'GM', price: 5 },
            { name: 'Barbarian', price: 10 },
            { name: 'Paladin', price: 10 },
            { name: 'Voldemort', price: 15 },
            { name: 'Orc', price: 10 },
            { name: 'Robinhood', price: 15 }
        ];

        // Fetch owned generals for the user
        const ownedGenerals = player.ownedGenerals || [];

        // Ensure GW is included as a default, but don't add it twice if the user already owns it
        if (!ownedGenerals.includes('GW')) {
            ownedGenerals.push('GW');
        }

        // Mark the generals with ownership and avoid duplication
        const generalsWithOwnership = allGenerals.map(general => ({
            name: general.name,
            price: general.price,
            owned: ownedGenerals.includes(general.name)
        }));

        res.json(generalsWithOwnership);
    } catch (error) {
        res.status(500).json({ message: "Error fetching generals" });
    }
});

//game Clock
// Schedule the countdown to reset every 2 hours at specific times
schedule.scheduleJob('00 14 * * *', function() { //6pm server time
    console.log('Job triggered at:', new Date()); // Log the current time when job is triggered
    //countdown = 7200; // reset countdown
    io.emit('countdown', { countdown });
    try {
        // Reset all player ratings to 1200 at 6pm server time
        Player.updateMany(
            { rating: { $gte: 1500 } },  // Condition: rating is 1400 or more          
            { $inc: { rating: -60 } }   // Action: decrement rating by 25
        ).then(result => {
                console.log('Ratings reset for all players:', result);
            })
            .catch(err => {
                console.error('Error resetting player ratings:', err);
            });
            
    } catch (error) {
        console.error('Unexpected error occurred while resetting ratings:', error);
    }

    try {
        // Reset all player ratings to 1200 at 6pm server time
        Player.updateMany(
            { rating: { $gte: 1350 } },  // Condition: rating is 1500 or more          
            { $inc: { rating: -40 } }   // Action: decrement rating by 25
        ).then(result => {
                console.log('Ratings reset for all players:', result);
            })
            .catch(err => {
                console.error('Error resetting player ratings:', err);
            });
            
    } catch (error) {
        console.error('Unexpected error occurred while resetting ratings:', error);
    }
    
    
  });
 // const job = schedule.scheduleJob('05* * * *', function() {
  //  console.log('The answer to life, the universe, and everything!');
 // });
  
  // Decrement the countdown every second and emit the updated time
  setInterval(() => {
    if (countdown > 0) {
      countdown--;
      io.emit('countdown', { countdown });
    }
  }, 1000);  
  


   
  function checkWinCondition(game, player, roomId) {
    const opponent = player === 'P1' ? 'P2' : 'P1';
    let towerAlive = false;
    let unitsAlive = false;
   
    // Check if the opponent still has a tower or any units alive
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const unit = game.board[row][col].unit;
            if (unit.startsWith(opponent)) {
                if (unit.includes('_T')) {
                    towerAlive = true;  // Opponent's tower is still alive
                } else {
                    unitsAlive = true;  // Opponent has other units alive
                }
            }
        }
    }

    // Win condition: Opponent has no tower or no units left
    if (!towerAlive || !unitsAlive) {
        const winnerUsername = game.players[player].username;
        const loserUsername = game.players[opponent].username;

            

        console.log(`Game over! Winner: ${winnerUsername}, Loser: ${loserUsername}`);
        io.to(roomId).emit('gameOver', {
            message: `Player ${player} wins!`,
            winner: winnerUsername,
            loser: loserUsername
        });

      

        return true;  // Game over, return true
    }

    return false;  // No win condition met, return false
}



// Function to check if user is eligible for a new general
// Function to check and unlock generals based on games played
async function checkAndUnlockGeneral(username) {
    try {
        const player = await Player.findOne({ username: username });
        if (!player) {
            return 'Player not found';
        }

        let unlockedGeneral = null;
        const gamesPlayed = player.gamesPlayed;

        // Example unlock conditions based on games played
        if (player.rating >= 1400 && !player.ownedGenerals.includes('GA')) {
            unlockedGeneral = 'GH';  // Unlock General Horse after 10 games
        }
         else if (player.rating >= 1500 && !player.ownedGenerals.includes('GH')) {
            unlockedGeneral = 'GW';  // Unlock General Horse after 10 games
        } 

        // If a new general is unlocked, add it to the player's ownedGenerals
        if (unlockedGeneral) {
            player.ownedGenerals.push(unlockedGeneral);
            await player.save();
            return `Congratulations! You've unlocked ${unlockedGeneral}.`;
        }

        return 'No new general unlocked';

    } catch (error) {
        console.error('Error unlocking generals:', error);
        return 'Error unlocking generals';
    }
}

// Start or reset a game timer
function startTurnTimer(roomId, currentPlayer) {
    if (gameTimers[roomId]) {
        clearTimeout(gameTimers[roomId]); // Clear the existing timer
    }
    gameTimers[roomId] = setTimeout(() => {
        console.log(`Player ${currentPlayer} timed out.`);
        switchTurn(roomId);
        
    }, 30000); // 60 seconds for each turn
     // Emit an event to start the client-side timer
     io.to(roomId).emit('startTimer');
}

let botAccount = {
    username: 'Newacc',
    password: '12345678',
    general: 'GA',
    socketId: 'botSocketId12345'  // Static socket ID for the bot
};
// Switch turns
function switchTurn(roomId) {
    const game = games[roomId];
    if (!game) return;
    game.unitHasAttacked = {};  // Reset attack tracking
    game.unitHasMoved = 0;  // Reset movement tracking
    game.turn = game.turn === 'P1' ? 'P2' : 'P1'; // Toggle turn
    game.actionCount = 0; // Reset action count for new turn
    io.to(roomId).emit('turnSwitched', { newTurn: game.turn });
    io.to(roomId).emit('updateBoard', {
        board: game.board,
        terrain: game.terrain,
        turn: game.turn,
    });
    io.to(roomId).emit('updateTurnCounter', turnCounter);
    startTurnTimer(roomId, game.turn); // Start timer for the new player's turn
    console.log(`Turn switched to ${game.turn}`);
     // If it's the bot's turn, initiate bot logic
     if (game.players[game.turn].username === botAccount.username) {
        botTakeTurn(roomId);
    }

     
}
function botTakeTurn(roomId) {
    const game = games[roomId];
    if (!game) return;

    let actionsPerformed = 0;
    const unitsThatAttacked = new Set(); // Track which units have attacked this turn

    // Function to perform a single action with a delay
    function attemptAction() {
        if (actionsPerformed >= 2) {
            switchTurn(roomId); // End bot's turn after 2 actions
            return;
        }

        // Find all available moves for the bot
        const availableMoves = findAvailableMoves(game, 'P2'); // Bot is player 2

        // Prioritize ranged attacks first
        const rangedAttacks = availableMoves.attacks.filter(move => {
            const from = move.move.from;
            const to = move.move.to;
            const unitPosition = `${from.row},${from.col}`;

            return isValidAttack(game, game.board[from.row][from.col], from.row, from.col, to.row, to.col, unitsThatAttacked) &&
                   (game.board[from.row][from.col].unit.startsWith("P2_A") || game.board[from.row][from.col].unit.startsWith("P2_M") || game.board[from.row][from.col].unit.startsWith("P2_GA")) &&
                   !unitsThatAttacked.has(unitPosition); // Ensure the unit hasn’t attacked yet
        });

        let actionTaken = false;

        if (rangedAttacks.length > 0) {
            // Execute a ranged attack if available
            const randomRangedAttack = rangedAttacks[Math.floor(Math.random() * rangedAttacks.length)];
            const from = randomRangedAttack.move.from;
            const attackSuccess = executeMove(randomRangedAttack, roomId);

            unitsThatAttacked.add(`${from.row},${from.col}`); // Mark this unit as having attacked
            actionsPerformed++; // Count the attack attempt as an action
            actionTaken = true;

            console.log(`Bot attempted a ranged attack from (${randomRangedAttack.move.from.row}, ${randomRangedAttack.move.from.col}) to (${randomRangedAttack.move.to.row}, ${randomRangedAttack.move.to.col})`);
        } else if (availableMoves.attacks.length > 0) {
            // Execute a melee attack if no ranged attacks are available
            const randomMeleeAttack = availableMoves.attacks.find(move => {
                const from = move.move.from;
                const unitPosition = `${from.row},${from.col}`;
                return !unitsThatAttacked.has(unitPosition); // Ensure the unit hasn’t attacked yet
            });

            if (randomMeleeAttack) {
                const from = randomMeleeAttack.move.from;
                const attackSuccess = executeMove(randomMeleeAttack, roomId);

                unitsThatAttacked.add(`${from.row},${from.col}`); // Mark this unit as having attacked
                actionsPerformed++; // Count the attack attempt as an action
                actionTaken = true;

                console.log(`Bot attempted a melee attack from (${randomMeleeAttack.move.from.row}, ${randomMeleeAttack.move.from.col}) to (${randomMeleeAttack.move.to.row}, ${randomMeleeAttack.move.to.col})`);
            }
        } 

        // If no attacks are available, attempt a move
        if (!actionTaken && availableMoves.moves.length > 0) {
            const randomMove = availableMoves.moves[Math.floor(Math.random() * availableMoves.moves.length)];
            console.log(`Bot chose to move from (${randomMove.move.from.row}, ${randomMove.move.from.col}) to (${randomMove.move.to.row}, ${randomMove.move.to.col})`);
            executeMove(randomMove, roomId);
            actionsPerformed++;
        } else if (!actionTaken) {
            console.error('No valid moves available for the bot.');
            switchTurn(roomId); // End turn if no moves are available
            return;
        }

        // Check for win condition after each action
        if (checkWinCondition(game, 'P2', roomId)) {
            io.to(roomId).emit('gameOver', `Bot wins!`);
            return;
        }

        // Schedule the next action attempt if fewer than 2 actions have been performed
        if (actionsPerformed < 2) {
            setTimeout(attemptAction, 2000);
        }
    }

    // Start the first action attempt with an initial delay
    setTimeout(attemptAction, 4000);
}



function executeMove(selectedMove, roomId) {
    const game = games[roomId];
    if (!selectedMove || !selectedMove.move) return;

    const { from, to } = selectedMove.move;
    const moveSuccessful = makeMove(from, to, roomId, botAccount.socketId);

    if (moveSuccessful) {
        console.log(`Bot action from (${from.row}, ${from.col}) to (${to.row}, ${to.col})`);
    } else {
        console.error(`Failed to execute move from (${from.row}, ${from.col}) to (${to.row}, ${to.col})`);
    }
}

function findAvailableMoves(game, player) {
    const moves = { attacks: [], moves: [] };
    const board = game.board;

    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
            const pieceData = board[row][col];
            const piece = pieceData.unit;

            if (!piece || !piece.startsWith(player)) continue;

            const maxMoveDistance = piece.startsWith("P2_H") || piece.startsWith("P2_GH") ? 3 : 1;
            const maxAttackDistance = getMaxAttackRange(piece);

            // Check for valid ranged attacks for Archers, General Archers, and Mages
            if (piece.startsWith("P2_A") || piece.startsWith("P2_GA") || piece.startsWith("P2_M")) {
                for (let toRow = row - maxAttackDistance; toRow <= row + maxAttackDistance; toRow++) {
                    for (let toCol = col - maxAttackDistance; toCol <= col + maxAttackDistance; toCol++) {
                        if (toRow < 0 || toRow >= board.length || toCol < 0 || toCol >= board[0].length || (toRow === row && toCol === col)) continue;

                        const targetPieceData = board[toRow]?.[toCol];
                        if (!targetPieceData) continue;

                        const targetPiece = targetPieceData.unit;

                        if (targetPiece && !targetPiece.startsWith(player) && isValidAttack(game, pieceData, row, col, toRow, toCol)) {
                            moves.attacks.push({ move: { from: { row, col }, to: { row: toRow, col: toCol } } });
                        }
                    }
                }
            }

            // Check for valid melee attacks for all units
            for (let toRow = row - 1; toRow <= row + 1; toRow++) {
                for (let toCol = col - 1; toCol <= col + 1; toCol++) {
                    if (row === toRow && col === toCol) continue;

                    const targetPieceData = board[toRow]?.[toCol];
                    if (!targetPieceData) continue;

                    const targetPiece = targetPieceData.unit;

                    if (targetPiece && !targetPiece.startsWith(player) && isValidAttack(game, pieceData, row, col, toRow, toCol)) {
                        moves.attacks.push({ move: { from: { row, col }, to: { row: toRow, col: toCol } } });
                    }
                }
            }

            // Standard move range for units without any attacks
            for (let toRow = Math.max(0, row - maxMoveDistance); toRow <= Math.min(board.length - 1, row + maxMoveDistance); toRow++) {
                for (let toCol = Math.max(0, col - maxMoveDistance); toCol <= Math.min(board[toRow].length - 1, col + maxMoveDistance); toCol++) {
                    if (row === toRow && col === toCol) continue;

                    const targetPieceData = board[toRow]?.[toCol];
                    if (!targetPieceData) continue;

                    const targetPiece = targetPieceData.unit;

                    // Prevent moves to friendly units
                    if (targetPiece && targetPiece.startsWith(player)) continue;

                    // Enhanced movement logic for Horse pieces
                    if (piece !== "P2_T" && isValidMove(game, pieceData, row, col, toRow, toCol)) {
                        if (piece.startsWith("P2_H") || piece.startsWith("P2_GH")) {
                            // Check moves up to 3 spaces in any direction (straight or diagonal)
                            const rowDiff = Math.abs(toRow - row);
                            const colDiff = Math.abs(toCol - col);

                            if ((rowDiff === 3 && colDiff === 0) ||  // Vertical move up to 3 spaces
                                (colDiff === 3 && rowDiff === 0) ||  // Horizontal move up to 3 spaces
                                (rowDiff === colDiff && rowDiff <= 3)) { // Diagonal move up to 3 spaces
                                moves.moves.push({ move: { from: { row, col }, to: { row: toRow, col: toCol } } });
                            }
                        } else {
                            // Standard movement for non-Horse units
                            moves.moves.push({ move: { from: { row, col }, to: { row: toRow, col: toCol } } });
                        }
                    }
                }
            }
        }
    }
    return moves;
}



// Define maximum attack range for each piece type
function getMaxAttackRange(piece) {
    if (piece.startsWith("P1_A") || piece.startsWith("P2_A") ) {
        return 3; // Archer range
    } if (piece.startsWith("P1_GA") || piece.startsWith("P2_GA")) {
        return 4; // Archer range
    }
    if (piece.startsWith("P1_M") || piece.startsWith("P2_M")) {
        return 2; // Mage range
    }
    return 1; // Default range for other pieces
}

function isValidMove(game, pieceData, fromRow, fromCol, toRow, toCol) {
    const board = game.board;

    if (!pieceData || typeof pieceData.unit !== 'string') {
        console.error('Invalid pieceData:', pieceData);
        return false;
    }

    const piece = pieceData.unit;
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    // Check that destination is within bounds
    if (toRow < 0 || toRow >= board.length || toCol < 0 || toCol >= board[0].length) {
        console.log(`Out of bounds move attempt from (${fromRow}, ${fromCol}) to (${toRow}, ${toCol})`);
        return false;
    }

    // Prevent moving onto water
    if (board[toRow][toCol].terrain === 'water') {
        console.log(`Cannot move onto water at (${toRow}, ${toCol})`);
        return false;
    }

    // Prevent moving onto friendly units
    const targetPiece = board[toRow][toCol].unit;
    if (targetPiece && targetPiece.startsWith(piece.substring(0, 3))) {
        console.log(`Cannot move onto friendly unit at (${toRow}, ${toCol})`);
        return false;
    }

    // Movement logic for Horses (up to 3 spaces)
    if (piece.startsWith("P1_H") || piece.startsWith("P2_H") || piece.startsWith("P1_GH") || piece.startsWith("P2_GH")) {
        const valid = (rowDiff <= 3 && colDiff === 0) ||  // Vertical up to 3 spaces
                      (colDiff <= 3 && rowDiff === 0) ||  // Horizontal up to 3 spaces
                      (rowDiff === colDiff && rowDiff <= 3); // Diagonal up to 3 spaces
        console.log(`Horse move from (${fromRow}, ${fromCol}) to (${toRow}, ${toCol}): ${valid ? 'Valid' : 'Invalid'}`);
        return valid;
    }

    // Default movement for other units (1 space in any direction)
    const valid = rowDiff <= 1 && colDiff <= 1;
    console.log(`Move from (${fromRow}, ${fromCol}) to (${toRow}, ${toCol}): ${valid ? 'Valid' : 'Invalid'}`);
    return valid;
}



// Refine attack validation based on unit type and range
function isValidAttack(game, pieceData, fromRow, fromCol, toRow, toCol, unitsThatAttacked = new Set()) {
    const board = game.board;

    if (toRow < 0 || toRow >= board.length || toCol < 0 || toCol >= board[0].length) return false;
    if (!pieceData || typeof pieceData.unit !== 'string') return false;

    const piece = pieceData.unit;
    const targetPiece = board[toRow][toCol]?.unit;
    const unitPosition = `${fromRow},${fromCol}`;

      // Check if this unit has already attacked
      if (unitsThatAttacked.has(unitPosition)) return false; // Prevent the unit from attacking again

    if (targetPiece && targetPiece.startsWith(piece.substring(0, 3))) return false; // No friendly fire

    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    if (piece.startsWith("P1_A") || piece.startsWith("P2_A") ) {
        // Archers attack in a cross pattern, up to 3 spaces
        return (rowDiff === 0 && colDiff <= 3) || (colDiff === 0 && rowDiff <= 3);
    } 
    if (piece.startsWith("P1_GA") || piece.startsWith("P2_GA")) {
        // Archers attack in a cross pattern, up to 3 spaces
        return (rowDiff === 0 && colDiff <= 4) || (colDiff === 0 && rowDiff <= 4);
    }
    if (piece.startsWith("P1_M") || piece.startsWith("P2_M")) {
        // Mages can attack within a 2x2 area in orthogonal directions only
        return (rowDiff <= 2 && colDiff === 0) || (colDiff <= 2 && rowDiff === 0);
    }
    if (piece.startsWith("P1_W") || piece.startsWith("P2_W") || piece.startsWith("P1_Barbarian") || piece.startsWith("P2_GW")) {
        // Warriors and General Warriors can attack adjacent squares
        return rowDiff <= 1 && colDiff <= 1;
    } 
    if (piece.startsWith("P1_H") || piece.startsWith("P2_T") || piece.startsWith("P2_H") || piece.startsWith("P1_GH") || piece.startsWith("P2_GH")) {
        // Horses can attack adjacent squares
        return rowDiff <= 1 && colDiff <= 1;
    }

    return false; // Default no attack
}


function makeMove(from, to, roomId, playerId) {
    const game = games[roomId];
    if (!game) {
        console.error(`Game not found for roomId: ${roomId}`);
        return false;
    }

    const board = game.board;
    const attackingPiece = board[from.row][from.col].unit;
    const targetPiece = board[to.row][to.col].unit;

    if (!attackingPiece) {
        console.log(`No piece found at source (${from.row}, ${from.col})`);
        return false;
    }

    const fromTerrain = board[from.row][from.col].terrain;
    const isAttack = isValidAttack(game, board[from.row][from.col], from.row, from.col, to.row, to.col);

    if (isAttack && targetPiece) {
        // Avoidance logic (skip for towers or if bot is attacking from red terrain)
        let hitChance = 1.0;
        if (!attackingPiece.startsWith("P2_M") && !targetPiece.startsWith('P2_T') && fromTerrain !== 'red') {
            if (targetPiece.startsWith('P1_H') || targetPiece.startsWith('P2_H')) {
                hitChance = 0.7; // Horse avoidance
            } else if (targetPiece.startsWith('P1_W') || targetPiece.startsWith('P2_W')) {
                hitChance = 0.6; // Warrior avoidance
            } else if (targetPiece.startsWith('P1_A') || targetPiece.startsWith('P2_A')) {
                hitChance = 0.8; // Archer avoidance
            }else if (targetPiece.startsWith('P1_GW') || targetPiece.startsWith('P2_GW')) {
                hitChance = 0.35;  // General Warrior has a 20% chance to avoid
            } else if (targetPiece.startsWith('P1_GH') || targetPiece.startsWith('P2_GH')) {
                hitChance = 0.4;  // General Horse has a 70% chance to avoid against normal units
            } else if (targetPiece.startsWith('P1_GA') || targetPiece.startsWith('P2_GA')) {
                hitChance = 0.6;  // General Archer has a 50% chance to avoid
            }else if (targetPiece.startsWith('P1_Robinhood') || targetPiece.startsWith('P2_Robinhood')) {
                hitChance = 0.5;  // General Archer Robinhood has a 60% chance to avoid
            }
             else if (targetPiece.startsWith('P1_Barbarian') || targetPiece.startsWith('P2_Barbarian')) {
                hitChance = 0.3;  // General barbarian 70% chance to avoid
            }else if (targetPiece.startsWith('P1_Paladin') || targetPiece.startsWith('P2_Paladin')) {
                hitChance = 0.35;  // General barbarian 70% chance to avoid
            } else if (targetPiece.startsWith('P1_Orc') || targetPiece.startsWith('P2_Orc')) {
                hitChance = 0.3;  // General Orc 70% chance to avoid
            }
            if (attackingPiece === 'P1_T' || attackingPiece === 'P2_T') {
                const attackingTower = game.board[from.row][from.col];
            
                if (attackingTower.hp > 1) {
                    attackingTower.hp -= 0;  // Reduce tower HP by 1 on attack
                    console.log(`${attackingPiece} tower now has ${attackingTower.hp} HP after attacking.`);
                }

            }
            // Random chance to hit or miss
            if (Math.random() > hitChance) {
                console.log(`Attack missed! ${targetPiece} avoided the hit.`);
                io.to(roomId).emit('attackMiss', { targetPosition: to, message: `${targetPiece} avoided the attack!` });
                
                // Count this as an action even though it missed
                game.actionCount++;
                if (game.actionCount >= 2) {
                    switchTurn(roomId); // End the bot's turn after performing 2 actions
                }
                return true; // End function here if attack missed
            }
        }

        // If attack succeeds or avoidance is bypassed
        console.log(`Bot is attacking from (${from.row},${from.col}) to (${to.row},${to.col})`);

        if (targetPiece === "P1_T") {
            const tower = board[to.row][to.col];
            tower.hp = tower.hp ? tower.hp - 7 : 26;  // Initialize if not already set, then reduce HP
            console.log(`Player 1's tower at (${to.row}, ${to.col}) now has ${tower.hp} HP.`);

            if (tower.hp <= 0) {
                board[to.row][to.col].unit = 'towerdestroyed';
                io.to(roomId).emit('gameOver', 'Player 2 wins!');
            }
        } else {
            console.log(`Bot is moving from (${from.row},${from.col}) to (${to.row},${to.col})`);
            board[to.row][to.col].unit = attackingPiece;
            io.to(roomId).emit('botAttackHit');
            board[to.row][to.col].unit = 'explosion';  // replace defender img
            setTimeout(() => {
                board[to.row][to.col].unit = '';  // Clear target piece after successful attack
            }, 3000); // 3 seconds for the hit animation
            
        }
    } else {
        // Handle movement if it's not an attack
        console.log(`Bot is moving from (${from.row},${from.col}) to (${to.row},${to.col})`);
        board[to.row][to.col].unit = attackingPiece;
        board[from.row][from.col].unit = '';
    }

    // Emit board update after move or attack
    io.to(roomId).emit('updateBoard', { board: game.board });

    // Increment action count and end turn if necessary
    game.actionCount++;
    if (game.actionCount >= 2) {
        switchTurn(roomId); // End the bot's turn after performing 2 actions
    }
    return true;
}


// Helper function to randomly place terrain on a row
function placeRandomTerrain(board, row, type, count) {
    const availableCols = [...Array(BOARD_SIZE).keys()]; // Columns 0 to 7
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * availableCols.length);
        const col = availableCols.splice(randomIndex, 1)[0]; // Remove the chosen column from the pool
        board[row][col].terrain = type; // Assign the terrain type (water/red)
    }
}

function createGameBoard() {
    const board = Array(BOARD_SIZE).fill(null).map(() =>
        Array(BOARD_SIZE).fill(null).map(() => ({ terrain: 'normal', unit: '' })) // Separate terrain and unit
    );

   // Place Player 1's Warrior (W) units (6 pawns instead of 8)
    for (let i = 1; i <= 6; i++) {  // Place pawns from column 1 to 6
    board[1][i].unit = 'P1_W';  // Player 1 Warriors
    }

// Place Player 2's Warrior (W) units (6 pawns instead of 8)
    for (let i = 1; i <= 6; i++) {  // Place pawns from column 1 to 6
    board[6][i].unit = 'P2_W';  // Player 2 Warriors
    }


    // Add Player 1 and Player 2's Horse (H) units
    board[0][2].unit = 'P1_H';
    board[0][5].unit = 'P1_H';
    board[7][2].unit = 'P2_H';
    board[7][5].unit = 'P2_H';

    // Add Player 1 and Player 2's Archer (A) units
    board[0][4].unit = 'P1_M';
    board[7][3].unit = 'P2_M';
    board[0][0].unit = 'P1_A';
    board[7][0].unit = 'P2_A';
    board[0][7].unit = 'P1_A';
    board[7][7].unit = 'P2_A';
    // Add Towers for Player 1 and Player 2
    board[3][0] = { terrain: 'normal', unit: 'P1_T', hp: 26 };  // Player 1 Tower
    board[4][7] = { terrain: 'normal', unit: 'P2_T', hp: 28 };  // Player 2 Tower

    // Randomly place water and red terrain on rows 2-5
    for (let row = 2; row <= 5; row++) {
        const waterCount = Math.floor(Math.random() * 3) + 1;  // Random 1-3 water tiles
        const redCount = Math.floor(Math.random() * 2);  // Random 0-4 red tiles

        placeRandomTerrain(board, row, 'water', waterCount);
        placeRandomTerrain(board, row, 'red', redCount);
    }

    return board;
}


async function updateGameResult(winnerUsername, loserUsername) {
    try {
        const winner = await Player.findOne({ username: winnerUsername });
        const loser = await Player.findOne({ username: loserUsername });

        if (!winner || !loser) {
            throw new Error("Player not found");
        }

        let ratingChange = 0;
        const ratingDifference = winner.rating - loser.rating;

        if (ratingDifference >= 50) {
            ratingChange = 0; // No points gained for the winner
        }else if (ratingDifference >= 20) {
            ratingChange = 0; // Minimal points gained for the winner
        }  else if (ratingDifference >= 15) {
            ratingChange = 5; // Minimal points gained for the winner
        } else if (ratingDifference < 0) {
            ratingChange = 10; // Big gain for the winner when beating a higher-rated player
        } else {
            ratingChange = 15; // Moderate gain when players are closely rated
        }

        // Apply rating changes
        winner.rating += ratingChange;
        loser.rating -= ratingChange; // Assuming losers always lose the same as winners gain

        // Ensure ratings do not fall below a minimum, for example, 1000
        loser.rating = Math.max(1000, loser.rating);

        // Increment games played
        winner.gamesPlayed += 1;
        loser.gamesPlayed += 1;

        // Save changes
        await winner.save();
        await loser.save();
        
        console.log('Updated game results with adjusted rating logic.');
    } catch (error) {
        console.error('Failed to update game results:', error);
    }
}


async function updateBotGameResult(playerUsername, botWins) {
    console.log(`updateBotGameResult called for ${playerUsername}, botWins: ${botWins}`);
    try {
        const player = await Player.findOne({ username: playerUsername });
        console.log("Player found:", player);
        if (!player) {
            throw new Error("Player not found");
        }

        let ratingChange = botWins ? -15 : 5;

        // Update the player's rating based on the result
        player.rating += ratingChange;

        // Ensure the player’s rating does not fall below the minimum rating, e.g., 1000
        player.rating = Math.max(1000, player.rating);

        // Increment games played for the player
        player.gamesPlayed += 1;

        // Save changes
        await player.save();

        console.log(`Game result updated for player vs bot. ${botWins ? 'Bot wins' : 'Player wins'}.`);
    } catch (error) {
        console.error('Failed to update game results for player vs bot:', error);
    }
}


function logout() {
    // Clear the username and other data from localStorage
    localStorage.removeItem('username');
    
    // Hide user information and show the login form again
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('userInfo').style.display = 'none';
    
    alert('You have logged out successfully.');
    delete activePlayers[socket.id];  // Remove player from active list
    console.log(`Player logged out, total active players: ${Object.keys(activePlayers).length}`);
}


let activePlayers = {};
io.on('connection',(socket) => {
    console.log('A player connected:', socket.id);
    socket.emit('countdown', { countdown });
    activePlayers[socket.id] = socket.id;  // Add player to active list
    console.log(`Player ${socket.id} logged in, total active players: ${Object.keys(activePlayers).length}`);


 // Server-side (Node.js)
// Handling emoji selection within a game room
socket.on('emojiSelected', function(data) {
    console.log('Emoji selected:', data);
    // This ensures that the emoji is only sent to players in the same room
    socket.to(data.roomId).emit('receiveEmoji', {
        emoji: data.emoji,
        player: socket.id  // or any identifier you use for the player
    });
});
    socket.on('leaveGame', ({ roomId, playerNumber }) => {
        const game = games[roomId];
        if (game) {
            const winner = playerNumber === 'P1' ? 'P2' : 'P1';
            const loser = playerNumber;

           
    
            // Emit gameOver to both players
            io.to(roomId).emit('gameOver', {
                message: `Player ${loser} left the game. Player ${winner} wins!`,
                winner: game.players[winner].username,
                loser: game.players[loser].username
            });
    
            // Perform the updateGameResult afterward
                        // Check if the loser is the bot
                if (game.players[loser].username === botAccount.username) {
                    // Call a separate update function for bot loss
                    updateBotGameResult(game.players[winner].username)
                        .then(() => {
                            console.log('Bot loss handled successfully');
                            // Optionally remove the game after updating results
                            delete games[roomId];
                        })
                        .catch((error) => {
                            console.error('Failed to handle bot loss:', error);
                        });
                } else {
                    // Regular updateGameResult for player loss
                    updateGameResult(game.players[winner].username, game.players[loser].username)
                        .then(() => {
                            console.log('Game result updated successfully');
                            // Optionally remove the game after updating results
                            delete games[roomId];
                        })
                        .catch((error) => {
                            console.error('Failed to update game results:', error);
                        });
                }



        }
    });
    
    
    
    let isBotInQueue = false;
    let isBotInGame = false;
    let botLastQueuedTime = 0; // Timestamp of the bot's last queue entry
    
    const BOT_QUEUE_COOLDOWN = 300000; // 5 minutes in milliseconds
    
 
    function joinGameWithPlayer(socket, data) {
        console.log("Received data for joinGame:", data);
        if (!data || !data.general || !data.username) {
            console.error('Invalid or no data received for general or username');
            socket.emit('error', { message: 'Invalid or no data received for general or username.' });
            return;
        }
    
        const { username, general } = data;
        if (!username) {
            socket.emit('error', { message: "You must be logged in to join the game." });
            return;
        }
    
        const playerGame = Object.values(games).find(game => Object.keys(game.players).some(pid => game.players[pid].socketId === socket.id));
        if (playerGame) {
            console.log(`Player ${socket.id} is already in a game.`);
            socket.emit('error', 'You are already in a game.');
            return;
        }
    
        const isQueued = matchmakingQueue.some(player => player.username === username);
        if (isQueued) {
            console.log(`Player ${socket.id} is already in the matchmaking queue.`);
            socket.emit('error', 'You are already waiting for a match.');
            return;
        }
    
        const isInGame = Object.values(games).some(game => {
            return Object.values(game.players).some(player => player.username === username);
        });
    
        if (isInGame) {
            socket.emit('error', { message: 'You are already in a game' });
            return;
        }
    
        if (matchmakingQueue.length > 0) {
            const opponentData = matchmakingQueue.shift();
            const opponent = opponentData.socket;
    
            if (opponent && opponent.connected) {
                const roomId = `${socket.id}-${opponent.id}`;
                games[roomId] = {
                    players: {
                        'P1': { socketId: socket.id, username: data.username },
                        'P2': { socketId: opponent.id, username: opponentData.username }
                    },
                    board: createGameBoard(),
                    turn: 'P1',
                    actionCount: 0,
                    generals: {
                        [socket.id]: data.general,
                        [opponent.id]: opponentData.general
                    },
                    unitHasAttacked: {},
                    unitHasMoved: {}
                };
                console.log(`Game initialized with players:`, games[roomId].players);
                turnCounter = 0;
                io.to(roomId).emit('updateTurnCounter', turnCounter);
                games[roomId].board[0][3].unit = `P1_${data.general}`;
                games[roomId].board[7][4].unit = `P2_${opponentData.general}`;
                socket.join(roomId);
                opponent.join(roomId);
    
                socket.emit('gameStart', {
                    roomId,
                    board: games[roomId].board,
                    playerNumber: 'P1',
                    opponentNumber: 'P2',
                    playerName: games[roomId].players.P1.username,
                    opponentName: games[roomId].players.P2.username
                });
                opponent.emit('gameStart', {
                    roomId,
                    board: games[roomId].board,
                    playerNumber: 'P2',
                    opponentNumber: 'P1',
                    playerName: games[roomId].players.P2.username,
                    opponentName: games[roomId].players.P1.username
                });
            } else {
                console.error('Matchmaking error: Invalid or disconnected opponent.');
                matchmakingQueue.push({ socket: socket, username: data.username, general: data.general });
                socket.emit('waitingForOpponent', { status: 'Waiting for an opponent...' });
            }
        } else {
            matchmakingQueue.push({ socket: socket, username: data.username, general: data.general });
            socket.emit('waitingForOpponent', { status: 'Waiting for an opponent...' });
            console.log(`Player ${socket.id} added to matchmaking queue with general ${data.general}`);
    
            // Start a timeout to join a game with bot if no match is found in 40 seconds
            setTimeout(() => {
                const isStillQueued = matchmakingQueue.some(player => player.socket.id === socket.id);
                if (isStillQueued) {
                    matchmakingQueue = matchmakingQueue.filter(player => player.socket.id !== socket.id); // Remove player from queue
                    joinGameWithBot(socket, data); // Call function to join with bot
                }
            }, 40000); // 40 seconds timeout
        }
    }
    


    
        
    function joinGameWithBot(socket, data) {
        
        console.log("Received data for joinGame:", data);
        if (!data || !data.general || !data.username) {
            console.error('Invalid or no data received for general or username');
            socket.emit('error', { message: 'Invalid or no data received for general or username.' });
            return;
        }
    
        const { username, general } = data;
    
        if (!username) {
            socket.emit('error', { message: "You must be logged in to join the game." });
            return;
        }
    
        const playerGame = Object.values(games).find(game => 
            Object.keys(game.players).some(pid => game.players[pid].socketId === socket.id)
        );
    
        if (playerGame) {
            console.log(`Player ${socket.id} is already in a game.`);
            socket.emit('error', 'You are already in a game.');
            return;
        }
    
        const isQueued = matchmakingQueue.some(player => player.username === username);
        if (isQueued) {
            console.log(`Player ${socket.id} is already in the matchmaking queue.`);
            socket.emit('error', 'You are already waiting for a match.');
            return;
        }
    
        const isInGame = Object.values(games).some(game => 
            Object.values(game.players).some(player => player.username === username)
        );
    
        if (isInGame) {
            socket.emit('error', { message: 'You are already in a game' });
            return;
        }
    
        const currentTime = Date.now();
    
        // Add the bot only if no players are waiting, it's not in the queue or game, and cooldown has passed
        if (matchmakingQueue.length === 0 && username !== botAccount.username && !isBotInQueue && !isBotInGame && (currentTime - botLastQueuedTime >= BOT_QUEUE_COOLDOWN)) {
            matchmakingQueue.push({ socket: botAccount.socketId, username: botAccount.username, general: botAccount.general });
            isBotInQueue = true; // Mark the bot as in the queue
            botLastQueuedTime = currentTime; // Update the last queued time for the bot
        }
    
        // Matchmaking process
        if (matchmakingQueue.length > 0) {
            const opponentData = matchmakingQueue.shift();
            const opponentSocketId = opponentData.socket;
    
            const isBot = opponentSocketId === botAccount.socketId;
    
            // Check if the real player is still connected
            if (!isBot && (!opponentSocketId || !opponentSocketId.connected)) {
                console.error('Matchmaking error: Invalid or disconnected opponent.');
                matchmakingQueue.push({ socket: socket, username, general });
                socket.emit('waitingForOpponent', { status: 'Waiting for an opponent...' });
                return;
            }
    
            const roomId = `${socket.id}-${opponentSocketId}`;
            games[roomId] = {
                players: {
                    'P1': { socketId: socket.id, username },
                    'P2': { socketId: opponentSocketId, username: opponentData.username }
                },
                board: createGameBoard(),
                turn: 'P1',
                actionCount: 0,
                generals: {
                    [socket.id]: general,
                    [opponentSocketId]: opponentData.general
                },
                unitHasAttacked: {},
                unitHasMoved: {}
            };
    
            console.log(`Game initialized with players:`, games[roomId].players);
            turnCounter = 0;
            io.to(roomId).emit('updateTurnCounter', turnCounter);
    
            games[roomId].board[0][3].unit = `P1_${general}`;
            games[roomId].board[7][4].unit = `P2_${opponentData.general}`;
    
            socket.join(roomId);
            if (!isBot) opponentSocketId.join(roomId);
    
            socket.emit('gameStart', {
                roomId,
                board: games[roomId].board,
                playerNumber: 'P1',
                opponentNumber: 'P2',
                playerName: games[roomId].players.P1.username,
                opponentName: games[roomId].players.P2.username
            });
    
            if (!isBot) {
                opponentSocketId.emit('gameStart', {
                    roomId,
                    board: games[roomId].board,
                    playerNumber: 'P2',
                    opponentNumber: 'P1',
                    playerName: games[roomId].players.P2.username,
                    opponentName: games[roomId].players.P1.username
                });
            }
    
            // Bot-specific settings
            if (isBot) {
                isBotInQueue = false;  // Remove the bot from the queue
                isBotInGame = true;    // Mark the bot as currently in a game
    
                setTimeout(() => {
                    if (games[roomId].turn === "P2") botTakeTurn(roomId);
                }, 1000);
    
                games[roomId].onEnd = () => {
                    isBotInGame = false;
                };
            }
    
            startTurnTimer(roomId, games[roomId].turn);
        } else {
            matchmakingQueue.push({ socket: socket, username, general });
            socket.emit('waitingForOpponent', { status: 'Waiting for an opponent...' });
            console.log(`Player ${socket.id} added to matchmaking queue with general ${general}`);
        }
    }


    socket.on('joinGame', (data) => {
        const totalPlayers = Object.keys(activePlayers).length;

        if (totalPlayers >= 2) {
            // If there are two or more active players, match with another player
            console.log("Using player vs player matchmaking...");
            joinGameWithPlayer(socket, data);
        } else {
            // Otherwise, fall back to matching with the bot
            console.log("Using player vs bot matchmaking...");
            joinGameWithBot(socket, data);
        }
        
    }); 


    

    socket.on('saveGameState', (gameState) => {
        const game = games[gameState.roomId];
        game.board = gameState.board;
        game.turn = gameState.turn;
        game.actionCount = gameState.actionCount;
        game.unitHasAttacked = gameState.unitHasAttacked;
        game.playerNumber = gameState.playerNumber;
    });

    socket.on('getGameState', (roomId) => {
        const game = games[roomId];
        if (game) {
            // Send the current game state back to the client
            socket.emit('gameState', {
                board: game.board,
                turn: game.turn,
                playerNumber: game.players.includes(socket.id) ? 'P1' : 'P2', // Assign the player number
                actionCount: game.actionCount,
                unitHasAttacked: game.unitHasAttacked
            });
        }
    });

    let RobinhoodAttaackCounts = {};
    socket.on('makeMove', (moveData) => {
        let game = games[moveData.roomId];
        if (!game) {
            console.log("Game not found or may have ended:", moveData.roomId);
            socket.emit('error', 'Game not found or may have ended.');
            return;
        }
    
        if (game.turn !== moveData.player) {
            socket.emit('notYourTurn');
            return;
        }
    
        const { from, to } = moveData.move;
        const attackingPiece = game.board[from.row][from.col].unit;
        const targetPiece = game.board[to.row][to.col].unit;
        const fromTerrain = game.board[from.row][from.col].terrain;
        const destination = game.board[to.row][to.col].terrain;
    
        // Prevent movement onto water terrain
        if (destination === 'water' && !targetPiece.startsWith('P1_T') && !targetPiece.startsWith('P2_T')) {
            socket.emit('invalidAction', 'You cannot move onto water terrain.');
            return;
        }
    
        const attackingUnit = `${from.row},${from.col}`;
    
        // Check if the unit already attacked this turn but allow movement after attack
        if (game.unitHasAttacked[attackingUnit] && targetPiece) {
            socket.emit('invalidAction', 'This unit has already attacked this turn.');
            return;
        }
    
        // Check if the unit has already moved twice
        if (game.unitHasMoved[attackingUnit] >= 2 && !targetPiece) {
            socket.emit('invalidAction', 'This unit has already moved twice this turn.');
            return;
        }
    
        // Prevent players from attacking their own towers
        if ((targetPiece === 'P1_T' && game.turn === 'P1') || (targetPiece === 'P2_T' && game.turn === 'P2')) {
            socket.emit('invalidAction', 'You cannot attack your own tower!');
            return;
        }
        

        async function updatePlayerRating(username) {
            try {
                const player = await Player.findOne({ username });
                
                if (player) {
                    // Add 5 points to the player's rating
                    player.rating += 20;
        
                    // Ensure the rating does not exceed the maximum, e.g., 1500
                    player.rating = Math.min(player.rating, 1500);
        
                    // Save the updated rating to the database
                    await player.save();
                    console.log(`Player ${username}'s rating increased by 5.`);
                } else {
                    console.error(`Player ${username} not found for rating update.`);
                }
            } catch (error) {
                console.error(`Error updating rating for player ${username}:`, error);
            }
        }
        
  

        // Helper function to calculate damage based on unit type
        function getUnitDamage(unit) {
            if (unit.startsWith('P1_W') || unit.startsWith('P2_W')) {
                return 2;  // Warrior deals 2 damage
            } else if (unit.startsWith('P1_H') || unit.startsWith('P2_H')) {
                return 2;  // Horse deals 2 damage
            } else if (unit.startsWith('P1_M') || unit.startsWith('P2_M')) {
                return 3;  // Mage deals 3 damage
            } else if (unit.startsWith('P1_A') || unit.startsWith('P2_A')) {
                return 1;  // Archer deals 1 damage
            } else if (unit.startsWith('P1_GW') || unit.startsWith('P2_GW')) {
                return 3;  // General Warrior deals 3 damage
            } else if (unit.startsWith('P1_GH') || unit.startsWith('P2_GH')) {
                return 3;  // General Warrior deals 3 damage
            } else if (unit.startsWith('P1_GA') || unit.startsWith('P2_GA')) {
                return 2;  // General Warrior deals 3 damage
            } else if (unit.startsWith('P1_Robinhood') || unit.startsWith('P2_Robinhood')) {
                return 2;  // Robinhood deals 2 damage
            }
            else if (unit.startsWith('P1_GM') || unit.startsWith('P2_GM')) {
                return 4;  // General Warrior deals 3 damage
            } else if (unit.startsWith('P1_Barbarian') || unit.startsWith('P2_Barbarian')) {
                return 3;  // General Barbarian deals 3 damage
            }else if (unit.startsWith('P1_Paladin') || unit.startsWith('P2_Paladin')) {
                return 3;  // General Paladin deals 3 damage
            }else if (unit.startsWith('P1_Orc') || unit.startsWith('P2_Orc')) {
                return 4;  // General Paladin deals 3 damage
            }else if (unit.startsWith('P1_Voldemort') || unit.startsWith('P2_Voldemort')) {
                return 4;  // GeneralVoldemort deals 4 damage
            }
            return 0;  // Default no damage for unrecognized units
        }
    
        // Handle attacks
        if (targetPiece) {
            console.log(`Player ${moveData.player} attacking ${targetPiece} at (${to.row}, ${to.col})`);
    
            let isTower = false;
            let hitChance = 1.0;
            let damage = getUnitDamage(attackingPiece);  // Get damage based on unit type
    
            // Check if the target is a tower
            if (targetPiece === 'P1_T' || targetPiece === 'P2_T') {
                isTower = true;
            }
    
            // Deal damage to towers
            if (isTower) {
                const tower = game.board[to.row][to.col];
    
                if (!tower.hp) {
                    tower.hp = 28;  // Initialize tower HP if not already set
                }
    
                tower.hp -= damage;  // Apply damage to tower
    
                console.log(`Tower at (${to.row}, ${to.col}) now has ${tower.hp} HP after taking ${damage} damage.`);
                let winnerUsername = game.players['P1'].username; // Example path, adjust according to your structure
                let loserUsername = game.players['P2'].username;
                console.log(loserUsername)
                if (tower.hp <= 0) {
                    console.log(`Tower ${targetPiece} is destroyed!`);
                    game.board[to.row][to.col].unit = 'towerdestroyed';  // Remove the tower from the board
                    
                    // Determine winner and loser based on current player's turn
                    // Suppose you determine the winner and loser based on some game logic
                        // Suppose you determine the winner and loser based on some game logic
                        let winnerUsername = game.turn === 'P1' ? game.players['P1'].username : game.players['P2'].username;
                        let loserUsername = game.turn === 'P1' ? game.players['P2'].username : game.players['P1'].username;
                          // Check if this is a bot game and if P1 is the winner
                            const isBotGame = game.players['P2'].username === botAccount.username;
                            if (isBotGame && game.turn === 'P1') {
                                console.log("Bot game detected, awarding rating bonus to P1 for victory.");
                                updatePlayerRating(winnerUsername);  // Increase rating for Player 1
                            }

                        console.log(loserUsername)
                        if (!winnerUsername || !loserUsername) {
                            console.error('Winner or loser username is undefined');
                            io.to(moveData.roomId).emit('error', { message: 'Game result cannot be updated due to missing data.' });
                        } else {
                            io.to(moveData.roomId).emit('gameOver', { message: `Player ${winnerUsername} wins!`, winner: winnerUsername,
                                loser: loserUsername });
                       
                        }
                     } else {
                    io.to(moveData.roomId).emit('towerDamaged', `Tower ${targetPiece} is damaged! Remaining HP: ${tower.hp}`);
                }
                
            } else {
                 // Special avoidance for General Horse when attacked by an Archer
               

               // Mage always hits (no avoidance)
               if (attackingPiece.startsWith('P1_M') || attackingPiece.startsWith('P2_M') || attackingPiece.startsWith('P1_GM') || attackingPiece.startsWith('P2_GM')
                || attackingPiece.startsWith('P1_Voldemort') || attackingPiece.startsWith('P2_Voldemort')) {
                        if (targetPiece.startsWith('P1_Orc') || targetPiece.startsWith('P2_Orc')) {
                            hitChance = 0.00;  // General Orc avoids Mages attacks 100% of the time
                        }
                        else{
                        hitChance = 1.0;  // Mages always hit (no avoidance)
                        }

                         //Darkmage converts after it dies
                if(targetPiece.startsWith('P1_Voldemort') || targetPiece.startsWith('P2_Voldemort')) {
                    console.log(`Mage ${targetPiece} defeated by ${attackingPiece}`);
                
                    // Get the team prefix from the attacking unit
                    let teamPrefix = attackingPiece.substring(0, 3); // This gets "P1_" or "P2_"
                
                    // Determine the new team prefix based on the current one
                    let newTeamPrefix = (teamPrefix === 'P1_') ? 'P2_' : 'P1_';
                
                    // Change the team of the attacking unit
                    let newUnit = newTeamPrefix + attackingPiece.substring(3); // Changes "P1_H" to "P2_H" or vice versa
                
                                        // Update the attacking unit on the board
                        if(newUnit.startsWith('P1_T') || newUnit.startsWith('P2_T')) {
                            console.log("this is a tower cant be converted")
                        } 
                        else{              
                        game.board[from.row][from.col].unit = newUnit;
                       console.log(`Converted ${attackingPiece} to ${newUnit}`);
                       io.to(moveData.roomId).emit('unitConvert', `This! ${attackingPiece} is now your enemy.`);    }              
                    
                    }

                        //To heal the tower
                if (attackingPiece.startsWith('P1_GM') || attackingPiece.startsWith('P2_GM')) {
                    // Determine which player is attacking and get the corresponding tower position
                    let towerPosition = attackingPiece.startsWith('P1_GM') ? { row: 3, col: 0 } : { row: 4, col: 7 };
                    let tower = game.board[towerPosition.row][towerPosition.col];
                
                    // Log the state of the tower before attempting to heal
                    console.log(`Tower at (${towerPosition.row}, ${towerPosition.col}):`, tower);
                
                    // Check that the tower exists, is a tower, and has HP that can be healed
                    if (tower && (tower.unit === 'P1_T' || tower.unit === 'P2_T') && typeof tower.hp === 'number') {
                        tower.hp += 4;  // Heal the tower by 2 HP
                        console.log(`Healed tower at (${towerPosition.row}, ${towerPosition.col}) to ${tower.hp} HP`);
                
                        // Emit an update to all clients with the new game state
                        io.to(moveData.roomId).emit('updateBoard', {
                            board: game.board,
                            turn: game.turn,
                            message: `Tower healed for 4 HP by General Mage at (${towerPosition.row}, ${towerPosition.col}). New HP: ${tower.hp}`
                        });
                    } else {
                        console.log(`No valid tower to heal at (${towerPosition.row}, ${towerPosition.col})`);
                    }
                }
                
                
            } else if (attackingPiece.startsWith('P1_A') || attackingPiece.startsWith('P2_A')) {
                // Specific avoidance logic for Archers attacking General Horse (GH)
                if (targetPiece.startsWith('P1_GH') || targetPiece.startsWith('P2_GH')) {
                    hitChance = 0.00;  // General Horse avoids Archer attacks 100% of the time
                    
                } else {
                    // Regular avoidance logic for Archers hitting other units
                    if (targetPiece.startsWith('P1_H') || targetPiece.startsWith('P2_H')) {
                        hitChance = 0.7;  // Horse has a 50% chance to avoid
                    } else if (targetPiece.startsWith('P1_W') || targetPiece.startsWith('P2_W')) {
                        hitChance = 0.5;  // Warrior has a 60% chance to avoid
                    } else if (targetPiece.startsWith('P1_A') || targetPiece.startsWith('P2_A')) {
                        hitChance = 0.8;  // Archers have a 25% chance to avoid
                    } else if (targetPiece.startsWith('P1_GW') || targetPiece.startsWith('P2_GW')) {
                        hitChance = 0.2;  // General Warrior has a 20% chance to avoid
                    } else if (targetPiece.startsWith('P1_GA') || targetPiece.startsWith('P2_GA')) {
                        hitChance = 0.5;  // General Archer has a 50% chance to avoid
                    }else if (targetPiece.startsWith('P1_Robinhood') || targetPiece.startsWith('P2_Robinhood')) {
                        hitChance = 0.4;  // General Archer Robinhood has a 60% chance to avoid
                    }
                     else if (targetPiece.startsWith('P1_Barbarian') || targetPiece.startsWith('P2_Barbarian')) {
                        hitChance = 0.15;  // General barbarian 70% chance to avoid
                    } else if (targetPiece.startsWith('P1_Paladin') || targetPiece.startsWith('P2_Paladin')) {
                        hitChance = 0.2;  // General barbarian 70% chance to avoid
                    } else if (targetPiece.startsWith('P1_Orc') || targetPiece.startsWith('P2_Orc')) {
                        hitChance = 0.15;  // General Orc 85% chance to avoid
                    }
                       // Ignore avoidance if attacking from red terrain
                    if (fromTerrain === 'red' && !isTower) {
                        hitChance = 1.0;
                    }

                     //Darkmage converts after it dies
                     if(targetPiece.startsWith('P1_Voldemort') || targetPiece.startsWith('P2_Voldemort')) {
                        console.log(`Mage ${targetPiece} defeated by ${attackingPiece}`);
                    
                        // Get the team prefix from the attacking unit
                        let teamPrefix = attackingPiece.substring(0, 3); // This gets "P1_" or "P2_"
                    
                        // Determine the new team prefix based on the current one
                        let newTeamPrefix = (teamPrefix === 'P1_') ? 'P2_' : 'P1_';
                    
                        // Change the team of the attacking unit
                        let newUnit = newTeamPrefix + attackingPiece.substring(3); // Changes "P1_H" to "P2_H" or vice versa
                    
                                            // Update the attacking unit on the board
                            if(newUnit.startsWith('P1_T') || newUnit.startsWith('P2_T')) {
                                console.log("this is a tower cant be converted")
                            } 
                            else{              
                            game.board[from.row][from.col].unit = newUnit;
                           console.log(`Converted ${attackingPiece} to ${newUnit}`);
                           io.to(moveData.roomId).emit('unitConvert', `This! ${attackingPiece} is now your enemy.`);    }              
                        
                        }
                } 
            }    else {
                // Avoidance logic for regular units
                if (targetPiece.startsWith('P1_H') || targetPiece.startsWith('P2_H')) {
                    hitChance = 0.7;  // Horse has a 50% chance to avoid
                } else if (targetPiece.startsWith('P1_W') || targetPiece.startsWith('P2_W')) {
                    hitChance = 0.5;  // Warrior has a 60% chance to avoid
                } else if (targetPiece.startsWith('P1_A') || targetPiece.startsWith('P2_A')) {
                    hitChance = 0.8;  // Archers have a 25% chance to avoid
                } else if (targetPiece.startsWith('P1_GW') || targetPiece.startsWith('P2_GW')) {
                    hitChance = 0.2;  // General Warrior has a 20% chance to avoid
                } else if (targetPiece.startsWith('P1_GH') || targetPiece.startsWith('P2_GH')) {
                    hitChance = 0.25;  // General Horse has a 70% chance to avoid against normal units
                } else if (targetPiece.startsWith('P1_GA') || targetPiece.startsWith('P2_GA')) {
                    hitChance = 0.5;  // General Archer has a 50% chance to avoid
                }else if (targetPiece.startsWith('P1_Robinhood') || targetPiece.startsWith('P2_Robinhood')) {
                    hitChance = 0.4;  // General Archer Robinhood has a 60% chance to avoid
                }
                 else if (targetPiece.startsWith('P1_Barbarian') || targetPiece.startsWith('P2_Barbarian')) {
                    hitChance = 0.15;  // General barbarian 70% chance to avoid
                }else if (targetPiece.startsWith('P1_Paladin') || targetPiece.startsWith('P2_Paladin')) {
                    hitChance = 0.20;  // General barbarian 70% chance to avoid
                } else if (targetPiece.startsWith('P1_Orc') || targetPiece.startsWith('P2_Orc')) {
                    hitChance = 0.15;  // General Orc 70% chance to avoid
                }
                
                //Darkmage converts after it dies
                if(targetPiece.startsWith('P1_Voldemort') || targetPiece.startsWith('P2_Voldemort')) {
                    console.log(`Mage ${targetPiece} defeated by ${attackingPiece}`);
                
                    // Get the team prefix from the attacking unit
                    let teamPrefix = attackingPiece.substring(0, 3); // This gets "P1_" or "P2_"
                
                    // Determine the new team prefix based on the current one
                    let newTeamPrefix = (teamPrefix === 'P1_') ? 'P2_' : 'P1_';
                
                    // Change the team of the attacking unit
                    let newUnit = newTeamPrefix + attackingPiece.substring(3); // Changes "P1_H" to "P2_H" or vice versa
                
                                        // Update the attacking unit on the board
                        if(newUnit.startsWith('P1_T') || newUnit.startsWith('P2_T')) {
                            console.log("this is a tower cant be converted")
                        } 
                        else{              
                        game.board[from.row][from.col].unit = newUnit;
                       console.log(`Converted ${attackingPiece} to ${newUnit}`);
                       io.to(moveData.roomId).emit('unitConvert', `This! ${attackingPiece} is now your enemy.`);    }              
                    
                    }

                    if(attackingPiece.startsWith('P1_Robinhood') || attackingPiece.startsWith('P2_Robinhood') )
                    {
                        if (RobinhoodAttaackCounts[attackingPiece]) {
                            RobinhoodAttaackCounts[attackingPiece]++;
                            console.log("Archer chance", RobinhoodAttaackCounts[attackingPiece])
                    }
                        else{
                            RobinhoodAttaackCounts[attackingPiece] = 1;
                        }
                        if (RobinhoodAttaackCounts[attackingPiece] % 3 === 0) {
                            hitChance = 1.0;  // 100% hit chance on every third attack
                            console.log("Archer should 1 hit now", RobinhoodAttaackCounts[attackingPiece] )
                            RobinhoodAttaackCounts[attackingPiece] = 0;
                            
                        
                        }
                    }
                            
                        
                    // Ignore avoidance if attacking from red terrain
                if (fromTerrain === 'red' && !isTower) {
                        hitChance = 1.0;
                }
                    if (attackingPiece === 'P1_T' || attackingPiece === 'P2_T') {
                        const attackingTower = game.board[from.row][from.col];
            
                        if (attackingTower.hp > 1) {
                            attackingTower.hp -= 1;  // Reduce tower HP by 1 on attack
                            console.log(`${attackingPiece} tower now has ${attackingTower.hp} HP after attacking.`);
            
                            // Check if attacking tower is destroyed due to HP loss
                            if (attackingTower.hp <= 0) {
                                console.log(`Tower ${attackingPiece} is destroyed!`);
                                game.board[from.row][from.col].unit = 'towerdestroyed';  // Remove the attacking tower from the board
                                io.to(moveData.roomId).emit('towerDestroyed', `Tower ${attackingPiece} is destroyed. `);
                                io.to(moveData.roomId).emit('gameOver', `Player ${moveData.player} Lose!`)
                                
                            }
                        }
                    }

                }
    
                const hitRoll = Math.random();
                console.log(hitRoll);
                if (hitRoll <= hitChance) {
                    console.log(`Attack hit! ${targetPiece} is removed.`);
                    const attackerimg = game.board[from.row][from.col].unit;
                    const defenderimg = game.board[to.row][to.col].unit;

                    if (attackingPiece.startsWith('P1_M') || attackingPiece.startsWith('P2_M'))
                    {
                        game.board[to.row][to.col].unit = 'magehit';  // replace the target piece
                        if (attackingPiece.startsWith('P1_M')){
                            game.board[from.row][from.col].unit = 'p1mageattack';
                        }
                        else{
                            game.board[from.row][from.col].unit = 'p2mageattack';
                        }
                    }
                    else if(attackingPiece.startsWith('P1_A') || attackingPiece.startsWith('P2_A'))
                    {
                        game.board[to.row][to.col].unit = 'archerhit';  // replace the target piece
                        if (attackingPiece.startsWith('P1_A')){
                            game.board[from.row][from.col].unit = 'archerattack';
                        }
                        else{
                            game.board[from.row][from.col].unit = 'archerattack';
                        }
                        
                    } else if(attackingPiece.startsWith('P1_Paladin') || attackingPiece.startsWith('P2_Paladin'))
                        {
                            game.board[to.row][to.col].unit = 'paladinhit';  // replace the target piece
                            if (attackingPiece.startsWith('P1_Paladin')){
                                game.board[from.row][from.col].unit = 'paladinattack';
                            }
                            else{
                                game.board[from.row][from.col].unit = 'paladin2attack';
                            }
                            
                        }
                    else if(attackingPiece.startsWith('P1_GA') || attackingPiece.startsWith('P2_GA'))
                        {
                            game.board[to.row][to.col].unit = 'gahit';  // replace the target piece
                            if (attackingPiece.startsWith('P1_A')){
                                game.board[from.row][from.col].unit = 'archerattack';
                            }
                            else{
                                game.board[from.row][from.col].unit = 'archerattack';
                            }
                            
                        }

                    else{
                    game.board[to.row][to.col].unit = 'explosion';  // replace defender img
                    
               
                    }  
    
                    
                    io.to(moveData.roomId).emit('attackHit', { message: `Attack hit! ${targetPiece} is removed.`, attackingPiece: attackingPiece,
                        targetRow: to.row,  // Also useful for a miss to possibly show an effect
                        targetCol: to.col,
                         unitDied: true });
                         // Server-side: Lock the game when the animation starts
                         io.to(moveData.roomId).emit('lockGame', true);

                         // Set a timeout to revert back or clear after animation
                         setTimeout(() => {
                            game.board[to.row][to.col].unit = ''; // Clear or revert depending on your game logic
                            game.board[from.row][from.col].unit = attackerimg;
                            io.to(moveData.roomId).emit('lockGame', false); //unlock game 
                            io.to(moveData.roomId).emit('updateBoard', {
                                board: game.board,
                                terrain: game.terrain,
                                turn: game.turn,
                            });
                         }, 3000); // 3 seconds for the hit animation
                        
                    if (checkWinCondition(game, game.turn, moveData.roomId)) {
                        const isBotGame = game.players['P2'].username === botAccount.username;
                        const winnerUsername = game.turn === 'P1' ? game.players['P1'].username : game.players['P2'].username;
                        if (isBotGame && game.turn === 'P1') {
                            console.log("Bot game detected, awarding rating bonus to P1 for victory.");
                            updatePlayerRating(winnerUsername);  // Increase rating for Player 1
                        }
                        io.to(moveData.roomId).emit('gameOver', `Player ${moveData.player} wins!`);
                        return;
                    }
                } else {
                    console.log(`Attack missed! ${targetPiece} avoided the hit.`);
                    io.to(moveData.roomId).emit('attackMiss', `Attack missed! ${targetPiece} avoided the hit.`);
                    const defenderimg = game.board[to.row][to.col].unit;
                    game.board[to.row][to.col].unit = 'miss';
                        // Set a timeout to revert back or clear after animation
                        setTimeout(() => {
                           // game.board[to.row][to.col].unit = ''; // Clear or revert depending on your game logic
                            game.board[to.row][to.col].unit = defenderimg;
                            io.to(moveData.roomId).emit('updateBoard', {
                                board: game.board,
                                terrain: game.terrain,
                                turn: game.turn,
                            });
                         }, 2000); // 3 seconds for the hit animation

                    // General Warrior counter-attack logic
                    if (targetPiece.startsWith('P1_GW') || targetPiece.startsWith('P2_GW')) {
                        const counterRoll = Math.random();
                        if (counterRoll <= 0.4) {  // 40% chance to counter-attack
                            console.log(`Counter-attack! ${attackingPiece} is removed.`);
                            game.board[from.row][from.col].unit = 'counterattack';  // Remove the attacking piece
                            io.to(moveData.roomId).emit('counterAttack', `Counter-attack! ${attackingPiece} is removed.`);
                            setTimeout(() => {
                                // game.board[to.row][to.col].unit = ''; // Clear or revert depending on your game logic
                                game.board[from.row][from.col].unit = ''; 
                                 io.to(moveData.roomId).emit('updateBoard', {
                                     board: game.board,
                                     terrain: game.terrain,
                                     turn: game.turn,
                                 });
                              }, 2000); // 3 seconds for the hit animation



                            if (checkWinCondition(game, game.turn === 'P1' ? 'P2' : 'P1', moveData.roomId)) {
                                io.to(moveData.roomId).emit('gameOver', `Player ${game.turn === 'P1' ? 'P2' : 'P1'} wins!`);
                                return;
                            }
                        }
                    }
                }
            }
    
                            // If the attacking unit is a Barbarian, allow it to attack twice
                if (attackingPiece.startsWith('P1_Barbarian') || attackingPiece.startsWith('P2_Barbarian')) {
                    // Don't mark the Barbarian as having attacked after the first attack
                    game.unitHasAttacked[attackingUnit] = false;
                } else {
                    // For other units, mark them as having attacked
                    game.unitHasAttacked[attackingUnit] = true;
}
        }
    
        // Move logic (if the target piece is empty, i.e., not attacking)
        if (!targetPiece) {
            game.board[to.row][to.col].unit = game.board[from.row][from.col].unit;
            game.board[from.row][from.col].unit = '';
    
            // Track the number of moves for the unit
            if (!game.unitHasMoved[attackingUnit]) {
                game.unitHasMoved[attackingUnit] = 1;
            } else {
                game.unitHasMoved[attackingUnit] += 1;
            }
        }
    
        game.actionCount++;
        console.log(game.actionCount);
        // Emit an event to both players about the turn change
        
    
        // End the turn after two actions
        if (game.actionCount >= 2) {
            //game.turn = game.turn === 'P1' ? 'P2' : 'P1';
           // game.actionCount = 0;
           
            switchTurn(moveData.roomId); // Switch turns after 2 actions
          
        }
           // Increment the turn counter (full turn is 2 actions per player)
           turnCounter++;
           io.to(moveData.roomId).emit('updateTurnCounter', turnCounter);
           // Every 20 turns, make both towers lose 1 HP
           if (turnCounter >= 100 && turnCounter % 2 === 0) {  // Every 2 full turns after the 20th turn
               const p1Tower = game.board[3][0];
               const p2Tower = game.board[4][7];

               // Reduce HP for Player 1's tower
               if (p1Tower.unit === 'P1_T' && p1Tower.hp > 1) {
                   p1Tower.hp -= 1;
                   console.log(`Player 1's tower loses 1 HP, now at ${p1Tower.hp}`);
                   io.to(moveData.roomId).emit('towerDamaged', `Player 1's tower loses 1 HP! Remaining HP: ${p1Tower.hp}`);

                   // Check if Player 1's tower is destroyed
                   if (p1Tower.hp <= 0) {
                       game.board[3][0].unit = 'towerdestroyed';  // Remove the tower from the board
                       io.to(moveData.roomId).emit('updateBoard', {
                                board: game.board,
                                terrain: game.terrain,
                                turn: game.turn,
                            });
                       io.to(moveData.roomId).emit('towerDestroyed', `Player 1's tower is destroyed!`);
                       io.to(moveData.roomId).emit('gameOver', `Player ${moveData.player} wins!`)
                       if (checkWinCondition(game, 'P2',moveData.roomId)) {
                        io.to(roomId).emit('gameOver', 'Player 2 wins!');
                        return;
                    }
                   }
               }

               // Reduce HP for Player 2's tower
               if (p2Tower.unit === 'P2_T' && p2Tower.hp > 1) {
                   p2Tower.hp -= 1;
                   console.log(`Player 2's tower loses 1 HP, now at ${p2Tower.hp}`);
                   io.to(moveData.roomId).emit('towerDamaged', `Player 2's tower loses 1 HP! Remaining HP: ${p2Tower.hp}`);

                   // Check if Player 2's tower is destroyed
                   if (p2Tower.hp <= 0) {
                       game.board[4][7].unit = 'towerdestroyed';  // Remove the tower from the board
                       io.to(moveData.roomId).emit('towerDestroyed', `Player 2's tower is destroyed!`);
                       io.to(moveData.roomId).emit('gameOver', `Player ${moveData.player} wins!`)
                       io.to(moveData.roomId).emit('updateBoard', {
                        board: game.board,
                        terrain: game.terrain,
                        turn: game.turn,
                    });                       
                       // Check for game over, as Player 1 would win
                        if (checkWinCondition(game, 'P1',moveData.roomId)) {
                         io.to(moveData.roomId).emit('gameOver', 'Player 1 wins!');
                            return;
                         }
                       
                   }
               }

               // Optionally, check for win conditions after a tower is destroyed
               if (checkWinCondition(game, game.turn,moveData.roomId )) {
                   io.to(moveData.roomId).emit('gameOver', `Player ${moveData.player} wins!`);
                   return;
               }
           }
        io.to(moveData.roomId).emit('updateBoard', {
            board: game.board,
            terrain: game.terrain,
            turn: game.turn,
        });
    });
    

    socket.on('disconnect', () => {
        delete activePlayers[socket.id];  // Remove player from active list
        console.log(`Player logged out, total active players: ${Object.keys(activePlayers).length}`);
        // Remove from matchmaking queue
        const initialQueueLength = matchmakingQueue.length;
        matchmakingQueue = matchmakingQueue.filter(player => player.socket.id !== socket.id);
        if (initialQueueLength !== matchmakingQueue.length) {
            console.log(`Player ${socket.id} removed from matchmaking queue.`);
        }
        
        // Check if the player was part of any ongoing game
        for (const roomId in games) {
            const game = games[roomId];
    
            // Skip processing if the game has already been concluded
            if (game.gameConcluded) {
                console.log(`Game ${roomId} already concluded. No action needed on disconnect.`);
                continue; // Skip to the next game if this one is already concluded
            }
    
            if (game.players['P1'].socketId === socket.id || game.players['P2'].socketId === socket.id) {
                const loser = game.players['P1'].socketId === socket.id ? 'P1' : 'P2';
                const winner = loser === 'P1' ? 'P2' : 'P1';
    
                // Emit gameOver to both players
                io.to(roomId).emit('gameOver', {
                    message: `Player ${loser} disconnected. Player ${winner} wins by default.`,
                    winner: game.players[winner].username,
                    loser: game.players[loser].username
                });
    
                // Mark the game as concluded to prevent further actions affecting the result
                game.gameConcluded = true;
    
               // Check if the loser is the bot
     // Check if the bot is the winner or loser
        if (game.players[winner].username === botAccount.username || game.players[loser].username === botAccount.username) {
            // Determine who is the actual player
            const realPlayerUsername = game.players[winner].username === botAccount.username 
                ? game.players[loser].username 
                : game.players[winner].username;
            
            // Determine if the bot won or lost
            const botWins = game.players[winner].username === botAccount.username;

            // Call `updateBotGameResult` with the real player's username and bot's result
            updateBotGameResult(realPlayerUsername, botWins)
                .then(() => {
                    console.log(`Bot result handled successfully. Bot ${botWins ? 'won' : 'lost'}.`);
                    delete games[roomId]; // Optionally delete the game afterward
                })
                .catch((error) => {
                    console.error('Failed to handle bot result:', error);
                });
        } else {
            // Regular updateGameResult for player loss
            updateGameResult(game.players[winner].username, game.players[loser].username)
                .then(() => {
                    console.log('Game result updated successfully');
                    // Optionally remove the game after updating results
                    delete games[roomId];
                })
                .catch((error) => {
                    console.error('Failed to update game results:', error);
                });
        }

            }
        }
    });
    
    
    
    
    
});



   





const port = process.env.PORT || 3000;
server.listen(port, () => {
console.log(`Server running on port ${port}`);
});