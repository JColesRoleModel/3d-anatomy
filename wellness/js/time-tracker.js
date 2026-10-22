// Time Tracker Module
// Tracks active time for routines with localStorage persistence
// Provides aggregation by time period, section, and movement

class TimeTracker {
    constructor(storageKey = 'innervation-atlas-time-data') {
        this.storageKey = storageKey;
        this.data = this.loadData();
        this.activeSession = null;
        this.sessionStartTime = null;
        this.lastSessionDuration = 0;
        this.movementStartTime = null;
        this.currentSection = null;
        this.currentRoutine = null;
        this.currentMovement = null;
        this.movement = null; // the movement under way, see beginMovement
        this.openKey = `${storageKey}-open-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        this.recoverOpenMovements();
    }

    // Load data from localStorage
    loadData() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                // Ensure structure exists
                return {
                    sessions: Array.isArray(data.sessions) ? data.sessions : []
                };
            }
        } catch (e) {
            console.error('Error loading time tracking data:', e);
        }
        return { sessions: [] };
    }

    // Save data to localStorage
    saveData() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        } catch (e) {
            console.error('Error saving time tracking data:', e);
        }
    }

    // Start tracking a session
    startSession(section, routine = null) {
        this.stopSession(); // Stop any existing session, keeping the time already done
        this.currentSection = section;
        this.currentRoutine = routine;
        this.currentMovement = null;
        this.sessionStartTime = Date.now();
    }

    // The clock for one movement. Only time that actually passes while it runs counts: pausing, stopping, going
    // back, or leaving the page stops it, and whatever was done up to then is kept. maxSeconds (the movement's set
    // length) is the most it can ever count, so a slow timer never adds time you didn't do.
    beginMovement(label, maxSeconds = Infinity) {
        if (!this.sessionStartTime) return;
        this.endMovement();
        this.currentMovement = label;
        this.movement = { label, max: maxSeconds, ms: 0, recorded: 0, since: Date.now() };
        this.checkpoint();
    }

    pauseMovement() {
        const m = this.movement;
        if (!m || m.since == null) return;
        m.ms += Date.now() - m.since;
        m.since = null;
        this.checkpoint();
    }

    resumeMovement() {
        const m = this.movement;
        if (!m || m.since != null) return;
        m.since = Date.now();
        this.checkpoint();
    }

    // Save the time done so far, leaving the movement open (paused) so it can carry on
    flushMovement() {
        const m = this.movement;
        if (!m) return;
        this.pauseMovement();
        let seconds = Math.min(Math.floor(m.ms / 1000), m.max - m.recorded);
        if (seconds >= 1) {
            m.recorded += seconds;
            m.ms -= seconds * 1000; // the part of a second left over carries on with the movement
            // One record holds at most an hour (what the account accepts), so a long open-ended session is split
            for (; seconds > 0; seconds -= 3600) this.recordMovement(m.label, Math.min(seconds, 3600));
        }
        this.checkpoint();
    }

    // Finish the movement, keeping the time actually done
    endMovement() {
        const m = this.movement;
        if (!m) return;
        this.pauseMovement();
        m.ms = Math.round(m.ms / 1000) * 1000; // the last part counts to the nearest second
        this.flushMovement();
        this.movement = null;
        this.currentMovement = null;
        this.clearCheckpoint();
    }

    // While a movement runs its progress is kept on the device every few seconds, so if the page is closed without
    // warning (the browser killed, the battery died) the next visit still counts the time up to then.
    checkpoint() {
        const m = this.movement;
        if (!m) return this.clearCheckpoint();
        const ms = m.ms + (m.since != null ? Date.now() - m.since : 0);
        try {
            localStorage.setItem(this.openKey, JSON.stringify({
                section: this.currentSection, routine: this.currentRoutine, movement: m.label,
                ms, recorded: m.recorded, max: Number.isFinite(m.max) ? m.max : null, at: Date.now()
            }));
        } catch (e) { /* storage full or blocked: the time is still saved when the movement ends */ }
    }

    clearCheckpoint() {
        try { localStorage.removeItem(this.openKey); } catch (e) { /* ignore */ }
    }

    // Count movements left open by a page that closed without saving them
    recoverOpenMovements() {
        const prefix = `${this.storageKey}-open-`;
        let keys = [];
        try { keys = Object.keys(localStorage).filter(k => k.startsWith(prefix)); } catch (e) { return; }
        for (const key of keys) {
            let open = null;
            try { open = JSON.parse(localStorage.getItem(key)); } catch (e) { /* ignore */ }
            // A page that's still open keeps its checkpoint fresh; leave that one alone
            if (open && Date.now() - open.at < 15000) continue;
            try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
            if (!open) continue;
            const max = open.max == null ? Infinity : open.max - (open.recorded || 0);
            const seconds = Math.min(Math.floor(open.ms / 1000), max);
            if (seconds >= 1) {
                this.data.sessions.push({
                    section: open.section, routine: open.routine, movement: open.movement,
                    duration: seconds, timestamp: open.at
                });
                this.saveData();
            }
        }
    }

    // Record time spent on a movement (or a breath cycle)
    recordMovement(movementLabel, durationSeconds) {
        if (!this.sessionStartTime) return;
        durationSeconds = Math.round(durationSeconds);
        if (!(durationSeconds >= 1)) return; // Ignore if less than 1 second

        this.data.sessions.push({
            section: this.currentSection,
            routine: this.currentRoutine,
            movement: movementLabel,
            duration: durationSeconds,
            timestamp: Date.now()
        });

        this.saveData();
    }

    // Stop tracking session, keeping the time done in the movement under way
    stopSession() {
        this.endMovement();
        if (this.sessionStartTime) {
            this.lastSessionDuration = this.getCurrentSessionDuration();
        }
        this.sessionStartTime = null;
        this.currentSection = null;
        this.currentRoutine = null;
        this.currentMovement = null;
    }

    // Leaving the page (another app, another tab, the screen locking, or closing it) saves the time done so far and
    // tells the player to pause, so nothing is counted while you're away.
    watchPage() {
        const away = () => {
            if (!this.movement) return;
            this.flushMovement();
            window.dispatchEvent(new CustomEvent('practice:away'));
        };
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') away();
            else window.dispatchEvent(new CustomEvent('practice:back'));
        });
        window.addEventListener('pagehide', () => { away(); this.clearCheckpoint(); });
        setInterval(() => { if (this.movement && this.movement.since != null) this.checkpoint(); }, 5000);
    }

    // Get total time for a date range
    getTimeForPeriod(startDate, endDate) {
        return this.data.sessions
            .filter(s => s.timestamp >= startDate.getTime() && s.timestamp < endDate.getTime())
            .reduce((total, s) => total + s.duration, 0);
    }

    // Get time for today
    getTimeToday() {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        return this.getTimeForPeriod(startOfDay, endOfDay);
    }

    // Get time for this week (since Monday, like the account panel)
    getTimeThisWeek() {
        const now = new Date();
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
        return this.getTimeForPeriod(monday, new Date(now.getTime() + 24 * 60 * 60 * 1000));
    }

    // Get time for this month (last 30 days)
    getTimeThisMonth() {
        const now = new Date();
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return this.getTimeForPeriod(monthAgo, new Date(now.getTime() + 24 * 60 * 60 * 1000));
    }

    // Get time for this year (last 365 days)
    getTimeThisYear() {
        const now = new Date();
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        return this.getTimeForPeriod(yearAgo, new Date(now.getTime() + 24 * 60 * 60 * 1000));
    }

    // Get time breakdown by section (all time)
    getTimeBySection() {
        const bySection = {};
        this.data.sessions.forEach(s => {
            if (!bySection[s.section]) {
                bySection[s.section] = 0;
            }
            bySection[s.section] += s.duration;
        });
        return bySection;
    }

    // Get time breakdown by movement (all time)
    getTimeByMovement() {
        const byMovement = {};
        this.data.sessions.forEach(s => {
            const key = `${s.section} - ${s.movement}`;
            if (!byMovement[key]) {
                byMovement[key] = 0;
            }
            byMovement[key] += s.duration;
        });
        return byMovement;
    }

    // Get time for specific section (all time)
    getTimeForSection(sectionName) {
        return this.data.sessions
            .filter(s => s.section === sectionName)
            .reduce((total, s) => total + s.duration, 0);
    }

    // Get time for specific movement (all time)
    getTimeForMovement(sectionName, movementName) {
        return this.data.sessions
            .filter(s => s.section === sectionName && s.movement === movementName)
            .reduce((total, s) => total + s.duration, 0);
    }

    // Get time recorded in the currently active session
    getCurrentSessionDuration() {
        if (!this.sessionStartTime) return 0;
        return this.data.sessions
            .filter(s => s.timestamp >= this.sessionStartTime)
            .reduce((total, s) => total + s.duration, 0);
    }

    // Last session length (useful after stopSession)
    getLastSessionDuration() {
        return this.lastSessionDuration || 0;
    }

    // A short form for small boxes: 45s, 23m, 1h 5m, 120h
    static formatShort(seconds) {
        seconds = Math.round(seconds || 0);
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours >= 100 || !minutes ? `${hours}h` : `${hours}h ${minutes}m`;
    }

    // Format seconds into human-readable time
    static formatTime(seconds) {
        seconds = Math.round(seconds || 0);
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            const remainingSeconds = seconds % 60;
            return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }

    // Export data for backup
    exportData() {
        return JSON.stringify(this.data, null, 2);
    }

    // Import data from backup
    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data && Array.isArray(data.sessions)) {
                this.data = data;
                this.saveData();
                return true;
            }
        } catch (e) {
            console.error('Error importing data:', e);
        }
        return false;
    }

    // Clear all data
    clearAllData() {
        this.data = { sessions: [] };
        this.lastSessionDuration = 0;
        this.sessionStartTime = null;
        this.saveData();
    }

    // Get summary stats
    getSummaryStats() {
        return {
            today: this.getTimeToday(),
            week: this.getTimeThisWeek(),
            month: this.getTimeThisMonth(),
            year: this.getTimeThisYear(),
            bySection: this.getTimeBySection(),
            byMovement: this.getTimeByMovement(),
            totalSessions: this.data.sessions.length
        };
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.TimeTracker = TimeTracker;
    window.timeTracker = new TimeTracker();
    window.timeTracker.watchPage();
}
