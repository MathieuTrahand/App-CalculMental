import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- CONSTANTES GLOBALES ET CONFIGURATION ---
const LOCAL_STORAGE_KEY = 'mentalMathProgression_Add1to9_JS';
const MIN_NUM = 1;
const MAX_NUM = 9;

// Paramètres du modèle adaptatif (Skill Level de 0 à 1000)
const TARGET_TIME_S = 1.5; // Temps cible pour un "réflexe"
const MAX_GAIN_DELTA = 40; // Gain maximal de points
const BASE_PENALTY = 75;  // Pénalité de base en cas d'erreur
const SKILL_THRESHOLD = 980; // Seuil de maîtrise pour ne plus être tiré

const initialProblemState = {
    a: 0,
    b: 0,
    result: 0,
    key: '',
};

// --- LOGIQUE DE PERSISTANCE ET D'INITIALISATION ---

/**
 * Génère la clé de stockage pour un couple (ex: "add_5_4").
 */
const generateKey = (a, b) => `add_${a}_${b}`;

/**
 * Initialise les 81 couples (A + B) avec A et B de 1 à 9.
 */
const initializeProgressionData = (storedProgression) => {
    let newProgression = { ...storedProgression };
    let initializedCount = 0;

    for (let a = MIN_NUM; a <= MAX_NUM; a++) {
        for (let b = MIN_NUM; b <= MAX_NUM; b++) {
            const key = generateKey(a, b);
            if (!newProgression[key]) {
                newProgression[key] = {
                    skill_level: 500, // Niveau neutre de 0 à 1000
                    total_attempts: 0,
                };
                initializedCount++;
            }
        }
    }
    return newProgression;
};

// --- COMPOSANT PRINCIPAL (Renommé et Exporté) ---

export const MathTrainer = () => {
    // État de l'application
    const [progression, setProgression] = useState({});
    const [currentProblem, setCurrentProblem] = useState(initialProblemState);
    const [gameActive, setGameActive] = useState(false);
    const [answerInput, setAnswerInput] = useState('');
    const [feedback, setFeedback] = useState('');
    const [isCorrect, setIsCorrect] = useState(null); // null, true, false
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [elapsedTime, setElapsedTime] = useState(0);

    // Références pour la logique de chronométrage
    const startTimeRef = useRef(null);
    const sessionTimerRef = useRef(null);
    const answerInputRef = useRef(null); // Pour le focus

    // --- LOGIQUE DE PERSISTANCE (useEffect) ---
    
    // 1. Charger les données au montage
    useEffect(() => {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        let loadedProgression = {};
        if (stored) {
            try {
                loadedProgression = JSON.parse(stored);
            } catch (e) {
                console.error("Erreur lors du parsing du localStorage:", e);
            }
        }
        // Initialiser l'ensemble des 81 couples
        const initialData = initializeProgressionData(loadedProgression);
        setProgression(initialData);
    }, []);

    // 2. Sauvegarder les données quand la progression change
    useEffect(() => {
        if (Object.keys(progression).length > 0) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(progression));
        }
    }, [progression]);

    // --- LOGIQUE DE TEMPS ---

    // Chronomètre global de la session
    const startSessionTimer = () => {
        if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
        
        sessionTimerRef.current = setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);
    };

    const stopSessionTimer = () => {
        if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
    };

    // Chronomètre de la question
    const startQuestionTimer = () => {
        startTimeRef.current = performance.now();
    };
    
    const stopQuestionTimer = () => {
        if (startTimeRef.current === null) return 0;
        const timeTaken = (performance.now() - startTimeRef.current) / 1000;
        startTimeRef.current = null;
        return timeTaken;
    };


    // --- LOGIQUE ADAPTATIVE ---

    /**
     * Sélectionne le prochain problème basé sur la pondération.
     */
    const selectNextProblem = useCallback(() => {
        const problemPool = [];
        let totalWeight = 0;

        for (const key in progression) {
            const item = progression[key];
            
            // Poids est inversement proportionnel au niveau de compétence
            let weight = 1000 - item.skill_level;

            // Application du seuil d'invisibilité
            if (item.skill_level >= SKILL_THRESHOLD) {
                weight = 0;
            }
            
            if (weight > 0) {
                problemPool.push({ key, weight });
                totalWeight += weight;
            }
        }

        let keyToSelect;

        if (totalWeight === 0) {
            // Tout est maîtrisé, on choisit un couple au hasard pour révision
            const allKeys = Object.keys(progression);
            keyToSelect = allKeys[Math.floor(Math.random() * allKeys.length)];
        } else {
            // Tirage pondéré
            let randomValue = Math.random() * totalWeight;
            for (const item of problemPool) {
                randomValue -= item.weight;
                if (randomValue <= 0) {
                    keyToSelect = item.key;
                    break;
                }
            }
        }

        // Parsing de la clé pour obtenir les nombres
        const parts = keyToSelect.split('_'); // ["add", "A", "B"]
        const a = parseInt(parts[1]);
        const b = parseInt(parts[2]);

        return {
            a,
            b,
            result: a + b,
            key: keyToSelect,
        };
    }, [progression]);


    /**
     * Met à jour le skill_level après une tentative.
     */
    const updateSkillLevel = (key, isCorrect, time_s) => {
        setProgression(prevProg => {
            const item = prevProg[key];
            if (!item) return prevProg; // Sécurité

            let delta;
            
            if (isCorrect) {
                // Formule de Gain: Accélère si le temps est sous T_CIBLE
                const factor = Math.max(0, TARGET_TIME_S + 1 - time_s);
                delta = MAX_GAIN_DELTA * (factor / (TARGET_TIME_S + 1));
            } else {
                // Formule de Perte: Pénalité sévère
                delta = -BASE_PENALTY - (item.skill_level * 0.05);
            }

            // Cloner et appliquer le Delta
            const newLevel = Math.min(1000, Math.max(0, item.skill_level + delta));
            
            return {
                ...prevProg,
                [key]: {
                    ...item,
                    skill_level: newLevel,
                    total_attempts: item.total_attempts + 1,
                    last_response_time: time_s,
                }
            };
        });
    };

    // --- LOGIQUE DE JEU ---

    const generateProblem = useCallback(() => {
        if (Object.keys(progression).length === 0) return; // Attendre le chargement

        const problemData = selectNextProblem();
        setCurrentProblem(problemData);
        setAnswerInput('');
        startQuestionTimer();
        
        // Focus sur le champ de réponse
        if (answerInputRef.current) {
            answerInputRef.current.focus();
        }
    }, [progression, selectNextProblem]);


    const startGame = () => {
        if (Object.keys(progression).length === 0) return; // Sécurité

        setGameActive(true);
        setScore({ correct: 0, total: 0 });
        setElapsedTime(0);
        setFeedback('');
        setIsCorrect(null);
        
        startSessionTimer();
        generateProblem();
    };

    const stopGame = () => {
        setGameActive(false);
        stopSessionTimer();
        stopQuestionTimer();
        setFeedback("Session Terminée. Appuyez sur Démarrer pour recommencer.");
        setIsCorrect(null);
        setCurrentProblem(initialProblemState);
    };

    const checkAnswer = (e) => {
        if (e) e.preventDefault();
        if (!gameActive || !currentProblem.key) return;

        const timeTaken = stopQuestionTimer();
        const userAnswer = parseInt(answerInput.trim());

        if (isNaN(userAnswer)) {
            setFeedback("Veuillez entrer un nombre valide.");
            setIsCorrect(null);
            answerInputRef.current.focus();
            return;
        }

        const correct = (userAnswer === currentProblem.result);
        
        // Mise à jour de l'état
        setScore(prev => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
        updateSkillLevel(currentProblem.key, correct, timeTaken);
        setIsCorrect(correct);

        // Affichage du feedback
        const feedbackMessage = correct
            ? `✅ Correct en ${timeTaken.toFixed(2)} s!`
            : `❌ Faux. ${currentProblem.a} + ${currentProblem.b} = ${currentProblem.result}.`;
        setFeedback(feedbackMessage);

        // Passer à la question suivante après un court délai
        const delay = correct ? 500 : 1500;
        setTimeout(generateProblem, delay);
    };
    
    // Pour afficher le niveau de compétence du problème actuel
    const currentSkillLevel = progression[currentProblem.key]?.skill_level || 500;
    
    // Calcul des statistiques
    const masteredCount = Object.values(progression).filter(item => item.skill_level >= SKILL_THRESHOLD).length;
    const totalCount = Object.keys(progression).length;

    // Mise en forme de l'affichage du niveau de compétence
    const getSkillLevelDisplay = (level) => {
        const formattedLevel = level.toFixed(0);
        let colorClass = 'text-red-500';
        let message = "Faible";
        
        if (level > 400) { colorClass = 'text-yellow-500'; message = "Moyen"; }
        if (level > 700) { colorClass = 'text-indigo-500'; message = "Bon"; }
        if (level >= SKILL_THRESHOLD) { colorClass = 'text-green-600'; message = "MAÎTRISÉ !"; }

        return <span className={`font-semibold ${colorClass}`}>Niveau de Maîtrise: {formattedLevel} ({message})</span>;
    };

    // Style de la zone de feedback
    const getFeedbackClass = () => {
        if (isCorrect === true) return 'text-green-600';
        if (isCorrect === false) return 'text-red-600';
        return 'text-gray-500';
    };


    return (
        <div className="bg-gray-50 flex flex-col items-center justify-center min-h-screen p-4">
            <div className="w-full max-w-lg bg-white shadow-2xl rounded-3xl p-6 md:p-10 space-y-8 border-t-4 border-indigo-600">

                <h1 className="text-3xl font-extrabold text-gray-900 text-center">
                    Entraîneur Adaptatif (+1 à +9)
                </h1>
                
                {/* Statistiques de session */}
                <div className="grid grid-cols-2 gap-4 text-lg font-medium text-gray-700 bg-gray-100 p-3 rounded-xl">
                    <div className="flex items-center space-x-2 justify-start">
                        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span id="score">Score: {score.correct} / {score.total}</span>
                    </div>
                    <div className="flex items-center space-x-2 justify-end">
                        <svg className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span id="timer">Temps: {elapsedTime} s</span>
                    </div>
                </div>

                {/* Statistique de Maîtrise Globale */}
                <div className="text-center text-md font-medium text-gray-600 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                    Maîtrise Globale : {masteredCount} / {totalCount} couples ({'>'} 980 points)
                </div>

                {/* Zone de la question */}
                <div className="text-center bg-indigo-50 p-8 rounded-xl border-4 border-indigo-300 shadow-inner">
                    <p className="text-xl text-indigo-500 mb-2 font-medium">Question Actuelle :</p>
                    <div id="question" className="text-6xl font-mono font-bold text-indigo-800 transition-all duration-300">
                        {currentProblem.a} + {currentProblem.b} = ?
                    </div>
                </div>

                {/* Informations sur le couple */}
                <div className="text-center text-sm text-gray-500 h-6">
                    {gameActive && currentProblem.key && getSkillLevelDisplay(currentSkillLevel)}
                </div>

                {/* Formulaire de réponse */}
                <form onSubmit={checkAnswer} className="space-y-4">
                    <input 
                        ref={answerInputRef}
                        type="number" 
                        id="answerInput" 
                        placeholder="Entrez votre réponse..." 
                        className="w-full p-5 text-center text-3xl border-2 border-gray-300 rounded-xl focus:ring-indigo-600 focus:border-indigo-600 transition duration-150 shadow-md"
                        inputMode="numeric"
                        autoComplete="off"
                        value={answerInput}
                        onChange={(e) => setAnswerInput(e.target.value)}
                        disabled={!gameActive}
                    />
                    <button 
                        type="submit"
                        id="checkButton" 
                        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition duration-200 disabled:opacity-50 text-xl"
                        disabled={!gameActive || answerInput.trim() === ''}
                    >
                        Vérifier (Entrée)
                    </button>
                </form>

                {/* Zone de feedback et Message */}
                <div id="feedback" className={`text-center text-2xl font-bold min-h-8 ${getFeedbackClass()}`}>
                    {feedback}
                </div>

                {/* Bouton de Contrôle */}
                <button 
                    onClick={gameActive ? stopGame : startGame}
                    id="startButton" 
                    className={`w-full font-bold py-4 rounded-xl shadow-xl transition duration-200 text-xl ${
                        gameActive 
                            ? 'bg-orange-600 text-white hover:bg-orange-700' 
                            : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                >
                    {gameActive ? "Arrêter la session" : "Démarrer l'Entraînement"}
                </button>
            </div>
        </div>
    );
};

// Changement ici : Exportation nommée au lieu de l'exportation par défaut
// export default App; 
// Devient:
// export { MathTrainer };
