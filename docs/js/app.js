// Configuração do servidor
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : 'https://quiz-a966.onrender.com'; // TODO: Substitua pela URL do seu backend no Render

// Variáveis de Estado
let allQuizzes = [];
let allRankings = [];
let currentActiveQuiz = null;
let currentQuestionIndex = 0;
let playerScore = 0;
let playerCorrectCount = 0;
let questionStartTime = 0;
let hasAnsweredCurrent = false;
let selectedName = "";

// Elementos DOM
const quizzesContainer = document.getElementById('quizzes-container');
const rankingTabs = document.getElementById('ranking-tabs');
const rankingList = document.getElementById('ranking-list');

// Modal Elements
const quizModal = document.getElementById('quiz-modal');
const quizIntroScreen = document.getElementById('quiz-intro-screen');
const quizGameScreen = document.getElementById('quiz-game-screen');
const quizResultScreen = document.getElementById('quiz-result-screen');
const modalQuizTitle = document.getElementById('modal-quiz-title');
const modalQuizDesc = document.getElementById('modal-quiz-desc');
const playerNameInput = document.getElementById('player-name');

const startQuizBtn = document.getElementById('start-quiz-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const nextQuestionBtn = document.getElementById('next-question-btn');
const finishQuizBtn = document.getElementById('finish-quiz-btn');

const questionCounter = document.getElementById('question-counter');
const gameProgressFill = document.getElementById('game-progress-fill');
const currentScoreDisplay = document.getElementById('current-score');
const gameQuestionText = document.getElementById('game-question-text');
const gameOptionsGrid = document.getElementById('game-options-grid');

const summaryPlayerName = document.getElementById('summary-player-name');
const summaryScore = document.getElementById('summary-score');
const summaryCorrects = document.getElementById('summary-corrects');

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  loadQuizzes();
  loadRankings();
  setupEventListeners();
});

// Configurar ouvintes de eventos básicos
function setupEventListeners() {
  closeModalBtn.addEventListener('click', closeModal);
  startQuizBtn.addEventListener('click', startQuiz);
  nextQuestionBtn.addEventListener('click', nextQuestion);
  finishQuizBtn.addEventListener('click', finishQuizAndSave);

  // Fechar modal ao clicar fora do conteúdo
  quizModal.addEventListener('click', (e) => {
    if (e.target === quizModal) closeModal();
  });
}

// --- CARREGAR DADOS ---

// Buscar quizzes do servidor
async function loadQuizzes() {
  try {
    const response = await fetch(BACKEND_URL + '/api/quizzes');
    allQuizzes = await response.json();
    renderQuizzes();
    renderRankingTabs();
  } catch (error) {
    console.error('Erro ao buscar quizzes:', error);
    quizzesContainer.innerHTML = `<p class="text-center" style="color: var(--color-danger);">Erro ao carregar quizzes.</p>`;
  }
}

// Buscar rankings do servidor
async function loadRankings() {
  try {
    const response = await fetch(BACKEND_URL + '/api/ranking');
    allRankings = await response.json();
    renderRankings('all');
  } catch (error) {
    console.error('Erro ao buscar rankings:', error);
    rankingList.innerHTML = `<p class="text-center" style="color: var(--color-danger);">Erro ao carregar rankings.</p>`;
  }
}

// --- RENDERIZAR INTERFACES ---

// Renderizar cartões de quiz
function renderQuizzes() {
  if (allQuizzes.length === 0) {
    quizzesContainer.innerHTML = `<p class="text-center">Nenhum quiz disponível.</p>`;
    return;
  }

  quizzesContainer.innerHTML = allQuizzes.map(quiz => `
    <div class="glass-card quiz-card">
      <h3>${quiz.title}</h3>
      <p>${quiz.description}</p>
      <div class="quiz-card-footer">
        <button class="btn btn-primary" style="width: 100%;" onclick="location.href='host.html?quizId=${quiz.id}'">🏫 Hospedar Partida</button>
      </div>
    </div>
  `).join('');
}

// Renderizar as abas de filtro do ranking
function renderRankingTabs() {
  rankingTabs.innerHTML = `<button class="ranking-tab active" data-filter="all">Todos</button>`;
  
  allQuizzes.forEach(quiz => {
    const tab = document.createElement('button');
    tab.className = 'ranking-tab';
    tab.setAttribute('data-filter', quiz.id);
    tab.textContent = quiz.title;
    
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.ranking-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderRankings(quiz.id);
    });
    
    rankingTabs.appendChild(tab);
  });

  // Re-adicionar evento no tab 'Todos'
  rankingTabs.children[0].addEventListener('click', (e) => {
    document.querySelectorAll('.ranking-tab').forEach(t => t.classList.remove('active'));
    rankingTabs.children[0].classList.add('active');
    renderRankings('all');
  });
}

// Renderizar a lista de rankings com base no filtro
function renderRankings(filter) {
  let filteredList = allRankings;
  if (filter !== 'all') {
    filteredList = allRankings.filter(r => r.quizId === filter);
  }

  if (filteredList.length === 0) {
    rankingList.innerHTML = `<p class="text-center" style="color: var(--text-secondary); padding: 2rem 0;">Nenhuma pontuação registrada.</p>`;
    return;
  }

  rankingList.innerHTML = filteredList.map((item, index) => {
    const dateObj = new Date(item.date);
    const dateStr = dateObj.toLocaleDateString('pt-BR');
    
    return `
      <div class="ranking-item">
        <div class="rank-number">#${index + 1}</div>
        <div class="rank-details">
          <div class="rank-name">${item.name}</div>
          <div class="rank-quiz">${item.quizTitle} • ${dateStr}</div>
        </div>
        <div class="rank-score">
          <span class="score">${item.score} pts</span>
          <span class="corrects">${item.correctCount}/${item.totalQuestions} acertos</span>
        </div>
      </div>
    `;
  }).join('');
}

// --- JOGO INDIVIDUAL (MODAL) ---

// Abrir modal e preparar o quiz
window.openQuizModal = function(quizId) {
  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz) return;

  currentActiveQuiz = quiz;
  modalQuizTitle.textContent = quiz.title;
  modalQuizDesc.textContent = quiz.description;
  playerNameInput.value = '';

  // Exibir tela intro, ocultar as outras
  quizIntroScreen.classList.remove('hidden');
  quizGameScreen.classList.add('hidden');
  quizResultScreen.classList.add('hidden');

  quizModal.classList.add('open');
};

function closeModal() {
  quizModal.classList.remove('open');
  currentActiveQuiz = null;
}

// Iniciar rodada de quiz
function startQuiz() {
  const name = playerNameInput.value.trim();
  if (!name) {
    alert('Por favor, insira o seu nome!');
    return;
  }

  selectedName = name;
  currentQuestionIndex = 0;
  playerScore = 0;
  playerCorrectCount = 0;

  // Mudar de tela
  quizIntroScreen.classList.add('hidden');
  quizGameScreen.classList.remove('hidden');

  showQuestion();
}

// Apresentar pergunta na tela
function showQuestion() {
  hasAnsweredCurrent = false;
  nextQuestionBtn.classList.add('hidden');

  const question = currentActiveQuiz.questions[currentQuestionIndex];
  
  // Atualizar cabeçalho
  questionCounter.textContent = `Pergunta ${currentQuestionIndex + 1} de ${currentActiveQuiz.questions.length}`;
  const progressPercent = ((currentQuestionIndex) / currentActiveQuiz.questions.length) * 100;
  gameProgressFill.style.width = `${progressPercent}%`;
  currentScoreDisplay.textContent = `${playerScore} pts`;

  // Conteúdo da Pergunta
  gameQuestionText.textContent = question.question;

  // Alternativas
  gameOptionsGrid.innerHTML = '';
  const symbols = ['▲', '◆', '●', '■'];
  
  question.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `
      <span class="option-symbol">${symbols[idx]}</span>
      <span class="option-text">${opt}</span>
    `;
    btn.addEventListener('click', () => submitAnswer(idx));
    gameOptionsGrid.appendChild(btn);
  });

  questionStartTime = Date.now();
}

// Processar resposta do jogador
function submitAnswer(selectedIdx) {
  if (hasAnsweredCurrent) return;
  hasAnsweredCurrent = true;

  const question = currentActiveQuiz.questions[currentQuestionIndex];
  const isCorrect = selectedIdx === question.correct;
  const timeLimit = question.timeLimit;
  const timeTaken = (Date.now() - questionStartTime) / 1000;

  const optionBtns = gameOptionsGrid.querySelectorAll('.option-btn');

  optionBtns.forEach((btn, idx) => {
    // Desabilitar todas
    btn.disabled = true;

    // Feedback visual
    if (idx === question.correct) {
      btn.classList.add('correct-feedback');
    } else if (idx === selectedIdx && !isCorrect) {
      btn.classList.add('option-btn-incorrect'); // apenas para referência
      btn.classList.add('incorrect-feedback');
    } else {
      btn.classList.add('incorrect-feedback');
    }
  });

  if (isCorrect) {
    // Calcular pontuação (500 fixos + 500 pela velocidade)
    playerCorrectCount++;
    const speedRatio = Math.max(0, 1 - (timeTaken / timeLimit));
    const points = Math.round(500 + (500 * speedRatio));
    playerScore += points;
    currentScoreDisplay.textContent = `${playerScore} pts`;
  }

  // Revelar botão Próxima
  nextQuestionBtn.classList.remove('hidden');
}

// Avançar no jogo
function nextQuestion() {
  currentQuestionIndex++;
  
  if (currentQuestionIndex < currentActiveQuiz.questions.length) {
    showQuestion();
  } else {
    showQuizResults();
  }
}

// Mostrar tela de resultados
function showQuizResults() {
  // Atualizar barra para 100% no final
  gameProgressFill.style.width = '100%';

  quizGameScreen.classList.add('hidden');
  quizResultScreen.classList.remove('hidden');

  summaryPlayerName.textContent = selectedName;
  summaryScore.textContent = `${playerScore} Pontos`;
  summaryCorrects.textContent = `Você acertou ${playerCorrectCount} de ${currentActiveQuiz.questions.length} perguntas.`;
}

// Enviar resultado para o backend e fechar modal
async function finishQuizAndSave() {
  try {
    const response = await fetch(BACKEND_URL + '/api/ranking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: selectedName,
        quizId: currentActiveQuiz.id,
        quizTitle: currentActiveQuiz.title,
        score: playerScore,
        correctCount: playerCorrectCount,
        totalQuestions: currentActiveQuiz.questions.length
      })
    });

    if (response.ok) {
      // Recarregar rankings para mostrar a pontuação atualizada
      await loadRankings();
    }
  } catch (error) {
    console.error('Erro ao salvar resultado no ranking:', error);
  } finally {
    closeModal();
  }
}
