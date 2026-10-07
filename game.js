const CATEGORIES = [
  { key: "geografia", name: "Geografía", shortName: "Geo", color: "#d6a733" },
  { key: "entretenimiento", name: "Entretenimiento", shortName: "Entreten.", color: "#c75d6d" },
  { key: "historia", name: "Historia", shortName: "Historia", color: "#5778b8" },
  { key: "arte", name: "Arte", shortName: "Arte", color: "#9c7657" },
  { key: "ciencias", name: "Ciencias", shortName: "Ciencias", color: "#429174" },
  { key: "deportes", name: "Deportes", shortName: "Deportes", color: "#df7653" }
];

const PLAYER_COLORS = ["#287c5b", "#5578b7", "#d06a58", "#8a65a2"];
const TOTAL_SPACES = 36;
const CENTER = 350;
const TRACK_RADIUS = 278;
const SPECIAL_SPACE_OFFSET = 2;
const TRACK_SPACES = Array.from({ length: TOTAL_SPACES }, (_, index) => {
  const segment = Math.floor(index / 6);
  const positionInSegment = index % 6;
  const cheeseCategory = CATEGORIES[segment];

  if (positionInSegment === SPECIAL_SPACE_OFFSET) {
    return { category: cheeseCategory, isSpecial: true };
  }

  const categoryIndexInSegment = positionInSegment < SPECIAL_SPACE_OFFSET
    ? positionInSegment
    : positionInSegment - 1;
  const otherCategories = CATEGORIES.filter(category => category.key !== cheeseCategory.key);
  return { category: otherCategories[categoryIndexInSegment], isSpecial: false };
});

const setupScreen = document.getElementById("setup-screen");
const gameScreen = document.getElementById("game-screen");
const playerNames = document.getElementById("player-names");
const boardCanvas = document.getElementById("board");
const boardContext = boardCanvas.getContext("2d");
const piecesLayer = document.getElementById("pieces-layer");
const rollButton = document.getElementById("roll-dice");
const questionModal = document.getElementById("question-modal");
const directionModal = document.getElementById("direction-modal");
const questionContent = document.getElementById("question-content");
const winnerContent = document.getElementById("winner-content");
const questionTitle = document.getElementById("question-title");
const questionKicker = document.getElementById("question-kicker");
const questionCategory = document.getElementById("question-category");
const answersElement = document.getElementById("answers");
const answerFeedback = document.getElementById("answer-feedback");
const continueButton = document.getElementById("continue-turn");
const toast = document.getElementById("toast");

let players = [];
let currentPlayer = 0;
let canRoll = false;
let isGameOver = false;
let activeQuestion = null;
let pendingRoll = null;
let questionDecks = {};
let toastTimeout;

if (!boardContext) {
  throw new Error("No se ha podido inicializar el tablero.");
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function validateQuestions() {
  CATEGORIES.forEach(category => {
    const questions = QUESTIONS[category.key];
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error(`No hay preguntas para la categoría ${category.name}.`);
    }
    questions.forEach((question, index) => {
      if (!question.q || !Array.isArray(question.a) || question.a.length < 2 ||
          !Number.isInteger(question.c) || question.c < 0 || question.c >= question.a.length) {
        throw new Error(`La pregunta ${index + 1} de ${category.name} no es válida.`);
      }
    });
  });
}

function renderNameFields() {
  const selectedCount = Number(document.querySelector('input[name="player-count"]:checked').value);
  const previousNames = [...playerNames.querySelectorAll("input")].map(input => input.value);
  playerNames.replaceChildren();

  for (let i = 0; i < selectedCount; i++) {
    const field = document.createElement("div");
    field.className = "name-field";

    const label = document.createElement("label");
    label.htmlFor = `player-name-${i}`;
    label.textContent = selectedCount === 1 ? "Tu nombre" : `Jugador ${i + 1}`;

    const input = document.createElement("input");
    input.id = `player-name-${i}`;
    input.type = "text";
    input.maxLength = 18;
    input.autocomplete = "off";
    input.placeholder = selectedCount === 1 ? "Por ejemplo, Alex" : `Nombre del jugador ${i + 1}`;
    input.value = previousNames[i] || "";
    input.setAttribute("aria-label", label.textContent);

    field.append(label, input);
    playerNames.append(field);
  }
}

function initializeGame() {
  const selectedCount = Number(document.querySelector('input[name="player-count"]:checked').value);
  const inputs = [...playerNames.querySelectorAll("input")];
  players = Array.from({ length: selectedCount }, (_, index) => ({
    name: inputs[index].value.trim() || (selectedCount === 1 ? "Jugador" : `Jugador ${index + 1}`),
    position: 0,
    color: PLAYER_COLORS[index],
    atCenter: false,
    cheeses: Object.fromEntries(CATEGORIES.map(category => [category.key, false]))
  }));

  currentPlayer = 0;
  canRoll = true;
  isGameOver = false;
  activeQuestion = null;
  pendingRoll = null;
  questionDecks = Object.fromEntries(CATEGORIES.map(category => [
    category.key,
    shuffle(QUESTIONS[category.key].map((_, index) => index))
  ]));

  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  questionModal.classList.add("hidden");
  directionModal.classList.add("hidden");
  winnerContent.classList.add("hidden");
  questionContent.classList.remove("hidden");
  document.getElementById("dice-value").textContent = "—";
  document.getElementById("player-count-label").textContent = `${selectedCount} ${selectedCount === 1 ? "jugador" : "jugadores"}`;
  buildCategoryLegend();
  drawBoard();
  renderGame();
  showToast(`¡A jugar, ${players[0].name}!`);
}

function buildCategoryLegend() {
  const legend = document.getElementById("category-legend");
  legend.replaceChildren();
  CATEGORIES.forEach(category => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const marker = document.createElement("i");
    marker.style.backgroundColor = category.color;
    const name = document.createElement("span");
    name.textContent = category.name;
    item.append(marker, name);
    legend.append(item);
  });
}

function drawBoard() {
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  boardCanvas.width = 700 * pixelRatio;
  boardCanvas.height = 700 * pixelRatio;
  boardContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  boardContext.clearRect(0, 0, 700, 700);

  boardContext.beginPath();
  boardContext.arc(CENTER, CENTER, 331, 0, Math.PI * 2);
  boardContext.fillStyle = "#f7f8f4";
  boardContext.fill();
  boardContext.lineWidth = 1;
  boardContext.strokeStyle = "#eaede6";
  boardContext.stroke();

  boardContext.beginPath();
  boardContext.arc(CENTER, CENTER, 302, 0, Math.PI * 2);
  boardContext.fillStyle = "#fbfcf9";
  boardContext.fill();

  boardContext.beginPath();
  boardContext.arc(CENTER, CENTER, TRACK_RADIUS, 0, Math.PI * 2);
  boardContext.strokeStyle = "#e5e8e2";
  boardContext.lineWidth = 2;
  boardContext.stroke();

  for (let index = 0; index < TOTAL_SPACES; index++) {
    const { category, isSpecial } = TRACK_SPACES[index];
    const angle = -Math.PI / 2 + (index / TOTAL_SPACES) * Math.PI * 2;
    const x = CENTER + Math.cos(angle) * TRACK_RADIUS;
    const y = CENTER + Math.sin(angle) * TRACK_RADIUS;

    boardContext.beginPath();
    boardContext.arc(x, y, isSpecial ? 16 : 11.5, 0, Math.PI * 2);
    boardContext.fillStyle = isSpecial ? category.color : "#fff";
    boardContext.fill();
    boardContext.lineWidth = isSpecial ? 3 : 2;
    boardContext.strokeStyle = isSpecial ? "#fff" : category.color;
    boardContext.stroke();

    if (isSpecial) {
      boardContext.save();
      boardContext.translate(x, y);
      boardContext.fillStyle = "#fff";
      boardContext.font = "bold 15px sans-serif";
      boardContext.textAlign = "center";
      boardContext.textBaseline = "middle";
      boardContext.fillText("✦", 0, 1);
      boardContext.restore();
    }
  }

  boardContext.beginPath();
  boardContext.arc(CENTER, CENTER, 81, 0, Math.PI * 2);
  boardContext.fillStyle = "#fff";
  boardContext.fill();
  boardContext.lineWidth = 1;
  boardContext.strokeStyle = "#e7eae4";
  boardContext.stroke();

  boardContext.textAlign = "center";
  boardContext.textBaseline = "middle";
  boardContext.fillStyle = "#287c5b";
  boardContext.font = "800 12px Manrope, sans-serif";
  boardContext.fillText("TRIVIAL", CENTER, CENTER - 7);
  boardContext.fillStyle = "#949b91";
  boardContext.font = "600 8px 'DM Sans', sans-serif";
  boardContext.fillText("CULTURA GENERAL", CENTER, CENTER + 12);
}

function getSpacePosition(index) {
  const angle = -Math.PI / 2 + (index / TOTAL_SPACES) * Math.PI * 2;
  return {
    x: CENTER + Math.cos(angle) * TRACK_RADIUS,
    y: CENTER + Math.sin(angle) * TRACK_RADIUS
  };
}

function renderPieces() {
  piecesLayer.replaceChildren();
  players.forEach((playerData, index) => {
    const piece = document.createElement("div");
    piece.className = "player-piece";
    piece.style.backgroundColor = playerData.color;
    piece.textContent = playerData.name.slice(0, 1).toUpperCase();
    piece.title = playerData.name;
    piece.setAttribute("aria-label", `${playerData.name}${index === currentPlayer ? ", turno actual" : ""}`);

    const position = playerData.atCenter
      ? { x: CENTER, y: CENTER }
      : getSpacePosition(playerData.position);
    const offsetAngle = (Math.PI * 2 * index) / Math.max(players.length, 2);
    const offset = players.length > 1 ? 9 : 0;
    piece.style.left = `${((position.x + Math.cos(offsetAngle) * offset) / 700) * 100}%`;
    piece.style.top = `${((position.y + Math.sin(offsetAngle) * offset) / 700) * 100}%`;
    piecesLayer.append(piece);
  });
}

function renderScoreboard() {
  const scoreboard = document.getElementById("scoreboard");
  scoreboard.replaceChildren();

  players.forEach((playerData, index) => {
    const row = document.createElement("div");
    row.className = `score-row${index === currentPlayer ? " active" : ""}`;

    const avatar = document.createElement("span");
    avatar.className = "score-avatar";
    avatar.style.backgroundColor = playerData.color;
    avatar.textContent = playerData.name.slice(0, 1).toUpperCase();

    const name = document.createElement("span");
    name.className = "score-name";
    name.textContent = playerData.name;

    const cheeseMarks = document.createElement("span");
    cheeseMarks.className = "score-cheeses";
    CATEGORIES.forEach(category => {
      const mark = document.createElement("i");
      if (playerData.cheeses[category.key]) mark.classList.add("on");
      cheeseMarks.append(mark);
    });

    row.append(avatar, name, cheeseMarks);
    scoreboard.append(row);
  });
}

function renderCollection() {
  const playerData = players[currentPlayer];
  const collection = document.getElementById("collection");
  collection.replaceChildren();
  let count = 0;

  CATEGORIES.forEach(category => {
    const isOwned = playerData.cheeses[category.key];
    if (isOwned) count++;

    const item = document.createElement("div");
    item.className = `collection-item${isOwned ? " on" : ""}`;
    item.style.setProperty("--token-color", category.color);

    const token = document.createElement("span");
    token.className = "collection-token";
    token.textContent = isOwned ? "✓" : "·";
    token.setAttribute("aria-label", `${category.name}: ${isOwned ? "conseguido" : "pendiente"}`);

    const name = document.createElement("span");
    name.textContent = category.shortName;
    item.append(token, name);
    collection.append(item);
  });

  document.getElementById("cheese-count").innerHTML = `${count} <span>/ 6</span>`;
  document.getElementById("collection-note").textContent = count === CATEGORIES.length
    ? "¡Colección completa! Ve al centro para jugar el desafío final."
    : "Una respuesta correcta en una casilla especial te da su quesito.";
}

function renderTurn() {
  const playerData = players[currentPlayer];
  const hasAllCheeses = CATEGORIES.every(category => playerData.cheeses[category.key]);
  document.getElementById("turn-heading").textContent = `Turno de ${playerData.name}`;
  document.getElementById("turn-message").textContent = hasAllCheeses
    ? "Ya tienes los seis quesitos. El desafío final te espera en el centro."
    : "Tira el dado y demuestra lo que sabes.";
  document.getElementById("turn-indicator").innerHTML = `<i></i> ${hasAllCheeses ? "RETO FINAL" : "TU TURNO"}`;
  document.getElementById("turn-indicator").classList.toggle("final-turn", hasAllCheeses);
  rollButton.innerHTML = hasAllCheeses
    ? '<span class="dice-icon" aria-hidden="true">✦</span> Ir al centro'
    : '<span class="dice-icon" aria-hidden="true">⚄</span> Tirar el dado';
  rollButton.disabled = !canRoll || isGameOver;
  document.querySelector(".turn-hint").textContent = hasAllCheeses
    ? "Acertar la pregunta final te dará la victoria."
    : "Responde bien y conserva el turno.";
}

function renderGame() {
  renderPieces();
  renderScoreboard();
  renderCollection();
  renderTurn();
}

function takeQuestion(categoryKey) {
  const categoryQuestions = QUESTIONS[categoryKey];
  if (!categoryQuestions || categoryQuestions.length === 0) {
    throw new Error(`No se encontraron preguntas para ${categoryKey}.`);
  }
  if (!questionDecks[categoryKey] || questionDecks[categoryKey].length === 0) {
    questionDecks[categoryKey] = shuffle(categoryQuestions.map((_, index) => index));
  }
  return categoryQuestions[questionDecks[categoryKey].pop()];
}

function askQuestion(categoryKey, isFinal = false) {
  const category = CATEGORIES.find(item => item.key === categoryKey);
  if (!category) throw new Error(`Categoría desconocida: ${categoryKey}.`);
  const question = takeQuestion(categoryKey);

  activeQuestion = { categoryKey, question, isFinal, answered: false, wasCorrect: false };
  questionKicker.textContent = isFinal ? "DESAFÍO FINAL" : "PREGUNTA";
  questionCategory.textContent = category.name.toUpperCase();
  questionCategory.style.backgroundColor = category.color;
  questionTitle.textContent = question.q;
  answerFeedback.textContent = "";
  answerFeedback.className = "answer-feedback";
  continueButton.classList.add("hidden");
  continueButton.innerHTML = isFinal
    ? 'Ver resultado <span aria-hidden="true">→</span>'
    : 'Continuar <span aria-hidden="true">→</span>';
  answersElement.replaceChildren();

  question.a.forEach((answer, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "answer-option";
    option.textContent = answer;
    option.addEventListener("click", () => answerQuestion(index));
    answersElement.append(option);
  });

  questionContent.classList.remove("hidden");
  winnerContent.classList.add("hidden");
  questionModal.classList.remove("hidden");
  const firstAnswer = answersElement.querySelector("button");
  if (firstAnswer) firstAnswer.focus();
}

function answerQuestion(selectedIndex) {
  if (!activeQuestion || activeQuestion.answered) return;

  activeQuestion.answered = true;
  activeQuestion.wasCorrect = selectedIndex === activeQuestion.question.c;
  const buttons = [...answersElement.querySelectorAll("button")];
  buttons.forEach((button, index) => {
    button.disabled = true;
    if (index === activeQuestion.question.c) button.classList.add("correct");
    else if (index === selectedIndex) button.classList.add("incorrect");
  });

  if (activeQuestion.wasCorrect) {
    answerFeedback.textContent = activeQuestion.isFinal
      ? "¡Respuesta correcta! Has ganado la partida."
      : "¡Correcto! Conservas el turno.";
    answerFeedback.classList.add("good");

    if (!activeQuestion.isFinal) {
      const playerData = players[currentPlayer];
      const space = getSpaceData(playerData.position);
      if (space.isSpecial && !playerData.cheeses[space.category.key]) {
        playerData.cheeses[space.category.key] = true;
        renderGame();
        showToast(`¡Quesito de ${space.category.name}!`);
      }
    }
  } else {
    const correctAnswer = activeQuestion.question.a[activeQuestion.question.c];
    answerFeedback.textContent = activeQuestion.isFinal
      ? `No era esa. La respuesta correcta era: ${correctAnswer}.`
      : `No era esa. La respuesta correcta era: ${correctAnswer}. Tu turno termina.`;
    answerFeedback.classList.add("bad");
  }

  continueButton.classList.remove("hidden");
  if (!activeQuestion.isFinal && activeQuestion.wasCorrect &&
      CATEGORIES.every(category => players[currentPlayer].cheeses[category.key])) {
    continueButton.innerHTML = 'Ir al centro <span aria-hidden="true">→</span>';
  }
  continueButton.focus();
}

function getSpaceData(index) {
  return TRACK_SPACES[index];
}

function continueAfterQuestion() {
  if (!activeQuestion || !activeQuestion.answered) return;
  const question = activeQuestion;

  if (question.isFinal && question.wasCorrect) {
    showWinner(players[currentPlayer].name);
    return;
  }

  questionModal.classList.add("hidden");
  if (question.isFinal || !question.wasCorrect) {
    players[currentPlayer].atCenter = false;
    currentPlayer = (currentPlayer + 1) % players.length;
    canRoll = true;
    document.getElementById("dice-value").textContent = "—";
  } else {
    canRoll = true;
  }

  activeQuestion = null;
  renderGame();
}

function showWinner(name) {
  isGameOver = true;
  canRoll = false;
  questionContent.classList.add("hidden");
  winnerContent.classList.remove("hidden");
  document.getElementById("winner-title").textContent = `¡Enhorabuena, ${name}!`;
  questionModal.classList.remove("hidden");
  document.getElementById("play-again").focus();
}

function showFinalChallenge() {
  if (!canRoll || isGameOver) return;
  canRoll = false;
  const playerData = players[currentPlayer];
  playerData.atCenter = true;
  renderGame();
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  document.getElementById("turn-message").textContent = "Una última pregunta te separa de la victoria.";
  askQuestion(category.key, true);
}

function rollDice() {
  if (!canRoll || isGameOver) return;
  const playerData = players[currentPlayer];
  const hasAllCheeses = CATEGORIES.every(category => playerData.cheeses[category.key]);
  if (hasAllCheeses) {
    showFinalChallenge();
    return;
  }

  canRoll = false;
  const roll = Math.floor(Math.random() * 6) + 1;
  pendingRoll = roll;
  document.getElementById("dice-value").textContent = `${roll}`;
  document.getElementById("direction-roll").innerHTML = `⚄ <span>${roll}</span>`;
  directionModal.classList.remove("hidden");
  document.getElementById("direction-clockwise").focus();
}

function moveByDirection(direction) {
  if (pendingRoll === null || isGameOver) return;
  const playerData = players[currentPlayer];
  playerData.position = (playerData.position + direction * pendingRoll + TOTAL_SPACES) % TOTAL_SPACES;
  playerData.atCenter = false;
  pendingRoll = null;
  directionModal.classList.add("hidden");
  renderGame();

  const questionCategoryKey = getSpaceData(playerData.position).category.key;
  window.setTimeout(() => askQuestion(questionCategoryKey), 420);
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

function returnToSetup() {
  isGameOver = true;
  questionModal.classList.add("hidden");
  gameScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
  canRoll = false;
}

document.querySelectorAll('input[name="player-count"]').forEach(input => {
  input.addEventListener("change", renderNameFields);
});
document.getElementById("start-game").addEventListener("click", initializeGame);
document.getElementById("new-game").addEventListener("click", returnToSetup);
document.getElementById("play-again").addEventListener("click", returnToSetup);
rollButton.addEventListener("click", rollDice);
document.getElementById("direction-clockwise").addEventListener("click", () => moveByDirection(1));
document.getElementById("direction-counter").addEventListener("click", () => moveByDirection(-1));
continueButton.addEventListener("click", continueAfterQuestion);
window.addEventListener("resize", () => {
  if (!gameScreen.classList.contains("hidden")) drawBoard();
});

validateQuestions();
renderNameFields();
