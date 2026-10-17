// Post-Routine Completion Prompt
class RoutineCompletionPrompt {
    constructor() {
        this.modal = null;
        this.createModal();
    }

    createModal() {
        const modalHTML = `
      <div class="completion-modal" id="completion-modal">
        <div class="completion-overlay"></div>
        <div class="completion-content">
          <h2 class="completion-title">🎉 Routine Complete!</h2>
          <p class="completion-message">Great work! What would you like to do next?</p>
          
          <div class="completion-options">
            <button class="completion-btn primary-btn" id="completion-random">
              🔀 Start Random Routine
            </button>
            <button class="completion-btn secondary-btn" id="completion-related">
              🎯 Pick Related Routine
            </button>
            <button class="completion-btn ghost-btn" id="completion-home">
              🏠 Back to Home
            </button>
          </div>
        </div>
      </div>
    `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('completion-modal');

        // Bind events
        document.getElementById('completion-random').addEventListener('click', () => {
            window.location.href = 'random.html';
        });

        document.getElementById('completion-related').addEventListener('click', () => {
            this.close();
            this.showRelatedRoutines();
        });

        document.getElementById('completion-home').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        this.modal.querySelector('.completion-overlay').addEventListener('click', () => {
            this.close();
        });
    }

    show() {
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    showRelatedRoutines() {
        // Get current page to determine related routines
        const page = window.location.pathname.split('/').pop();
        let relatedHTML = '<div class="related-routines-modal"><div class="related-content">';
        relatedHTML += '<h3>Related Routines</h3><div class="related-grid">';

        // Define related routines based on current page
        const related = {
            'eyes.html': [
                { url: 'breathwork.html', name: '🫁 Breathwork', desc: 'Calm the nervous system' },
                { url: 'head.html', name: '🧠 Head', desc: 'Complete the upper activation' },
                { url: 'mudras.html', name: '🤲 Mudras', desc: 'Seal the energy' }
            ],
            'lower.html': [
                { url: 'upper.html', name: '💪 Upper Body', desc: 'Balance lower with upper' },
                { url: 'breathwork.html', name: '🫁 Breathwork', desc: 'Ground the energy' },
                { url: 'mudras.html', name: '🤲 Mudras', desc: 'Integrate the work' }
            ],
            'upper.html': [
                { url: 'lower.html', name: '🦵 Lower Body', desc: 'Balance upper with lower' },
                { url: 'head.html', name: '🧠 Head', desc: 'Complete the activation' },
                { url: 'breathwork.html', name: '🫁 Breathwork', desc: 'Integrate' }
            ],
            'head.html': [
                { url: 'eyes.html', name: '👁️ Eyes', desc: 'Refine cranial work' },
                { url: 'mudras.html', name: '🤲 Mudras', desc: 'Seal the energy' },
                { url: 'breathwork.html', name: '🫁 Breathwork', desc: 'Calm down' }
            ],
            'mudras.html': [
                { url: 'breathwork.html', name: '🫁 Breathwork', desc: 'Deepen the practice' },
                { url: 'eyes.html', name: '👁️ Eyes', desc: 'Activate vision' },
                { url: 'lower.html', name: '🦵 Lower Body', desc: 'Ground the energy' }
            ],
            'breathwork.html': [
                { url: 'mudras.html', name: '🤲 Mudras', desc: 'Seal the breath' },
                { url: 'eyes.html', name: '👁️ Eyes', desc: 'Calm and focus' },
                { url: 'lower.html', name: '🦵 Lower Body', desc: 'Ground' }
            ]
        };

        const routines = related[page] || [];
        routines.forEach(r => {
            relatedHTML += `
        <a href="${r.url}" class="related-card">
          <div class="related-name">${r.name}</div>
          <div class="related-desc">${r.desc}</div>
        </a>
      `;
        });

        relatedHTML += '</div><button class="btn ghost-btn" onclick="document.querySelector(\'.related-routines-modal\').remove()">Close</button></div></div>';
        document.body.insertAdjacentHTML('beforeend', relatedHTML);
    }
}

// Initialize globally
window.routineCompletionPrompt = new RoutineCompletionPrompt();
