const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Stockage des parties
const games = {};

// Nombre de manches par partie
const MAX_ROUNDS = 5;

// Délai de déconnexion (en ms) - 10 secondes pour permettre la reconnexion
const DISCONNECT_TIMEOUT = 10000;

// Générer un code de partie
function generateGameCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('Utilisateur connecté:', socket.id);

    // Reconnexion à une partie existante
    socket.on('reconnectGame', ({ gameCode, playerName }) => {
        const game = games[gameCode];
        if (!game) {
            socket.emit('error', 'Partie non trouvée');
            return;
        }

        const player = game.players.find(p => p.name === playerName);
        if (player && player.disconnected) {
            // Annuler le timeout de déconnexion
            if (player.disconnectTimeout) {
                clearTimeout(player.disconnectTimeout);
            }

            // Mettre à jour l'ID du socket
            player.id = socket.id;
            player.disconnected = false;
            socket.join(gameCode);
            socket.gameCode = gameCode;

            // Informer que le joueur s'est reconnecté
            io.to(gameCode).emit('playerReconnected', {
                players: game.players.map(p => ({ name: p.name, score: p.score })),
                gameCode,
                reconnectedPlayer: playerName
            });

            // Envoyer un message système dans le chat
            io.to(gameCode).emit('newMessage', {
                sender: 'System',
                message: `${playerName} s'est reconnecté.`,
                timestamp: Date.now(),
                isSystem: true
            });
        }
    });

    // Créer une nouvelle partie
    socket.on('createGame', (playerName) => {
        const gameCode = generateGameCode();
        games[gameCode] = {
            players: [{
                id: socket.id,
                name: playerName,
                choice: null,
                score: 0
            }],
            currentRound: 1,
            chat: [],
            status: 'waiting'
        };
        socket.join(gameCode);
        socket.gameCode = gameCode;
        socket.emit('gameCreated', { gameCode, playerName });
    });

    // Rejoindre une partie existante
    socket.on('joinGame', ({ gameCode, playerName }) => {
        const game = games[gameCode];
        if (!game) {
            socket.emit('error', 'Partie non trouvée');
            return;
        }
        if (game.players.length >= 2) {
            socket.emit('error', 'Partie déjà complète');
            return;
        }

        game.players.push({
            id: socket.id,
            name: playerName,
            choice: null,
            score: 0
        });
        socket.join(gameCode);
        socket.gameCode = gameCode;
        game.status = 'playing';

        // Informer les deux joueurs
        io.to(gameCode).emit('gameJoined', {
            players: game.players.map(p => ({ name: p.name, score: p.score })),
            gameCode
        });
    });

    // Faire un choix
    socket.on('makeChoice', ({ gameCode, choice }) => {
        const game = games[gameCode];
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (player) {
            player.choice = choice;
        }

        // Vérifier si les deux joueurs ont choisi
        if (game.players.every(p => p.choice !== null)) {
            // Calculer le gagnant
            const [p1, p2] = game.players;
            const winner = determineWinner(p1, p2);

            if (winner) {
                winner.score++;
            }

            // Vérifier si c'est la fin de la partie (5 manches)
            const isGameEnd = game.currentRound >= MAX_ROUNDS;

            // Envoyer les résultats
            io.to(gameCode).emit('roundResult', {
                choices: game.players.map(p => ({ name: p.name, choice: p.choice })),
                winner: winner ? winner.name : null,
                scores: game.players.map(p => ({ name: p.name, score: p.score })),
                round: game.currentRound,
                isGameEnd: isGameEnd
            });

            if (!isGameEnd) {
                // Réinitialiser pour la prochaine manche
                game.players.forEach(p => p.choice = null);
                game.currentRound++;
            }
        } else {
            // Informer l'autre joueur qu'on attend son choix
            socket.to(gameCode).emit('opponentChoosing');
        }
    });

    // Envoyer un message de chat
    socket.on('sendMessage', ({ gameCode, message }) => {
        const game = games[gameCode];
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player) return;

        const chatMessage = {
            sender: player.name,
            message: message,
            timestamp: Date.now()
        };

        game.chat.push(chatMessage);
        io.to(gameCode).emit('newMessage', chatMessage);
    });

    // Nouvelle manche
    socket.on('newRound', (gameCode) => {
        const game = games[gameCode];
        if (game) {
            io.to(gameCode).emit('startNewRound', { round: game.currentRound });
        }
    });

    // Nouvelle partie
    socket.on('restartGame', (gameCode) => {
        const game = games[gameCode];
        if (game) {
            // Réinitialiser les scores et les choix
            game.players.forEach(p => {
                p.score = 0;
                p.choice = null;
            });
            game.currentRound = 1;

            // Informer les deux joueurs
            io.to(gameCode).emit('gameRestarted', {
                players: game.players.map(p => ({ name: p.name, score: 0 }))
            });
        }
    });

    // Déconnexion - avec délai pour permettre la reconnexion
    socket.on('disconnect', () => {
        if (socket.gameCode) {
            const game = games[socket.gameCode];
            if (game) {
                const playerId = socket.id;
                const player = game.players.find(p => p.id === playerId);

                if (player) {
                    // Marquer le joueur comme déconnecté temporairement
                    player.disconnected = true;

                    // Informer l'autre joueur que le joueur est en cours de reconnexion
                    socket.to(socket.gameCode).emit('playerReconnecting', {
                        playerName: player.name
                    });

                    // Envoyer un message système dans le chat
                    io.to(socket.gameCode).emit('newMessage', {
                        sender: 'System',
                        message: `${player.name} tente de se reconnecter...`,
                        timestamp: Date.now(),
                        isSystem: true
                    });

                    player.disconnectTimeout = setTimeout(() => {
                        // Après le délai, vérifier si le joueur ne s'est pas reconnecté
                        const currentGame = games[socket.gameCode];
                        if (currentGame) {
                            const currentPlayer = currentGame.players.find(p => p.id === playerId);
                            if (currentPlayer && currentPlayer.disconnected) {
                                // Le joueur ne s'est pas reconnecté, fin de partie
                                io.to(socket.gameCode).emit('playerDisconnected');
                                delete games[socket.gameCode];
                            }
                        }
                    }, DISCONNECT_TIMEOUT);
                }
            }
        }
    });
});

function determineWinner(p1, p2) {
    const choices = p1.choice + p2.choice;

    if (p1.choice === p2.choice) return null; // Égalité

    const wins = {
        'pierre': 'ciseaux',
        'feuille': 'pierre',
        'ciseaux': 'feuille'
    };

    if (wins[p1.choice] === p2.choice) return p1;
    return p2;
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});