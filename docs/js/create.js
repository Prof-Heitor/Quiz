// Configuração do servidor
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : 'https://quiz-a966.onrender.com'; // TODO: Substitua pela URL do seu backend no Render

let questionCounter = 0;

// Elementos DOM
const questionsContainer = document.getElementById('questions-container');
const addQuestionBtn = document.getElementById('add-question-btn');
const quizCreatorForm = document.getElementById('quiz-creator-form');

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar com uma pergunta padrão
  addQuestionBlock();
  
  // Ouvintes de eventos
  addQuestionBtn.addEventListener('click', addQuestionBlock);
  quizCreatorForm.addEventListener('submit', handleFormSubmit);
});

// Adicionar um novo bloco de pergunta dinamicamente
function addQuestionBlock() {
  questionCounter++;
  const blockId = `q-block-${questionCounter}`;
  
  const blockHtml = `
    <div class="question-block" id="${blockId}">
      <div class="question-block-header">
        <h3 style="font-family: var(--font-title); font-size: 1.15rem;">Pergunta #${questionCounter}</h3>
        ${questionCounter > 1 ? `
          <button type="button" class="remove-question-btn" onclick="removeQuestionBlock('${blockId}')">
            🗑️ Excluir
          </button>
        ` : ''}
      </div>

      <div class="input-group">
        <label>Enunciado da Pergunta</label>
        <input type="text" class="question-input" placeholder="Digite a pergunta aqui..." required>
      </div>

      <div class="input-group" style="width: 200px;">
        <label>Tempo Limite (segundos)</label>
        <select class="question-time-limit">
          <option value="10">10 segundos</option>
          <option value="15">15 segundos</option>
          <option value="20" selected>20 segundos</option>
          <option value="30">30 segundos</option>
          <option value="60">60 segundos</option>
        </select>
      </div>

      <label style="font-family: var(--font-title); font-weight: 500; font-size: 0.9rem; color: var(--text-secondary); display: block; margin-bottom: 0.5rem;">Alternativas</label>
      <div class="options-creator">
        <!-- Alternativa A -->
        <div class="option-input-wrapper is-correct" data-index="0">
          <div class="correct-selector" title="Marcar como correta" onclick="setCorrectOption('${blockId}', 0)"></div>
          <input type="text" class="option-input" placeholder="Alternativa A..." required>
        </div>
        
        <!-- Alternativa B -->
        <div class="option-input-wrapper" data-index="1">
          <div class="correct-selector" title="Marcar como correta" onclick="setCorrectOption('${blockId}', 1)"></div>
          <input type="text" class="option-input" placeholder="Alternativa B..." required>
        </div>

        <!-- Alternativa C -->
        <div class="option-input-wrapper" data-index="2">
          <div class="correct-selector" title="Marcar como correta" onclick="setCorrectOption('${blockId}', 2)"></div>
          <input type="text" class="option-input" placeholder="Alternativa C..." required>
        </div>

        <!-- Alternativa D -->
        <div class="option-input-wrapper" data-index="3">
          <div class="correct-selector" title="Marcar como correta" onclick="setCorrectOption('${blockId}', 3)"></div>
          <input type="text" class="option-input" placeholder="Alternativa D..." required>
        </div>
      </div>
      <input type="hidden" class="correct-index-input" value="0">
    </div>
  `;

  // Converter string HTML em elemento DOM
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = blockHtml;
  questionsContainer.appendChild(tempDiv.firstElementChild);
  
  renumberHeaders();
}

// Remover bloco de pergunta
window.removeQuestionBlock = function(blockId) {
  const block = document.getElementById(blockId);
  if (block) {
    block.remove();
    renumberHeaders();
  }
};

// Selecionar a resposta correta de uma pergunta
window.setCorrectOption = function(blockId, correctIdx) {
  const block = document.getElementById(blockId);
  if (!block) return;

  const wrappers = block.querySelectorAll('.option-input-wrapper');
  wrappers.forEach((wrap, idx) => {
    if (idx === correctIdx) {
      wrap.classList.add('is-correct');
    } else {
      wrap.classList.remove('is-correct');
    }
  });

  // Salvar a escolha no input escondido correspondente
  block.querySelector('.correct-index-input').value = correctIdx;
};

// Renumerar os cabeçalhos das perguntas sequencialmente caso uma seja apagada
function renumberHeaders() {
  const blocks = questionsContainer.querySelectorAll('.question-block');
  blocks.forEach((block, index) => {
    const header = block.querySelector('.question-block-header h3');
    header.textContent = `Pergunta #${index + 1}`;
  });
}

// Submeter formulário ao backend
async function handleFormSubmit(e) {
  e.preventDefault();

  const title = document.getElementById('quiz-title').value.trim();
  const description = document.getElementById('quiz-description').value.trim();
  const blocks = questionsContainer.querySelectorAll('.question-block');

  const questions = [];

  for (const block of blocks) {
    const questionText = block.querySelector('.question-input').value.trim();
    const timeLimit = parseInt(block.querySelector('.question-time-limit').value);
    const correctIndex = parseInt(block.querySelector('.correct-index-input').value);
    
    const optionInputs = block.querySelectorAll('.option-input');
    const options = [];
    
    optionInputs.forEach(input => {
      options.push(input.value.trim());
    });

    // Validar alternativas
    if (options.some(opt => !opt)) {
      alert('Por favor, preencha todas as alternativas de todas as perguntas.');
      return;
    }

    questions.push({
      question: questionText,
      options: options,
      correct: correctIndex,
      timeLimit: timeLimit
    });
  }

  // Enviar dados
  try {
    const response = await fetch(BACKEND_URL + '/api/quizzes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        description,
        questions
      })
    });

    const data = await response.json();
    if (response.ok && data.success) {
      alert('Quiz salvo com sucesso! Você será redirecionado para o portal.');
      window.location.href = 'index.html';
    } else {
      alert('Erro ao criar quiz: ' + (data.error || 'Erro desconhecido.'));
    }
  } catch (error) {
    console.error('Erro na requisição:', error);
    alert('Erro ao se conectar ao servidor.');
  }
}
