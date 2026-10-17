// Hamburger Menu Component
class HamburgerMenu {
    constructor() {
        this.isOpen = false;
        this.init();
    }

    init() {
        // Create menu elements
        this.createMenuHTML();

        // Get references
        this.btn = document.querySelector('.hamburger-btn');
        this.overlay = document.querySelector('.menu-overlay');
        this.menu = document.querySelector('.slide-menu');

        // Bind events
        this.btn.addEventListener('click', () => this.toggle());
        this.overlay.addEventListener('click', () => this.close());

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });
    }

    createMenuHTML() {
        const menuHTML = `
      <!-- Hamburger Button -->
      <button class="hamburger-btn" aria-label="Menu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <!-- Menu Overlay -->
      <div class="menu-overlay"></div>

      <!-- Slide-out Menu -->
      <nav class="slide-menu">
        <div class="menu-header">
          <h2>Navigation</h2>
        </div>
        <ul class="menu-nav">
          <li><a href="index.html">🏠 Home</a></li>
          <li><a href="#" id="menu-stats">📊 Stats</a></li>
          <li><a href="index.html#start">▶️ Start Here</a></li>
          <li><a href="random.html">🔀 Random Routine</a></li>
          <li><a href="eyes.html">👁️ Eyes</a></li>
          <li><a href="breathwork.html">🫁 Breath</a></li>
          <li><a href="lower.html">🦵 Lower Body</a></li>
          <li><a href="upper.html">💪 Upper Body</a></li>
          <li><a href="head.html">🧠 Head</a></li>
          <li><a href="mudras.html">🤲 Mudras</a></li>
          <li><a href="#downloads">📥 Downloads</a></li>
          <li><a href="#about">❓ About / FAQ</a></li>
        </ul>
      </nav>
    `;

        document.body.insertAdjacentHTML('afterbegin', menuHTML);

        // Stats button handler
        setTimeout(() => {
            const statsLink = document.getElementById('menu-stats');
            if (statsLink && window.timeStatsUI) {
                statsLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.close();
                    window.timeStatsUI.open();
                });
            }
        }, 100);
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        this.isOpen = true;
        this.btn.classList.add('active');
        this.overlay.classList.add('active');
        this.menu.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.isOpen = false;
        this.btn.classList.remove('active');
        this.overlay.classList.remove('active');
        this.menu.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.hamburgerMenu = new HamburgerMenu();
    });
} else {
    window.hamburgerMenu = new HamburgerMenu();
}
