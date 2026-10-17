(() => {
  function initMenuDropdown() {
    const dropdown = document.querySelector('.menu-dropdown');
    if (!dropdown) return;
    const toggleBtn = dropdown.querySelector('.menu-button');
    const closeMenu = () => dropdown.classList.remove('open');

    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    dropdown.querySelectorAll('[data-menu-stats]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.timeStatsUI) {
          window.timeStatsUI.open();
        }
        closeMenu();
      });
    });
  }

  function initFooterStats() {
    const footerStats = document.getElementById('footer-stats');
    if (footerStats) {
      footerStats.addEventListener('click', (e) => {
        if (window.timeStatsUI) {
          e.preventDefault();
          window.timeStatsUI.open();
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initMenuDropdown();
    initFooterStats();
  });
})();
