import tkinter as tk
import random
from tkinter import messagebox

# Chessboard size
BOARD_SIZE = 8

class ChessGame:
    def __init__(self, root):
        self.root = root
        self.board = [['' for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        self.tower_hp = {'T1': 20, 'T2': 20}  # Towers start with 15 hit points
        self.selected_piece = None
        self.turn = 'P1'  # Tracks whose turn it is, P1 for Player 1 and P2 for Player 2
        self.move_count = 0  # Track how many moves have been made during the current turn
        
        self.blue_count = 0  # Track how many blue squares we have
        self.red_count = 0   # Track how many red squares we have
        self.gray_count = 0  # Track how many gray squares we have
        self.max_blue_squares = 6  # Maximum number of blue squares allowed
        self.max_red_squares = 2   # Maximum number of red squares allowed
        self.max_gray_squares = 1  # Maximum number of gray squares allowed

        # Initialize the GUI board
        self.create_board()
        self.place_pieces()
    
    def create_board(self):
        self.buttons = [[None for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                # Determine the color based on the row and limit blue/red/gray squares
                color = self.get_color_for_square(row)
                button = tk.Button(self.root, text='', width=8, height=4, bg=color, 
                                   command=lambda r=row, c=col: self.on_click(r, c))
                button.grid(row=row, column=col)
                self.buttons[row][col] = button

    def get_color_for_square(self, row):
        """Returns the color for the square based on the row index and square limit."""
        if row in [0, 1, 2, 5, 6, 7]:  # Rows 1, 2, 7, and 8 (0-based index) are green
            return 'green'
        else:
            # For other rows, select a random color, respecting the max blue, red, and gray limits
            return self.random_color()

    def random_color(self):
        """Return a random color, with a maximum of blue, red, and gray squares allowed."""
        colors = ['blue', 'green', 'gray', 'red']
        
        if self.blue_count >= self.max_blue_squares:
            colors.remove('blue')
        if self.red_count >= self.max_red_squares:
            colors.remove('red')
        if self.gray_count >= self.max_gray_squares:
            colors.remove('gray')
        
        selected_color = random.choice(colors)
        
        if selected_color == 'blue':
            self.blue_count += 1  # Increment the blue count
        elif selected_color == 'red':
            self.red_count += 1  # Increment the red count
        elif selected_color == 'gray':
            self.gray_count += 1  # Increment the gray count

        return selected_color

    def place_pieces(self):
        # Place 6 Pawns for each side on the second row
        for col in range(BOARD_SIZE):
            if col not in [0, 7]:  # Only place pawns between the horse units
                self.board[1][col] = 'P1'  # Player 1's Pawn
                self.board[6][col] = 'P2'  # Player 2's Pawn

        # Place 2 Horse units for each side on the edges of the second row
        self.board[0][2] = 'H1'  # Player 1's new Horse
        self.board[7][5] = 'H2'  # Player 2's new Horse

        self.board[1][0] = 'A1'  # Player 1's right-side Archer
        self.board[1][7] = 'H1'  # Player 1's right-side Horse
        self.board[6][0] = 'H2'  # Player 2's right-side Horse
        self.board[6][7] = 'A2'  # Player 2's right-side Archer
        self.board[7][7] = 'GR2'  # Player 2's General Hunter
        self.board[0][0] = 'GR1'  # Player 1's General Hunter   
        # Place 1 Archer for each side on the right side
        self.board[0][4] = 'A1'  # Player 1's Archer
        self.board[7][3] = 'A2'  # Player 2's Archer

        # Place 1 General Warrior for Player 1 and General Hunter for Player 2
        self.board[0][3] = 'GW1'  # Player 1's General Warrior
        self.board[7][4] = 'GH2'  # Player 2's General Hunter

        # Place Tower for both players (Player 1 on the left side of row 3, Player 2 on the right side of row 4)
        self.board[3][0] = 'T1'  # Player 1's Tower
        self.board[4][7] = 'T2'  # Player 2's Tower

        self.update_board()

    def update_board(self):
        # Update the GUI buttons to reflect the board state
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                piece = self.board[row][col]
                if piece:
                    if len(piece) > 2 and piece[2] == '1':
                        self.buttons[row][col].config(text=piece[:2], fg='white')  # Player 1's pieces are white
                    elif len(piece) > 2 and piece[2] == '2':
                        self.buttons[row][col].config(text=piece[:2], fg='black')  # Player 2's pieces are black
                    else:
                        # For two-character pieces like 'P1', 'H1'
                        if piece[1] == '1':
                            self.buttons[row][col].config(text=piece[0], fg='white')
                        else:
                            self.buttons[row][col].config(text=piece[0], fg='black')
                else:
                    self.buttons[row][col].config(text='')

    def on_click(self, row, col):
        # Handle selecting and moving pieces
        if self.selected_piece:
            self.move_or_attack(row, col)
        else:
            self.select_piece(row, col)

    
    def select_piece(self, row, col):
        """Ensure player selects their own unit and deselect the opponent's unit if needed."""
        piece = self.board[row][col]
        
        # Check if the piece belongs to the current player
        if piece and ((self.turn == 'P1' and piece.endswith('1')) or (self.turn == 'P2' and piece.endswith('2'))):
            self.selected_piece = (row, col)
        else:
            # Deselect if the selected piece doesn't belong to the current player
            self.selected_piece = None
            

    def move_or_attack(self, row, col):
        selected_row, selected_col = self.selected_piece
        piece = self.board[selected_row][selected_col]

        # Ensure the piece exists before acting
        if not piece:
            return  # Exit if there is no piece selected

        # Determine if the action is a move or an attack
        target_piece = self.board[row][col]
        if target_piece == '':  # If the target square is empty, it's a move
            self.move_piece(row, col)
        elif target_piece and target_piece.endswith('1') and self.turn == 'P2':  # Attack by Player 2 on Player 1's piece
            if self.is_valid_attack(selected_row, selected_col, row, col):
                self.attack_piece(row, col)
        elif target_piece and target_piece.endswith('2') and self.turn == 'P1':  # Attack by Player 1 on Player 2's piece
            if self.is_valid_attack(selected_row, selected_col, row, col):
                self.attack_piece(row, col)
                # Deselect the piece after move or attack
        self.selected_piece = None
        self.update_board()

    def move_piece(self, row, col):
        selected_row, selected_col = self.selected_piece
        piece = self.board[selected_row][selected_col]

        if not piece:
            return  # Ensure the piece exists before moving

        # Prevent movement onto blue squares (water)
        if self.buttons[row][col].cget('bg') == 'blue':
            messagebox.showinfo("Invalid Move", "You cannot move onto water (blue square)!")
            return

        if piece.startswith('GH'):  # General Hunter shares pawn movement
            if self.is_valid_pawn_move(selected_row, selected_col, row, col):
                self.board[row][col] = piece
                self.board[selected_row][selected_col] = ''
                self.move_count += 1
                self.end_turn_if_done()
        elif piece.startswith('GW'):  # General Warrior shares pawn movement
            if self.is_valid_pawn_move(selected_row, selected_col, row, col):
                self.board[row][col] = piece
                self.board[selected_row][selected_col] = ''
                self.move_count += 1
                self.end_turn_if_done()
        elif piece[0] == 'P':  # Pawn movement (1 space in any direction)
            if self.is_valid_pawn_move(selected_row, selected_col, row, col):
                self.board[row][col] = piece
                self.board[selected_row][selected_col] = ''
                self.move_count += 1
                self.end_turn_if_done()
        elif piece[0] == 'H':  # Horse movement (up to 3 spaces in cross or diagonal)
            if self.is_valid_horse_move(selected_row, selected_col, row, col):
                self.board[row][col] = piece
                self.board[selected_row][selected_col] = ''
                self.move_count += 1
                self.end_turn_if_done()
        elif piece[0] == 'A':  # Archer movement (1 space in any direction)
            if self.is_valid_archer_move(selected_row, selected_col, row, col):
                self.board[row][col] = piece
                self.board[selected_row][selected_col] = ''
                self.move_count += 1
                self.end_turn_if_done()
        elif piece[0] == 'GR':  # Horse movement (up to 3 spaces in cross or diagonal)
            if self.is_valid_horse_move(selected_row, selected_col, row, col):
                self.board[row][col] = piece
                self.board[selected_row][selected_col] = ''
                self.move_count += 1
                self.end_turn_if_done()

        # Deselect the piece
        self.selected_piece = None
        self.update_board()

    def is_valid_pawn_move(self, selected_row, selected_col, row, col):
        """Check if the pawn move is valid (only 1 space in cross or diagonal)."""
        return abs(row - selected_row) <= 1 and abs(col - selected_col) <= 1

    def is_valid_horse_move(self, selected_row, selected_col, row, col):
        """Check if the horse move is valid (up to 3 spaces in cross or diagonal)."""
        return (abs(row - selected_row) <= 3 and col == selected_col) or \
               (abs(col - selected_col) <= 3 and row == selected_row) or \
               (abs(row - selected_row) == abs(col - selected_col) and abs(row - selected_row) <= 3)

    def is_valid_archer_move(self, selected_row, selected_col, row, col):
        """Check if the archer move is valid (1 space in any direction)."""
        return abs(row - selected_row) <= 1 and abs(col - selected_col) <= 1

    def is_valid_attack(self, selected_row, selected_col, row, col):
        """Check if the attack is valid."""
        attacking_piece = self.board[selected_row][selected_col]

        # Towers cannot attack
        if attacking_piece.startswith('T'):
            messagebox.showinfo("Invalid Attack", "Towers cannot attack!")
            return False

        if attacking_piece and (attacking_piece[0] == 'A' or attacking_piece.startswith('GH')):  # Archer and General Hunter attack
            return self.is_valid_archer_attack(selected_row, selected_col, row, col)
        else:
            return abs(row - selected_row) <= 1 and abs(col - selected_col) <= 1  # Adjacent attack for others

    def is_valid_archer_attack(self, selected_row, selected_col, row, col):
        """Check if the archer attack is valid (1-4 spaces in cross direction for GH, 1-3 for A)."""
        if self.board[selected_row][selected_col].startswith('GH'):
            # GH has a range of 4 spaces
            return (selected_row == row and abs(col - selected_col) <= 4) or \
                   (selected_col == col and abs(row - selected_row) <= 4)
        else:
            # Normal archers have a range of 3 spaces
            return (selected_row == row and abs(col - selected_col) <= 3) or \
                   (selected_col == col and abs(row - selected_row) <= 3)

    def attack_piece(self, row, col):
        """Handle the attack action."""
        attacker_piece = self.board[self.selected_piece[0]][self.selected_piece[1]]
        defender_piece = self.board[row][col]

        if not attacker_piece or not defender_piece:
            return  # Exit if either the attacker or defender doesn't exist

        # Check red terrain effect for attacking units
        attacker_on_red = self.buttons[self.selected_piece[0]][self.selected_piece[1]].cget('bg') == 'red'

        # Towers cannot be hit from red terrain
        if defender_piece.startswith('T') and attacker_on_red:
            messagebox.showinfo("Invalid Attack", "You cannot attack a tower from red terrain!")
            return

          # Towers cannot initiate an attack and should not be able to counter-attack
        if defender_piece.startswith('T'):  # Check if it's a tower
            tower_id = defender_piece  # 'T1' for Player 1's tower, 'T2' for Player 2's tower
            
            # Determine the damage based on the attacker
            if attacker_piece.startswith('A') or attacker_piece.startswith('GH'):
                damage = 1  # Archer or General Hunter deals 1 point of damage
            elif attacker_piece.startswith('P') or attacker_piece.startswith('H') or attacker_piece.startswith('GW') or attacker_piece.startswith('GR'):
                damage = 2  # Pawns, Horses, or General Warrior deals 2 points of damage
            else:
                damage = 0  # No damage from other units (if any)

            # Apply the damage to the tower
            self.tower_hp[tower_id] -= damage
            messagebox.showinfo("Tower Hit", f"{attacker_piece} hit {defender_piece}! {defender_piece} has {self.tower_hp[tower_id]} HP left.")

            if self.tower_hp[tower_id] <= 0:
                # Tower is destroyed
                self.board[row][col] = ''  # Remove the tower from the board
                messagebox.showinfo("Tower Destroyed", f"{attacker_piece} destroyed {defender_piece}!")

            # After attacking the tower, deselect the piece and end the turn
            self.move_count = 2  # Consumes both actions
            self.selected_piece = None
            self.update_board()
            self.end_turn_if_done()
            self.check_game_end()
            return
        
        if defender_piece.startswith('GH'):
            if random.random() < 0.5 and not attacker_on_red:  # 50% chance of avoiding the attack, ignored by red terrain
                messagebox.showinfo("Miss", f"{attacker_piece} missed the attack on {defender_piece}!")
                self.move_count += 1
                self.end_turn_if_done()
                return  # Exit early, GH avoids the attack

        # General Warrior counter-attack logic
        if defender_piece.startswith('GW'):  
            if random.random() < 0.8 and not attacker_on_red:  # 80% chance of avoiding the attack
                messagebox.showinfo("Miss", f"{attacker_piece} missed the attack on {defender_piece}!")
                if attacker_piece[0] not in ['A', 'G']:  # Counter-attack if not Archer or General Hunter
                    self.perform_counter_attack(row, col, self.selected_piece[0], self.selected_piece[1])
                self.move_count += 1
                self.end_turn_if_done()
                return

        # Normal attack chance for other units
        if defender_piece[0] == 'P':  # Pawn has a 70% chance of avoiding the attack
            if random.random() < 0.7 and not attacker_on_red:
                messagebox.showinfo("Miss", f"{attacker_piece} missed the attack on {defender_piece}!")
                self.move_count += 1  # Even if it misses, it counts as a move
                self.end_turn_if_done()
                return
        elif defender_piece[0] == 'H':  # Horse has a 50% chance of avoiding the attack
            if random.random() < 0.5 and not attacker_on_red:
                messagebox.showinfo("Miss", f"{attacker_piece} missed the attack on {defender_piece}!")
                self.move_count += 1  # Even if it misses, it counts as a move
                self.end_turn_if_done()
                return
        elif defender_piece[0] == 'GR':  # General Horse has a 70% chance of avoiding the attack
            if random.random() < 0.7 and not attacker_on_red:
                messagebox.showinfo("Miss", f"{attacker_piece} missed the attack on {defender_piece}!")
                self.move_count += 1  # Even if it misses, it counts as a move
                self.end_turn_if_done()
                return
        elif defender_piece[0] == 'A':  # Archer is always hit
            pass  # No chance to miss

        # Check gray terrain effect for defending units
        defender_on_gray = self.buttons[row][col].cget('bg') == 'gray'
        if defender_on_gray:
            self.board[self.selected_piece[0]][self.selected_piece[1]] = ''  # Attacker also dies
            messagebox.showinfo("Gray Terrain Effect", f"{defender_piece} was on gray terrain, and {attacker_piece} also dies!")
        
        # If the attack hits, remove the defender
        self.board[row][col] = ''  # Defender is defeated
        messagebox.showinfo("Hit", f"{attacker_piece} defeated {defender_piece}!")

        # The attacker does not move, it stays in the original position
        self.move_count += 1

        # Deselect the piece
        self.selected_piece = None
        self.update_board()

        # End the turn if both moves are used
        self.end_turn_if_done()

        # Check if game has ended (if a tower or all other units are killed)
        self.check_game_end()

    def perform_counter_attack(self, defender_row, defender_col, attacker_row, attacker_col):
        """Perform the counter-attack for General Warrior."""
        if random.random() < 0.8:  # General Warrior has an 80% chance to hit in counter-attack
            self.board[attacker_row][attacker_col] = ''  # Eliminate the attacker
            self.update_board()
            messagebox.showinfo("Counter-Attack", f"General Warrior counter-attacked and defeated the attacker!")
        else:
            messagebox.showinfo("Counter-Attack Missed", "The General Warrior's counter-attack missed!")

        # Reset selected piece after counter-attack
        self.selected_piece = None
        self.move_count += 1  # Count the counter-attack as a move
        self.end_turn_if_done()

    def check_game_end(self):
        """Check if the game has ended."""
        p1_tower_exists = any('T1' in row for row in self.board)
        p2_tower_exists = any('T2' in row for row in self.board)

        # Check if any player has lost all other units (besides the tower)
        p1_has_units = any(piece.endswith('1') for row in self.board for piece in row if piece != 'T1')
        p2_has_units = any(piece.endswith('2') for row in self.board for piece in row if piece != 'T2')

        if not p1_tower_exists or not p1_has_units:
            self.end_game('P2')  # Player 2 wins
        elif not p2_tower_exists or not p2_has_units:
            self.end_game('P1')  # Player 1 wins

    def end_game(self, winner):
        """End the game and announce the winner."""
        winner_message = "Player 1 wins!" if winner == 'P1' else "Player 2 wins!"
        messagebox.showinfo("Game Over", winner_message)
        self.root.quit()  # Exit the game

    def end_turn_if_done(self):
        """Check if both moves are used, and if so, switch turns."""
        if self.move_count >= 2:
            self.move_count = 0
            self.turn = 'P2' if self.turn == 'P1' else 'P1'
            messagebox.showinfo("Turn Change", f"It's now {self.turn}'s turn!")

    def start(self):
        """Start the game loop."""
        self.root.mainloop()

# Create the game window
root = tk.Tk()
root.title("Chess Game")

# Create and start the game
game = ChessGame(root)
game.start()
