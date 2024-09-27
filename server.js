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

    // Place Player 1's Warrior (W) units
    for (let i = 0; i < BOARD_SIZE; i++) {
        board[1][i].unit = 'P1_W';  // Player 1 Warriors
    }

    // Place Player 2's Warrior (W) units
    for (let i = 0; i < BOARD_SIZE; i++) {
        board[6][i].unit = 'P2_W';  // Player 2 Warriors
    }

    // Add Player 1 and Player 2's Horse (H) units
    board[0][2].unit = 'P1_H';
    board[0][5].unit = 'P1_H';
    board[7][2].unit = 'P2_H';
    board[7][5].unit = 'P2_H';

    // Add Player 1 and Player 2's Archer (A) units
    board[0][4].unit = 'P1_A';
    board[7][3].unit = 'P2_A';
    board[0][4].unit = 'P1_A';
    board[7][3].unit = 'P2_A';
    board[0][0].unit = 'P1_A';
    board[7][0].unit = 'P2_A';
    board[0][7].unit = 'P1_A';
    board[7][7].unit = 'P2_A';
    // Add Towers for Player 1 and Player 2
    board[3][0].unit = 'T1';  // Player 1 Tower with 90% avoidance
    board[4][7].unit = 'T2';  // Player 2 Tower with 92% avoidance

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
                unitHasAttacked: {}  // Track attacks per unit
            };
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

        socket.on('makeMove', (moveData) => {
            const game = games[moveData.roomId];

            if (game.turn !== moveData.player) {
                socket.emit('notYourTurn');
                return;
            }

            const { from, to } = moveData.move;
            const attackingPiece = game.board[from.row][from.col].unit;
            const targetPiece = game.board[to.row][to.col].unit;
            const fromTerrain = game.board[from.row][from.col].terrain;  // Check if attacking unit stands on red terrain
            const destination = game.board[to.row][to.col].terrain;

            // Prevent movement onto water terrain
            if (destination === 'water') {
                socket.emit('invalidAction', 'You cannot move onto water terrain.');
                return;
            }

            const attackingUnit = `${from.row},${from.col}`;
            if (game.unitHasAttacked[attackingUnit]) {
                socket.emit('invalidAction', 'This unit has already attacked this turn.');
                return;
            }

            // Handle attacks
            if (targetPiece && (targetPiece.startsWith(game.turn === 'P1' ? 'P2' : 'P1') || targetPiece === 'T1' || targetPiece === 'T2')) {
                console.log(`Player ${moveData.player} attacking ${targetPiece} at (${to.row}, ${to.col})`);

                let hitChance = 1.0;  // Default: attack hits
                let isTower = false;

                // Avoidance logic
                if (targetPiece.startsWith('P1_H') || targetPiece.startsWith('P2_H')) {
                    hitChance = 0.5;  // Horse has a 50% chance to avoid
                } else if (targetPiece.startsWith('P1_W') || targetPiece.startsWith('P2_W')) {
                    hitChance = 0.3;  // Warrior has a 70% chance to avoid
                } else if (targetPiece.startsWith('P1_A') || targetPiece.startsWith('P2_A')) {
                    hitChance = 1.0;  // Archers always get hit
                } else if (targetPiece.startsWith('P1_GW') || targetPiece.startsWith('P2_GW')) {
                    hitChance = 0.2;  // Archers always get hit
                }
                else if (targetPiece === 'T1' || targetPiece === 'T2') {
                    // Tower avoidance
                    hitChance = targetPiece === 'T1' ? 0.1 : 0.08;  // Tower avoidance rates
                    isTower = true;
                }

                // If attacking unit is on red terrain, ignore avoidance
                if (fromTerrain === 'red' && !isTower) {
                    hitChance = 1.0;
                }

                const hitRoll = Math.random();
                if (hitRoll <= hitChance) {
                    console.log(`Attack hit! ${targetPiece} is removed.`);
                    game.board[to.row][to.col].unit = '';  // Remove the target piece
                    io.to(moveData.roomId).emit('attackHit', `Attack hit! ${targetPiece} is removed.`);
                } else {
                    console.log(`Attack missed! ${targetPiece} avoided the hit.`);
                    io.to(moveData.roomId).emit('attackMiss', `Attack missed! ${targetPiece} avoided the hit.`);
                }

                game.unitHasAttacked[attackingUnit] = true;

            } else {
                // Normal move
                game.board[to.row][to.col].unit = game.board[from.row][from.col].unit;
                game.board[from.row][from.col].unit = '';
            }

            game.actionCount++;

            if (game.actionCount >= 2) {
                game.turn = game.turn === 'P1' ? 'P2' : 'P1';
                game.actionCount = 0;
                game.unitHasAttacked = {};  // Reset unit attack tracking
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
