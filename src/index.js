import React from 'react';
import { createRoot } from 'react-dom/client';
import { MathTrainer } from './MathTrainer.js'; // Importation nommée

// Point d'entrée de l'application. 
// Il monte le composant MathTrainer dans l'élément HTML avec l'ID 'root'.

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <MathTrainer />
        </React.StrictMode>
    );
} else {
    console.error("Élément racine 'root' non trouvé dans le DOM.");
}
