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
        this.autosaveInterval = null;
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
        this.stopSession(); // Stop any existing session
        this.currentSection = section;
        this.currentRoutine = routine;
        this.currentMovement = null;
        this.sessionStartTime = Date.now();
        // NO autosave - we track based on configured duration, not wall clock
    }

    // Record a movement with its configured duration
    recordMovement(movementLabel, durationSeconds) {
        if (!this.sessionStartTime) return;
        if (durationSeconds < 1) return; // Ignore if less than 1 second

        this.data.sessions.push({
            section: this.currentSection,
            routine: this.currentRoutine,
            movement: movementLabel,
            duration: durationSeconds, // Use the configured duration, not wall clock!
            timestamp: Date.now()
        });

        this.saveData();
    }

    // Stop tracking session
    stopSession() {
        if (this.sessionStartTime) {
            this.lastSessionDuration = this.getCurrentSessionDuration();
        }
        this.sessionStartTime = null;
        this.currentSection = null;
        this.currentRoutine = null;
        this.currentMovement = null;
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

    // Get time for this week (last 7 days)
    getTimeThisWeek() {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return this.getTimeForPeriod(weekAgo, new Date(now.getTime() + 24 * 60 * 60 * 1000));
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

    // Format seconds into human-readable time
    static formatTime(seconds) {
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
}
