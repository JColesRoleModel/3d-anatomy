// Time Stats UI Component
// Creates and manages the stats modal overlay

class TimeStatsUI {
  constructor(timeTracker) {
    this.tracker = timeTracker;
    this.modal = null;
    this.isOpen = false;
    this.messageTimeout = null;
  }

  // Create the stats modal HTML
  createModal() {
    if (this.modal) return; // Already created

    const modal = document.createElement('div');
    modal.id = 'time-stats-modal';
    modal.className = 'stats-modal';
    modal.innerHTML = `
      <div class="stats-modal-overlay"></div>
      <div class="stats-modal-content">
        <div class="stats-modal-header">
          <h2>📊 Practice Statistics</h2>
          <button class="stats-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="stats-modal-body">
          <!-- Period Summary -->
          <section class="stats-section">
            <h3>Time Periods</h3>
            <div class="stats-period-grid">
              <div class="stats-card">
                <div class="stats-card-label">Today</div>
                <div class="stats-card-value" id="stats-today">—</div>
              </div>
              <div class="stats-card">
                <div class="stats-card-label">This Week</div>
                <div class="stats-card-value" id="stats-week">—</div>
              </div>
              <div class="stats-card">
                <div class="stats-card-label">This Month</div>
                <div class="stats-card-value" id="stats-month">—</div>
              </div>
              <div class="stats-card">
                <div class="stats-card-label">This Year</div>
                <div class="stats-card-value" id="stats-year">—</div>
              </div>
            </div>
          </section>

          <!-- Section Breakdown -->
          <section class="stats-section">
            <h3>By Section (All Time)</h3>
            <div class="stats-table-container">
              <table class="stats-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Total Time</th>
                  </tr>
                </thead>
                <tbody id="stats-by-section">
                  <tr><td colspan="2">No data yet</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Movement Breakdown -->
          <section class="stats-section">
            <h3>By Movement (All Time - Top 10)</h3>
            <div class="stats-table-container">
              <table class="stats-table">
                <thead>
                  <tr>
                    <th>Movement</th>
                    <th>Total Time</th>
                  </tr>
                </thead>
                <tbody id="stats-by-movement">
                  <tr><td colspan="2">No data yet</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Data Management -->
          <section class="stats-section stats-actions">
            <h3>Data Management</h3>
            <div class="stats-actions-grid">
              <button class="btn ghost-btn" id="stats-export-btn">📥 Export Data</button>
              <button class="btn ghost-btn" id="stats-import-btn">📤 Import Data</button>
              <button class="btn ghost-btn" id="stats-clear-btn">🗑️ Clear All Data</button>
            </div>
            <input type="file" id="stats-import-file" accept=".json" style="display: none;">
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modal = modal;

    // Attach event listeners
    this.attachEventListeners();
  }

  // Attach all event listeners
  attachEventListeners() {
    if (!this.modal) return;

    // Close button
    const closeBtn = this.modal.querySelector('.stats-modal-close');
    closeBtn.addEventListener('click', () => this.close());

    // Close on overlay click
    const overlay = this.modal.querySelector('.stats-modal-overlay');
    overlay.addEventListener('click', () => this.close());

    // Export button
    const exportBtn = this.modal.querySelector('#stats-export-btn');
    exportBtn.addEventListener('click', () => this.exportData());

    // Import button
    const importBtn = this.modal.querySelector('#stats-import-btn');
    const importFile = this.modal.querySelector('#stats-import-file');
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (e) => this.importData(e));

    // Clear button
    const clearBtn = this.modal.querySelector('#stats-clear-btn');
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.clearData();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  // Update stats display
  updateStats() {
    const stats = this.tracker.getSummaryStats();

    // Update period cards
    document.getElementById('stats-today').textContent = TimeTracker.formatTime(stats.today);
    document.getElementById('stats-week').textContent = TimeTracker.formatTime(stats.week);
    document.getElementById('stats-month').textContent = TimeTracker.formatTime(stats.month);
    document.getElementById('stats-year').textContent = TimeTracker.formatTime(stats.year);

    // Update section breakdown
    const sectionTBody = document.getElementById('stats-by-section');
    sectionTBody.innerHTML = '';
    const sections = Object.entries(stats.bySection).sort((a, b) => b[1] - a[1]);

    if (sections.length === 0) {
      sectionTBody.innerHTML = '<tr><td colspan="2">No practice data yet</td></tr>';
    } else {
      sections.forEach(([section, time]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${section}</td>
          <td><strong>${TimeTracker.formatTime(time)}</strong></td>
        `;
        sectionTBody.appendChild(row);
      });
    }

    // Update movement breakdown (top 10)
    const movementTBody = document.getElementById('stats-by-movement');
    movementTBody.innerHTML = '';
    const movements = Object.entries(stats.byMovement)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (movements.length === 0) {
      movementTBody.innerHTML = '<tr><td colspan="2">No practice data yet</td></tr>';
    } else {
      movements.forEach(([movement, time]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${movement}</td>
          <td><strong>${TimeTracker.formatTime(time)}</strong></td>
        `;
        movementTBody.appendChild(row);
      });
    }
  }

  // Open modal
  open() {
    if (!this.modal) {
      this.createModal();
    }
    this.updateStats();
    this.modal.classList.add('active');
    this.isOpen = true;
    document.body.style.overflow = 'hidden'; // Prevent background scroll
  }

  // Close modal
  close() {
    if (this.modal) {
      this.modal.classList.remove('active');
      this.isOpen = false;
      document.body.style.overflow = ''; // Restore scroll
    }
  }

  // Export data as JSON file
  exportData() {
    const data = this.tracker.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `innervation-atlas-stats-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import data from JSON file
  importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const success = this.tracker.importData(e.target.result);
      if (success) {
        this.showMessage('Data imported successfully.', 'success');
        this.updateStats();
      } else {
        this.showMessage('Error importing data. Please check the file format.', 'error');
      }
      // Clear the input
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  // Clear all data with confirmation
  clearData() {
    if (confirm('Are you sure you want to clear all practice statistics? This cannot be undone.')) {
      this.tracker.clearAllData();
      this.updateStats();
      this.showMessage('All data cleared.', 'success');
    }
  }

  // Inline status message inside the modal
  showMessage(text, type = 'info') {
    if (!this.modal) return;
    const body = this.modal.querySelector('.stats-modal-body');
    if (!body) return;

    // Remove any existing message
    const existing = this.modal.querySelector('.stats-inline-message');
    if (existing) existing.remove();
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }

    const msg = document.createElement('div');
    msg.className = `stats-inline-message ${type}`;
    msg.textContent = text;
    body.prepend(msg);

    // Fade in
    requestAnimationFrame(() => msg.classList.add('visible'));

    // Auto-hide
    this.messageTimeout = setTimeout(() => {
      msg.classList.remove('visible');
      setTimeout(() => msg.remove(), 250);
    }, 4200);
  }

  // Show quick summary after routine completion
  static showQuickSummary(section, totalTime) {
    const summary = document.createElement('div');
    summary.className = 'stats-quick-summary';
    summary.innerHTML = `
      <div class="stats-quick-content">
        <div class="stats-quick-icon">✨</div>
        <div class="stats-quick-text">
          <strong>Great work!</strong><br>
          You practiced ${section} for ${TimeTracker.formatTime(totalTime)}
        </div>
      </div>
    `;

    document.body.appendChild(summary);

    // Fade in
    setTimeout(() => summary.classList.add('active'), 10);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      summary.classList.remove('active');
      setTimeout(() => summary.remove(), 300);
    }, 4000);
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.TimeStatsUI = TimeStatsUI;
  if (window.timeTracker) {
    window.timeStatsUI = new TimeStatsUI(window.timeTracker);
  }
}
