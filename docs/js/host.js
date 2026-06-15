// Configuração do servidor
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : '74.220.48.0/24'; // TODO: Substitua pela URL do seu backend no Render

let socket;
let roomPin = null;
let currentQuizTitle = "";
let timerInterval = null;
let currentQuestionTimeLimit = 20;
let remainingTime = 20;

// Elementos DOM
const selectQuizSection = document.getElementById('select-quiz-section');
const hostQuizList = document.getElementById('host-quiz-list');
const lobbySection = document.getElementById('lobby-section');
const pinCodeDisplay = document.getElementById('pin-code');
const playersCountDisplay = document.getElementById('players-count');
const playersListContainer = document.getElementById('players-list');
const startGameBtn = document.getElementById('start-game-btn');

const questionSection = document.getElementById('question-section');
const hostQuestionIndex = document.getElementById('host-question-index');
const hostQuestionText = document.getElementById('host-question-text');
const hostOptionsGrid = document.getElementById('host-options-grid');
const answersCountDisplay = document.getElementById('answers-count');
const timerCircle = document.getElementById('timer-circle');

const resultsSection = document.getElementById('results-section');
const resultsQuestionText = document.getElementById('results-question-text');
const correctAnswerText = document.getElementById('correct-answer-text');
const nextStepBtn = document.getElementById('next-step-btn');
const partialLeaderboardList = document.getElementById('partial-leaderboard-list');

// Gráficos de barras
const barRed = document.getElementById('bar-red');
const barBlue = document.getElementById('bar-blue');
const barYellow = document.getElementById('bar-yellow');
const barGreen = document.getElementById('bar-green');
const valRed = document.getElementById('val-red');
const valBlue = document.getElementById('val-blue');
const valYellow = document.getElementById('val-yellow');
const valGreen = document.getElementById('val-green');

const podiumSection = document.getElementById('podium-section');
const podiumContainer = document.getElementById('podium-container');
const confettiContainer = document.getElementById('confetti-container');
const quitBtn = document.getElementById('quit-btn');

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  // Conectar Socket.io
  socket = io(BACKEND_URL);

  // Ler query params
  const urlParams = new URLSearchParams(window.location.search);
  const quizId = urlParams.get('quizId');

  if (quizId) {
    // Esconder seleção e criar sala imediatamente
    selectQuizSection.classList.add('hidden');
    lobbySection.classList.remove('hidden');
    createRoom(quizId);
  } else {
    // Carregar lista de quizzes para seleção do host
    loadHostQuizzes();
  }

  setupEventListeners();
  setupSocketListeners();
});

// Ouvintes de eventos do Host
function setupEventListeners() {
  startGameBtn.addEventListener('click', () => {
    if (roomPin) {
      socket.emit('startGame', { pin: roomPin });
    }
  });

  nextStepBtn.addEventListener('click', () => {
    if (roomPin) {
      socket.emit('nextStep', { pin: roomPin });
    }
  });

  quitBtn.addEventListener('click', () => {
    if (confirm('Tem certeza de que deseja encerrar esta sala? Todos os jogadores serão desconectados.')) {
      window.location.href = 'index.html';
    }
  });
}

// Carregar quizzes do servidor se não houver um na URL
async function loadHostQuizzes() {
  try {
    const response = await fetch(BACKEND_URL + '/api/quizzes');
    const quizzes = await response.json();
    
    if (quizzes.length === 0) {
      hostQuizList.innerHTML = `<p class="text-center" style="grid-column:1/-1;">Nenhum quiz disponível no momento. Crie um primeiro!</p>`;
      return;
    }

    hostQuizList.innerHTML = quizzes.map(quiz => `
      <div class="glass-card quiz-card">
        <h3>${quiz.title}</h3>
        <p>${quiz.description}</p>
        <button class="btn btn-primary" onclick="selectQuizForHost('${quiz.id}')">Selecionar e Hospedar</button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Erro ao buscar quizzes:', error);
    hostQuizList.innerHTML = `<p class="text-center" style="color: var(--color-danger); grid-column:1/-1;">Erro ao carregar lista de quizzes.</p>`;
  }
}

// Método chamado pelo botão na lista
window.selectQuizForHost = function(quizId) {
  selectQuizSection.classList.add('hidden');
  lobbySection.classList.remove('hidden');
  createRoom(quizId);
};

// Emitir evento para criar sala
function createRoom(quizId) {
  socket.emit('createRoom', { quizId });
}

// --- ESCUTA DO SOCKET (HOST) ---
function setupSocketListeners() {
  // 1. Confirmação de sala criada
  socket.on('roomCreated', ({ pin, quizTitle }) => {
    roomPin = pin;
    currentQuizTitle = quizTitle;
    
    document.getElementById('lobby-title').textContent = `Lobby: ${quizTitle}`;
    pinCodeDisplay.textContent = pin;
  });

  // 2. Atualizar lista de players no lobby
  socket.on('updatePlayers', (players) => {
    playersCountDisplay.textContent = `Jogadores na Sala (${players.length})`;
    
    if (players.length === 0) {
      playersListContainer.innerHTML = '';
      startGameBtn.disabled = true;
      playersCountDisplay.textContent = "Aguardando jogadores...";
      return;
    }

    startGameBtn.disabled = false;
    
    // Renderizar bolhas pulando
    playersListContainer.innerHTML = players.map(name => `
      <div class="player-bubble">${name}</div>
    `).join('');
  });

  // 3. Próxima pergunta
  socket.on('nextQuestionHost', ({ question, options, correct, timeLimit, questionIndex, totalQuestions, playerCount }) => {
    // Esconder outras seções, exibir a da pergunta
    lobbySection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    questionSection.classList.remove('hidden');

    hostQuestionIndex.textContent = `Pergunta ${questionIndex + 1} de ${totalQuestions}`;
    hostQuestionText.textContent = question;
    answersCountDisplay.textContent = "0";
    
    // Alterar o rótulo de quantidade
    document.querySelector('.answers-counter-label').textContent = `de ${playerCount} Respostas`;

    // Desenhar alternativas
    const symbols = ['▲', '◆', '●', '■'];
    hostOptionsGrid.innerHTML = options.map((opt, idx) => `
      <div class="option-btn">
        <span class="option-symbol">${symbols[idx]}</span>
        <span class="option-text">${opt}</span>
      </div>
    `).join('');

    // Iniciar Cronômetro
    startTimer(timeLimit);
  });

  // 4. Receber contagem de respostas atualizada
  socket.on('updateAnswersCount', ({ count, total }) => {
    answersCountDisplay.textContent = count;
  });

  // 5. Pergunta finalizada (tempo esgotado ou todos responderam)
  socket.on('questionFinishedHost', ({ correctOption, stats, unanswered, leaderboard }) => {
    clearInterval(timerInterval);
    
    questionSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    // Identificar a pergunta resolvida
    resultsQuestionText.textContent = hostQuestionText.textContent;
    
    // Obter texto da opção correta
    const optText = questionSection.querySelectorAll('.option-btn .option-text')[correctOption].textContent;
    correctAnswerText.textContent = optText;

    // Calcular gráfico de barras
    const totalAnswers = stats.reduce((a, b) => a + b, 0) + unanswered;
    
    updateBarChart(barRed, valRed, stats[0], totalAnswers);
    updateBarChart(barBlue, valBlue, stats[1], totalAnswers);
    updateBarChart(barYellow, valYellow, stats[2], totalAnswers);
    updateBarChart(barGreen, valGreen, stats[3], totalAnswers);

    // Leaderboard parcial
    if (leaderboard.length === 0) {
      partialLeaderboardList.innerHTML = `<p style="color:var(--text-secondary);">Nenhum ponto registrado.</p>`;
    } else {
      partialLeaderboardList.innerHTML = leaderboard.map((player, idx) => `
        <div class="partial-leaderboard-item">
          <div>
            <span class="partial-rank-name">${idx + 1}. ${player.name}</span>
          </div>
          <div class="partial-rank-score">
            <div>${player.score} pts</div>
            ${player.lastGained > 0 ? `<div class="partial-gained-points">+${player.lastGained}</div>` : ''}
          </div>
        </div>
      `).join('');
    }
  });

  // 6. Fim do jogo total (Pódio)
  socket.on('gameFinishedHost', ({ podium }) => {
    resultsSection.classList.add('hidden');
    podiumSection.classList.remove('hidden');
    
    // Renderizar Pódio 3D
    // Ordem no HTML: 2º lugar (esquerda), 1º lugar (centro), 3º lugar (direita)
    const second = podium.find(p => p.rank === 2);
    const first = podium.find(p => p.rank === 1);
    const third = podium.find(p => p.rank === 3);

    let html = '';

    // 2º Lugar
    if (second) {
      html += `
        <div class="podium-place second">
          <div class="podium-player-name">${second.name}</div>
          <div class="podium-pedestal">
            <span class="podium-number">2</span>
            <span class="podium-player-score">${second.score} pts</span>
          </div>
        </div>
      `;
    } else {
      html += `<div style="width: 150px"></div>`; // spacer
    }

    // 1º Lugar
    if (first) {
      html += `
        <div class="podium-place first">
          <div class="podium-player-name">👑 ${first.name}</div>
          <div class="podium-pedestal">
            <span class="podium-number">1</span>
            <span class="podium-player-score">${first.score} pts</span>
          </div>
        </div>
      `;
    }

    // 3º Lugar
    if (third) {
      html += `
        <div class="podium-place third">
          <div class="podium-player-name">${third.name}</div>
          <div class="podium-pedestal">
            <span class="podium-number">3</span>
            <span class="podium-player-score">${third.score} pts</span>
          </div>
        </div>
      `;
    } else {
      html += `<div style="width: 150px"></div>`; // spacer
    }

    podiumContainer.innerHTML = html;

    // Disparar Confetes!
    triggerConfetti();
  });

  socket.on('errorMsg', (msg) => {
    alert(msg);
  });
}

// --- CRONÔMETRO ---
function startTimer(timeLimit) {
  clearInterval(timerInterval);
  currentQuestionTimeLimit = timeLimit;
  remainingTime = timeLimit;
  
  timerCircle.textContent = remainingTime;
  timerCircle.className = "timer-circle"; // Reset classes

  timerInterval = setInterval(() => {
    remainingTime--;
    timerCircle.textContent = remainingTime;

    // Alertas de tempo acabando
    if (remainingTime <= 5 && remainingTime > 2) {
      timerCircle.className = "timer-circle warning";
    } else if (remainingTime <= 2) {
      timerCircle.className = "timer-circle danger";
    }

    if (remainingTime <= 0) {
      clearInterval(timerInterval);
      socket.emit('timeExpired', { pin: roomPin });
    }
  }, 1000);
}

// --- ATUALIZAR GRÁFICO DE BARRAS ---
function updateBarChart(barElement, valElement, votes, total) {
  const percent = total > 0 ? (votes / total) * 100 : 0;
  // Limitar altura a no mínimo 10% se houver voto, senão 5%
  barElement.style.height = votes > 0 ? `calc(${percent}% + 10px)` : '10px';
  valElement.textContent = votes;
}

// --- ANIMAÇÃO DE CONFETES ---
function triggerConfetti() {
  confettiContainer.innerHTML = '';
  const colors = ['#f472b6', '#a5b4fc', '#6366f1', '#d946ef', '#10b981', '#f59e0b', '#ef4444'];
  
  for (let i = 0; i < 100; i++) {
    const conf = document.createElement('div');
    conf.className = 'confetti';
    conf.style.left = `${Math.random() * 100}%`;
    conf.style.top = `${-10 - Math.random() * 20}px`;
    conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    conf.style.width = `${5 + Math.random() * 10}px`;
    conf.style.height = `${10 + Math.random() * 10}px`;
    conf.style.animationDuration = `${2 + Math.random() * 3}s`;
    conf.style.animationDelay = `${Math.random() * 2}s`;
    confettiContainer.appendChild(conf);
  }
}
