// Firebase variables (will be populated by Canvas environment)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app, db, auth, userId;
let unsubscribeGameListener = null; // To manage Firestore real-time listener

// Initialize Firebase
async function initializeFirebase() {
    if (!firebaseConfig) {
        console.error("Firebase config not available. Online features will be disabled.");
        document.getElementById('online-controls').style.display = 'none';
        return;
    }
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.getFirestore(app);
    auth = firebase.getAuth(app);

    firebase.onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            document.getElementById('user-id-display').textContent = `Votre ID: ${userId}`;
        } else {
            // Sign in anonymously if no initial token or user is not signed in
            try {
                if (initialAuthToken) {
                    await firebase.signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await firebase.signInAnonymously(auth);
                }
                userId = auth.currentUser.uid;
                document.getElementById('user-id-display').textContent = `Votre ID: ${userId}`;
            } catch (error) {
                console.error("Firebase authentication error:", error);
                document.getElementById('user-id-display').textContent = `Votre ID: Erreur de connexion`;
                document.getElementById('online-controls').style.display = 'none';
            }
        }
    });
}

class TicTacToeAI {
    constructor(boardSize, winCondition) {
        this.boardSize = boardSize;
        this.winCondition = winCondition;
        this.maxMinimaxDepth = this.calculateMaxMinimaxDepth();
    }

    calculateMaxMinimaxDepth() {
        if (this.boardSize <= 5) return 4;
        if (this.boardSize <= 8) return 3;
        if (this.boardSize <= 13) return 2;
        return 1;
    }

    /**
     * Checks if a player has won the game.
     * @param {Array<Array<string>>} board - The 2D game board.
     * @param {string} player - The player to check ('X' or 'O').
     * @returns {Object|null} {winner: boolean, line: Array<{x: number, y: number}>} or null if no win.
     */
    checkWinner(board, player) {
        const N = this.boardSize;
        const K = this.winCondition;

        const directions = [
            [1, 0], // horizontal
            [0, 1], // vertical
            [1, 1], // diagonal down-right
            [1, -1] // diagonal up-right
        ];

        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                if (board[r][c] !== player) continue;

                for (const [dx, dy] of directions) {
                    let count = 0;
                    const currentLine = [];
                    for (let i = 0; i < K; i++) {
                        const nx = c + i * dx;
                        const ny = r + i * dy;
                        if (nx >= 0 && nx < N && ny >= 0 && ny < N && board[ny][nx] === player) {
                            count++;
                            currentLine.push({ x: nx, y: ny });
                        } else {
                            break;
                        }
                    }
                    if (count === K) return { winner: true, line: currentLine };
                }
            }
        }
        return null;
    }

    /**
     * Evaluates the board heuristically for the current player.
     * Assigns scores based on potential winning lines and blocking opportunities.
     * @param {Array<Array<string>>} board - The 2D game board.
     * @param {string} playerChar - The AI player character.
     * @returns {number} The evaluated score of the board.
     */
    evaluateBoard(board, playerChar) {
        const opponentChar = playerChar === 'X' ? 'O' : 'X';
        let score = 0;

        const directions = [
            [1, 0], [0, 1], [1, 1], [1, -1]
        ];

        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                for (const [dx, dy] of directions) {
                    let playerCount = 0;
                    let opponentCount = 0;
                    let emptyCount = 0;
                    let blockedByPlayer = false;
                    let blockedByOpponent = false;

                    // Check a line segment of length winCondition
                    for (let i = 0; i < this.winCondition; i++) {
                        const nx = x + i * dx;
                        const ny = y + i * dy;

                        if (nx >= 0 && nx < this.boardSize && ny >= 0 && ny < this.boardSize) {
                            if (board[ny][nx] === playerChar) {
                                playerCount++;
                            } else if (board[ny][nx] === opponentChar) {
                                opponentCount++;
                            } else {
                                emptyCount++;
                            }
                        } else {
                            // Out of bounds acts as a block
                            // Check the immediate adjacent cells outside the current K-length segment
                            const prevX = x - dx;
                            const prevY = y - dy;
                            const nextX = x + this.winCondition * dx;
                            const nextY = y + this.winCondition * dy;

                            if (prevX >= 0 && prevX < this.boardSize && prevY >= 0 && prevY < this.boardSize && board[prevY][prevX] === opponentChar) {
                                blockedByOpponent = true;
                            }
                            if (nextX >= 0 && nextX < this.boardSize && nextY >= 0 && nextY < this.boardSize && board[nextY][nextX] === opponentChar) {
                                blockedByOpponent = true;
                            }
                            if (prevX >= 0 && prevX < this.boardSize && prevY >= 0 && prevY < this.boardSize && board[prevY][prevX] === playerChar) {
                                blockedByPlayer = true;
                            }
                            if (nextX >= 0 && nextX < this.boardSize && nextY >= 0 && nextY < this.boardSize && board[nextY][nextX] === playerChar) {
                                blockedByPlayer = true;
                            }
                        }
                    }

                    // If a line is formed by the current player and not blocked by opponent
                    if (playerCount > 0 && opponentCount === 0 && !blockedByOpponent) {
                        if (playerCount === this.winCondition) score += 1000000;
                        else if (playerCount === this.winCondition - 1 && emptyCount >= 1) score += 50000;
                        else if (playerCount === this.winCondition - 2 && emptyCount >= 2) score += 5000;
                        else if (playerCount === this.winCondition - 3 && emptyCount >= 3) score += 500;
                    }
                    // If a line is formed by the opponent and not blocked by AI
                    else if (opponentCount > 0 && playerCount === 0 && !blockedByPlayer) {
                        if (opponentCount === this.winCondition) score -= 900000;
                        else if (opponentCount === this.winCondition - 1 && emptyCount >= 1) score -= 40000;
                        else if (opponentCount === this.winCondition - 2 && emptyCount >= 2) score -= 4000;
                        else if (opponentCount === this.winCondition - 3 && emptyCount >= 3) score -= 400;
                    }
                }
            }
        }
        return score;
    }

    /**
     * Get all empty cells as possible moves.
     * @param {Array<Array<string>>} board - The 2D game board.
     * @returns {Array<{x: number, y: number}>} An array of available moves.
     */
    getAvailableMoves(board) {
        const moves = [];
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                if (board[y][x] === '') {
                    moves.push({ x, y });
                }
            }
        }
        return moves;
    }

    /**
     * Helper to check if a move creates a win for a player.
     * @param {Array<Array<string>>} tempBoard - The 2D game board (a copy).
     * @param {{x: number, y: number}} move - The move to test.
     * @param {string} char - The player character to check for win.
     * @returns {boolean} True if the move creates a win, false otherwise.
     */
    createsWin(tempBoard, move, char) {
        tempBoard[move.y][move.x] = char;
        const win = this.checkWinner(tempBoard, char);
        tempBoard[move.y][move.x] = ''; // Undo move
        return win ? win.winner : false;
    }

    /**
     * Heuristic function for quick critical moves (win, block, fork, advanced blocking).
     * @param {Array<Array<string>>} board - The 2D game board.
     * @param {string} playerChar - The AI player character.
     * @param {string} opponentChar - The opponent player character.
     * @returns {{x: number, y: number}|null} The best heuristic move, or null.
     */
    heuristicMove(board, playerChar, opponentChar) {
        const moves = this.getAvailableMoves(board);
        if (moves.length === 0) return null;

        const N = this.boardSize;
        const K = this.winCondition;
        const directions = [
            [1, 0], [0, 1], [1, 1], [1, -1]
        ];

        // 1. Check for immediate winning move (AI)
        for (const move of moves) {
            if (this.createsWin(board, move, playerChar)) {
                return move;
            }
        }

        // 2. Check for immediate blocking move (Opponent's win)
        for (const move of moves) {
            if (this.createsWin(board, move, opponentChar)) {
                return move;
            }
        }

        // 3. Look for AI's own forks (creating two potential winning lines of K-1)
        for (const move of moves) {
            board[move.y][move.x] = playerChar;
            let potentialWins = 0;
            for (const [dr, dc] of directions) {
                let count = 0;
                let empty = 0;
                let blocked = false;

                for (let i = 0; i < K; i++) {
                    const nr = move.y + i * dr;
                    const nc = move.x + i * dc;
                    if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
                        if (board[nr][nc] === playerChar) count++;
                        else if (board[nr][nc] === '') empty++;
                        else { blocked = true; break; }
                    } else { blocked = true; break; }
                }
                if (!blocked && count >= K - 1 && empty >= 1) {
                    potentialWins++;
                }
            }
            board[move.y][move.x] = ''; // Undo move
            if (potentialWins >= 2) {
                return move;
            }
        }

        // 4. Block opponent's forks (opponent creating two potential winning lines of K-1)
        for (const move of moves) {
            board[move.y][move.x] = opponentChar;
            let opponentPotentialWins = 0;
            for (const [dr, dc] of directions) {
                let count = 0;
                let empty = 0;
                let blocked = false;

                for (let i = 0; i < K; i++) {
                    const nr = move.y + i * dr;
                    const nc = move.x + i * dc;
                    if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
                        if (board[nr][nc] === opponentChar) count++;
                        else if (board[nr][nc] === '') empty++;
                        else { blocked = true; break; }
                    } else { blocked = true; break; }
                }
                if (!blocked && count >= K - 1 && empty >= 1) {
                    opponentPotentialWins++;
                }
            }
            board[move.y][move.x] = ''; // Undo move
            if (opponentPotentialWins >= 2) {
                return move;
            }
        }

        // 5. Prioritize blocking opponent's K-2 threats (e.g., 4 in a row for K=6)
        // This targets patterns like OOO_O, OO_OO, O_OOO where blocking one empty spot prevents a K-1 threat.
        for (const move of moves) {
            const r = move.y;
            const c = move.x;

            // Temporarily place AI's piece to see if it blocks a significant opponent threat
            board[r][c] = playerChar;
            const scoreAfterBlocking = this.evaluateBoard(board, opponentChar); // Evaluate opponent's score after our block
            board[r][c] = ''; // Undo our temporary move

            // Temporarily place opponent's piece to see how threatening the line becomes if we DON'T block
            board[r][c] = opponentChar;
            const scoreIfOpponentPlaysHere = this.evaluateBoard(board, opponentChar);
            board[r][c] = ''; // Undo opponent's temporary move

            // If placing our piece significantly reduces opponent's score (i.e., blocks a strong threat)
            // and the opponent's score would have been very negative (indicating a strong threat).
            // The threshold -3000 is chosen as an example for K-2 threats.
            if (scoreIfOpponentPlaysHere < -3000 && scoreAfterBlocking > scoreIfOpponentPlaysHere && board[r][c] === '') {
                 return move;
            }
        }

        // 6. Prioritize moves that extend existing lines or create strong threats for AI
        let bestOffensiveMove = null;
        let maxOffensiveScore = -Infinity;

        for (const move of moves) {
            board[move.y][move.x] = playerChar;
            const score = this.evaluateBoard(board, playerChar);
            board[move.y][move.x] = '';

            if (score > maxOffensiveScore) {
                maxOffensiveScore = score;
                bestOffensiveMove = move;
            }
        }
        // Return the best offensive move if it's significantly good.
        // The threshold (-5000) is arbitrary and can be tuned. It means we won't pick a move
        // that leads to a very bad state for the AI, even if it's the "best offensive" one.
        if (bestOffensiveMove !== null && maxOffensiveScore > -5000) {
            return bestOffensiveMove;
        }

        // Fallback: center or random if no critical or strong offensive move
        const center = Math.floor(N / 2);
        if (board[center][center] === '') {
            return { y: center, x: center };
        }

        // If center is taken, pick a random available move
        return moves[Math.floor(Math.random() * moves.length)];
    }


    /**
     * Minimax algorithm with alpha-beta pruning.
     * @param {Array<Array<string>>} board - The 2D game board.
     * @param {number} depth - Current depth of the search tree.
     * @param {number} alpha - Alpha value for pruning.
     * @param {number} beta - Beta value for pruning.
     * @param {boolean} maximizingPlayer - True if current player is maximizing, false otherwise.
     * @param {string} playerChar - The AI player character.
     * @param {string} opponentChar - The opponent player character.
     * @returns {{score: number, move?: {x: number, y: number}}} The best score and corresponding move.
     */
    minimax(board, depth, alpha, beta, maximizingPlayer, playerChar, opponentChar) {
        const winnerPlayer = this.checkWinner(board, playerChar);
        const winnerOpponent = this.checkWinner(board, opponentChar);

        if (winnerPlayer) return { score: 100000 - depth };
        if (winnerOpponent) return { score: depth - 100000 };
        if (this.getAvailableMoves(board).length === 0) return { score: 0 };

        if (depth === 0) {
            return { score: this.evaluateBoard(board, playerChar) };
        }

        let moves = this.getAvailableMoves(board);

        // Sort moves to try more promising ones first (improves alpha-beta pruning efficiency)
        moves.sort((a, b) => {
            // Temporarily make the move to evaluate its score
            board[a.y][a.x] = maximizingPlayer ? playerChar : opponentChar;
            const scoreA = this.evaluateBoard(board, playerChar); // Evaluate from AI's perspective
            board[a.y][a.x] = ''; // Undo the temporary move

            board[b.y][b.x] = maximizingPlayer ? playerChar : opponentChar;
            const scoreB = this.evaluateBoard(board, playerChar);
            board[b.y][b.x] = '';
            return (maximizingPlayer ? scoreB - scoreA : scoreA - scoreB); // Maximize for AI, minimize for opponent
        });


        if (maximizingPlayer) {
            let maxEval = -Infinity;
            let bestMove = null;
            for (const move of moves) {
                board[move.y][move.x] = playerChar;
                const evalResult = this.minimax(board, depth - 1, alpha, beta, false, playerChar, opponentChar);
                board[move.y][move.x] = '';

                if (evalResult.score > maxEval) {
                    maxEval = evalResult.score;
                    bestMove = move;
                }
                alpha = Math.max(alpha, evalResult.score);
                if (beta <= alpha) break; // Alpha-beta pruning
            }
            return { score: maxEval, move: bestMove };
        } else {
            let minEval = Infinity;
            let bestMove = null;
            for (const move of moves) {
                board[move.y][move.x] = opponentChar;
                const evalResult = this.minimax(board, depth - 1, alpha, beta, true, playerChar, opponentChar);
                board[move.y][move.x] = '';

                if (evalResult.score < minEval) {
                    minEval = evalResult.score;
                    bestMove = move;
                }
                beta = Math.min(beta, evalResult.score);
                if (beta <= alpha) break; // Alpha-beta pruning
            }
            return { score: minEval, move: bestMove };
        }
    }

    /**
     * Get the best move for the AI player.
     * @param {Array<Array<string>>} board - The 2D game board.
     * @param {string} playerChar - The AI player character.
     * @returns {{x: number, y: number}|null} The best move coordinates, or null.
     */
    getSmartMove(board, playerChar) {
        const opponentChar = playerChar === 'X' ? 'O' : 'X';
        const availableMoves = this.getAvailableMoves(board);
        if (availableMoves.length === 0) return null;

        // 1. First, check for immediate critical moves using heuristic
        const criticalMove = this.heuristicMove(board, playerChar, opponentChar);
        if (criticalMove) {
            console.log("AI played a critical move (win/block/fork/advanced block).");
            return criticalMove;
        }

        // 2. If no immediate critical move, use Minimax for deeper analysis
        let currentDepth = this.maxMinimaxDepth;
        const emptyCellsCount = availableMoves.length;
        const totalCells = this.boardSize * this.boardSize;

        // Dynamically adjust depth based on available moves (game progress)
        // Deeper search in mid-game when fewer moves are available
        if (emptyCellsCount > totalCells * 0.75) { // Early game, limit depth
            currentDepth = Math.min(currentDepth, 2);
        } else if (emptyCellsCount > totalCells * 0.5) { // Mid game, slightly deeper
            currentDepth = Math.min(currentDepth, 3);
        } else { // Late game, can go deeper
            currentDepth = this.maxMinimaxDepth;
        }


        console.log(`AI launching Minimax with depth: ${currentDepth}`);
        const { move } = this.minimax(board, currentDepth, -Infinity, Infinity, true, playerChar, opponentChar);

        if (move) {
            return move;
        } else {
            console.warn("Minimax failed to find a move, falling back to simple heuristic.");
            // Fallback to a random move if minimax somehow fails to find anything
            return availableMoves[Math.floor(Math.random() * availableMoves.length)];
        }
    }
}

let currentBoardSize = parseInt(document.getElementById('board-size-input').value);
let currentWinCondition = parseInt(document.getElementById('win-condition-input').value);

const gameBoardContainer = document.getElementById('game-board-container');
const gameBoardElement = document.getElementById('game-board');
const themeSelector = document.getElementById('theme-selector');
const aiLevelSelector = document.getElementById('ai-level-selector');
const resetButton = document.getElementById('reset-button');
const undoButton = document.getElementById('undo-button');
const hintButton = document.getElementById('hint-button');
const gameStatusDisplay = document.getElementById('game-status');
const gameModal = document.getElementById('game-modal');
const modalTitle = document.getElementById('modal-title');
const modalCloseButton = document.getElementById('modal-close-button');
const winningLineSvg = document.getElementById('winning-line-svg');
const boardSizeInput = document.getElementById('board-size-input');
const winConditionInput = document.getElementById('win-condition-input');

const scoreXDisplay = document.getElementById('score-x');
const scoreODisplay = document.getElementById('score-o');
const scoreDrawsDisplay = document.getElementById('score-draws');

// Online elements
const createGameButton = document.getElementById('create-game-button');
const joinGameButton = document.getElementById('join-game-button');
const leaveGameButton = document.getElementById('leave-game-button');
const gameIdInput = document.getElementById('game-id-input');
const gameIdDisplay = document.getElementById('game-id-display');
const playerRolesDisplay = document.getElementById('player-roles-display');

let board = [];
let currentPlayer = 'X';
let aiPlayer = 'O';
let gameOver = false;
let aiInstance;
let movesHistory = [];
let scores = { 'X': 0, 'O': 0, 'Draws': 0 };

let gameMode = 'ai';
let onlineGameId = null;
let playerRole = null;

// Map for winning line colors based on theme
const themeWinningLineColors = {
    'theme-retro': '#a67c00',
    'theme-punk': '#ff00ff',
    'theme-matrix': '#00ff00',
    'theme-gemini': '#fdbb2d',
    'theme-ocean': '#e0f7fa',
    'theme-sunset': '#4a2c2a',
    'theme-forest': '#dcedc1',
    'theme-neon': '#fff',
    'theme-classique': 'gold',
    'theme-space1': '#88aaff',
    'theme-space2': '#ff99ff',
    'theme-space3': '#ff8c00',
    'theme-vintage-comic': '#000',
    'theme-cyberpunk': '#00ff00',
    'theme-chalkboard': '#f0f0f0',
    'theme-lava': '#ffa500',
    'theme-pixel-art': '#f1c40f',
    'theme-rpg-fantasy': '#ffd700',
};

// Function to update board grid CSS
function updateBoardGridCSS() {
    gameBoardElement.style.gridTemplateColumns = `repeat(${currentBoardSize}, minmax(30px, 1fr))`;
    gameBoardElement.style.gridTemplateRows = `repeat(${currentBoardSize}, minmax(30px, 1fr))`;
    gameBoardContainer.style.width = `calc(${currentBoardSize} * 40px + ${currentBoardSize - 1} * 2px + 10px)`;
    gameBoardContainer.style.maxWidth = `90vw`;
    gameBoardContainer.style.aspectRatio = `1 / 1`;
}

/**
 * Converts a 1D board array to a 2D array.
 * @param {Array<string>} flatBoard - The 1D board array.
 * @returns {Array<Array<string>>} The 2D board array.
 */
function convertTo2D(flatBoard) {
    const b2d = [];
    for (let i = 0; i < currentBoardSize; i++) {
        b2d.push(flatBoard.slice(i * currentBoardSize, (i + 1) * currentBoardSize));
    }
    return b2d;
}

/**
 * Displays a custom modal message.
 * @param {string} message - The message to display.
 */
function showModal(message) {
    modalTitle.textContent = message;
    gameModal.style.display = 'flex';
}

/**
 * Hides the custom modal message.
 */
function hideModal() {
    gameModal.style.display = 'none';
}

/**
 * Updates the game status display.
 * @param {string} message - The message to display.
 */
function updateGameStatus(message) {
    gameStatusDisplay.innerHTML = message;
}

/**
 * Updates the score display.
 */
function updateScoreDisplay() {
    scoreXDisplay.textContent = `Joueur X: ${scores['X']}`;
    scoreODisplay.textContent = `Joueur O: ${scores['O']}`;
    scoreDrawsDisplay.textContent = `Nuls: ${scores['Draws']}`;
}

/**
 * Clears any winning lines drawn on the SVG.
 */
function clearWinningLine() {
    winningLineSvg.innerHTML = '';
    // Remove winning-cell-highlight from all cells
    gameBoardElement.querySelectorAll('.cell.winning-cell-highlight').forEach(cell => {
        cell.classList.remove('winning-cell-highlight');
    });
}

/**
 * Draws a line on the SVG to highlight the winning sequence.
 * @param {Array<{x: number, y: number}>} line - Array of winning cell coordinates.
 */
function drawWinningLine(line) {
    clearWinningLine();
    if (line.length < 2) return;

    const cells = gameBoardElement.querySelectorAll('.cell');
    const firstCell = cells[line[0].y * currentBoardSize + line[0].x];
    const lastCell = cells[line[line.length - 1].y * currentBoardSize + line[line.length - 1].x];

    if (!firstCell || !lastCell) return;

    const boardRect = gameBoardElement.getBoundingClientRect();
    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();

    // Calculate coordinates relative to the SVG container (which is same as board element)
    const x1 = (firstRect.left + firstRect.right) / 2 - boardRect.left;
    const y1 = (firstRect.top + firstRect.bottom) / 2 - boardRect.top;
    const x2 = (lastRect.left + lastRect.right) / 2 - boardRect.left;
    const y2 = (lastRect.top + lastRect.bottom) / 2 - boardRect.top;

    const lineElement = document.createElementNS("http://www.w3.org/2000/svg", "line");
    lineElement.setAttribute("x1", x1);
    lineElement.setAttribute("y1", y1);
    lineElement.setAttribute("x2", x2);
    lineElement.setAttribute("y2", y2);

    const currentTheme = document.body.className;
    const lineColor = themeWinningLineColors[currentTheme] || 'gold'; // Default to gold
    lineElement.style.stroke = lineColor;

    winningLineSvg.appendChild(lineElement);

    // Add highlight to winning cells
    line.forEach(coord => {
        const cellIndex = coord.y * currentBoardSize + coord.x;
        const cell = gameBoardElement.querySelector(`[data-index="${cellIndex}"]`);
        if (cell) {
            cell.classList.add('winning-cell-highlight');
        }
    });
}

/**
 * Initializes the game board and state.
 */
function createBoard() {
    // Validate inputs
    currentBoardSize = parseInt(boardSizeInput.value);
    currentWinCondition = parseInt(winConditionInput.value);

    if (isNaN(currentBoardSize) || currentBoardSize < 3 || currentBoardSize > 20) {
        showModal("La taille du plateau doit être entre 3 et 20.");
        boardSizeInput.value = 13;
        currentBoardSize = 13;
    }
    if (isNaN(currentWinCondition) || currentWinCondition < 3 || currentWinCondition > currentBoardSize) {
        showModal(`La condition de victoire doit être entre 3 et ${currentBoardSize}.`);
        winConditionInput.value = Math.min(6, currentBoardSize);
        currentWinCondition = Math.min(6, currentBoardSize);
    }

    aiInstance = new TicTacToeAI(currentBoardSize, currentWinCondition); // Re-initialize AI with new size
    updateBoardGridCSS(); // Update CSS for new board size

    board = Array(currentBoardSize * currentBoardSize).fill('');
    gameBoardElement.innerHTML = '';
    for (let i = 0; i < currentBoardSize * currentBoardSize; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.setAttribute('role', 'gridcell');
        cell.dataset.index = i;
        cell.addEventListener('click', onCellClick);
        gameBoardElement.appendChild(cell);
    }
    currentPlayer = 'X';
    gameOver = false;
    movesHistory = []; // Reset history
    clearWinningLine();
    updateBoardUI();
    updateGameStatus(`C'est au tour de ${currentPlayer}`);

    // Reset online game state
    onlineGameId = null;
    playerRole = null;
    gameIdDisplay.textContent = `ID de la partie: Aucune`;
    playerRolesDisplay.textContent = '';
    leaveGameButton.style.display = 'none';
    if (unsubscribeGameListener) {
        unsubscribeGameListener();
        unsubscribeGameListener = null;
    }
}

/**
 * Updates the UI to reflect the current board state.
 */
function updateBoardUI() {
    const cells = gameBoardElement.querySelectorAll('.cell');
    cells.forEach((cell, idx) => {
        let playerMark = cell.querySelector('.player-mark');
        if (playerMark) {
            cell.removeChild(playerMark);
        }
        cell.classList.remove('x', 'o', 'hint-highlight', 'winning-cell-highlight'); // Remove all highlights

        if (board[idx] !== '') {
            playerMark = document.createElement('span');
            playerMark.classList.add('player-mark');
            playerMark.textContent = board[idx];
            cell.appendChild(playerMark);

            if (board[idx] === 'X') {
                cell.classList.add('x');
            } else if (board[idx] === 'O') {
                cell.classList.add('o');
            }
        }
    });
}

/**
 * Checks if the board is completely full.
 * @param {Array<string>} currentBoard - The 1D board array.
 * @returns {boolean} True if the board is full, false otherwise.
 */
function isBoardFull(currentBoard) {
    return currentBoard.every(cell => cell !== '');
}

/**
 * Makes a move on the board.
 * @param {number} index - The 1D index of the cell.
 * @param {string} player - The player making the move.
 * @param {boolean} isOnlineUpdate - True if this move comes from an online update.
 */
async function makeMove(index, player, isOnlineUpdate = false) {
    if (gameOver || board[index] !== '') {
        return false;
    }

    if (gameMode === 'online' && !isOnlineUpdate && player !== playerRole) {
        showModal("Ce n'est pas votre tour ou vous n'êtes pas ce joueur.");
        return false;
    }

    board[index] = player;
    movesHistory.push({ index, player });
    updateBoardUI();
    clearWinningLine();

    const winnerInfo = aiInstance.checkWinner(convertTo2D(board), player);
    if (winnerInfo && winnerInfo.winner) {
        showModal(`${player} a gagné !`);
        updateGameStatus(`${player} a gagné !`);
        drawWinningLine(winnerInfo.line);
        scores[player]++;
        updateScoreDisplay();
        gameOver = true;
        if (onlineGameId && !isOnlineUpdate) {
            await firebase.updateDoc(firebase.doc(db, `artifacts/${appId}/public/data/games`, onlineGameId), {
                board: board,
                currentPlayer: player === 'X' ? 'O' : 'X',
                status: `${player}_wins`,
                lastMove: { index, player },
                movesHistory: movesHistory
            });
        }
        return true;
    }
    if (isBoardFull(board)) {
        showModal('Match nul !');
        updateGameStatus('Match nul !');
        scores['Draws']++;
        updateScoreDisplay();
        gameOver = true;
        if (onlineGameId && !isOnlineUpdate) {
            await firebase.updateDoc(firebase.doc(db, `artifacts/${appId}/public/data/games`, onlineGameId), {
                board: board,
                currentPlayer: player === 'X' ? 'O' : 'X',
                status: 'draw',
                lastMove: { index, player },
                movesHistory: movesHistory
            });
        }
        return true;
    }

    currentPlayer = player === 'X' ? 'O' : 'X';
    updateGameStatus(`C'est au tour de ${currentPlayer}`);

    if (onlineGameId && !isOnlineUpdate) {
        await firebase.updateDoc(firebase.doc(db, `artifacts/${appId}/public/data/games`, onlineGameId), {
            board: board,
            currentPlayer: currentPlayer,
            lastMove: { index, player },
            movesHistory: movesHistory
        });
    }

    return true;
}

/**
 * Handles a cell click by the human player.
 * @param {Event} e - The click event.
 */
async function onCellClick(e) {
    if (gameOver) return;
    const index = parseInt(e.target.dataset.index);

    if (gameMode === 'ai') {
        if (currentPlayer === 'X') {
            const moveMade = await makeMove(index, currentPlayer);
            if (moveMade && !gameOver) {
                updateGameStatus(`C'est au tour de ${aiPlayer} <span class="loading-spinner"></span>`);
                setTimeout(aiMove, 500);
            }
        }
    } else if (gameMode === 'human') {
        await makeMove(index, currentPlayer);
    } else if (gameMode === 'online') {
        if (currentPlayer === playerRole) {
            await makeMove(index, currentPlayer);
        } else {
            showModal("Ce n'est pas votre tour ou vous n'êtes pas ce joueur.");
        }
    }
}

/**
 * Handles the AI's move.
 */
async function aiMove() {
    if (gameOver) return;

    const b2d = convertTo2D(board);
    const move = aiInstance.getSmartMove(b2d, aiPlayer);

    if (move) {
        const index = move.y * currentBoardSize + move.x;
        await makeMove(index, aiPlayer);
    } else {
        showModal('Match nul !');
        updateGameStatus('Match nul !');
        scores['Draws']++;
        updateScoreDisplay();
        gameOver = true;
    }
}

/**
 * Undoes the last move(s).
 */
function undoLastMove() {
    if (gameOver || movesHistory.length === 0) return;

    if (gameMode === 'ai') {
        if (movesHistory.length >= 2) {
            const lastAIMove = movesHistory.pop();
            const lastPlayerMove = movesHistory.pop();
            board[lastAIMove.index] = '';
            board[lastPlayerMove.index] = '';
            currentPlayer = 'X';
        } else if (movesHistory.length === 1) {
            const lastPlayerMove = movesHistory.pop();
            board[lastPlayerMove.index] = '';
            currentPlayer = 'X';
        }
    } else if (gameMode === 'human') {
        if (movesHistory.length >= 1) {
            const lastMove = movesHistory.pop();
            board[lastMove.index] = '';
                    currentPlayer = lastMove.player; // Correctly restore the turn to the player who undid the move
        }
    } else if (gameMode === 'online') {
        showModal("L'annulation n'est pas prise en charge en mode en ligne pour le moment.");
        return;
    }

    gameOver = false;
    clearWinningLine();
    updateBoardUI();
    updateGameStatus(`C'est au tour de ${currentPlayer}`);
}

/**
 * Provides a hint for the current player's best move.
 */
async function getHint() {
    if (gameOver || gameMode !== 'ai' || currentPlayer === aiPlayer) return;

    updateGameStatus(`Calcul de l'indice... <span class="loading-spinner"></span>`);
    const b2d = convertTo2D(board);
    const hintMove = aiInstance.getSmartMove(b2d, currentPlayer);

    if (hintMove) {
        const index = hintMove.y * currentBoardSize + hintMove.x;
        const cell = gameBoardElement.querySelector(`[data-index="${index}"]`);
        if (cell) {
            cell.classList.add('hint-highlight');
            setTimeout(() => {
                cell.classList.remove('hint-highlight');
            }, 1500);
        }
        updateGameStatus(`C'est au tour de ${currentPlayer}`);
    } else {
        updateGameStatus(`Aucun indice disponible.`);
    }
}

// --- Online Play Functions ---

/**
 * Creates a new online game.
 */
async function createOnlineGame() {
    if (!db) {
        showModal("Firebase n'est pas initialisé. Les fonctionnalités en ligne sont désactivées.");
        return;
    }
    if (onlineGameId) {
        showModal("Vous êtes déjà dans une partie en ligne. Quittez d'abord.");
        return;
    }

    try {
        const gameRef = await firebase.addDoc(firebase.collection(db, `artifacts/${appId}/public/data/games`), {
            board: Array(currentBoardSize * currentBoardSize).fill(''),
            currentPlayer: 'X',
            playerXId: userId,
            playerOId: null,
            status: 'waiting',
            boardSize: currentBoardSize,
            winCondition: currentWinCondition,
            createdAt: firebase.serverTimestamp(),
            lastMove: null,
            movesHistory: []
        });
        onlineGameId = gameRef.id;
        playerRole = 'X';
        gameMode = 'online';
        gameIdDisplay.textContent = `ID de la partie: ${onlineGameId}`;
        playerRolesDisplay.textContent = `Vous êtes Joueur X (ID: ${userId.substring(0, 8)}...)`;
        leaveGameButton.style.display = 'inline-block';
        showModal(`Partie créée ! Partagez l'ID: ${onlineGameId}`);
        listenToGameChanges(onlineGameId);
        createBoard();
    } catch (error) {
        console.error("Erreur lors de la création de la partie en ligne:", error);
        showModal("Erreur lors de la création de la partie en ligne.");
    }
}

/**
 * Joins an existing online game.
 */
async function joinOnlineGame() {
    if (!db) {
        showModal("Firebase n'est pas initialisé. Les fonctionnalités en ligne sont désactivées.");
        return;
    }
    if (onlineGameId) {
        showModal("Vous êtes déjà dans une partie en ligne. Quittez d'abord.");
        return;
    }

    const idToJoin = gameIdInput.value.trim();
    if (!idToJoin) {
        showModal("Veuillez entrer un ID de partie.");
        return;
    }

    try {
        const gameDocRef = firebase.doc(db, `artifacts/${appId}/public/data/games`, idToJoin);
        const gameDoc = await firebase.getDoc(gameDocRef);

        if (!gameDoc.exists()) {
            showModal("Partie non trouvée.");
            return;
        }

        const gameData = gameDoc.data();

        if (gameData.playerXId === userId || gameData.playerOId === userId) {
            showModal("Vous êtes déjà dans cette partie.");
            onlineGameId = idToJoin;
            playerRole = (gameData.playerXId === userId) ? 'X' : 'O';
            gameMode = 'online';
            gameIdDisplay.textContent = `ID de la partie: ${onlineGameId}`;
            playerRolesDisplay.textContent = `Vous êtes Joueur ${playerRole} (ID: ${userId.substring(0, 8)}...)`;
            leaveGameButton.style.display = 'inline-block';
            listenToGameChanges(onlineGameId);
            board = gameData.board;
            currentPlayer = gameData.currentPlayer;
            currentBoardSize = gameData.boardSize;
            currentWinCondition = gameData.winCondition;
            movesHistory = gameData.movesHistory || [];
            gameOver = (gameData.status === 'X_wins' || gameData.status === 'O_wins' || gameData.status === 'draw');
            aiInstance = new TicTacToeAI(currentBoardSize, currentWinCondition);
            updateBoardGridCSS();
            updateBoardUI();
            updateGameStatus(`C'est au tour de ${currentPlayer}`);
            if (gameOver) {
                const winner = gameData.status.split('_')[0];
                if (winner === 'X' || winner === 'O') {
                    const winnerInfo = aiInstance.checkWinner(convertTo2D(board), winner);
                    if (winnerInfo) drawWinningLine(winnerInfo.line);
                }
            }
            return;
        }

        if (gameData.playerOId && gameData.playerOId !== userId) {
            showModal("Cette partie est déjà pleine.");
            return;
        }

        await firebase.updateDoc(gameDocRef, {
            playerOId: userId,
            status: 'playing'
        });
        onlineGameId = idToJoin;
        playerRole = 'O';
        gameMode = 'online';
        gameIdDisplay.textContent = `ID de la partie: ${onlineGameId}`;
        playerRolesDisplay.textContent = `Vous êtes Joueur O (ID: ${userId.substring(0, 8)}...)`;
        leaveGameButton.style.display = 'inline-block';
        showModal(`Vous avez rejoint la partie ${onlineGameId} en tant que Joueur O.`);
        listenToGameChanges(onlineGameId);
        createBoard();
    } catch (error) {
        console.error("Erreur lors de la tentative de rejoindre la partie:", error);
        showModal("Erreur lors de la tentative de rejoindre la partie.");
    }
}

/**
 * Leaves the current online game.
 */
async function leaveOnlineGame() {
    if (!onlineGameId) return;

    try {
        const gameDocRef = firebase.doc(db, `artifacts/${appId}/public/data/games`, onlineGameId);
        const gameDoc = await firebase.getDoc(gameDocRef);

        if (gameDoc.exists()) {
            const gameData = gameDoc.data();
            if (gameData.playerXId === userId) {
                await firebase.updateDoc(gameDocRef, { playerXId: null, status: 'waiting' });
            } else if (gameData.playerOId === userId) {
                await firebase.updateDoc(gameDocRef, { playerOId: null, status: 'waiting' });
            }
            if (!gameData.playerXId && !gameData.playerOId) {
                await firebase.deleteDoc(gameDocRef);
            }
        }

        if (unsubscribeGameListener) {
            unsubscribeGameListener();
            unsubscribeGameListener = null;
        }
        onlineGameId = null;
        playerRole = null;
        gameMode = aiLevelSelector.value === 'minimax' ? 'ai' : 'human';
        gameIdDisplay.textContent = `ID de la partie: Aucune`;
        playerRolesDisplay.textContent = '';
        leaveGameButton.style.display = 'none';
        showModal("Vous avez quitté la partie en ligne.");
        createBoard();
    } catch (error) {
        console.error("Erreur lors de la tentative de quitter la partie:", error);
        showModal("Erreur lors de la tentative de quitter la partie.");
    }
}

/**
 * Listens to real-time changes in the Firestore game document.
 * @param {string} gameId - The ID of the game document.
 */
function listenToGameChanges(gameId) {
    if (unsubscribeGameListener) {
        unsubscribeGameListener();
    }
    const gameDocRef = firebase.doc(db, `artifacts/${appId}/public/data/games`, gameId);
    unsubscribeGameListener = firebase.onSnapshot(gameDocRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            const gameData = docSnapshot.data();
            board = gameData.board;
            currentPlayer = gameData.currentPlayer;
            currentBoardSize = gameData.boardSize;
            currentWinCondition = gameData.winCondition;
            movesHistory = gameData.movesHistory || [];
            gameOver = (gameData.status === 'X_wins' || gameData.status === 'O_wins' || gameData.status === 'draw');

            if (aiInstance.boardSize !== currentBoardSize || aiInstance.winCondition !== currentWinCondition) {
                aiInstance = new TicTacToeAI(currentBoardSize, currentWinCondition);
                updateBoardGridCSS();
            }

            updateBoardUI();
            if (gameOver) {
                updateGameStatus(`Partie terminée: ${gameData.status.replace('_', ' ')}`);
                const winner = gameData.status.split('_')[0];
                if (winner === 'X' || winner === 'O') {
                    const winnerInfo = aiInstance.checkWinner(convertTo2D(board), winner);
                    if (winnerInfo) drawWinningLine(winnerInfo.line);
                }
            } else {
                updateGameStatus(`C'est au tour de ${currentPlayer}`);
            }

            let rolesText = `Joueur X: ${gameData.playerXId ? gameData.playerXId.substring(0, 8) + '...' : 'En attente'}`;
            rolesText += ` | Joueur O: ${gameData.playerOId ? gameData.playerOId.substring(0, 8) + '...' : 'En attente'}`;
            playerRolesDisplay.textContent = rolesText;

        } else {
            showModal("La partie en ligne a été supprimée ou n'existe plus.");
            leaveOnlineGame();
        }
    }, (error) => {
        console.error("Erreur d'écoute Firestore:", error);
        showModal("Erreur de connexion à la partie en ligne.");
        leaveOnlineGame();
    });
}


// --- Event Listeners ---

boardSizeInput.addEventListener('change', createBoard);
winConditionInput.addEventListener('change', createBoard);

themeSelector.addEventListener('change', (e) => {
    document.body.className = e.target.value;
});

aiLevelSelector.addEventListener('change', (e) => {
    gameMode = e.target.value === 'minimax' ? 'ai' : 'human';
    createBoard();
    if (gameMode === 'human') {
        showModal("Mode Joueur vs Joueur (Local) activé. Le joueur X commence.");
    } else {
        showModal("Mode IA activé. Le joueur X commence.");
    }
});

resetButton.addEventListener('click', createBoard);
undoButton.addEventListener('click', undoLastMove);
hintButton.addEventListener('click', getHint);
modalCloseButton.addEventListener('click', hideModal);
createGameButton.addEventListener('click', createOnlineGame);
joinGameButton.addEventListener('click', joinOnlineGame);
leaveGameButton.addEventListener('click', leaveOnlineGame);

initializeFirebase().then(() => {
    createBoard();
    updateScoreDisplay();
});