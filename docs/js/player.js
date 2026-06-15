// Configuração do servidor
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : 'https://quiz-a966.onrender.com'; // TODO: Substitua pela URL do seu backend no Render

let socket;
let currentPin = null;
let playerName = "";
let currentScore = 0;

// Elementos DOM
const loginSection = document.getElementById('login-section');
const pinInput = document.getElementById('pin-input');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');

const lobbyWaitingSection = document.getElementById('lobby-waiting-section');
const lobbyPlayerName = document.getElementById('lobby-player-name');

const playSection = document.getElementById('play-section');
const playerQuestionCounter = document.getElementById('player-question-counter');
const playerCurrentScore = document.getElementById('player-current-score');
const playerQuestionText = document.getElementById('player-question-text');
const playerOptionBtns = document.querySelectorAll('.player-option-btn');

const waitingOthersSection = document.getElementById('waiting-others-section');

const feedbackSection = document.getElementById('feedback-section');
const feedbackCard = document.getElementById('feedback-card');
const feedbackIcon = document.getElementById('feedback-icon');
const feedbackTitle = document.getElementById('feedback-title');
const feedbackPoints = document.getElementById('feedback-points');
const incorrectInfo = document.getElementById('incorrect-info');
const correctTextFeedback = document.getElementById('correct-text-feedback');
const feedbackTotalScore = document.getElementById('feedback-total-score');

const playerFinishedSection = document.getElementById('player-finished-section');
const playerPlacementIcon = document.getElementById('player-placement-icon');
const playerPlacementText = document.getElementById('player-placement-text');
const playerFinalCorrects = document.getElementById('player-final-corrects');
const playerFinalScore = document.getElementById('player-final-score');

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  socket = io(BACKEND_URL);

  setupEventListeners();
  setupSocketListeners();
});

// Configurar cliques do jogador
function setupEventListeners() {
  joinBtn.addEventListener('click', handleJoinGame);

  // Tecla enter no input
  pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') nameInput.focus();
  });
  
  nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleJoinGame();
  });

  // Evento nos 4 botões de resposta
  playerOptionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const optionIndex = btn.getAttribute('data-index');
      submitAnswer(optionIndex);
    });
  });
}

// Entrar no lobby do jogo
function handleJoinGame() {
  const pin = pinInput.value.trim();
  const name = nameInput.value.trim();

  if (!pin || pin.length !== 6 || isNaN(pin)) {
    alert('Por favor, digite um PIN válido de 6 números.');
    return;
  }

  if (!name) {
    alert('Por favor, digite seu nome ou apelido.');
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = 'Entrando...';

  // Emitir solicitação de entrada no socket
  socket.emit('joinRoom', { pin, name });
}

// Submeter resposta
function submitAnswer(idx) {
  // Desativar botões para não clicar mais de uma vez
  disableAnswerButtons();

  socket.emit('submitAnswer', { pin: currentPin, optionIndex: idx });

  // Ir para a tela de espera dos outros
  playSection.classList.add('hidden');
  waitingOthersSection.classList.remove('hidden');
}

function disableAnswerButtons() {
  playerOptionBtns.forEach(btn => btn.disabled = true);
}

function enableAnswerButtons() {
  playerOptionBtns.forEach(btn => btn.disabled = false);
}

// --- ESCUTA DO SOCKET (PLAYER) ---
function setupSocketListeners() {
  // 1. Sucesso ao entrar na sala
  socket.on('joinSuccess', ({ pin, name, quizTitle }) => {
    currentPin = pin;
    playerName = name;
    
    lobbyPlayerName.textContent = name;
    
    loginSection.classList.add('hidden');
    lobbyWaitingSection.classList.remove('hidden');
  });

  // 2. Erro ao entrar na sala
  socket.on('joinError', (msg) => {
    alert(msg);
    joinBtn.disabled = false;
    joinBtn.textContent = 'Entrar no Lobby';
  });

  // 3. Receber próxima pergunta
  socket.on('nextQuestionPlayer', ({ question, options, timeLimit, questionIndex, totalQuestions }) => {
    // Esconder outras telas, abrir tela de jogo
    lobbyWaitingSection.classList.add('hidden');
    waitingOthersSection.classList.add('hidden');
    feedbackSection.classList.add('hidden');
    playSection.classList.remove('hidden');

    // Reset de botões
    enableAnswerButtons();

    // Atualizar UI
    playerQuestionCounter.textContent = `Pergunta ${questionIndex + 1} de ${totalQuestions}`;
    playerCurrentScore.textContent = `${currentScore} pts`;
    playerQuestionText.textContent = question;

    // Também mostramos o texto correspondente a cada botão para que o aluno leia no próprio celular se desejar
    const symbols = ['▲', '◆', '●', '■'];
    playerOptionBtns.forEach((btn, idx) => {
      btn.textContent = `${symbols[idx]} ${options[idx]}`;
    });
  });

  // 4. Receber feedback da rodada de pergunta finalizada
  socket.on('questionFinishedPlayer', ({ correct, pointsGained, totalScore, correctOptionText }) => {
    waitingOthersSection.classList.add('hidden');
    playSection.classList.add('hidden');
    feedbackSection.classList.remove('hidden');

    currentScore = totalScore;
    feedbackTotalScore.textContent = `${totalScore} pts`;

    if (correct) {
      feedbackCard.className = "player-feedback-screen correct";
      feedbackIcon.textContent = "✔️";
      feedbackTitle.textContent = "Correto!";
      feedbackPoints.textContent = `+${pointsGained} pts`;
      feedbackPoints.style.color = "var(--color-success)";
      incorrectInfo.classList.add('hidden');
    } else {
      feedbackCard.className = "player-feedback-screen incorrect";
      feedbackIcon.textContent = "❌";
      feedbackTitle.textContent = "Incorreto...";
      feedbackPoints.textContent = "+0 pts";
      feedbackPoints.style.color = "var(--color-danger)";
      
      // Mostrar qual era a resposta certa
      incorrectInfo.classList.remove('hidden');
      correctTextFeedback.textContent = correctOptionText;
    }
  });

  // 5. Receber fim do jogo
  socket.on('gameFinishedPlayer', ({ rank, totalPlayers, score, correctCount, totalQuestions }) => {
    feedbackSection.classList.add('hidden');
    playSection.classList.add('hidden');
    waitingOthersSection.classList.add('hidden');
    playerFinishedSection.classList.remove('hidden');

    // Escolher ícone com base no rank
    let icon = "👏";
    if (rank === 1) icon = "👑";
    else if (rank <= 3) icon = "🏆";

    playerPlacementIcon.textContent = icon;
    playerPlacementText.textContent = `Você ficou em ${rank}º Lugar!`;
    playerFinalCorrects.textContent = `Você acertou ${correctCount} de ${totalQuestions} perguntas.`;
    playerFinalScore.textContent = `Pontuação Final: ${score} pts`;
  });

  // 6. Host desconectou
  socket.on('hostDisconnected', () => {
    alert('O apresentador encerrou a partida ou perdeu a conexão.');
    window.location.href = 'index.html';
  });
}
