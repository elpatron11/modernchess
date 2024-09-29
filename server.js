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

// Serve static files from the "public" directory
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    socket.on('joinRoom', (data) => {
        const { roomId, general } = data;
        console.log(`Player ${socket.id} joined room ${roomId} with General ${general}`);
        
        if (!games[roomId]) {
            games[roomId] = {
                players: [],
                board: createGameBoard(),
                turn: 'P1',
                actionCount: 0,  // Track actions for the current player
                generals: {},
                unitHasAttacked: {},  // Track attacks per unit
                unitHasMoved: {}  // Track moves per unit
            };
              // Reset the turnCounter when a new game starts (first player joins)
              turnCounter = 0;

              // Emit the reset turn counter to both players
              io.to(roomId).emit('updateTurnCounter', turnCounter);
        }

        const game = games[roomId];

        if (game.players.length >= 2) {
            socket.emit('roomFull');
            return;
        }

        game.players.push(socket.id);

        const playerNumber = game.players.length === 1 ? 'P1' : 'P2';
        game.generals[playerNumber] = general;

        if (playerNumber === 'P1') {
            game.board[0][3].unit = `P1_${general}`;  // Player 1 General
        } else {
            game.board[7][4].unit = `P2_${general}`;  // Player 2 General
        }

        socket.emit('playerNumber', { playerNumber, board: game.board, turn: game.turn, general });

        socket.join(roomId);

        if (game.players.length === 2) {
            io.to(roomId).emit('gameStart', game.board);
        }

        function checkWinCondition(game, player) {
            const opponent = player === 'P1' ? 'P2' : 'P1';
            
            // Check if opponent's tower is destroyed
            const opponentTower = opponent === 'P1' ? 'P1_T' : 'P2_T';
            let towerAlive = false;
            let unitsAlive = false;
        
            for (let row = 0; row < BOARD_SIZE; row++) {
                for (let col = 0; col < BOARD_SIZE; col++) {
                    const unit = game.board[row][col].unit;
                    if (unit === opponentTower) {
                        towerAlive = true;
                    }
                    // Check if any of the opponent's units (except towers) are still alive
                    if (unit && unit.startsWith(opponent) && unit !== opponentTower) {
                        unitsAlive = true;
                    }
                }
            }
        
            // Winning condition: if opponent's tower is destroyed OR if no opponent units (except towers) are alive
            if (!towerAlive || !unitsAlive) {
                return true;  // Winning condition met
            }
        
            return false;
        }

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
        socket.on('makeMove', (moveData) => {
            const game = games[moveData.roomId];
        
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
                        tower.hp = 20;  // Initialize tower HP if not already set
                    }
        
                    tower.hp -= damage;  // Apply damage to tower
        
                    console.log(`Tower at (${to.row}, ${to.col}) now has ${tower.hp} HP after taking ${damage} damage.`);
        
                    if (tower.hp <= 0) {
                        console.log(`Tower ${targetPiece} is destroyed!`);
                        game.board[to.row][to.col].unit = '';  // Remove the tower from the board
                        io.to(moveData.roomId).emit('towerDestroyed', `Tower ${targetPiece} is destroyed!`);
        
                        if (checkWinCondition(game, game.turn)) {
                            io.to(moveData.roomId).emit('gameOver', {
                                message: `Player ${moveData.player} wins!`,
                                winner: moveData.player,
                                loser: game.turn === 'P1' ? 'P2' : 'P1'  // Identify the losing player
                            });
                            return;
                        }
                    } else {
                        io.to(moveData.roomId).emit('towerDamaged', `Tower ${targetPiece} is damaged! Remaining HP: ${tower.hp}`);
                    }
                } else {
                    // Mage always hits (no avoidance)
                    if (attackingPiece.startsWith('P1_M') || attackingPiece.startsWith('P2_M')) {
                        hitChance = 1.0;  // Mages always hit (no avoidance)
                    } else {
                        // Avoidance logic for regular units
                        if (targetPiece.startsWith('P1_H') || targetPiece.startsWith('P2_H')) {
                            hitChance = 0.5;  // Horse has a 50% chance to avoid
                        } else if (targetPiece.startsWith('P1_W') || targetPiece.startsWith('P2_W')) {
                            hitChance = 0.4;  // Warrior has a 60% chance to avoid
                        } else if (targetPiece.startsWith('P1_A') || targetPiece.startsWith('P2_A')) {
                            hitChance = 0.75;  // Archers have a 25% chance to avoid
                        } else if (targetPiece.startsWith('P1_GW') || targetPiece.startsWith('P2_GW')) {
                            hitChance = 0.2;  // General Warrior has a 20% chance to avoid
                        }
        
                        // Ignore avoidance if attacking from red terrain
                        if (fromTerrain === 'red' && !isTower) {
                            hitChance = 1.0;
                        }
                        if (attackingPiece === 'P1_T' || attackingPiece === 'P2_T') {
                            const attackingTower = game.board[from.row][from.col];
                
                            if (attackingTower.hp > 0) {
                                attackingTower.hp -= 1;  // Reduce tower HP by 1 on attack
                                console.log(`${attackingPiece} tower now has ${attackingTower.hp} HP after attacking.`);
                
                                // Check if attacking tower is destroyed due to HP loss
                                if (attackingTower.hp <= 0) {
                                    console.log(`Tower ${attackingPiece} is destroyed!`);
                                    game.board[from.row][from.col].unit = '';  // Remove the attacking tower from the board
                                    io.to(moveData.roomId).emit('towerDestroyed', `Tower ${attackingPiece} is destroyed after attacking.`);
                                }
                            }
                        }

                    }
        
                    const hitRoll = Math.random();
                    console.log(hitRoll);
                    if (hitRoll <= hitChance) {
                        console.log(`Attack hit! ${targetPiece} is removed.`);
                        game.board[to.row][to.col].unit = '';  // Remove the target piece
                        io.to(moveData.roomId).emit('attackHit', { message: `Attack hit! ${targetPiece} is removed.`, attackingPiece });
        
                        if (checkWinCondition(game, game.turn)) {
                            io.to(moveData.roomId).emit('gameOver', `Player ${moveData.player} wins!`);
                            return;
                        }
                    } else {
                        console.log(`Attack missed! ${targetPiece} avoided the hit.`);
                        io.to(moveData.roomId).emit('attackMiss', `Attack missed! ${targetPiece} avoided the hit.`);
        
                        // General Warrior counter-attack logic
                        if (targetPiece.startsWith('P1_GW') || targetPiece.startsWith('P2_GW')) {
                            const counterRoll = Math.random();
                            if (counterRoll <= 0.3) {  // 30% chance to counter-attack
                                console.log(`Counter-attack! ${attackingPiece} is removed.`);
                                game.board[from.row][from.col].unit = '';  // Remove the attacking piece
                                io.to(moveData.roomId).emit('counterAttack', `Counter-attack! ${attackingPiece} is removed.`);
        
                                if (checkWinCondition(game, game.turn === 'P1' ? 'P2' : 'P1')) {
                                    io.to(moveData.roomId).emit('gameOver', `Player ${game.turn === 'P1' ? 'P2' : 'P1'} wins!`);
                                    return;
                                }
                            }
                        }
                    }
                }
        
                game.unitHasAttacked[attackingUnit] = true;  // Mark as attacked but allow further movement
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
        
            // End the turn after two actions
            if (game.actionCount >= 2) {
                game.turn = game.turn === 'P1' ? 'P2' : 'P1';
                game.actionCount = 0;
                game.unitHasAttacked = {};  // Reset attack tracking
                game.unitHasMoved = {};  // Reset movement tracking
            }
               // Increment the turn counter (full turn is 2 actions per player)
               turnCounter++;
               io.to(moveData.roomId).emit('updateTurnCounter', turnCounter);
               // Every 20 turns, make both towers lose 1 HP
               if (turnCounter >= 100 && turnCounter % 2 === 0) {  // Every 2 full turns after the 20th turn
                   const p1Tower = game.board[3][0];
                   const p2Tower = game.board[4][7];
   
                   // Reduce HP for Player 1's tower
                   if (p1Tower.unit === 'P1_T' && p1Tower.hp > 0) {
                       p1Tower.hp -= 1;
                       console.log(`Player 1's tower loses 1 HP, now at ${p1Tower.hp}`);
                       io.to(moveData.roomId).emit('towerDamaged', `Player 1's tower loses 1 HP! Remaining HP: ${p1Tower.hp}`);
   
                       // Check if Player 1's tower is destroyed
                       if (p1Tower.hp <= 0) {
                           game.board[3][0].unit = '';  // Remove the tower from the board
                           io.to(moveData.roomId).emit('towerDestroyed', `Player 1's tower is destroyed!`);
                       }
                   }
   
                   // Reduce HP for Player 2's tower
                   if (p2Tower.unit === 'P2_T' && p2Tower.hp > 0) {
                       p2Tower.hp -= 1;
                       console.log(`Player 2's tower loses 1 HP, now at ${p2Tower.hp}`);
                       io.to(moveData.roomId).emit('towerDamaged', `Player 2's tower loses 1 HP! Remaining HP: ${p2Tower.hp}`);
   
                       // Check if Player 2's tower is destroyed
                       if (p2Tower.hp <= 0) {
                           game.board[4][7].unit = '';  // Remove the tower from the board
                           io.to(moveData.roomId).emit('towerDestroyed', `Player 2's tower is destroyed!`);
                       }
                   }
   
                   // Optionally, check for win conditions after a tower is destroyed
                   if (checkWinCondition(game, game.turn)) {
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
            console.log(`Player ${socket.id} disconnected`);
            game.players = game.players.filter(player => player !== socket.id);

            if (game.players.length === 0) {
                delete games[roomId];
            }
        });
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
