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
let countdown = 0; // 2 hours in seconds


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
            ownedGenerals: player.ownedGenerals  // Return owned generals
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
            .limit(20);  // Limit to top 10 players
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
schedule.scheduleJob('0 16,18,20,22,24 * * *', function() {
    console.log('Job triggered at:', new Date()); // Log the current time when job is triggered
    countdown = 7200; // reset countdown
    io.emit('countdown', { countdown });
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
        if (player.rating >= 1300 && !player.ownedGenerals.includes('GA')) {
            unlockedGeneral = 'GA';  // Unlock General Horse after 10 games
        }
         else if (player.rating >= 1350 && !player.ownedGenerals.includes('GH')) {
            unlockedGeneral = 'GH';  // Unlock General Horse after 10 games
        }else if (player.rating >= 1450 && !player.ownedGenerals.includes('GM')) {
            unlockedGeneral = 'GM';  // Unlock General Horse after 10 games
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

        if (ratingDifference >= 150) {
            ratingChange = 0; // No points gained for the winner
        } else if (ratingDifference >= 100) {
            ratingChange = 10; // Minimal points gained for the winner
        } else if (ratingDifference < 0) {
            ratingChange = 50; // Big gain for the winner when beating a higher-rated player
        } else {
            ratingChange = 25; // Moderate gain when players are closely rated
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

function logout() {
    // Clear the username and other data from localStorage
    localStorage.removeItem('username');
    
    // Hide user information and show the login form again
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('userInfo').style.display = 'none';
    
    alert('You have logged out successfully.');
}


io.on('connection',(socket) => {
    console.log('A player connected:', socket.id);
    socket.emit('countdown', { countdown });

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
    });
    
    
    
    socket.on('joinGame', (data) => {
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
            // Check if the player is already in a game
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
        }
    });

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
            let winnerUsername = game.players[player].username;
            let loserUsername = game.players[opponent].username;
            
            console.log(`Game over! Winner: ${winnerUsername}, Loser: ${loserUsername}`);
            io.to(roomId).emit('gameOver', {
                message: `Player ${player} wins!`,
                winner: winnerUsername,
                loser: loserUsername
            });

      
            //delete games[roomId];
            console.log("deleted room?`")
            return true;  // Game over, return true
        }
    
        return false;  // No win condition met, return false
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
                    game.board[to.row][to.col].unit = '';  // Remove the tower from the board
                
                    // Determine winner and loser based on current player's turn
                    // Suppose you determine the winner and loser based on some game logic
                        // Suppose you determine the winner and loser based on some game logic
                        let winnerUsername = game.turn === 'P1' ? game.players['P1'].username : game.players['P2'].username;
                        let loserUsername = game.turn === 'P1' ? game.players['P2'].username : game.players['P1'].username;
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
                        tower.hp += 2;  // Heal the tower by 2 HP
                        console.log(`Healed tower at (${towerPosition.row}, ${towerPosition.col}) to ${tower.hp} HP`);
                
                        // Emit an update to all clients with the new game state
                        io.to(moveData.roomId).emit('updateBoard', {
                            board: game.board,
                            turn: game.turn,
                            message: `Tower healed for 2 HP by General Mage at (${towerPosition.row}, ${towerPosition.col}). New HP: ${tower.hp}`
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
                        hitChance = 0.2;  // General barbarian 70% chance to avoid
                    } else if (targetPiece.startsWith('P1_Paladin') || targetPiece.startsWith('P2_Paladin')) {
                        hitChance = 0.25;  // General barbarian 70% chance to avoid
                    } else if (targetPiece.startsWith('P1_Orc') || targetPiece.startsWith('P2_Orc')) {
                        hitChance = 0.2;  // General Orc 75% chance to avoid
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
                    hitChance = 0.3;  // General Horse has a 70% chance to avoid against normal units
                } else if (targetPiece.startsWith('P1_GA') || targetPiece.startsWith('P2_GA')) {
                    hitChance = 0.5;  // General Archer has a 50% chance to avoid
                }else if (targetPiece.startsWith('P1_Robinhood') || targetPiece.startsWith('P2_Robinhood')) {
                    hitChance = 0.4;  // General Archer Robinhood has a 60% chance to avoid
                }
                 else if (targetPiece.startsWith('P1_Barbarian') || targetPiece.startsWith('P2_Barbarian')) {
                    hitChance = 0.2;  // General barbarian 70% chance to avoid
                }else if (targetPiece.startsWith('P1_Paladin') || targetPiece.startsWith('P2_Paladin')) {
                    hitChance = 0.25;  // General barbarian 70% chance to avoid
                } else if (targetPiece.startsWith('P1_Orc') || targetPiece.startsWith('P2_Orc')) {
                    hitChance = 0.2;  // General Orc 70% chance to avoid
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
            
                        if (attackingTower.hp > 0) {
                            attackingTower.hp -= 1;  // Reduce tower HP by 1 on attack
                            console.log(`${attackingPiece} tower now has ${attackingTower.hp} HP after attacking.`);
            
                            // Check if attacking tower is destroyed due to HP loss
                            if (attackingTower.hp <= 0) {
                                console.log(`Tower ${attackingPiece} is destroyed!`);
                                game.board[from.row][from.col].unit = '';  // Remove the attacking tower from the board
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
                    game.board[to.row][to.col].unit = '';  // Remove the target piece
                    io.to(moveData.roomId).emit('attackHit', { message: `Attack hit! ${targetPiece} is removed.`, attackingPiece });
    
                    if (checkWinCondition(game, game.turn, moveData.roomId)) {
                        io.to(moveData.roomId).emit('gameOver', `Player ${moveData.player} wins!`);
                        return;
                    }
                } else {
                    console.log(`Attack missed! ${targetPiece} avoided the hit.`);
                    io.to(moveData.roomId).emit('attackMiss', `Attack missed! ${targetPiece} avoided the hit.`);
    
                    // General Warrior counter-attack logic
                    if (targetPiece.startsWith('P1_GW') || targetPiece.startsWith('P2_GW')) {
                        const counterRoll = Math.random();
                        if (counterRoll <= 0.4) {  // 40% chance to counter-attack
                            console.log(`Counter-attack! ${attackingPiece} is removed.`);
                            game.board[from.row][from.col].unit = '';  // Remove the attacking piece
                            io.to(moveData.roomId).emit('counterAttack', `Counter-attack! ${attackingPiece} is removed.`);
    
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
        // Emit an event to both players about the turn change
        
    
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
               if (p1Tower.unit === 'P1_T' && p1Tower.hp > 1) {
                   p1Tower.hp -= 1;
                   console.log(`Player 1's tower loses 1 HP, now at ${p1Tower.hp}`);
                   io.to(moveData.roomId).emit('towerDamaged', `Player 1's tower loses 1 HP! Remaining HP: ${p1Tower.hp}`);

                   // Check if Player 1's tower is destroyed
                   if (p1Tower.hp <= 0) {
                       game.board[3][0].unit = '';  // Remove the tower from the board
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
                       game.board[4][7].unit = '';  // Remove the tower from the board
                       io.to(moveData.roomId).emit('towerDestroyed', `Player 2's tower is destroyed!`);
                       io.to(moveData.roomId).emit('gameOver', `Player ${moveData.player} wins!`)
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
        console.log(`Player ${socket.id} disconnected`);
    
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
    
                // Perform the updateGameResult
                updateGameResult(game.players[winner].username, game.players[loser].username)
                    .then(() => {
                        console.log('Game result updated successfully due to disconnection.');
                        // Optionally remove the game after updating results
                        delete games[roomId];
                    })
                    .catch((error) => {
                        console.error('Failed to update game results:', error);
                    });
            }
        }
    });
    
    
    
    
    
});



   





const port = process.env.PORT || 3000;
server.listen(port, () => {
console.log(`Server running on port ${port}`);
});