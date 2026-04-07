// Connexion Socket.io
const socket = io();

// Vérifier les paramètres URL pour auto-join
const urlParams = new URLSearchParams(window.location.search);
const gameCodeFromUrl = urlParams.get('game');

// Éléments du DOM
const screens = {
    welcome: document.getElementById('welcome-screen'),
    waiting: document.getElementById('waiting-screen'),
    game: document.getElementById('game-screen'),
    disconnect: document.getElementById('disconnect-screen')
};

const elements = {
    playerName: document.getElementById('player-name'),
    createGameBtn: document.getElementById('create-game-btn'),
    gameCodeInput: document.getElementById('game-code-input'),
    joinGameBtn: document.getElementById('join-game-btn'),
    displayGameCode: document.getElementById('display-game-code'),
    copyCodeBtn: document.getElementById('copy-code-btn'),
    roundNumber: document.getElementById('round-number'),
    player1Info: document.getElementById('player1-info'),
    player2Info: document.getElementById('player2-info'),
    choiceArea: document.getElementById('choice-area'),
    waitingChoice: document.getElementById('waiting-choice'),
    yourChoice: document.getElementById('your-choice'),
    resultArea: document.getElementById('result-area'),
    p1Name: document.getElementById('p1-name'),
    p2Name: document.getElementById('p2-name'),
    p1Choice: document.getElementById('p1-choice'),
    p2Choice: document.getElementById('p2-choice'),
    resultMessage: document.getElementById('result-message'),
    nextRoundBtn: document.getElementById('next-round-btn'),
    chatMessages: document.getElementById('chat-messages'),
    messageInput: document.getElementById('message-input'),
    sendMessageBtn: document.getElementById('send-message-btn'),
    restartBtn: document.getElementById('restart-btn'),
    disconnectMessage: document.getElementById('disconnect-message'),
    reconnectingOverlay: document.getElementById('reconnecting-overlay')
};

// État du jeu
let gameState = {
    gameCode: null,
    playerName: null,
    myChoice: null,
    opponentName: null
};

// Vérifier s'il y a une partie sauvegardée pour reconnexion
let savedGameData = null;
const savedGameStr = localStorage.getItem('currentGame');
if (savedGameStr) {
    try {
        savedGameData = JSON.parse(savedGameStr);
        gameState.gameCode = savedGameData.gameCode;
        gameState.playerName = savedGameData.playerName;
    } catch (e) {
        localStorage.removeItem('currentGame');
    }
}

// Icônes pour les choix
const choiceIcons = {
    pierre: '✊',
    feuille: '✋',
    ciseaux: '✌️'
};

// Fonctions utilitaires
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
    });
    screens[screenName].classList.add('active');
}

function showError(message) {
    alert(message);
}

// Créer une partie
elements.createGameBtn.addEventListener('click', () => {
    const playerName = elements.playerName.value.trim();
    if (!playerName) {
        showError('Veuillez entrer votre pseudo');
        return;
    }
    gameState.playerName = playerName;
    socket.emit('createGame', playerName);
});

// Rejoindre une partie
elements.joinGameBtn.addEventListener('click', () => {
    const playerName = elements.playerName.value.trim();
    const gameCode = elements.gameCodeInput.value.trim().toUpperCase();

    if (!playerName) {
        showError('Veuillez entrer votre pseudo');
        return;
    }
    if (!gameCode) {
        showError('Veuillez entrer le code de la partie');
        return;
    }

    gameState.playerName = playerName;
    gameState.gameCode = gameCode;
    socket.emit('joinGame', { gameCode, playerName });
});

// Événements Socket.io
socket.on('gameCreated', ({ gameCode, playerName }) => {
    gameState.gameCode = gameCode;

    // Sauvegarder pour la reconnexion
    localStorage.setItem('currentGame', JSON.stringify({ gameCode, playerName }));

    // Générer le lien complet
    const gameLink = `${window.location.origin}?game=${gameCode}`;
    elements.displayGameCode.textContent = gameLink;

    showScreen('waiting');
});

socket.on('gameJoined', ({ players, gameCode }) => {
    // Sauvegarder pour la reconnexion
    localStorage.setItem('currentGame', JSON.stringify({ gameCode, playerName: gameState.playerName }));

    // Trouver mon index et celui de l'adversaire
    const myIndex = players.findIndex(p => p.name === gameState.playerName);
    const opponentIndex = myIndex === 0 ? 1 : 0;

    // Moi à gauche (mon nom), adversaire à droite
    elements.player1Info.querySelector('.player-name').textContent = players[myIndex].name;
    elements.player2Info.querySelector('.player-name').textContent = players[opponentIndex].name;

    // Sauvegarder le nom de l'adversaire
    gameState.opponentName = players[opponentIndex].name;

    showScreen('game');
});

// Reconnexion
socket.on('playerReconnected', ({ players, gameCode }) => {
    // Masquer l'overlay de reconnexion
    elements.reconnectingOverlay.classList.add('hidden');

    // Réinitialiser l'interface
    const myIndex = players.findIndex(p => p.name === gameState.playerName);
    const opponentIndex = myIndex === 0 ? 1 : 0;

    elements.player1Info.querySelector('.player-name').textContent = players[myIndex].name;
    elements.player2Info.querySelector('.player-name').textContent = players[opponentIndex].name;
    elements.player1Info.querySelector('.player-score').textContent = players[myIndex].score;
    elements.player2Info.querySelector('.player-score').textContent = players[opponentIndex].score;

    gameState.opponentName = players[opponentIndex].name;

    // Masquer l'écran de déconnexion et afficher le jeu
    showScreen('game');
});

// Un joueur est en train de se reconnecter
socket.on('playerReconnecting', ({ playerName }) => {
    // Afficher un message temporaire
    elements.disconnectMessage.textContent = `${playerName} tente de se reconnecter...`;
});

// Tenter de se reconnecter si une partie existe
if (savedGameData && gameCodeFromUrl === savedGameData.gameCode) {
    socket.emit('reconnectGame', savedGameData);
}

socket.on('error', (message) => {
    showError(message);
});

socket.on('opponentChoosing', () => {
    // L'adversaire a fait son choix, on attend le nôtre
});

// Gestion des choix
document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('selected')) return;

        const choice = btn.dataset.choice;
        gameState.myChoice = choice;

        // Animation de sélection
        document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        // Envoyer le choix au serveur
        socket.emit('makeChoice', {
            gameCode: gameState.gameCode,
            choice: choice
        });

        // Afficher la zone d'attente
        elements.yourChoice.textContent = choiceIcons[choice];
        elements.choiceArea.classList.add('hidden');
        elements.waitingChoice.classList.remove('hidden');
    });
});

// Recevoir les résultats
socket.on('roundResult', ({ choices, winner, scores, round, isGameEnd }) => {
    // Trouver mon choix et celui de l'adversaire
    const myChoiceData = choices.find(c => c.name === gameState.playerName);
    const opponentChoiceData = choices.find(c => c.name !== gameState.playerName);

    // Moi à gauche, adversaire à droite
    elements.p1Name.textContent = myChoiceData.name;
    elements.p2Name.textContent = opponentChoiceData.name;
    elements.p1Choice.textContent = choiceIcons[myChoiceData.choice];
    elements.p2Choice.textContent = choiceIcons[opponentChoiceData.choice];

    // Trouver mes scores et ceux de l'adversaire
    const myScore = scores.find(s => s.name === gameState.playerName);
    const opponentScore = scores.find(s => s.name !== gameState.playerName);

    // Mettre à jour les scores
    elements.player1Info.querySelector('.player-score').textContent = myScore.score;
    elements.player2Info.querySelector('.player-score').textContent = opponentScore.score;

    // Déterminer le message de résultat
    let message = '';
    let resultClass = '';

    if (winner === null) {
        message = 'Égalité!';
        resultClass = 'draw';
    } else if (winner === gameState.playerName) {
        message = 'Vous avez gagné!';
        resultClass = 'win';
    } else {
        message = `${winner} gagne!`;
        resultClass = 'lose';
    }

    // Ajouter info manche
    message += ` (Manche ${round}/5)`;

    // Si fin de partie
    if (isGameEnd) {
        const finalWinner = scores[0].score > scores[1].score ? scores[0].name :
                           scores[1].score > scores[0].score ? scores[1].name : null;

        if (finalWinner) {
            const winnerScore = scores.find(s => s.name === finalWinner).score;
            const loserScore = scores.find(s => s.name !== finalWinner)?.score || 0;

            if (finalWinner === gameState.playerName) {
                message = `🎉 Vous avez gagné la partie! ${winnerScore} - ${loserScore}`;
                resultClass = 'win';
            } else {
                message = `${finalWinner} gagne la partie! ${winnerScore} - ${loserScore}`;
                resultClass = 'lose';
            }
        } else {
            message = `Partie terminée! Égalité ${scores[0].score} - ${scores[1].score}`;
            resultClass = 'draw';
        }

        // Nettoyer le localStorage à la fin de la partie
        localStorage.removeItem('currentGame');

        elements.nextRoundBtn.textContent = 'Nouvelle partie';
        elements.nextRoundBtn.onclick = () => {
            socket.emit('restartGame', gameState.gameCode);
        };
    }

    elements.resultMessage.textContent = message;
    elements.resultMessage.className = 'result-message ' + resultClass;

    // Afficher les résultats
    elements.waitingChoice.classList.add('hidden');
    elements.resultArea.classList.remove('hidden');
});

// Manche suivante
elements.nextRoundBtn.addEventListener('click', () => {
    socket.emit('newRound', gameState.gameCode);
});

socket.on('startNewRound', ({ round }) => {
    elements.roundNumber.textContent = round;
    elements.resultArea.classList.add('hidden');
    elements.choiceArea.classList.remove('hidden');
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
    gameState.myChoice = null;
});

socket.on('gameRestarted', ({ players }) => {
    // Trouver mon index et celui de l'adversaire
    const myIndex = players.findIndex(p => p.name === gameState.playerName);
    const opponentIndex = myIndex === 0 ? 1 : 0;

    // Réinitialiser l'interface - moi à gauche, adversaire à droite
    elements.player1Info.querySelector('.player-name').textContent = players[myIndex].name;
    elements.player2Info.querySelector('.player-name').textContent = players[opponentIndex].name;
    elements.roundNumber.textContent = '1';
    elements.player1Info.querySelector('.player-score').textContent = '0';
    elements.player2Info.querySelector('.player-score').textContent = '0';
    elements.nextRoundBtn.textContent = 'Manche suivante';
    elements.nextRoundBtn.onclick = () => {
        socket.emit('newRound', gameState.gameCode);
    };
    elements.resultArea.classList.add('hidden');
    elements.choiceArea.classList.remove('hidden');
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
    gameState.myChoice = null;
});

// Chat
function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message) return;

    socket.emit('sendMessage', {
        gameCode: gameState.gameCode,
        message: message
    });

    elements.messageInput.value = '';
}

elements.sendMessageBtn.addEventListener('click', sendMessage);
elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

socket.on('newMessage', ({ sender, message, isSystem }) => {
    const messageDiv = document.createElement('div');

    if (isSystem) {
        // Message système (centré)
        messageDiv.className = 'message system';
        messageDiv.innerHTML = `<div class="text">${escapeHtml(message)}</div>`;
    } else {
        // Message normal
        const isMe = sender === gameState.playerName;
        messageDiv.className = `message ${isMe ? 'sent' : 'received'}`;
        messageDiv.innerHTML = `
            ${!isMe ? `<div class="sender">${sender}</div>` : ''}
            <div class="text">${escapeHtml(message)}</div>
        `;
    }

    elements.chatMessages.appendChild(messageDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Copier le lien
elements.copyCodeBtn.addEventListener('click', () => {
    const gameLink = elements.displayGameCode.textContent;
    navigator.clipboard.writeText(gameLink);
    elements.copyCodeBtn.textContent = 'Copié!';
    setTimeout(() => {
        elements.copyCodeBtn.textContent = 'Copier le lien';
    }, 2000);
});

// Déconnexion de l'adversaire
socket.on('playerDisconnected', () => {
    // Nettoyer le localStorage
    localStorage.removeItem('currentGame');
    elements.disconnectMessage.textContent = 'Votre adversaire s\'est déconnecté.';
    showScreen('disconnect');
});

// Déconnexion du serveur
socket.on('disconnect', () => {
    // Afficher l'overlay de reconnexion si on est en jeu
    if (gameState.gameCode && gameState.playerName) {
        elements.reconnectingOverlay.classList.remove('hidden');
    }
});

socket.on('connect', () => {
    // Masquer l'overlay de reconnexion
    elements.reconnectingOverlay.classList.add('hidden');

    // Si on a une partie en cours, tenter de se reconnecter
    if (gameState.gameCode && gameState.playerName) {
        socket.emit('reconnectGame', {
            gameCode: gameState.gameCode,
            playerName: gameState.playerName
        });
    }
});

elements.restartBtn.addEventListener('click', () => {
    localStorage.removeItem('currentGame');
    location.reload();
});

// Auto-join si un code de partie est dans l'URL
if (gameCodeFromUrl) {
    elements.gameCodeInput.value = gameCodeFromUrl;

    // Afficher automatiquement la section de connexion
    elements.playerName.focus();
}