const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Configurar CORS para permitir que o frontend do Cloudflare Pages se conecte
app.use(cors({
  origin: '*' // Em produção, você pode restringir para a sua URL do Cloudflare Pages
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));

// Caminho do arquivo JSON legado para migração inicial
const QUIZZES_FILE = path.join(__dirname, 'quizzes.json');

// --- CONEXÃO E MODELOS DO MONGODB ---

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/quizdb';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Conectado ao MongoDB com sucesso!');
    await migrateLocalData();
  })
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err);
  });

// Esquema do Quiz
const QuizSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  questions: [{
    question: { type: String, required: true },
    options: [{ type: String, required: true }],
    correct: { type: Number, required: true },
    timeLimit: { type: Number, default: 20 }
  }]
});

const Quiz = mongoose.model('Quiz', QuizSchema);

// Esquema de Resultados (Ranking)
const ResultSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quizId: { type: String, required: true },
  quizTitle: { type: String, required: true },
  score: { type: Number, required: true },
  correctCount: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});

const Result = mongoose.model('Result', ResultSchema);

// Função para migrar dados do JSON para o MongoDB no primeiro boot
async function migrateLocalData() {
  try {
    const quizCount = await Quiz.countDocuments();
    if (quizCount === 0) {
      console.log('Nenhum quiz encontrado no MongoDB. Verificando arquivo local quizzes.json para migração...');
      if (fs.existsSync(QUIZZES_FILE)) {
        const fileContent = fs.readFileSync(QUIZZES_FILE, 'utf8');
        const localQuizzes = JSON.parse(fileContent);
        
        if (localQuizzes.length > 0) {
          await Quiz.insertMany(localQuizzes);
          console.log(`Migrados ${localQuizzes.length} quizzes do arquivo local para o MongoDB com sucesso!`);
        }
      } else {
        console.log('Arquivo quizzes.json não encontrado. Banco de dados inicializado vazio.');
      }
    }
  } catch (error) {
    console.error('Erro durante a migração de dados locais:', error);
  }
}

// --- ROTAS DA API ---

// 1. Obter todos os quizzes
app.get('/api/quizzes', async (req, res) => {
  try {
    const quizzes = await Quiz.find();
    res.json(quizzes);
  } catch (error) {
    console.error('Erro ao buscar quizzes no MongoDB:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar quizzes.' });
  }
});

// 2. Criar um novo quiz
app.post('/api/quizzes', async (req, res) => {
  try {
    const { title, description, questions } = req.body;
    
    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Dados inválidos. O quiz precisa de título e pelo menos uma pergunta.' });
    }
    
    // Criar slug simples para ID
    const id = title.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);

    const newQuiz = new Quiz({
      id,
      title,
      description: description || '',
      questions: questions.map(q => ({
        question: q.question,
        options: q.options,
        correct: parseInt(q.correct),
        timeLimit: parseInt(q.timeLimit) || 20
      }))
    });

    await newQuiz.save();
    res.status(201).json({ success: true, quiz: newQuiz });
  } catch (error) {
    console.error('Erro ao salvar novo quiz no MongoDB:', error);
    res.status(500).json({ error: 'Erro ao criar quiz no banco de dados.' });
  }
});

// 3. Obter ranking geral
app.get('/api/ranking', async (req, res) => {
  try {
    const results = await Result.find().sort({ score: -1, correctCount: -1 }).limit(50);
    res.json(results);
  } catch (error) {
    console.error('Erro ao buscar rankings no MongoDB:', error);
    res.status(500).json({ error: 'Erro ao buscar rankings.' });
  }
});

// 4. Salvar resultado individual (se reativado no futuro)
app.post('/api/ranking', async (req, res) => {
  try {
    const { name, quizId, quizTitle, score, correctCount, totalQuestions } = req.body;
    if (!name || !quizId || score === undefined) {
      return res.status(400).json({ error: 'Dados incompletos.' });
    }

    const newResult = new Result({
      name,
      quizId,
      quizTitle: quizTitle || quizId,
      score: parseInt(score),
      correctCount: parseInt(correctCount) || 0,
      totalQuestions: parseInt(totalQuestions) || 0
    });

    await newResult.save();
    res.status(201).json({ success: true, result: newResult });
  } catch (error) {
    console.error('Erro ao salvar resultado no MongoDB:', error);
    res.status(500).json({ error: 'Erro ao salvar resultado no banco de dados.' });
  }
});


// --- LÓGICA MULTIPLAYER (SOCKET.IO) ---

const rooms = {};

function generatePin() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms[pin]);
  return pin;
}

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // 1. HOST: Cria sala
  socket.on('createRoom', async ({ quizId }) => {
    try {
      const quiz = await Quiz.findOne({ id: quizId });

      if (!quiz) {
        socket.emit('errorMsg', 'Quiz não encontrado.');
        return;
      }

      const pin = generatePin();
      rooms[pin] = {
        hostSocketId: socket.id,
        quizId: quizId,
        quiz: quiz,
        status: 'lobby',
        players: [],
        currentQuestionIndex: -1,
        questionStartTime: 0,
        answersReceivedCount: 0,
        activeAnswers: {}
      };

      socket.join(pin);
      socket.emit('roomCreated', { pin, quizTitle: quiz.title, totalQuestions: quiz.questions.length });
      console.log(`Sala criada: ${pin} para o quiz ${quiz.title}`);
    } catch (error) {
      console.error('Erro ao criar sala:', error);
      socket.emit('errorMsg', 'Erro interno no servidor ao carregar sala.');
    }
  });

  // 2. PLAYER: Entra na sala
  socket.on('joinRoom', ({ pin, name }) => {
    const room = rooms[pin];
    if (!room) {
      socket.emit('joinError', 'Sala não encontrada. Verifique o PIN.');
      return;
    }

    if (room.status !== 'lobby') {
      socket.emit('joinError', 'O jogo já começou nesta sala.');
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      socket.emit('joinError', 'Digite um nome válido.');
      return;
    }

    const nameExists = room.players.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (nameExists) {
      socket.emit('joinError', 'Este nome já está sendo usado nesta sala.');
      return;
    }

    const newPlayer = {
      socketId: socket.id,
      name: cleanName,
      score: 0,
      correctCount: 0,
      lastQuestionPoints: 0,
      lastAnswerCorrect: false
    };

    room.players.push(newPlayer);
    socket.join(pin);
    
    socket.emit('joinSuccess', { pin, name: cleanName, quizTitle: room.quiz.title });

    io.to(room.hostSocketId).emit('updatePlayers', room.players.map(p => p.name));
    console.log(`Jogador ${cleanName} entrou na sala ${pin}`);
  });

  // 3. HOST: Inicia a partida
  socket.on('startGame', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostSocketId !== socket.id) return;

    if (room.players.length === 0) {
      socket.emit('errorMsg', 'Não é possível iniciar sem jogadores.');
      return;
    }

    room.status = 'playing';
    room.currentQuestionIndex = 0;
    
    sendQuestion(pin);
  });

  // Enviar a pergunta atual
  function sendQuestion(pin) {
    const room = rooms[pin];
    if (!room) return;

    const questionIndex = room.currentQuestionIndex;
    const question = room.quiz.questions[questionIndex];

    room.status = 'playing';
    room.answersReceivedCount = 0;
    room.activeAnswers = {};
    room.questionStartTime = Date.now();

    room.players.forEach(p => {
      p.lastQuestionPoints = 0;
      p.lastAnswerCorrect = false;
    });

    io.to(room.hostSocketId).emit('nextQuestionHost', {
      question: question.question,
      options: question.options,
      correct: question.correct,
      timeLimit: question.timeLimit,
      questionIndex: questionIndex,
      totalQuestions: room.quiz.questions.length,
      playerCount: room.players.length
    });

    io.to(pin).except(room.hostSocketId).emit('nextQuestionPlayer', {
      question: question.question,
      options: question.options,
      timeLimit: question.timeLimit,
      questionIndex: questionIndex,
      totalQuestions: room.quiz.questions.length
    });
  }

  // 4. PLAYER: Envia resposta
  socket.on('submitAnswer', ({ pin, optionIndex }) => {
    const room = rooms[pin];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    if (room.activeAnswers[socket.id] !== undefined) return;

    const timeLimit = room.quiz.questions[room.currentQuestionIndex].timeLimit;
    const timeTakenMs = Date.now() - room.questionStartTime;
    const timeTakenSec = Math.min(timeLimit, timeTakenMs / 1000);

    room.activeAnswers[socket.id] = {
      optionIndex: parseInt(optionIndex),
      timeTaken: timeTakenSec
    };

    room.answersReceivedCount++;

    io.to(room.hostSocketId).emit('updateAnswersCount', {
      count: room.answersReceivedCount,
      total: room.players.length
    });

    if (room.answersReceivedCount === room.players.length) {
      endQuestion(pin);
    }
  });

  // 5. HOST: Tempo esgotado
  socket.on('timeExpired', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostSocketId !== socket.id || room.status !== 'playing') return;
    endQuestion(pin);
  });

  // Encerrar a rodada de pergunta
  function endQuestion(pin) {
    const room = rooms[pin];
    if (!room || room.status !== 'playing') return;

    room.status = 'question_over';
    const qIndex = room.currentQuestionIndex;
    const question = room.quiz.questions[qIndex];
    const correctOption = question.correct;
    const timeLimit = question.timeLimit;

    room.players.forEach(p => {
      const answer = room.activeAnswers[p.socketId];
      if (answer && answer.optionIndex === correctOption) {
        const speedBonus = 1 - (answer.timeTaken / timeLimit);
        const pointsGained = Math.round(500 + (500 * Math.max(0, speedBonus)));
        
        p.score += pointsGained;
        p.correctCount++;
        p.lastQuestionPoints = pointsGained;
        p.lastAnswerCorrect = true;
      } else {
        p.lastQuestionPoints = 0;
        p.lastAnswerCorrect = false;
      }
    });

    const stats = [0, 0, 0, 0];
    Object.values(room.activeAnswers).forEach(ans => {
      if (ans.optionIndex >= 0 && ans.optionIndex < 4) {
        stats[ans.optionIndex]++;
      }
    });
    const unanswered = room.players.length - room.answersReceivedCount;

    const sortedLeaderboard = [...room.players]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(p => ({ name: p.name, score: p.score, lastGained: p.lastQuestionPoints }));

    io.to(room.hostSocketId).emit('questionFinishedHost', {
      correctOption: correctOption,
      stats: stats,
      unanswered: unanswered,
      leaderboard: sortedLeaderboard
    });

    room.players.forEach(p => {
      io.to(p.socketId).emit('questionFinishedPlayer', {
        correct: p.lastAnswerCorrect,
        pointsGained: p.lastQuestionPoints,
        totalScore: p.score,
        correctOptionText: question.options[correctOption]
      });
    });
  }

  // 6. HOST: Avançar
  socket.on('nextStep', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostSocketId !== socket.id || room.status !== 'question_over') return;

    room.currentQuestionIndex++;

    if (room.currentQuestionIndex < room.quiz.questions.length) {
      sendQuestion(pin);
    } else {
      room.status = 'finished';
      
      const podium = [...room.players]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((p, index) => ({
          rank: index + 1,
          name: p.name,
          score: p.score,
          correctCount: p.correctCount
        }));

      io.to(room.hostSocketId).emit('gameFinishedHost', { podium });

      const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
      sortedPlayers.forEach((p, index) => {
        io.to(p.socketId).emit('gameFinishedPlayer', {
          rank: index + 1,
          totalPlayers: room.players.length,
          score: p.score,
          correctCount: p.correctCount,
          totalQuestions: room.quiz.questions.length
        });
      });

      console.log(`Jogo finalizado na sala ${pin}. Pódio enviado.`);
    }
  });

  // 7. DESCONEXÃO
  socket.on('disconnect', () => {
    for (const pin in rooms) {
      const room = rooms[pin];
      
      if (room.hostSocketId === socket.id) {
        io.to(pin).emit('hostDisconnected');
        delete rooms[pin];
        console.log(`Sala ${pin} encerrada porque o Host desconectou.`);
        break;
      } else {
        const index = room.players.findIndex(p => p.socketId === socket.id);
        if (index !== -1) {
          const playerName = room.players[index].name;
          room.players.splice(index, 1);
          console.log(`Jogador ${playerName} saiu da sala ${pin}`);
          
          if (room.status === 'lobby') {
            io.to(room.hostSocketId).emit('updatePlayers', room.players.map(p => p.name));
          } else if (room.status === 'playing') {
            if (room.activeAnswers[socket.id] === undefined) {
              io.to(room.hostSocketId).emit('updateAnswersCount', {
                count: room.answersReceivedCount,
                total: room.players.length
              });
              
              if (room.answersReceivedCount === room.players.length && room.players.length > 0) {
                endQuestion(pin);
              }
            }
          }
          break;
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta http://localhost:${PORT}`);
});
