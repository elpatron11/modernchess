
const socket = io({
    reconnection: true,       // Enable automatic reconnection
    reconnectionAttempts: 10, // Number of attempts before giving up
    reconnectionDelay: 3000, // Wait time between attempts (ms)
    reconnectionDelayMax: 5000 // Maximum delay between attempts
});
let playerNumber;
let turn;
let board = [];
let roomId = null;
let selectedPiece = null;
let actionCount = 0; // Track 2 actions per turn
let previousAttacker = null;  // Track previous attacker to prevent two attacks from the same unit
let unitHasAttacked = {};  // Track which units have attacked in this turn
const backgroundSound = document.getElementById('backgroundSound');
const start = document.getElementById('start');
const letsgo = document.getElementById('letsgo');
const emojiSound = document.getElementById('emoji');
const emojiSound2 = document.getElementById('emoji2');
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
const loserSound = document.getElementById('loserSound');
const paladin = document.getElementById('paladin');
const paladinmove = document.getElementById('paladinmove');
const barbarian = document.getElementById('barbarian');
const orc = document.getElementById('orc');
const robin = document.getElementById('robin');
const voldemort = document.getElementById('voldemort');
const archerkill = document.getElementById('archerkill');
let terrainType2 = 0;
let terrainType3 = 0;
let isSpectator = false; // Default to false
let playerCard = null; // Global variable to store the player's selected card


// Join a room when the player clicks the join button
// Function to start matchmaking

//mongodb
function getPlayerData(username) {
    fetch(`/player/${username}`)
        .then(response => response.json())
        .then(data => {
            console.log('Player Data:', data);
            // Do something with the player data
        })
        .catch(error => console.error('Error fetching player data:', error));
}



function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        console.log("Received login response:", data);  // Check the actual data received
        if (data.message === "Login successful") {
            // Hide login form and show user details
            localStorage.setItem('username', data.username);  // Storing in local storage
            closeLoginModal();
            if (data.generalUnlockMessage) {
            alert(data.generalUnlockMessage); // Notify the player about the unlocked general
            loadGeneralDropdown();
            loadCardDropdown(); // Load cards
            }
              // Create a GC coin container
              const gcCoinContainer = `
              <div style="display: flex; align-items: center;">
              
              <span style="font-weight: bold; color:#00f819;">${data.generalsCoin}</span>
                  <img src="resources/images/gccoin.png" alt="GC Coin" style="width: 15px; height: 15px; margin-left: 5px;">
              </div>
          `;
            
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('userInfo').style.display = 'block';
            document.getElementById('userInfo').innerHTML = `
             ${data.username}</br>  
            Rating:${data.rating}</br>
            $${data.balance}.00 
            ${gcCoinContainer}</br>
        `;
      
            updateRatingImage(data.rating);
            document.getElementById('logoutButton').style.display = 'block';
            document.getElementById('generalPhoto').style.display = 'block';
            loadGeneralDropdown();  // Call this function after login success
            loadCardDropdown(); // Load cards
        } else {
            alert('Login failed: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error logging in:', error);
        alert('Login failed, please check the console for more information.');
    });
}



// Function to register a new user
function register() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    fetch('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        registrationMessage.style.display = 'block'; // Show the message
        if (data.username) {
            registrationMessage.textContent = 'Registration successful --> Login!!';
            registrationMessage.style.color = 'green';
        } else {
            registrationMessage.textContent = 'Registration failed: ' + data.message;
            registrationMessage.style.color = 'red';
        }
    })
    .catch(error => console.error('Error registering:', error));
    console.error('Error registering:', error);
    registrationMessage.style.display = 'block';
    registrationMessage.textContent = 'An unexpected error occurred. Please try again.';
    registrationMessage.style.color = 'red';
}



window.onload = function() {
    const username = localStorage.getItem('username');
    
    if (username) {
        // Optional: You can check with the server if the username is still valid
        loadGeneralDropdown(username); // Repopulate the dropdown based on ownership
        loadCardDropdown(username); // Load cards
        fetch(`/player/${username}`)
            .then(response => response.json())
            .then(data => {
                if (!data || !data.username) {
                    // If the username is not valid, clear localStorage
                    localStorage.removeItem('username');
                    document.getElementById('loginForm').style.display = 'block';
                    document.getElementById('userInfo').style.display = 'none';
                } else {
                     // Create a GC coin container
                    const gcCoinContainer = `
                    <div style="display: flex; align-items: center;">
                    
                    <span style="font-weight: bold; color:#00f819;">${data.generalsCoin}</span>
                        <img src="resources/images/gccoin.png" alt="GC Coin" style="width: 15px; height: 15px; margin-left: 5px;">
                    </div>
                `;
                    // If valid, display the user's information
                    document.getElementById('loginForm').style.display = 'none';
                    document.getElementById('userInfo').style.display = 'block';
                    document.getElementById('userInfo').innerHTML = `
                    ${data.username}</br>  
                    Rating:${data.rating}</br>
                    $${data.balance}.00 
                     ${gcCoinContainer}</br>
                `;
              
                    
                    // Optionally, show the logout button
                    document.getElementById('logoutButton').style.display = 'block';
                }
            })
            .catch(error => {
                // If an error occurs (e.g., server down), clear localStorage and show the login form
                console.error('Error validating user:', error);
                localStorage.removeItem('username');
                document.getElementById('loginForm').style.display = 'block';
                document.getElementById('userInfo').style.display = 'none';
            });
    } else {
        // If no username is in localStorage, show the login form
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('userInfo').style.display = 'none';
    }
};

function logout() {
    // Clear the username and other data from localStorage
    localStorage.removeItem('username');
    
    // Hide user information and show the login form again
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('logoutButton').style.display = 'none';
    
    alert('You have logged out successfully.');
}


function startMatchmaking() {
    console.log("Requesting to join a game");
    console.log("Emitting joinGame with general:", general);
    socket.emit('joinGame', { general: general, card:card }); // Request the server to join a game
        
}

function joinGame() {
        const username = localStorage.getItem('username'); 
        const general = document.getElementById('generalChoice').value;
        const card = document.getElementById('cardChoice').value;
        
        letsgo.play();
        if (!username) {
            alert("Please log in before joining the game.");
            openLoginModal();
            return;
        }
         // Ensure this ID matches your HTML element
         if (!general || !card) {
            alert("Please select a general and a card before joining.");
            return;
        }
    
    playerCard = card; // Save the selected card globally
    socket.emit('joinGame', {username:username, general: general, card: card });
}

function openLoginModal() {
    const loginModal = document.getElementById('loginModal');
    loginModal.style.display = 'block'; // Show the modal
}

function closeLoginModal() {
    const loginModal = document.getElementById('loginModal');
    loginModal.style.display = 'none'; // Hide the modal
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

function loadGeneralDropdown() {
    const username = localStorage.getItem('username');
    
    // Fetch user data from the backend including the generals they own
    fetch(`/player/${username}`)
        .then(response => response.json())
        .then(playerData => {
            const generals = playerData.ownedGenerals || []; // Assume 'generals' is an array of owned generals
            
              // Add default General Warrior (GW) if not already included
              if (!generals.includes('GM')) {
                generals.unshift('GM'); // Add GW at the start if it's missing
            }

            // Get the dropdown element
            const generalDropdown = document.getElementById('generalChoice');
            
            // Clear any existing options (if necessary)
            generalDropdown.innerHTML = '';

            // Populate the dropdown with the generals that the player owns
            generals.forEach(general => {
                const option = document.createElement('option');
                option.value = general;
                option.textContent = `General ${general}`; // Adjust label format as needed
                generalDropdown.appendChild(option);
            });


                            // Set the initial image
                            // Set the initial image and error handling
                const generalImage = document.getElementById('generalImage');
                generalImage.onerror = function() {
                    // This replaces the .png extension with .gif if the .png fails to load
                    this.src = this.src.replace('.png', '.gif');
                };

              generalImage.src = `/resources/images/dropdown/${generals[0]}.png`; // Adjust the path as necessary
              
              document.getElementById('generalPhoto').style.display = 'block'; // Show the card photo

              // Add an event listener to change image on selection
              generalDropdown.addEventListener('change', function() {
                  generalImage.src = `resources/images/dropdown/${this.value}.png`; // Update the image source based on the selected value
                  
                  document.getElementById('generalPhoto').style.display = 'block';
              });
        })
        .catch(error => {
            console.error('Error fetching player data:', error);
        });
}

//cards dropdown
function loadCardDropdown() {
    const username = localStorage.getItem('username');

    fetch(`/player/${username}`)
        .then(response => response.json())
        .then(playerData => {
            const cards = playerData.ownedCards || [];
            
            // Ensure the dropdown exists
            const cardDropdown = document.getElementById('cardChoice');
            cardDropdown.innerHTML = ''; // Clear existing options
               // Add default General Warrior (GW) if not already included
               if (!cards.includes('Tower Defense')) {
                cards.unshift('Tower Defense'); // Add GW at the start if it's missing
            }

            // Populate dropdown
            cards.forEach(card => {
                const option = document.createElement('option');
                option.value = card;
                option.textContent = card; // Display the card name
                cardDropdown.appendChild(option);
            });

           // Set the initial image
           const cardImage = document.getElementById('cardImage');
           cardImage.src = `/resources/images/card/${cards[0]}.gif`; // Adjust the path as necessary
           document.getElementById('cardPhoto').style.display = 'block'; // Show the card photo
           document.getElementById('cardPhoto').style.display = 'inline-flex'; // Ensure the image is visible
           // Add an event listener to change the image on selection
           cardDropdown.addEventListener('change', function () {
               cardImage.src = `/resources/images/card/${this.value}.gif`; // Update the image source based on the selected value
               document.getElementById('cardPhoto').style.display = 'block'; // Ensure the image is visible
               document.getElementById('cardPhoto').style.display = 'inline-flex'; // Ensure the image is visible
           });

        })
        .catch(error => {
            console.error('Error fetching player data:', error);
        });
}


  

 








const sliderItems = document.querySelectorAll('.slider-item');
let currentIndex = 0;

// Function to change slides
function changeSlide() {
    sliderItems[currentIndex].classList.remove('active');
    currentIndex = (currentIndex + 1) % sliderItems.length;
    sliderItems[currentIndex].classList.add('active');
}

// Start the slider loop
setInterval(changeSlide, 4000); // Change every 4 seconds


// Example usage when you receive the player data
socket.on('playerData', (data) => {
    // Assuming data contains the rating
    updateRatingImage(data.rating);
    
});







socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    if (reason === 'io server disconnect') {
        // The server disconnected this client manually
        socket.connect(); // Try to reconnect manually
    }
});
//turn timer for 60 sec coundown display for client side
let countdownTimer;
socket.on('startTimer', (data) => {
    let duration=30000;
    let timeLeft = duration / 1000; // convert milliseconds to seconds
    updateTimerDisplay(timeLeft);

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(countdownTimer);
            
        }
    }, 1000);
}); 


//loading bar
function startLoadingBar(duration) {
    const overlay = document.getElementById('loadingOverlay');
    const loadingBar = document.getElementById('loadingBar');

    // Show the overlay
    overlay.style.visibility = 'visible';

    // Reset the bar
    loadingBar.style.width = '0';

    // Simulate the loading process
    const interval = 100; // Update every 100ms
    const steps = duration / interval;
    let progress = 0;

    const loadingInterval = setInterval(() => {
        progress++;
        const percentage = Math.min((progress / steps) * 100, 100);
        loadingBar.style.width = `${percentage}%`;

        if (progress >= steps) {
            clearInterval(loadingInterval);
            // Hide the overlay after loading completes
            setTimeout(() => {
                overlay.style.visibility = 'hidden';
            }, 500); // Small delay to let users see the completed bar
        }
    }, interval);
}


function updateTimerDisplay(seconds) {
    
    document.getElementById('timerDisplay2').textContent = `${seconds}s`;
    document.getElementById('timerDisplay2').style.width = '60px';
    document.getElementById('timerDisplay2').style.fontSize = '13px';
    //document.getElementById('timerDisplay2').style.height = '30px';
} 


//when turn switches 60 sec timer resets
socket.on('turnSwitched', (data) => {
    clearInterval(countdownTimer);
   // document.getElementById('playerturn123').textContent = `It's now ${data.newTurn}'s turn`;
});

/* socket.on('countdown', function(data) {
    document.getElementById('timerDisplay').textContent = formatTime(data.countdown);
  });  

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m}:${s < 10 ? '0' : ''}${s}`;
  }
  */


function updateRatingImage(rating) {
    const ratingImageContainer = document.getElementById('ratingImageContainer');
    // Create an image element
    const ratingImage = document.createElement('img');
    ratingImage.id = 'ratingImage';  // Set an ID if needed for further reference
    ratingImage.src = '';  // Set the source as needed
    ratingImage.alt = 'Rating Badge';
    ratingImage.style.display = 'none'; // Initially hide it if necessary
    // Append the image to the container
    ratingImageContainer.appendChild(ratingImage);
    if (rating < 1300) {
        ratingImage.src = '/resources/images/ranks/rank1.png'; // Path to your image for rating < 1350
        ratingImage.style.display = 'block'; // Make the image visible
    } else if (rating >= 1300 && rating < 1500) {
        ratingImage.src = '/resources/images/ranks/rank2.png'; // Path to your image for rating between 1350 and 1600
        ratingImage.style.display = 'block'; // Make the image visible
    } else if (rating >= 1500) {
        ratingImage.src = '/resources/images/ranks/rank3.png'; // Path to your image for rating >= 1600
        ratingImage.style.display = 'block'; // Make the image visible
    }

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
// Receive game start data and initialize the game
socket.on('gameStart', (data) => {
    startLoadingBar(5000); // Example: 5 seconds loading duration
     // Delay game initialization until the loading bar completes
     
    roomId = data.roomId;
    board = data.board;
    playerNumber = data.playerNumber;
    turn = data.turn || 'P1'; // Assuming the game always starts with Player 1
    actionCount = 0;
    backgroundSound.loop = true;
    backgroundSound.volume=0.1;
    backgroundSound.play();
    start.play();
    terrainType2 = Math.random();
    playerCard = data.yourCard; // Save the player's card globally
    console.log(terrainType2);
    renderBoard();
    alert(`Game started! You are Player ${playerNumber}`);
    if (data.turn === 'P1') {
        // Logic to make the border red or any other indicator
        document.getElementById('turnInfo').style.background = 'green';
        
        document.getElementById('turnInfo').style.color = 'red';
        console.log(document.getElementById('gameBoard'));

       
    } else {
        // Logic to revert the border color or change to another color
        document.getElementById('turnInfo').style.background = 'black';
        document.getElementById('turnInfo').style.color = 'red';
      
    }
   
    const statusDisplay = document.getElementById('statusDisplay');
    statusDisplay.style.display = 'none'; // Hide the status message

    // Map card names to image file paths
    const cardIcons = {
        "Pushback": "/resources/images/card/icon/Pushback.gif",
        "Army Boost": "/resources/images/card/icon/Army Boost.gif",
        "Tower Attacker": "/resources/images/card/icon/Tower Attacker.gif",
        "Magia Negra": "/resources/images/card/icon/Magia Negra.gif",
        "Tower Defense":"/resources/images/card/icon/Tower Defense.gif"
        // Add paths for other cards
    };

    const opponentCardIcon = cardIcons[data.opponentCard] || "/resources/images/card/icon/Tower Defense.gif"; // Default image if card is not found


     // Display opponent details with card icon
        document.getElementById('opponentInfo').innerHTML = `
        <div style="text-align: center", "font-size: 14px">
            Opponent: ${data.opponentName} <br>
            Card: ${data.opponentCard || 'No card selected'}
            <div  style="margin-top: 10px;">
                <img  id="opponentCardIcon"; src="${opponentCardIcon}" alt="${data.opponentCard}" style="width: 50px; height: 50px;">
            </div>
        </div>
        `;

   console.log(`Your card: ${data.yourCard}, Opponent's card: ${data.opponentCard}`);
});





// Update the board state after a move
socket.on('updateBoard', (data) => {
    board = data.board;
    turn = data.turn;
    actionCount = 0;  // Reset action count after turn switch
    unitHasAttacked = {};  // Reset attack tracking after turn switch
    renderBoard();
    document.getElementById('turnInfo').textContent = `${turn === 'P1' ? 'P1' : ' P2'} `;
    if (data.turn === 'P1') {
        // Logic to make the border red or any other indicator
        document.getElementById('turnInfo').style.color = 'black';
        document.getElementById('turnInfo').style.backgroundColor = 'green';
        document.getElementById('turnCounterDisplay').style.backgroundColor = 'green';
        document.getElementById('gameBoard').style.border = '6px solid transparent'; // Correct border syntax
        document.getElementById('gameBoard').style.boxShadow = '0px 0px 8px rgba(3, 195, 38, 0.8), 0px 0px 40px rgba(3, 161, 195, 0.5)';
        document.getElementById('gameBoard').style.backgroundColor = 'rgb(6, 241, 13)';
        document.getElementById('timerDisplay2').style.backgroundColor ="green";
        document.getElementById('turnCounterDisplay').style.backgroundColor ="green";
        document.getElementById('timerDisplay2').style.color ='black';
        document.getElementById('turnCounterDisplay').style.color ='black';

    } else {
        // Logic to revert the border color or change to another color
        document.getElementById('turnCounterDisplay').style.backgroundColor = 'black';
        document.getElementById('gameBoard').style.border = '6px solid transparent'; // Correct border syntax
        document.getElementById('gameBoard').style.boxShadow = '0px 0px 8px rgba(8, 8, 8, 0.8), 0px 0px 40px rgba(3, 161, 195, 0.5)';
        document.getElementById('gameBoard').style.backgroundColor = 'black';
        document.getElementById('turnInfo').style.color = 'green';
        document.getElementById('turnInfo').style.backgroundColor = 'black';
        document.getElementById('timerDisplay2').style.backgroundColor ="black";
        document.getElementById('turnCounterDisplay').style.backgroundColor ="black";
        document.getElementById('timerDisplay2').style.color ='green';
        document.getElementById('turnCounterDisplay').style.color ='green';
    }
});

// Client-side: Handling the lock state
socket.on('lockGame', function(lock) {
    if (lock) {
        document.getElementById('gameBoard').style.pointerEvents = 'none'; // Disable clicks
        document.getElementById('gameBoard').style.opacity = '0.5'; // Optional: change opacity to indicate disabled state
    } else {
        document.getElementById('gameBoard').style.pointerEvents = 'auto'; // Enable clicks
        document.getElementById('gameBoard').style.opacity = '1'; // Restore opacity
    }
});

// Listen for the turn counter update from the server
socket.on('updateTurnCounter', (turnCounter) => {
    document.getElementById('turnCounterDisplay').textContent = `#${turnCounter}`;
});


// Handle attack result
socket.on('attackHit', (data) => {
    const { message, attackingPiece,  targetRow, targetCol} = data;  // Correctly extract data properties
    console.log(targetRow, targetCol);
    // Check if the attacking piece is a Mage (P1_M or P2_M)
    if (attackingPiece.startsWith('P1_M') || attackingPiece.startsWith('P2_M')) {
        spell.play();  // Play mage attack sound if Mage is attacking
   
    }  else if(attackingPiece.startsWith('P1_Paladin') || attackingPiece.startsWith('P2_Paladin'))
    {
        paladin.play();
    } else if(attackingPiece.startsWith('P1_Barbarian') || attackingPiece.startsWith('P2_Barbarian'))
        {
            barbarian.play();
        }
    else if(attackingPiece.startsWith('P1_Orc') || attackingPiece.startsWith('P2_Orc'))
            {
                orc.play();
            }
     else if(attackingPiece.startsWith('P1_GA') || attackingPiece.startsWith('P2_GA'))
                {
                    archerkill.play();
                }
    else if(attackingPiece.startsWith('P1_Robinhood') || attackingPiece.startsWith('P2_Robinhood')|| attackingPiece.startsWith('P1_Camaleon') || attackingPiece.startsWith('P2_Camaleon'))
                {
                    robin.play();
                }
    else {
        dieSound.play();  // Play default attack sound
    }
    const overlay = document.getElementById('effectOverlay');
    overlay.style.display = 'block';
    overlay.style.animation = 'blinkRed 1s';
    overlay.addEventListener('animationend', () => {
        overlay.style.display = 'none';  // Hide after the animation
        overlay.style.animation = '';     // Clear the animation
    }, { once: true });
    //alert(message);
       // Handle image replacement for the target unit
      
   });
// Handle tower damaged event
socket.on('towerDamaged', (message) => {
    //alert(message);  // You can display this message or update a UI element to show the tower's health.
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

// Handle counter-attack result
socket.on('unitConvert', (message) => {
    voldemort.play();
    alert(message);
});
// Handle missed attacks
socket.on('attackMiss', (message) => {
    //alert(message);
    const overlay = document.getElementById('effectOverlay');
    overlay.style.display = 'block';
    overlay.style.animation = 'blinkGreen 1s';
    overlay.addEventListener('animationend', () => {
        overlay.style.display = 'none';  // Hide after the animation
        overlay.style.animation = '';     // Clear the animation
    }, { once: true });
    playOnMiss();
});


// Play sound effect when the bot hits a target
socket.on('botAttackHit', (data) => {
    
    dieSound.play();
   
});




// Notify if it's not the player's turn
socket.on('notYourTurn', () => {
    alert('It is not your turn!');
});

// Handle game over event
socket.on('gameOver', async (data) => {
    const { message, winner, loser } = data;
    console.log('playerNumber:', playerNumber);
    
    const playerUsername = localStorage.getItem('username'); 
   // alert(message);
    if (playerUsername === winner) {
        youWin.play();  // Play winning sound
        // Example usage:
        showAlert('You Win!! Good Job', 5000);   
        console.log('Congratulations! You won!'); // Use console log 
      // Hide the leave button and show the join button after the game is over
      document.getElementById('leaveGameButton').style.display = 'none';     
       // Notify the server of game end to handle rating update
      
      setTimeout(() => {
          location.reload();
      }, 7000);  // Delay to let the sound play
        
        
        
    } else if (playerUsername === loser) {
        loserSound.play();  // Play losing sound
        //alert('You lost! Better luck next time!');
        showAlert('You Lose!! Try Again', 5000);   
        console.log('You lost! Better luck next time!'); // Use console log for testing
             // Hide the leave button and show the join button after the game is over
      document.getElementById('leaveGameButton').style.display = 'none';     
      
    
      setTimeout(() => {
        location.reload();
    }, 3000);  // Delay to let the sound play
      
       
    }
    
});

socket.on('generalUnlocked', (data) => {
    if (data.message) {
        alert(data.message); // Notify the player that they unlocked a new general
    }
});







function showAlert(message, duration = 3000) {
    const alertBox = document.getElementById('customAlert');
    alertBox.style.display = 'block';
    alertBox.children[0].textContent = message;  // Assuming the message paragraph is the first child

    setTimeout(() => {
        alertBox.style.display = 'none';
    }, duration);
}


function resetGameState() {
    roomId = null;
    playerNumber = null;
    turn = null;
    board = [];
    selectedPiece = null;
    actionCount = 0;
    previousAttacker = null;
    unitHasAttacked = {};
}


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
                if (isValidAttack(board[from.row][from.col], from.row, from.col, to.row, to.col, playerCard)) {
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

    // Towers can't move
    if (piece.startsWith('P1_T') || piece.startsWith('P2_T')) {
        return false; // Towers can't move
    }

    if (piece.startsWith('P1_W') || piece.startsWith('P2_W') || piece.startsWith('P1_Camaleon') || piece.startsWith('P2_Camaleon') 
        || piece.startsWith('P1_GW') || piece.startsWith('P2_GW') || 
        piece.startsWith('P1_Barbarian') || piece.startsWith('P2_Barbarian')  || 
        piece.startsWith('P1_Paladin') || piece.startsWith('P2_Paladin') || 
        piece.startsWith('P1_Orc') || piece.startsWith('P2_Orc') ) {
        return rowDiff <= 1 && colDiff <= 1;
    }

    // Horse (H) can move up to 3 spaces in a straight line (including diagonal)
    if (piece.startsWith('P1_H') || piece.startsWith('P2_H')) {
        return (rowDiff <= 3 && colDiff === 0) ||  // Straight vertical
               (colDiff <= 3 && rowDiff === 0) ||  // Straight horizontal
               (rowDiff === colDiff && rowDiff <= 3);  // Diagonal
    }
    if (piece.startsWith('P1_GH') || piece.startsWith('P2_GH')) {
        return (rowDiff <= 3 && colDiff === 0) ||  // Straight vertical
               (colDiff <= 3 && rowDiff === 0) ||  // Straight horizontal
               (rowDiff === colDiff && rowDiff <= 3);  // Diagonal
    }

    // Archer (A) can move 1 space in any direction
    if (piece.startsWith('P1_A') || piece.startsWith('P2_A')) {
        return rowDiff <= 1 && colDiff <= 1;
    }
     // Archer (A) can move 1 space in any direction
     if (piece.startsWith('P1_GA') || piece.startsWith('P2_GA')) {
        return rowDiff <= 1 && colDiff <= 1;
    }
    if (piece.startsWith('P1_Robinhood') || piece.startsWith('P2_Robinhood')) {
        return rowDiff <= 1 && colDiff <= 1;
    }

      //Mage can move 1 space in any direction
      if (piece.startsWith('P1_M') || piece.startsWith('P2_M') || piece.startsWith('P2_GM') 
        || piece.startsWith('P1_GM')|| piece.startsWith('P2_Voldemort') || piece.startsWith('P1_Voldemort')) {
        return rowDiff <= 1 && colDiff <= 1;
    }


    return false;
}

// Make a move and notify the server
function makeMove(from, to) {
    socket.emit('makeMove', { roomId, player: playerNumber, move: { from, to },playerCard });
    const movingPiece = board[from.row][from.col].unit;

    // Check if the moving piece is a Horse or Mage
    if (movingPiece.startsWith('P1_H') || movingPiece.startsWith('P2_H') || movingPiece.startsWith('P1_GH') || movingPiece.startsWith('P2_GH')) {
        horseMoveSound.play();  // Play horse move sound
    } else if (movingPiece.startsWith('P1_M') || movingPiece.startsWith('P2_M')) {
        mageMove.play();  // Play mage move sound
    } else if (movingPiece.startsWith('P1_Paladin') || movingPiece.startsWith('P2_Paladin')) {
        paladinmove.play();  // Play mage move sound
    }
     else {
        stepSound.play();  // Play regular move sound for all other units
    }


    selectedPiece = null;  // Deselect after the move
}

// Validate if the attack is valid
function isValidAttack(pieceData, fromRow, fromCol, toRow, toCol, playerCard) {
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
        piece.startsWith('P1_Barbarian') || piece.startsWith('P2_Barbarian') ||
        piece.startsWith('P1_Orc') || piece.startsWith('P2_Orc')||
        piece.startsWith('P1_Camaleon') || piece.startsWith('P2_Camaleon')
    ) {
        return rowDiff <= 1 && colDiff <= 1;
    }

      // Tower logic with "Tower Attacker" card
    if ((piece.startsWith('P1_T') || piece.startsWith('P2_T')) && playerCard === 'Tower Attacker') {
        return (rowDiff === 0 && colDiff <= 3) ||  // Horizontal attack
               (colDiff === 0 && rowDiff <= 3) || (rowDiff === colDiff && rowDiff <= 1);  // Vertical attack
    }

    // Default tower logic (adjacent attack only)
    if (piece.startsWith('P1_T') || piece.startsWith('P2_T')) {
        return rowDiff <= 1 && colDiff <= 1;
    }

    // Archer (A) attack logic: attack up to 3 spaces away in straight lines (no diagonal attacks)
    if (piece.startsWith('P1_A') || piece.startsWith('P2_A')) {
        return (rowDiff === 0 && colDiff <= 3) ||  // Horizontal attack
               (colDiff === 0 && rowDiff <= 3);  // Vertical attack
               
    }
            //Robinhood
    if (piece.startsWith('P1_Robinhood') || piece.startsWith('P2_Robinhood')) {
        return (rowDiff === 0 && colDiff <= 3) ||  // Horizontal attack
               (colDiff === 0 && rowDiff <= 3);  // Vertical attack
               
    }
     //GENERAL Archer (GA) attack logic: attack up to 3 spaces away in straight lines (no diagonal attacks)
     if (piece.startsWith('P1_GA') || piece.startsWith('P2_GA')) {
        return (rowDiff === 0 && colDiff <= 4) ||  // Horizontal attack
               (colDiff === 0 && rowDiff <= 4);  // Vertical attack
    }

    
     // Mage attack logic: attack up to 2 spaces away in straight lines (no diagonal attacks)
     if (piece.startsWith('P1_M') || piece.startsWith('P2_M')|| piece.startsWith('P1_GM') || piece.startsWith('P2_GM')
        || piece.startsWith('P1_Voldemort') || piece.startsWith('P2_Voldemort')) {
            if (playerCard === 'Magia Negra') {
                // Allow diagonal attacks up to 2 spaces with "Magia Negra"
                return (rowDiff === 0 && colDiff <= 2) ||  // Horizontal attack
                       (colDiff === 0 && rowDiff <= 2) ||  // Vertical attack
                       (rowDiff === colDiff && rowDiff <= 2);  // Diagonal attack
            } else {
                // Default Mage attack: only horizontal and vertical, up to 2 spaces
                return (rowDiff === 0 && colDiff <= 2) ||  // Horizontal attack
                       (colDiff === 0 && rowDiff <= 2);  // Vertical attack
            }
    }
    // General Paladin can attack up to 2 spaces and in diagonal too.
    if (piece.startsWith('P1_Paladin') || piece.startsWith('P2_Paladin')) {
        return (rowDiff === 0 && colDiff <= 2) ||  // Horizontal attack
               (colDiff === 0 && rowDiff <= 2) ||  // Vertical attack
               (rowDiff === colDiff && rowDiff <= 2);  // Diagonal
    }

    
    // Horse (H) attack logic (adjacent pieces, 1 space away in any direction)
    if (piece.startsWith('P1_H') || piece.startsWith('P2_H')) {
        return rowDiff <= 1 && colDiff <= 1;
    }
    // Horse (H) attack logic (adjacent pieces, 1 space away in any direction)
    if (piece.startsWith('P1_GH') || piece.startsWith('P2_GH')) {
        return rowDiff <= 1 && colDiff <= 1;
    }

    return false;
}

function updateTurnDisplay(turn) {
    const gameBoard = document.getElementById('gameBoard');

    if (turn === 'P1') {
        gameBoard.classList.add('player1Turn');
        gameBoard.classList.remove('player2Turn');
    } else if (turn === 'P2') {
        gameBoard.classList.add('player2Turn');
        gameBoard.classList.remove('player1Turn');
    }
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

//little player card icon to add below boardgame 
function updatePlayerCard(cardName) {
    const cardIcons = {
        "Pushback": "/resources/images/card/icon/Pushback.gif",
         "Army Boost": "/resources/images/card/icon/Army Boost.gif",
        "Tower Attacker": "/resources/images/card/icon/Tower Attacker.gif",
        "Magia Negra": "/resources/images/card/icon/Magia Negra.gif",
        "Tower Defense": "/resources/images/card/icon/Tower Defense.gif"
    };

    const playerCardIcon = document.getElementById('playerCardIcon');
    const playerCardSrc = cardIcons[cardName] || "/resources/images/card/icon/Tower Defense.gif"; // Default if not found

    if (playerCardIcon) {
        playerCardIcon.src = playerCardSrc;
        playerCardIcon.alt = cardName;
    }
}

// Render the board in the HTML
function renderBoard() {
      // Hide the control panel
      document.getElementById('viewGeneralsButton').style.display = 'none';
      document.getElementById('slider-container').style.display = 'none';
      document.getElementById('control-Panel').style.display = 'none';
      document.getElementById('generalImage').style.display = 'none';
      document.getElementById('cardImage').style.display = 'none';
      document.getElementById('apk').style.display = 'none';      
      document.getElementById('topRanking').style.display = 'none';
      document.getElementById('timerDisplay').style.display = 'none';
      document.getElementById('leaveGameButton').style.display = 'block';
      // Show the game board or other game start related elements
      document.getElementById('gameContainer').style.display = 'block';
      document.getElementById('infoContainer').style.display = 'block';
      document.getElementById('gameBoard').style.display = 'block';
      document.getElementById('emojiDisplays').style.display = 'block';

      const statusDisplay = document.getElementById('statusDisplay');
      statusDisplay.style.display = 'none'; // Hide the status message
    const gameBoard = document.getElementById('gameBoard');
    gameBoard.innerHTML = '';

    

     // Update the player's card icon
     updatePlayerCard(playerCard);

    for (let row = 0; row < board.length; row++) {
        const tr = document.createElement('tr');
        for (let col = 0; col < board[row].length; col++) {
            const td = document.createElement('td');
            td.classList.add('board-cell');
            td.id = `cell-${row}-${col}`;  // Assign ID in the format `cell-row-col`
            const terrainType = board[row][col].terrain;  // Get terrain type
            const unitType = board[row][col].unit;  // Get unit type
            const cell = board[row][col]; // Ensure you define `cell` here
            // Set terrain background based on terrain type
            if (terrainType === 'water') {
                td.classList.add('water-terrain');
            } else if (terrainType === 'red') {
                td.classList.add('red-terrain');
            } else if (terrainType === 'grass') {
                td.classList.add('grass-terrain');
                // Check if a camouflaged General (GC) is on this tile
                if (cell.unit.startsWith('P1_Camaleon') || cell.unit.startsWith('P2_Camaleon')) {
                    td.classList.add('camouflage'); // Add a special class for the camouflaged General
                    console.log(`${cell.unit} is camouflaged on grass!`);
                }

            } else {
                                                   
                    td.classList.add('normal-terrain');  // Apply first normal terrain class
               
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
                        hpDisplay.textContent = `${tower.hp}`;
                        hpDisplay.classList.add('tower-hp');  // Add this class
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
        'P1_T': '/resources/images/p1_t1.png',        // Example: Tower 1 image
        'P2_T': '/resources/images/p2_t2.png',         // Example: Tower 2 image
        'P1_GA': '/resources/images/p1_ga.png',
        'P2_GA': '/resources/images/p2_ga.png',
        'P1_GH': '/resources/images/p1_gh.png',
        'P2_GH': '/resources/images/p2_gh.png',
        'P1_M': '/resources/images/p1_mage.png',
        'P2_M': '/resources/images/p2_mage.png',
        'P1_GM': '/resources/images/p1_gm.png',
        'P2_GM': '/resources/images/p2_gm.png',
        'P1_Barbarian': '/resources/images/p1_Barbarian.png',  
        'P2_Barbarian': '/resources/images/p2_Barbarian.png',
        'P1_Paladin': '/resources/images/p1_Paladin.png',  
        'P2_Paladin': '/resources/images/p2_Paladin.png',
        'P1_Orc': '/resources/images/p1_orc.png',  
        'P2_Orc': '/resources/images/p2_orc.png',
        'P1_Voldemort': '/resources/images/p1_voldemort.png',
        'P2_Voldemort': '/resources/images/p2_voldemort.png',
        'P1_Robinhood': '/resources/images/p1_robin.png',
        'P1_Robinhood1': '/resources/images/p1_robin1.png',
        'P1_Robinhood2': '/resources/images/p1_robin2.png',
        'P2_Robinhood': '/resources/images/p2_robin.png',
        'P2_Robinhood1': '/resources/images/p2_robin1.png',
        'P2_Robinhood2': '/resources/images/p2_robin2.png',
        'P1_Camaleon': '/resources/images/p1_camaleon.png',
        'P2_Camaleon': '/resources/images/p2_camaleon.png',        
        'explosion': '/resources/images/animation/rip.gif',
        'warhit': '/resources/images/animation/hit.gif',
        'miss': '/resources/images/animation/miss.gif',
        'magehit': '/resources/images/animation/magehit2.gif',
        'p2mageattack': '/resources/images/animation/p2mageattack.gif',
        'p1mageattack': '/resources/images/animation/p1mageattack.gif',
        'archerhit': '/resources/images/animation/archerhit2.gif',
        'archerattack': '/resources/images/animation/archerattack.gif',
        'towerdestroyed': '/resources/images/animation/towerdestroyed.gif',
        'counterattack': '/resources/images/animation/counterattack.gif',
        'gahit': '/resources/images/animation/gahit.gif',
        'paladinhit': '/resources/images/animation/paladinhit.gif',
        'paladinattack': '/resources/images/animation/paladinattack.gif',
        'paladin2attack': '/resources/images/animation/paladin2attack.gif',
         'attackhit': '/resources/images/animation/explosion.gif'
        // Add other units as needed
    };
    return unitImages[unitType] || '';  // Return the image URL or an empty string if no unit
}

// Example: Play sound when a move or attack occurs
function playOnMiss(){
    missSound.play()
}














// Client-side JavaScript
socket.on('waitingForOpponent', (data) => {
    const statusDisplay = document.getElementById('statusDisplay'); // Ensure you have this element in your HTML
    statusDisplay.textContent = data.status;
    statusDisplay.style.display = 'block';  // Make the status visible
    
});

// Event listener for the "View Generals" button
document.getElementById('viewGeneralsButton').addEventListener('click', function() {
    // Redirect to the generals page
    window.location.href = '/generals.html'; // Adjust the path as needed
});


document.getElementById('emojiPicker').addEventListener('click', function(event) {
    if (event.target.tagName === 'SPAN') {
        const emoji = event.target.textContent;
        const playerDisplay = playerNumber === 'P1' ? 'emojiDisplayP1' : 'emojiDisplayP2';
        
        // Display the emoji in the player's own display area immediately
        document.getElementById(playerDisplay).textContent = emoji; 
        emojiSound.play();
        // Include roomId in the data sent to the server
        socket.emit('emojiSelected', { emoji: emoji, roomId: roomId });  // Assuming 'roomId' is globally available or stored
    }
});
// Listen for emoji selections from the other player
// When receiving an emoji from the server
// When receiving an emoji from the server
// When receiving an emoji from the server
// Listen for emoji selections from the other player
socket.on('receiveEmoji', function(data) {
    // Determine the display area based on the player number
    const playerDisplay = data.player === 'P1' ? 'emojiDisplayP2' : 'emojiDisplayP1';
    document.getElementById(playerDisplay).textContent = data.emoji; // Display the received emoji
    emojiSound2.play();
});


document.getElementById('comicButton').addEventListener('click', function() {
    window.location.href = '/comic.html';  // Opens the comic page
});

// Request the list of active games
socket.emit('getActiveGames');

// Handle the response from the server
socket.on('activeGamesList', (activeGames) => {
    const gameListContainer = document.getElementById('gameList'); // Assuming you have a container for the game list
    gameListContainer.innerHTML = ''; // Clear any previous list

    if (activeGames.length === 0) {
        gameListContainer.innerHTML = '<p>No active games available.</p>';
        return;
    }

    activeGames.forEach(game => {
        const gameButton = document.createElement('button');
        gameButton.textContent = `${game.players.P1}(P1) vs ${game.players.P2}(P2)`; // Display player names
        gameButton.onclick = () => joinAsSpectator(game.roomId); // Use roomId to join the game
        gameListContainer.appendChild(gameButton);
    });
});

function joinAsSpectator(roomId) {
    isSpectator = true; // Mark the user as a spectator
    startLoadingBar(5000); // Example: 5 seconds loading duration
    socket.emit('joinAsSpectator', roomId);
}


// Handle game state updates
socket.on('gameStateUpdate', (data) => {
    console.log('Game state updated for spectator:', data);
    
    renderBoard(data.board);
    updateTurnDisplay(data.turn);
        
    const player1Info = document.getElementById('player1Info'); // Element where player info is displayed
    const player2Info = document.getElementById('player2Info');

    // Update player usernames
    player1Info.textContent = `Player 1: ${data.players.P1.username}`;
    player2Info.textContent = `Player 2: ${data.players.P2.username}`;
    
    
    if (data.playerCards){
     displayPlayerCards(data.playerCards); // New function to handle displaying cards
    }
     document.querySelectorAll('.board-cell').forEach(cell => {
        cell.style.pointerEvents = 'none'; // Prevent interaction
    });
});





function displayPlayerCards(cards) {
    const cardIcons = {
        "Pushback": "/resources/images/card/icon/Pushback.gif",
        "Army Boost": "/resources/images/card/icon/Army Boost.gif",
        "Tower Attacker": "/resources/images/card/icon/Tower Attacker.gif",
        "Magia Negra": "/resources/images/card/icon/Magia Negra.gif",
        "Tower Defense": "/resources/images/card/icon/Tower Defense.gif"
    };

    const player1Card = cards.P1;
    const player2Card = cards.P2;

    const player1CardImage = document.getElementById('player1CardImage');
    const player2CardImage = document.getElementById('player2CardImage');
    document.getElementById('emojiDisplays').style.display = "none";
    document.getElementById('playerCardContainer').style.display = "none";
    document.getElementById('emojiPicker').style.display = "none";

    document.getElementById('player1Card').style.display = "block";
    document.getElementById('player2Card').style.display = "block";


    console.log(`Player 1 Card: ${player1Card}, Player 2 Card: ${player2Card}`); // Debugging

    player1CardImage.src = cardIcons[player1Card] || "/resources/images/card/icon/default.gif";
    player2CardImage.src = cardIcons[player2Card] || "/resources/images/card/icon/default.gif";

    player1CardImage.onerror = () => {
        console.error('Failed to load image for Player 1');
        player1CardImage.src = "/resources/images/card/icon/default.gif"; // Fallback image
    };
    player2CardImage.onerror = () => {
        console.error('Failed to load image for Player 2');
        player2CardImage.src = "/resources/images/card/icon/default.gif"; // Fallback image
    };
}




//Leave button
document.getElementById('leaveGameButton').addEventListener('click', function() {
   
    if (isSpectator) { // Add a variable to track if the user is a spectator
        location.reload(); // Reload the page for spectators
    } else {
        socket.emit('leaveGame', { roomId: roomId, playerNumber: playerNumber });
        // Hide the leave button once the player has left
        document.getElementById('leaveGameButton').style.display = 'none';
        resetGameState();
    }
    
});



document.getElementById("LoginButton").addEventListener("click", function () {
    openLoginModal(); // Reuse the existing modal opening logic
});

// Attach the joinRoom function to the join button
document.getElementById('joinButton').onclick = startMatchmaking;