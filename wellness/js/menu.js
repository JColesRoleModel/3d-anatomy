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

  // Bring the current page's chip into view in the bottom bar.
  function showCurrentChip() {
    const chip = document.querySelector('.hub-bar [aria-current="page"]');
    const bar = chip?.parentElement;
    if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2 - 60; // a little right of centre, past the pinned 3D Anatomy chip
  }

  // ...#stats (from the account menu on another page) opens the stats straight away.
  function openStatsFromLink() {
    if (location.hash !== '#stats') return;
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => window.timeStatsUI?.open(), 0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    showCurrentChip();
    openStatsFromLink();
    initMenuDropdown();
    initFooterStats();
  });
})();
