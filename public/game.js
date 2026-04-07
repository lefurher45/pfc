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
    restartBtn: document.getElementById('restart-btn')
};

// État du jeu
let gameState = {
    gameCode: null,
    playerName: null,
    myChoice: null
};

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

    // Générer le lien complet
    const gameLink = `${window.location.origin}?game=${gameCode}`;
    elements.displayGameCode.textContent = gameLink;

    showScreen('waiting');
});

socket.on('gameJoined', ({ players, gameCode }) => {
    elements.player1Info.querySelector('.player-name').textContent = players[0].name;
    elements.player2Info.querySelector('.player-name').textContent = players[1].name;
    showScreen('game');
});

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
    const [p1, p2] = choices;

    // Mettre à jour les noms et choix
    elements.p1Name.textContent = p1.name;
    elements.p2Name.textContent = p2.name;
    elements.p1Choice.textContent = choiceIcons[p1.choice];
    elements.p2Choice.textContent = choiceIcons[p2.choice];

    // Mettre à jour les scores
    elements.player1Info.querySelector('.player-score').textContent = scores[0].score;
    elements.player2Info.querySelector('.player-score').textContent = scores[1].score;

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
    // Réinitialiser l'interface
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

socket.on('newMessage', ({ sender, message }) => {
    const messageDiv = document.createElement('div');
    const isMe = sender === gameState.playerName;

    messageDiv.className = `message ${isMe ? 'sent' : 'received'}`;
    messageDiv.innerHTML = `
        ${!isMe ? `<div class="sender">${sender}</div>` : ''}
        <div class="text">${escapeHtml(message)}</div>
    `;

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

// Déconnexion
socket.on('playerDisconnected', () => {
    showScreen('disconnect');
});

elements.restartBtn.addEventListener('click', () => {
    location.reload();
});

// Auto-join si un code de partie est dans l'URL
if (gameCodeFromUrl) {
    elements.gameCodeInput.value = gameCodeFromUrl;

    // Afficher automatiquement la section de connexion
    elements.playerName.focus();
}