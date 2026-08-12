// School Management System
// ============================================

// Define system modules/pages mapping
const APP_MODULES = [
    'dashboard',
    'teacher-dashboard',
    'student-registry',
    'teachers',
    'classes',
    'attendance',
    'grades',
    'users',
    'portal',
    'settings',
    'requests'
];

// ============================================
// PHONE FORMATTING FALLBACK
// ============================================
if (typeof window.formatPhoneForDisplay === 'undefined') {
    window.formatPhoneForDisplay = function(phone) {
        if (!phone) return 'N/A';
        
        // Remove non-numeric characters except leading '+'
        const cleaned = String(phone).trim();
        if (!cleaned) return 'N/A';

        // Returns clean phone string or formats standard 10-digit numbers
        const digitsOnly = cleaned.replace(/\D/g, '');
        if (digitsOnly.length === 10) {
            return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
        }
        
        return cleaned; // Fallback to raw formatted string
    };
}

// ============================================
// DEFENSIVE UTILITIES & FALLBACKS
// ============================================
if (typeof window.sanitizeInput === 'undefined') {
    window.sanitizeInput = (val) => (val !== null && val !== undefined) ? String(val).trim() : '';
}

if (typeof window.sanitizeObject === 'undefined') {
    window.sanitizeObject = (obj) => {
        const clean = {};
        for (const [key, val] of Object.entries(obj)) {
            clean[key] = typeof val === 'string' ? sanitizeInput(val) : val;
        }
        return clean;
    };
}

if (typeof window.validateFields === 'undefined') {
    window.validateFields = (data, schema) => [];
}

if (typeof window.standardizeClassName === 'undefined') {
    window.standardizeClassName = (cls) => String(cls || '').toUpperCase().trim();
}

if (typeof window.escapeHtml === 'undefined') {
    window.escapeHtml = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
}

if (typeof window.formatDate === 'undefined') {
    window.formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString() : 'N/A';
}

if (typeof window.formatPhoneForDisplay === 'undefined') {
    window.formatPhoneForDisplay = (phone) => phone ? String(phone).trim() : 'N/A';
}

// ============================================
// TOAST SYSTEM
// ============================================
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    
    // Auto-create container if missing in DOM so toasts never fail silently
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type} flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white transition-all duration-300 ${
        type === 'success' ? 'bg-green-600' :
        type === 'error' ? 'bg-red-600' :
        type === 'warning' ? 'bg-amber-500' : 'bg-blue-600'
    }`;
    
    toast.innerHTML = `
        <i class="fas ${
            type === 'success' ? 'fa-check-circle' :
            type === 'error' ? 'fa-exclamation-circle' :
            type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'
        }"></i>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 3000);
}

const DataService = {
    // Generate standard student ID (e.g. BAGSS/2026/001 or fallback timestamp)
    generateId(prefix = 'BAGSS', year = new Date().getFullYear()) {
        const timestamp = Date.now().toString().slice(-4);
        const randomDigits = Math.floor(100 + Math.random() * 900);
        return `${prefix}/${year}/${timestamp}${randomDigits}`;
    },

    // Legacy helper
    get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn(`DataService.get error for key "${key}":`, e);
            return [];
        }
    },

    // Save to localStorage
    set(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error("DataService.set error:", e);
        }
    },

    // Cloud Firestore Async Fetch
    async getStudents() {
        try {
            if (typeof db !== 'undefined' && db) {
                const snapshot = await db.collection('students').get();
                return snapshot.docs.map(doc => ({ firebaseDocId: doc.id, ...doc.data() }));
            }
            return this.get('students');
        } catch (error) {
            console.error("Error fetching students from cloud, falling back to local:", error);
            return this.get('students');
        }
    }
};

const DataAccess = {
    // Batch insert students into Cloud Firestore during Bulk Upload
    async insertBatch(collectionName, newItems) {
        try {
            const batch = db.batch();
            newItems.forEach(item => {
                // Use the generated student ID (e.g. BAGSS/2026/001) as the document ID
                const docRef = db.collection(collectionName).doc(item.id.replace(/\//g, '_'));
                batch.set(docRef, item);
            });
            await batch.commit();
            return { success: newItems };
        } catch (error) {
            console.error("Batch insert error:", error);
            return { success: [] };
        }
    }
};

// Firestore Helper Functions for Single Student Operations
const FirestoreService = {
    // Helper to turn Student ID into a valid Firestore Document Path
    getDocRef(studentId) {
        if (!studentId) return null;
        const safeId = studentId.toString().trim().replace(/\//g, '_');
        return db.collection('students').doc(safeId);
    },

    // Save or update a single student in Firestore
    async saveStudent(studentData) {
        try {
            const docRef = this.getDocRef(studentData.id);
            await docRef.set({
                ...studentData,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return true;
        } catch (error) {
            console.error("Error saving student to Firestore:", error);
            return false;
        }
    },

    // Delete a student from Firestore (if needed)
    async deleteStudent(studentId) {
        try {
            const docRef = this.getDocRef(studentId);
            await docRef.delete();
            return true;
        } catch (error) {
            console.error("Error deleting student from Firestore:", error);
            return false;
        }
    }
};

// Data Migration Script for Existing Students
(function migrateStudentData() {
    const students = DataService.get('students', []);
    if (!Array.isArray(students) || students.length === 0) return;

    const yearCounters = {};

    students.forEach(s => {
        const year = s.admissionYear || new Date().getFullYear();
        
        if (!yearCounters[year]) {
            yearCounters[year] = students.filter(st => st.id && st.id.startsWith(`BAGSS/${year}/`)).length;
        }

        // 1. Update ID format safely without collisions
        if (s.id && !s.id.startsWith('BAGSS/')) {
            yearCounters[year] += 1;
            s.id = `BAGSS/${year}/${String(yearCounters[year]).padStart(3, '0')}`;
            if (s.class) s.class = standardizeClassName(s.class);
        }
        
        // 2. Ensure default field values exist
        s.parentPhone = s.parentPhone || null;
        s.previousSchool = s.previousSchool || null;
        s.transferDate = s.transferDate || null;
        s.exitDate = s.exitDate || null;
        s.status = s.status || 'Active';
    });

    DataService.set('students', students);
})();


// ============================================
// MANEB GRADING STANDARDS
// ============================================

// JCE Grading (Form 1 & 2) - Letter Grades
const JCE_GRADING = {
    A: { min: 90, max: 100, remark: 'Excellent' },
    B: { min: 80, max: 89, remark: 'Very Good' },
    C: { min: 60, max: 79, remark: 'Good' },
    D: { min: 40, max: 59, remark: 'Average' },
    F: { min: 0, max: 39, remark: 'Fail' }
};

const JCE_PASS_MIN = 40;
const JCE_MIN_SUBJECTS = 6;

// MSCE Grading (Form 3 & 4) - Point System
const MSCE_GRADING = {
    1: { min: 90, max: 100, remark: 'Distinction' },
    2: { min: 85, max: 89, remark: 'Distinction' },
    3: { min: 80, max: 84, remark: 'Credit' },
    4: { min: 75, max: 79, remark: 'Credit' },
    5: { min: 70, max: 74, remark: 'Credit' },
    6: { min: 55, max: 69, remark: 'Credit' },
    7: { min: 50, max: 54, remark: 'Pass' },
    8: { min: 40, max: 49, remark: 'Pass' },
    9: { min: 0, max: 39, remark: 'Fail' }
};

const MSCE_PASS_MIN = 40;
const MSCE_BEST_SUBJECTS = 6;

// Form levels
const JCE_FORMS = ['Form 1', 'Form 2', 'Form 1A', 'Form 1B', 'Form 2A', 'Form 2B'];
const MSCE_FORMS = ['Form 3', 'Form 4', 'Form 3A', 'Form 3B', 'Form 4A', 'Form 4B'];

function isJCE(classLevel) {
    if (!classLevel) return false;
    const upperClass = classLevel.toUpperCase();
    return JCE_FORMS.some(form => upperClass.includes(form.toUpperCase()));
}

function isMSCE(classLevel) {
    if (!classLevel) return false;
    const upperClass = classLevel.toUpperCase();
    return MSCE_FORMS.some(form => upperClass.includes(form.toUpperCase()));
}

// Constants
const CA_TASKS = [
    { id: 'ca1', label: 'CA 1', maxScore: 20 },
    { id: 'ca2', label: 'CA 2', maxScore: 20 },
    { id: 'ca3', label: 'CA 3', maxScore: 20 },
    { id: 'ca4', label: 'CA 4', maxScore: 20 }
];
const CA_TOTAL_MAX = 80;

// Grading Data Structure
let continuousAssessments = DataService.get('continuousAssessments') || [];

// Class Data Structure
let classes = DataService.get('classes') || [];

// Teachers Data Structure
let teachers = DataService.get('teachers') || [];

// Attendance Data Structure
let attendanceRecords = DataService.get('attendance') || [];

// User Data Structure
let users = DataService.get('users') || [];

// Seed default admin user if no users exist
if (users.length === 0) {
    users.push({
        id: DataService.generateId('USR'),
        username: 'admin',
        password: 'admin123', // In production, this should be hashed
        role: 'Admin',
        name: 'System Administrator',
        createdAt: new Date().toISOString()
    });
    DataService.set('users', users);
}

// Portal Settings - 
let portalSettings = DataService.get('portalSettings') || {};

// If it's an empty array or not an object, set default values
if (Array.isArray(portalSettings) || Object.keys(portalSettings).length === 0) {
    portalSettings = {
        isOpen: false,
        openingDate: null,
        closingDate: null,
        message: 'Results will be available soon.'
    };
    DataService.set('portalSettings', portalSettings);
}

// School Settings
let schoolSettings = DataService.get('schoolSettings') || {
    schoolName: 'BANDAWE GIRLS SECONDARY SCHOOL',
    address: 'Private Bag 11, Chintheche',
    email: 'bandawegirlssecondary@gmail.com',
    phone: '+265 123 456 789',
    motto: 'Dedicated to Excellence',
    nextOpeningDate: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 14).toISOString().split('T')[0],
    fees: 'MK450,000',
    accountName: 'Bandawe Girls Sec School',  // Changed from bankName
    bank: 'NBM',
    branch: 'Mzuzu Branch',
    accountNumber: '1467627',
    currency: 'MK'
};

// Published Reports
let publishedReports = DataService.get('publishedReports') || [];

function standardizeClassName(className) {
    if (!className) return '';
    // Uppercase, trim extra spaces
    let standardized = className.toUpperCase().trim();
    // Replace multiple spaces with single space
    standardized = standardized.replace(/\s+/g, ' ');
    return standardized;
}


// ============================================
// ROUTER
// ============================================
const Router = {
    pages: {
        'dashboard': { title: 'Dashboard', render: renderDashboard },
        'student-registry': { title: 'Student Registry', render: renderStudentRegistry },
        'teachers': { title: 'Teachers', render: renderTeachers },
        'classes': { title: 'Classes', render: renderClasses },
        'attendance': { title: 'Attendance', render: renderAttendance },
        'grades': { title: 'Grades', render: renderGrades },
        'users': { title: 'Users', render: renderUsers },
        'portal': { title: 'Results Portal', render: renderPortal },
        'settings': { title: 'School Settings', render: renderSchoolSettings },
        'requests': { title: 'Phone Requests', render: renderRequestCenter },
        'teacher-dashboard': { title: 'Teacher Dashboard', render: renderTeacherDashboard }
    },
    
    current: 'dashboard',
    
    navigate(page) {
        if (!this.pages[page]) {
            console.error(`Page "${page}" not found`);
            this.showToast('Page not found', 'error');
            return;
        }
        
        this.current = page;
        this.updateUI();
        const pageRender = this.pages[page];
        if (pageRender && typeof pageRender.render === 'function') {
            pageRender.render(document.getElementById('content'));
        }
        
        // Save current page
        localStorage.setItem('currentPage', page);
    },
    
    updateUI() {
        // 1. Update page header title
        const titleEl = document.getElementById('page-title');
        if (titleEl) {
            const page = this.pages[this.current];
            titleEl.textContent = page ? page.title : 'Dashboard';
        }
        
        // 2. Update active navigation sidebar links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.page === this.current);
        });
        
        // 3. Hide global top-right action button across all pages
        const btnText = document.getElementById('add-btn-text');
        if (btnText) {
            const actionBtn = btnText.closest('button') || btnText.parentElement;
            if (actionBtn) {
                actionBtn.style.display = 'none';
                actionBtn.onclick = null;
            }
        }
    },
    
    refresh() {
        const container = document.getElementById('content');
        if (container && this.current) {
            const page = this.pages[this.current];
            if (page && typeof page.render === 'function') {
                page.render(container);
            }
        }
    },
    
    showToast(message, type = 'info') {
        showToast(message, type);
    }
};

// ============================================
// NAVIGATION SETUP
// ============================================
function setupNavigation() {
    const navConfig = [
        { id: 'dashboard', icon: 'fa-home', label: 'Dashboard' },
        { id: 'student-registry', icon: 'fa-address-book', label: 'Student Registry' },
        { id: 'teachers', icon: 'fa-chalkboard-teacher', label: 'Teachers' },
        { id: 'classes', icon: 'fa-chalkboard', label: 'Classes' },
        { id: 'attendance', icon: 'fa-calendar-check', label: 'Attendance' },
        { id: 'grades', icon: 'fa-graduation-cap', label: 'Grades' },
    ];

    // Add User Management for Admin only
    if (isAdmin()) {
        navConfig.push({ id: 'users', icon: 'fa-users-cog', label: 'Users' });
        navConfig.push({ id: 'portal', icon: 'fa-door-open', label: 'Results Portal' });
        navConfig.push({ id: 'settings', icon: 'fa-cog', label: 'School Settings' }); 
        navConfig.push({ id: 'requests', icon: 'fa-clipboard-list', label: 'Phone Requests' });
    }
    
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    
    nav.innerHTML = `
        <ul class="space-y-1">
            ${navConfig.map(item => `
                <li>
                    <a href="#" 
                       data-page="${item.id}" 
                       class="nav-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-indigo-700 transition-all"
                       title="${item.label}">
                        <i class="fas ${item.icon}"></i>
                        <span>${item.label}</span>
                    </a>
                </li>
            `).join('')}
        </ul>
    `;
    
    // Event delegation for navigation
    nav.addEventListener('click', function(e) {
        const link = e.target.closest('[data-page]');
        if (link) {
            e.preventDefault();
            const page = link.dataset.page;
            Router.navigate(page);
        }
    });
}

// ============================================
// SCHOOL SETTINGS
// ============================================
function getSchoolSettings() {
    const defaults = {
        schoolName: 'BANDAWE GIRLS SECONDARY SCHOOL',
        address: 'Private Bag 11, Chintheche',
        email: 'bandawegirlssecondary@gmail.com',
        phone: '+265 993 819 599',
        motto: 'Dedicated to Excellence',
        nextOpeningDate: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 14).toISOString().split('T')[0],
        fees: 'MK450,000',
        accountName: 'Bandawe Girls Sec School',
        bank: 'NBM',
        branch: 'Mzuzu Branch',
        accountNumber: '1467627',
        currency: 'MK'
    };
    const settings = DataService.get('schoolSettings') || {};
    return { ...defaults, ...settings };
}

// ============================================
// DASHBOARD
// ============================================
function renderDashboard(container) {
    const students = DataService.get('students');
    const teachers = DataService.get('teachers');
    const classes = DataService.get('classes');
    
    // Group students by class
    const studentsByClass = {};
    students.forEach(s => {
        const cls = s.class || 'Unassigned';
        if (!studentsByClass[cls]) studentsByClass[cls] = [];
        studentsByClass[cls].push(s);
    });
    
    // Sort each class by name
    Object.keys(studentsByClass).forEach(cls => {
        studentsByClass[cls].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    const sortedStudents = [...students].sort((a, b) => {
        if (a.sex !== b.sex) return a.sex === 'Female' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    
    // Build class cards
    let classCards = '';
    Object.keys(studentsByClass).sort().forEach(cls => {
        const studentsInClass = studentsByClass[cls];
        classCards += `
            <div class="bg-white rounded-2xl shadow overflow-hidden mb-4">
                <div class="bg-indigo-50 px-6 py-3 border-b">
                    <h4 class="font-semibold text-indigo-800">${escapeHtml(cls)} (${studentsInClass.length} students)</h4>
                </div>
                <div class="overflow-x-auto">
                    <table class="table w-full border-collapse">
                        <thead>
                            <tr class="bg-gray-50 border-b">
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">#</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">ID</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Sex</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${studentsInClass.map((student, i) => `
                                <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50">
                                    <td class="px-4 py-2 text-sm">${i + 1}</td>
                                    <td class="px-4 py-2 text-sm font-medium">${escapeHtml(student.name)}</td>
                                    <td class="px-4 py-2 text-sm font-mono">${escapeHtml(student.id)}</td>
                                    <td class="px-4 py-2 text-sm">${escapeHtml(student.sex)}</td>
                                    <td class="px-4 py-2 text-sm">
                                        <span class="px-2 py-1 ${student.status === 'Active' ? 'bg-green-100 text-green-800' : student.status === 'Transfer' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'} rounded-full text-xs font-semibold">
                                            ${escapeHtml(student.status || 'Active')}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div class="bg-white p-6 rounded-2xl shadow card">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Total Students</p>
                        <p class="text-4xl font-bold text-indigo-600 mt-2">${students.length}</p>
                    </div>
                    <i class="fas fa-user-graduate text-5xl text-indigo-100"></i>
                </div>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow card">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Total Teachers</p>
                        <p class="text-4xl font-bold text-emerald-600 mt-2">${teachers.length}</p>
                    </div>
                    <i class="fas fa-chalkboard-teacher text-5xl text-emerald-100"></i>
                </div>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow card">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Classes</p>
                        <p class="text-4xl font-bold text-amber-600 mt-2">${classes.length}</p>
                    </div>
                    <i class="fas fa-chalkboard text-5xl text-amber-100"></i>
                </div>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow card">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Active Students</p>
                        <p class="text-4xl font-bold text-purple-600 mt-2">${students.filter(s => s.status !== 'Left').length}</p>
                    </div>
                    <i class="fas fa-user-check text-5xl text-purple-100"></i>
                </div>
            </div>
        </div>
        
        <h3 class="text-lg font-semibold mb-4">Students by Class</h3>
        ${classCards || '<p class="text-center py-8 text-gray-400">No students yet. Add some!</p>'}
    `;
}

// ============================================
// COMPREHENSIVE REFRESH & ROUTING SYSTEM
// ============================================

/**
 * Gets the default landing page for the currently logged-in user role
 */
function getDashboardForRole() {
    const role = typeof getUserRole === 'function' ? getUserRole() : (currentUser?.role || 'Admin');
    if (role === 'Admin') return 'dashboard';
    if (role === 'Teacher') return 'teacher-dashboard';
    if (role === 'Accountant') return 'accountant-dashboard';
    return 'dashboard';
}

/**
 * Role-aware dashboard refresh handler
 */
function refreshDashboard() {
    const content = document.getElementById('content');
    if (!content) return;
    
    const targetDashboard = getDashboardForRole();
    
    // Set Router state if available
    if (typeof Router !== 'undefined') {
        Router.current = targetDashboard;
    }

    if (targetDashboard === 'teacher-dashboard' && typeof renderTeacherDashboard === 'function') {
        renderTeacherDashboard(content);
    } else if (targetDashboard === 'accountant-dashboard' && typeof renderAccountantDashboard === 'function') {
        renderAccountantDashboard(content);
    } else if (typeof renderDashboard === 'function') {
        renderDashboard(content);
    }
}

/**
 * Re-renders the current page view with robust fallbacks
 */
function refreshCurrentPage() {
    const container = document.getElementById('content');
    if (!container) return;

    // Ensure we have a valid current route; if missing, fallback to user's role dashboard
    if (typeof Router !== 'undefined') {
        if (!Router.current || !Router.pages || !Router.pages[Router.current]) {
            Router.current = getDashboardForRole();
        }

        const page = Router.pages[Router.current];
        if (page && typeof page.render === 'function') {
            page.render(container);
        } else if (typeof Router.navigate === 'function') {
            Router.navigate(Router.current);
            return;
        } else {
            refreshDashboard();
            return;
        }
    } else {
        refreshDashboard();
        return;
    }

    // Refresh UI elements (headers, sidebar, permissions)
    refreshUIState();
}

/**
 * Synchronizes header titles, sidebar active links, role-based nav visibility, and user profile
 */
function refreshUIState() {
    // 1. Update Header User Profile Display
    if (typeof updateUserProfile === 'function') {
        updateUserProfile();
    }

    const currentRoute = (typeof Router !== 'undefined' && Router.current) ? Router.current : getDashboardForRole();
    const currentRole = typeof getUserRole === 'function' ? getUserRole() : (currentUser?.role || 'Admin');

    // 2. Update Header Title
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
        if (typeof Router !== 'undefined' && Router.pages && Router.pages[currentRoute]) {
            titleEl.textContent = Router.pages[currentRoute].title;
        } else {
            titleEl.textContent = currentRoute.replace('-', ' ').toUpperCase();
        }
    }

    // 3. Sync Navigation Links & Role Permissions
    document.querySelectorAll('.nav-link').forEach(link => {
        const pageKey = link.dataset.page;
        
        // Highlight active link
        link.classList.toggle('active', pageKey === currentRoute);

        // Hide admin-only links from Teachers and Accountants
        const isAdminOnly = link.dataset.adminOnly === 'true' || ['users', 'settings', 'teachers'].includes(pageKey);
        if (isAdminOnly && currentRole !== 'Admin') {
            link.style.display = 'none';
        } else {
            link.style.display = '';
        }
    });

    // 4. Ensure top-right global add button stays hidden if required
    if (typeof Router !== 'undefined' && typeof Router.updateUI === 'function') {
        Router.updateUI();
    }
}

/**
 * Full application refresh triggered after login, logout, or hard refresh (F5)
 */
function refreshApp() {
    refreshUIState();
    refreshCurrentPage();
    setTimeout(hideLoadingSpinner, 50);
}

async function renderTeacherDashboard(container) {
    if (!container) return;
    
    // Show loading spinner
    container.innerHTML = `
        <div class="p-8 text-center text-gray-500">
            <i class="fas fa-spinner fa-spin text-2xl mr-2 text-indigo-600"></i>
            <span>Loading dashboard...</span>
        </div>
    `;

    try {
        // Fetch students & classes data asynchronously
        const students = (await DataService.getStudents()) || [];
        const classes = (await DataService.getClasses()) || [];
        
        // Match teacher to their assigned class
        const teacherName = currentUser?.name || currentUser?.username || 'Teacher';
        const myClass = classes.find(c => c.classTeacher === teacherName || c.teacher === teacherName) || {};
        const myClassName = myClass.name || 'Unassigned';
        
        // Filter students in teacher's assigned class
        const myStudents = students.filter(s => s.class === myClassName && s.status !== 'Left');
        const activeTotal = students.filter(s => s.status !== 'Left').length;

        const todayStr = new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        container.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">
                <!-- Welcome Banner -->
                <div class="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <span class="bg-indigo-500/30 text-indigo-100 text-xs font-semibold px-3 py-1 rounded-full border border-indigo-400/30">
                            <i class="fas fa-chalkboard-teacher mr-1"></i> Teacher Portal
                        </span>
                        <h2 class="text-2xl sm:text-3xl font-bold mt-2">Welcome, ${escapeHtml(teacherName)}! 👋</h2>
                        <p class="text-indigo-200 text-sm mt-1">
                            ${myClassName !== 'Unassigned' 
                                ? `Assigned Class: <span class="font-semibold text-white bg-indigo-900/50 px-2 py-0.5 rounded border border-indigo-400/30">${escapeHtml(myClassName)}</span>` 
                                : '<span class="text-amber-200">No class assigned yet. Please contact the administrator.</span>'}
                        </p>
                    </div>
                    <div class="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/15 text-left md:text-right">
                        <div class="text-xs text-indigo-200 uppercase tracking-wider">Today's Date</div>
                        <div class="text-sm font-semibold text-white mt-0.5"><i class="far fa-calendar-alt mr-1.5"></i>${todayStr}</div>
                    </div>
                </div>

                <!-- KPI Metric Cards -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <div class="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 hover:shadow-md transition">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs font-semibold uppercase text-gray-400 tracking-wider">My Class Roster</p>
                                <p class="text-3xl font-bold text-gray-800 mt-1">${myStudents.length}</p>
                                <p class="text-xs text-gray-500 mt-1">Students in ${escapeHtml(myClassName)}</p>
                            </div>
                            <div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold">
                                <i class="fas fa-user-graduate"></i>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 hover:shadow-md transition">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs font-semibold uppercase text-gray-400 tracking-wider">Attendance</p>
                                <p class="text-lg font-bold text-emerald-600 mt-1">Daily Register</p>
                                <p class="text-xs text-gray-500 mt-1">Track presence & absent status</p>
                            </div>
                            <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl">
                                <i class="fas fa-calendar-check"></i>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 hover:shadow-md transition sm:col-span-2 lg:col-span-1">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs font-semibold uppercase text-gray-400 tracking-wider">Assessment</p>
                                <p class="text-lg font-bold text-purple-600 mt-1">Continuous Assessment</p>
                                <p class="text-xs text-gray-500 mt-1">Enter marks & term grades</p>
                            </div>
                            <div class="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-xl">
                                <i class="fas fa-graduation-cap"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Core Class Management Actions -->
                <div class="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <i class="fas fa-bolt text-amber-500"></i> Class Management Quick Tasks
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <!-- Mark Attendance Button -->
                        <button onclick="Router.navigate('attendance')" 
                                class="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition group text-left w-full">
                            <div class="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                                <i class="fas fa-clipboard-user"></i>
                            </div>
                            <div>
                                <div class="font-semibold text-gray-800 group-hover:text-emerald-700">Mark Attendance</div>
                                <div class="text-xs text-gray-500">Record daily register for ${escapeHtml(myClassName)}</div>
                            </div>
                        </button>

                        <!-- Continuous Assessment Button -->
                        <button onclick="Router.navigate('grades')" 
                                class="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-purple-500 hover:bg-purple-50/50 transition group text-left w-full">
                            <div class="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                                <i class="fas fa-file-pen"></i>
                            </div>
                            <div>
                                <div class="font-semibold text-gray-800 group-hover:text-purple-700">Continuous Assessment</div>
                                <div class="text-xs text-gray-500">Record coursework & examination grades</div>
                            </div>
                        </button>

                        <!-- View Class Register Button -->
                        <button onclick="Router.navigate('student-registry')" 
                                class="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition group text-left w-full">
                            <div class="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                                <i class="fas fa-address-book"></i>
                            </div>
                            <div>
                                <div class="font-semibold text-gray-800 group-hover:text-indigo-700">Student Register</div>
                                <div class="text-xs text-gray-500">View student profiles & parent contacts</div>
                            </div>
                        </button>
                    </div>
                </div>

                <!-- Assigned Class Roster Table -->
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="p-5 border-b flex flex-wrap gap-2 justify-between items-center bg-gray-50/50">
                        <div>
                            <h3 class="font-bold text-gray-800 text-lg">My Class Roster (${escapeHtml(myClassName)})</h3>
                            <p class="text-xs text-gray-500">Enrolled active students assigned to your class</p>
                        </div>
                        <button onclick="Router.navigate('student-registry')" class="text-sm text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1.5">
                            Full Registry <i class="fas fa-arrow-right text-xs"></i>
                        </button>
                    </div>
                    
                    ${myStudents.length === 0 ? `
                        <div class="p-8 text-center text-gray-500">
                            <i class="fas fa-user-slash text-3xl mb-2 text-gray-300"></i>
                            <p>No active students assigned to ${escapeHtml(myClassName)}.</p>
                        </div>
                    ` : `
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                                        <th class="px-6 py-3">Student ID</th>
                                        <th class="px-6 py-3">Full Name</th>
                                        <th class="px-6 py-3">Class</th>
                                        <th class="px-6 py-3">Parent Phone</th>
                                        <th class="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100">
                                    ${myStudents.slice(0, 10).map(student => `
                                        <tr class="hover:bg-indigo-50/30 transition">
                                            <td class="px-6 py-3.5 text-sm font-mono text-gray-600">${escapeHtml(student.id)}</td>
                                            <td class="px-6 py-3.5 text-sm font-medium text-gray-800">${escapeHtml(student.name)}</td>
                                            <td class="px-6 py-3.5 text-sm">
                                                <span class="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-semibold">
                                                    ${escapeHtml(student.class)}
                                                </span>
                                            </td>
                                            <td class="px-6 py-3.5 text-sm font-mono text-gray-600">
                                                ${student.parentPhone ? escapeHtml(typeof formatPhoneForDisplay === 'function' ? formatPhoneForDisplay(student.parentPhone) : student.parentPhone) : 'N/A'}
                                            </td>
                                            <td class="px-6 py-3.5 text-sm text-right space-x-1">
                                                <button onclick="Router.navigate('grades')" class="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg font-medium transition" title="Enter Marks">
                                                    <i class="fas fa-pen mr-1"></i> Grade
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${myStudents.length > 10 ? `
                            <div class="p-3 text-center border-t bg-gray-50 text-xs text-gray-500">
                                Showing top 10 of ${myStudents.length} class members. 
                                <a href="#" onclick="Router.navigate('student-registry'); return false;" class="text-indigo-600 font-semibold underline">View all in Registry</a>
                            </div>
                        ` : ''}
                    `}
                </div>
            </div>
        `;
    } catch (err) {
        console.error("Error rendering teacher dashboard:", err);
        container.innerHTML = `
            <div class="p-6 text-red-600 bg-red-50 rounded-xl border border-red-200">
                <i class="fas fa-exclamation-circle mr-2"></i> Failed to load dashboard data. Please try again.
            </div>
        `;
    }
}

// ============================================
// PHONE UPDATE MODAL
// ============================================

function openPhoneUpdateModal(studentId) {
    const students = DataService.get('students');
    const student = students.find(s => s.id === studentId);
    
    if (!student) {
        showToast('Student not found!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Update Parent Phone</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p class="text-sm font-medium text-blue-800">Student: ${escapeHtml(student.name)}</p>
            <p class="text-sm text-blue-700">ID: ${escapeHtml(student.id)}</p>
            <p class="text-sm text-blue-700">Current Phone: ${student.parentPhone ? escapeHtml(formatPhoneForDisplay(student.parentPhone)) : 'N/A'}</p>
        </div>
        
        <form id="phoneUpdateForm">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">New Parent Phone *</label>
                    <input type="tel" id="new-phone" required 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="e.g., +265 888 123 456">
                    <p class="text-xs text-gray-400 mt-1">Format: +265 888 123 456 or 0999123456</p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Reason for Change</label>
                    <select id="phone-change-reason" class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="Parent new SIM">Parent new SIM</option>
                        <option value="Correcting error">Correcting error</option>
                        <option value="Parent request">Parent request</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea id="phone-change-notes" rows="2" 
                              class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                              placeholder="Additional notes about this change..."></textarea>
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                    <i class="fas fa-save"></i> Update Phone
                </button>
            </div>
        </form>
    `;
    
    document.getElementById('phoneUpdateForm').onsubmit = function(e) {
        e.preventDefault();
        processPhoneUpdate(studentId);
    };
}


// Update Parent Phone Number
async function handleUpdatePhone(event, studentId) {
    if (event) event.preventDefault();

    const phoneInput = document.getElementById('update-parent-phone');
    if (!phoneInput) return;

    const newPhone = phoneInput.value.trim();

    const success = await FirestoreService.saveStudent({
        id: studentId,
        parentPhone: newPhone
    });

    if (success) {
        showToast('Parent phone updated successfully!', 'success');
        closeModal();

        const container = document.getElementById('main-content') || document.getElementById('student-registry-container');
        if (container) renderStudentRegistry(container);
    } else {
        showToast('Failed to update phone number in cloud.', 'error');
    }
}

/**
 ============================================================================
 STUDENT MANAGEMENT MODULE 
 ============================================================================
 ARCHITECTURE HIGHLIGHTS:
 1. Permanent Student IDs: BAGSS/{AdmissionYear}/{Serial} (e.g., BAGSS/2026/001).
    Class is mutable and NOT part of the ID, ensuring grade/promotion stability.
 2. Cohort Auto-Sorting: Bulk imports & registration sort Female-first, then A-Z.
 3. Unified UI Views: Single Registry View with integrated filters + Dashboard Widget.
 4. Zero Duplication: Standardized modal handling, event delegation, and storage API.
 ============================================================================


/** Defensive global fallbacks */
if (typeof window.DataService === 'undefined') {
    window.DataService = {
        get: (key) => JSON.parse(localStorage.getItem(key) || '[]'),
        set: (key, val) => localStorage.setItem(key, JSON.stringify(val))
    };
}

if (typeof window.showToast === 'undefined') {
    window.showToast = (msg, type = 'info') => console.log(`[${type.toUpperCase()}] ${msg}`);
}

let currentEditingId = null;

// ============================================================================
// PERMANENT STUDENT ID GENERATION & COHORT SORTING
// ============================================================================

/**
 * Generates PERMANENT Student ID: BAGSS/{AdmissionYear}/{Serial}
 * Format for Regular: BAGSS/2026/001
 * Format for Transfer In: BAGSS/2026/T001
 */
function generatePermanentStudentId(admissionYear = new Date().getFullYear(), isTransfer = false, offset = 0) {
    const students = DataService.get('students') || [];
    const yearStr = String(admissionYear);
    const prefix = `BAGSS/${yearStr}/`;
    
    let maxSerial = 0;

    students.forEach(s => {
        if (s && s.id && s.id.startsWith(prefix)) {
            const parts = s.id.split('/');
            const serialPart = parts[2] || '';
            
            if (isTransfer && serialPart.startsWith('T')) {
                const num = parseInt(serialPart.substring(1), 10);
                if (!isNaN(num) && num > maxSerial) maxSerial = num;
            } else if (!isTransfer && !serialPart.startsWith('T')) {
                const num = parseInt(serialPart, 10);
                if (!isNaN(num) && num > maxSerial) maxSerial = num;
            }
        }
    });

    const nextNumber = maxSerial + 1 + offset;
    const formattedSerial = String(nextNumber).padStart(3, '0');
    
    return isTransfer 
        ? `BAGSS/${yearStr}/T${formattedSerial}` 
        : `BAGSS/${yearStr}/${formattedSerial}`;
}

/**
 * Standard School Cohort Sorting Rule:
 * 1. Sex: Females first, then Males
 * 2. Name: Alphabetical (A-Z)
 */
function sortStudentCohort(studentList) {
    return [...studentList].sort((a, b) => {
        const sexA = (a.sex || '').toLowerCase();
        const sexB = (b.sex || '').toLowerCase();
        
        if (sexA !== sexB) {
            if (sexA === 'female') return -1;
            if (sexB === 'female') return 1;
        }
        return (a.name || '').localeCompare(b.name || '');
    });
}

// Real-time Firestore Listener
function listenToStudentRegistry(containerId = 'main-content') {
    if (typeof db === 'undefined' || !db) return;

    db.collection('students').onSnapshot((snapshot) => {
        const container = document.getElementById(containerId) || document.getElementById('student-registry-container');
        if (container) {
            renderStudentRegistry(container);
        }
    }, (error) => {
        console.error("Real-time sync error:", error);
    });
}

async function renderStudentRegistry(container) {
    if (!container) return;
    
    // Show loading indicator
    container.innerHTML = `<div class="p-8 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i> Loading register from cloud...</div>`;

    // Fetch from Firebase
    const students = await DataService.getStudents();
    const activeStudents = students.filter(s => s.status !== 'Left');
    const leftStudents = students.filter(s => s.status === 'Left');
    const sortedStudents = [...students].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    const uniqueClasses = [...new Set(students.map(s => s.class))].filter(Boolean).sort();

    // Render registry table html
    container.innerHTML = `
        <div class="bg-white rounded-2xl shadow">
            <!-- Header Controls & Actions -->
            <div class="p-4 border-b">
                <div class="flex flex-wrap gap-3 items-center justify-between">
                    <div class="flex flex-wrap gap-3 items-center flex-1">
                        <div class="flex-1 min-w-[200px]">
                            <div class="relative">
                                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                <input type="text" id="student-search" 
                                       class="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                       placeholder="Search by ID, Name, Class, or Phone..." 
                                       oninput="filterStudentTable()">
                            </div>
                        </div>
                        <select id="student-class-filter" class="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" onchange="filterStudentTable()">
                            <option value="">All Classes</option>
                            ${uniqueClasses.map(cls => `<option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>`).join('')}
                        </select>
                        <select id="student-status-filter" class="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" onchange="filterStudentTable()">
                            <option value="active">Active Only</option>
                            <option value="left">Left Only</option>
                            <option value="all">All (including Left)</option>
                        </select>
                    </div>
                    
                    <div class="flex gap-2 flex-wrap">
                        <button onclick="showAddStudentModal()" class="bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                            <i class="fas fa-plus"></i> Add Student
                        </button>
                        <button onclick="showTransferStudentModal()" class="bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 flex items-center gap-2">
                            <i class="fas fa-arrow-right"></i> Transfer In
                        </button>
                        <button onclick="showBulkUploadModal()" class="bg-emerald-600 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2">
                            <i class="fas fa-upload"></i> Bulk Import
                        </button>
                        <button onclick="exportStudentsToCSV()" class="bg-slate-700 text-white px-4 py-2.5 rounded-lg hover:bg-slate-800 flex items-center gap-2" title="Export Register to CSV">
                            <i class="fas fa-file-excel"></i> Export CSV
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Table Body -->
            <div class="overflow-x-auto">
                <table class="table w-full border-collapse">
                    <thead>
                        <tr class="bg-gray-50 border-b">
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Student ID</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Full Name</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Class</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Parent Phone</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="student-table-body">
                        ${sortedStudents.map((student, index) => `
                            <tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 ${student.status === 'Left' ? 'opacity-60' : ''}" data-id="${escapeHtml(student.id)}" data-status="${escapeHtml(student.status || 'Active')}">
                                <td class="px-4 py-3 text-sm font-mono">${escapeHtml(student.id)}</td>
                                <td class="px-4 py-3 text-sm font-medium">${escapeHtml(student.name)}</td>
                                <td class="px-4 py-3 text-sm">
                                    <span class="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-semibold">${escapeHtml(student.class)}</span>
                                </td>
                                <td class="px-4 py-3 text-sm">
                                    <span class="font-mono text-sm">${student.parentPhone ? escapeHtml(formatPhoneForDisplay(student.parentPhone)) : 'N/A'}</span>
                                </td>
                                <td class="px-4 py-3 text-sm">
                                    <span class="px-2 py-1 ${student.status === 'Active' ? 'bg-green-100 text-green-800' : student.status === 'Transfer' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'} rounded-full text-xs font-semibold">
                                        ${escapeHtml(student.status || 'Active')}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-sm">
                                    <button onclick="openEditStudentModal('${escapeHtml(student.id)}')" class="text-blue-600 hover:text-blue-800 mr-1" title="Edit Student">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="openPhoneUpdateModal('${escapeHtml(student.id)}')" class="text-amber-600 hover:text-amber-800 mr-1" title="Update Phone">
                                        <i class="fas fa-phone"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="p-4 border-t text-sm text-gray-500 flex justify-between">
                <span>Active Students: ${activeStudents.length}</span>
                <span>Left: ${leftStudents.length}</span>
                <span>Total: ${students.length}</span>
            </div>
        </div>
    `;

    filterStudentTable();
}
            
/**
 * Filter handler supporting search query, class, and active/left status.
 */
function filterStudentTable() {
    const searchTerm = document.getElementById('student-search')?.value.toLowerCase().trim() || '';
    const classFilter = document.getElementById('student-class-filter')?.value || '';
    const statusFilter = document.getElementById('student-status-filter')?.value || 'active';
    const rows = document.querySelectorAll('#student-table-body tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const classCell = row.querySelector('td:nth-child(3)')?.textContent.trim() || '';
        const status = row.getAttribute('data-status') || 'Active';

        const matchesSearch = !searchTerm || text.includes(searchTerm);
        const matchesClass = !classFilter || classCell.includes(classFilter);
        
        let matchesStatus = true;
        if (statusFilter === 'active') {
            matchesStatus = status !== 'Left';
        } else if (statusFilter === 'left') {
            matchesStatus = status === 'Left';
        }

        row.style.display = (matchesSearch && matchesClass && matchesStatus) ? '' : 'none';
    });
}

// ============================================================================
//  BULK IMPORT ENGINE (CSV/EXCEL WITH AUTO-SORT & ID ASSIGNMENT)
// ============================================================================
// Variable to temporarily store parsed CSV rows before committing
let pendingImportData = [];

// ============================================
// 1. SHOW BULK UPLOAD MODAL
// ============================================
function showBulkUploadModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    if (!modal || !modalContent) return;

    pendingImportData = [];
    const currentYear = new Date().getFullYear();

    modalContent.innerHTML = `
        <!-- Header -->
        <div class="flex justify-between items-center border-b pb-3 mb-4">
            <div>
                <h3 class="text-xl font-bold text-gray-800">Bulk Import Students</h3>
                <p class="text-xs text-gray-500">Upload class register CSV. System auto-formats and assigns Student IDs.</p>
            </div>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>

        <div class="space-y-4">
            <!-- Target Class (Manual Input) & Admission Year -->
            <div class="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div>
                    <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Type Class *</label>
                    <input type="text" id="import-target-class" class="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g. Form 1">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Admission Year *</label>
                    <input type="number" id="import-admission-year" value="${currentYear}" class="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g. ${currentYear}">
                </div>
            </div>

            <!-- Step 1: Download Template -->
            <div class="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-blue-900 font-medium">Step 1: Download CSV Template</p>
                        <p class="text-xs text-blue-700 mt-0.5">Note: Ensure student names begin with <strong>Surname first</strong> (e.g. Banda John).</p>
                    </div>
                    <button onclick="downloadStudentTemplate()" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
                        <i class="fas fa-file-download"></i> Download Template
                    </button>
                </div>
            </div>

            <!-- Step 2: Upload CSV File -->
            <div>
                <p class="text-sm text-gray-700 font-medium mb-1">Step 2: Upload completed CSV file</p>
                <div id="drop-zone" onclick="document.getElementById('bulk-file-input').click()" class="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center hover:border-blue-500 transition-colors cursor-pointer bg-gray-50">
                    <i class="fas fa-cloud-upload-alt text-2xl text-gray-400 mb-1"></i>
                    <p class="text-sm text-gray-600">Click to browse or drag & drop CSV file here</p>
                    <p id="selected-file-name" class="text-xs text-blue-600 font-semibold mt-2 hidden"></p>
                    <input type="file" id="bulk-file-input" accept=".csv" class="hidden" onchange="handleFileSelect(event)">
                </div>
            </div>

            <!-- Preview Count / Info -->
            <div id="import-preview-info" class="hidden text-sm text-gray-600 bg-gray-100 p-3 rounded-lg">
                <span id="import-record-count" class="font-bold text-gray-800">0</span> records parsed and ready for import.
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-end gap-3 border-t pt-4 mt-5">
            <button onclick="closeModal()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
            <button id="btn-process-import" onclick="processBulkImport()" disabled class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold flex items-center gap-2">
                <i class="fas fa-upload"></i> Process Import
            </button>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    setupDropZoneEvents();
}

 function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

// ============================================
// 2. DOWNLOAD CSV TEMPLATE
// ============================================
function downloadStudentTemplate() {
    // Escape phone numbers with quotes to prevent Excel scientific notation (e.g., 2.65E+11)
    const csvHeader = `"Full Name (Surname First)","Sex","Age","Parent Phone"\n`;
    const sampleRow1 = `"Banda John","Male","15","0991234567"\n`;
    const sampleRow2 = `"Phiri Mary","Female","14","0888123456"\n`;
    
    const blob = new Blob([csvHeader + sampleRow1 + sampleRow2], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'Student_Import_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ============================================
// 3. FILE SELECTION & PARSING
// ============================================
function setupDropZoneEvents() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('bulk-file-input');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-blue-500', 'bg-blue-50');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect({ target: fileInput });
        }
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    const previewInfo = document.getElementById('import-preview-info');
    const recordCountSpan = document.getElementById('import-record-count');
    const processBtn = document.getElementById('btn-process-import');
    const fileNameSpan = document.getElementById('selected-file-name');

    if (!file) return;

    if (!file.name.endsWith('.csv')) {
        showToast('Please upload a valid .csv file', 'error');
        return;
    }

    fileNameSpan.textContent = `Selected: ${file.name}`;
    fileNameSpan.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = function (e) {
        pendingImportData = parseCSVText(e.target.result);

        if (pendingImportData.length === 0) {
            showToast('No valid student records found in file', 'warning');
            processBtn.disabled = true;
            previewInfo.classList.add('hidden');
        } else {
            recordCountSpan.textContent = pendingImportData.length;
            previewInfo.classList.remove('hidden');
            processBtn.disabled = false;
        }
    };

    reader.readAsText(file);
}

function parseCSVText(csvText) {
    const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1').toLowerCase());
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
        if (!values || values.length === 0) continue;

        const rowObj = {};
        headers.forEach((header, index) => {
            let val = values[index] ? values[index].trim().replace(/^"(.*)"$/, '$1') : '';
            rowObj[header] = val;
        });

        if (rowObj['full name (surname first)'] || rowObj['full name'] || rowObj['name']) {
            results.push(rowObj);
        }
    }

    return results;
}

// Format Phone for Malawi standard (099..., 088..., +265...)
function formatMalawianPhone(phoneStr) {
    if (!phoneStr) return 'N/A';
    let digits = String(phoneStr).replace(/\D/g, ''); // Extract digits only
    
    // If entered as 265991234567, convert to 0991234567
    if (digits.startsWith('265') && digits.length === 12) {
        digits = '0' + digits.slice(3);
    }
    
    // Standard Malawi length check (10 digits starting with 0)
    if (digits.length === 9) digits = '0' + digits; // prepend leading zero if dropped by excel
    
    return digits || 'N/A';
}

// ============================================
// 2. PROCESS IMPORT & VALIDATE MANUAL CLASS INPUT
// ============================================
async function processBulkImport() {
    const rawClassInput = document.getElementById('import-target-class')?.value.trim();
    const admissionYear = parseInt(document.getElementById('import-admission-year')?.value) || new Date().getFullYear();

    if (!rawClassInput) {
        showToast('Please enter a target class/stream (e.g. Form 1 East)', 'error');
        return;
    }

    if (!pendingImportData || pendingImportData.length === 0) {
        showToast('No student data found to import', 'error');
        return;
    }

    const existingStudents = DataService.get('students', []);
    const yearCounter = existingStudents.filter(s => s.id && s.id.startsWith(`BAGSS/${admissionYear}/`)).length;
    let serial = yearCounter;

    const newStudents = pendingImportData.map(row => {
        serial += 1;
        const studentId = `BAGSS/${admissionYear}/${String(serial).padStart(3, '0')}`;
        const rawPhone = row['parent phone'] || row['phone'] || '';

        return {
            id: studentId,
            name: row['full name (surname first)'] || row['full name'] || row['name'] || 'Unknown',
            sex: row['sex'] || row['gender'] || 'Not Specified',
            age: parseInt(row['age']) || null,
            class: typeof standardizeClassName === 'function' ? standardizeClassName(rawClassInput) : rawClassInput.toUpperCase(),
            admissionYear: admissionYear,
            parentPhone: formatMalawianPhone(rawPhone),
            previousSchool: null,
            transferDate: null,
            exitDate: null,
            status: 'Active'
        };
    });

    // Save to Cloud Firestore
    const result = await DataAccess.insertBatch('students', newStudents);

    if (result.success.length > 0) {
        showToast(`Successfully imported ${result.success.length} students into ${rawClassInput.toUpperCase()}!`, 'success');
        
        // Refresh register from Firestore
        const container = document.getElementById('main-content') || document.getElementById('student-registry-container');
        if (container) renderStudentRegistry(container);
        
        closeModal();
    } else {
        showToast('Import failed. Please verify connection & CSV formatting.', 'error');
    }
}

// ============================================
// 5. EXPORT REGISTER TO CSV & PRINT HARD COPY
// ============================================
async function exportStudentsToCSV() {
    showToast('Fetching latest student data for export...', 'info');
    const students = await DataService.getStudents();

    if (!students || students.length === 0) {
        showToast('No student data available to export.', 'error');
        return;
    }

    // CSV Headers
    const headers = ['Student ID', 'Full Name', 'Class', 'Parent Phone', 'Status', 'Entry Date', 'Exit Date', 'Exit Reason'];
    
    // Map rows
    const rows = students.map(s => [
        `"${s.id || ''}"`,
        `"${s.name || ''}"`,
        `"${s.class || ''}"`,
        `"${s.parentPhone || ''}"`,
        `"${s.status || 'Active'}"`,
        `"${s.entryDate || ''}"`,
        `"${s.exitDate || ''}"`,
        `"${s.exitReason || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Student_Registry_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Student registry exported successfully!', 'success');
}

function printStudentRegister() {
    window.print();
}

//  FILE SELECTION & DRAG-AND-DROP
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('bulk-file-input');

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-500', 'bg-blue-50');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-blue-50');
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                handleFileSelect({ target: fileInput });
            }
        });
    }
});

// ============================================================================
// SINGLE STUDENT CRUD OPERATIONS
// ============================================================================

function showAddStudentModal() {
    currentEditingId = null;
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    if (!modal || !modalContent) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold text-gray-800">Add New Student</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <form id="studentForm">
            <div class="grid grid-cols-2 gap-4">
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input type="text" id="sname" required class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                    <input type="text" id="sclass" required class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Form 1A">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Sex *</label>
                    <select id="ssex" required class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Age *</label>
                    <input type="number" id="sage" required min="10" max="25" class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Admission Year *</label>
                    <input type="number" id="sadmission-year" value="${new Date().getFullYear()}" class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                </div>
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Parent/Guardian Phone *</label>
                    <input type="tel" id="sparent-phone" required class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g., +265 888 123 456">
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" class="flex-1 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" class="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">Save Student</button>
            </div>
        </form>
    `;

    document.getElementById('studentForm').onsubmit = saveStudent;
}

// Add or Save Single Student
async function handleSaveStudent(event) {
    if (event) event.preventDefault();

    const studentIdInput = document.getElementById('student-id');
    const nameInput = document.getElementById('student-name');
    const classInput = document.getElementById('student-class');
    const phoneInput = document.getElementById('student-phone');
    const statusInput = document.getElementById('student-status');

    if (!nameInput?.value || !classInput?.value) {
        showToast('Please fill in required fields (Name and Class)', 'error');
        return;
    }

    // Use existing ID or generate new standard ID
    const studentId = studentIdInput?.value?.trim() || DataService.generateId('BAGSS');

    const studentData = {
        id: studentId,
        name: nameInput.value.trim(),
        class: classInput.value.trim(),
        parentPhone: phoneInput ? phoneInput.value.trim() : '',
        status: statusInput ? statusInput.value : 'Active',
        entryDate: new Date().toISOString().split('T')[0]
    };

    // Save directly to Firestore
    const success = await FirestoreService.saveStudent(studentData);

    if (success) {
        showToast(`Student ${studentData.name} saved successfully!`, 'success');
        closeModal();
        
        // Refresh live UI
        const container = document.getElementById('main-content') || document.getElementById('student-registry-container');
        if (container) renderStudentRegistry(container);
    } else {
        showToast('Failed to save student to cloud database.', 'error');
    }
}

// Open Edit Student Modal with Cloud Data
async function openEditStudentModal(studentId) {
    const students = await DataService.getStudents();
    const student = students.find(s => s.id === studentId);

    if (!student) {
        showToast('Student not found!', 'error');
        return;
    }

    const modalContent = document.getElementById('modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800">Edit Student</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <form onsubmit="handleSaveStudent(event)">
            <input type="hidden" id="student-id" value="${escapeHtml(student.id)}">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
                    <input type="text" value="${escapeHtml(student.id)}" class="w-full px-3 py-2 border rounded-lg bg-gray-100" disabled>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input type="text" id="student-name" value="${escapeHtml(student.name)}" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                    <input type="text" id="student-class" value="${escapeHtml(student.class)}" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Parent Phone</label>
                    <input type="text" id="student-phone" value="${escapeHtml(student.parentPhone || '')}" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select id="student-status" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <option value="Active" ${student.status === 'Active' ? 'selected' : ''}>Active</option>
                        <option value="Transfer" ${student.status === 'Transfer' ? 'selected' : ''}>Transfer</option>
                        <option value="Left" ${student.status === 'Left' ? 'selected' : ''}>Left</option>
                    </select>
                </div>
            </div>
            <div class="mt-6 flex justify-end gap-3">
                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save Changes</button>
            </div>
        </form>
    `;

    document.getElementById('modal').classList.remove('hidden');
}

/**
 * Safely deletes a student by unique Student ID.
 */
function deleteStudent(studentId) {
    if (!studentId) return;

    const students = DataService.get('students') || [];
    const student = students.find(s => s.id === studentId);

    const studentNameStr = student ? ` "${student.name}"` : '';
    if (!confirm(`Are you sure you want to delete student${studentNameStr}? This action cannot be undone.`)) {
        return;
    }
    
    const updatedStudents = students.filter(s => s.id !== studentId);
    DataService.set('students', updatedStudents);
    showToast('Student deleted successfully!', 'success');
    
    if (typeof Router !== 'undefined' && Router.refresh) {
        Router.refresh();
    } else if (typeof Router !== 'undefined' && Router.navigate) {
        Router.navigate('students');
    }
}

// Open Phone Update Modal with Cloud Data
async function openPhoneUpdateModal(studentId) {
    const students = await DataService.getStudents();
    const student = students.find(s => s.id === studentId);

    if (!student) {
        showToast('Student not found!', 'error');
        return;
    }

    const modalContent = document.getElementById('modal-content');
    if (!modalContent) return;

    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800">Update Parent Phone</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <form onsubmit="handleUpdatePhone(event, '${escapeHtml(student.id)}')">
            <div class="space-y-4">
                <p class="text-sm text-gray-600">Updating phone for <strong>${escapeHtml(student.name)}</strong> (${escapeHtml(student.id)})</p>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Parent Phone Number</label>
                    <input type="text" id="update-parent-phone" value="${escapeHtml(student.parentPhone || '')}" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="+265..." required>
                </div>
            </div>
            <div class="mt-6 flex justify-end gap-3">
                <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">Update Phone</button>
            </div>
        </form>
    `;

    document.getElementById('modal').classList.remove('hidden');
}

// ============================================================================
// 3. TRANSFER OPERATIONS (IN & OUT)
// ============================================================================

/**
 * Displays modal for transferring a student in from another school.
 */
function showTransferStudentModal() {
    currentEditingId = null;
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    if (!modal || !modalContent) return;
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-semibold">Transfer Student In</h3>
            <span class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">Transfer In</span>
        </div>
        <form id="transferInForm">
            <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input type="text" id="sname" required class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                    <input type="text" id="sclass" required class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500" placeholder="e.g., Form 1A">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Sex *</label>
                    <select id="ssex" required class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Age *</label>
                    <input type="number" id="sage" required min="10" max="25" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Parent Phone *</label>
                    <input type="tel" id="sparent-phone" required class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500" placeholder="+265 888 123 456">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Admission Year</label>
                    <input type="number" id="sadmission-year" value="${new Date().getFullYear()}" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Previous School</label>
                    <input type="text" id="sprev-school" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500" placeholder="Previous school name">
                </div>
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Transfer Date</label>
                    <input type="date" id="stransfer-date" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500" value="${new Date().toISOString().split('T')[0]}">
                </div>
            </div>
            
            <div class="mt-4 flex gap-3">
                <button type="button" onclick="closeModal()" class="flex-1 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" class="flex-1 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Save Transfer Student</button>
            </div>
        </form>
    `;
    
    document.getElementById('transferInForm').onsubmit = saveTransferStudent;
}

/**
 * Saves a new incoming transfer student record.
 */
function saveTransferStudent(e) {
    e.preventDefault();
    
    const name = document.getElementById('sname').value.trim();
    const studentClass = document.getElementById('sclass').value.trim();
    const sex = document.getElementById('ssex').value;
    const age = parseInt(document.getElementById('sage').value, 10);
    const parentPhone = document.getElementById('sparent-phone').value.trim();
    const admissionYear = parseInt(document.getElementById('sadmission-year').value, 10) || new Date().getFullYear();
    const prevSchool = document.getElementById('sprev-school').value.trim() || 'Unknown';
    const transferDate = document.getElementById('stransfer-date').value || new Date().toISOString().split('T')[0];

    if (!name || !studentClass || !sex || isNaN(age) || !parentPhone) {
        showToast('Please fill all required fields', 'error');
        return;
    }

    let students = DataService.get('students') || [];
    const newId = generateNextStudentId(studentClass, true, admissionYear);

    const newStudent = {
        id: newId,
        name: name,
        class: studentClass,
        sex: sex,
        age: age,
        parentPhone: parentPhone,
        admissionYear: admissionYear,
        admissionDate: transferDate,
        status: 'Transfer',
        previousSchool: prevSchool,
        transferDate: transferDate
    };

    students.push(newStudent);
    DataService.set('students', students);
    
    closeModal();
    showToast('Transfer student added successfully!', 'success');
    if (typeof Router !== 'undefined' && Router.refresh) Router.refresh();
}

/**
 * Modal to process transferring a student out to another school.
 */
function showTransferOutModal(studentId) {
    const students = DataService.get('students') || [];
    const student = students.find(s => s.id === studentId);
    
    if (!student) {
        showToast('Student not found!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    if (!modal || !modalContent) return;
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-semibold">Transfer Student Out</h3>
            <span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Transfer Out</span>
        </div>
        
        <div class="bg-gray-50 rounded-lg p-3 mb-4">
            <p class="text-sm"><span class="font-semibold">Student:</span> ${escapeHtml(student.name)}</p>
            <p class="text-sm"><span class="font-semibold">ID:</span> ${escapeHtml(student.id)}</p>
            <p class="text-sm"><span class="font-semibold">Current Class:</span> ${escapeHtml(student.class)}</p>
        </div>
        
        <form id="transferOutForm">
            <div class="space-y-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Transferring To *</label>
                    <input type="text" id="transfer-to-school" required class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500" placeholder="e.g., Chintheche Secondary School">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Transfer Date</label>
                    <input type="date" id="transfer-out-date" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Reason for Transfer</label>
                    <select id="transfer-reason" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="Parent relocation">Parent relocation</option>
                        <option value="School transfer">School transfer</option>
                        <option value="Financial reasons">Financial reasons</option>
                        <option value="Academic reasons">Academic reasons</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                    <textarea id="transfer-notes" rows="2" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500" placeholder="Any additional information..."></textarea>
                </div>
            </div>
            
            <div class="mt-4 flex gap-3">
                <button type="button" onclick="closeModal()" class="flex-1 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" class="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700"><i class="fas fa-arrow-right"></i> Confirm Transfer Out</button>
            </div>
        </form>
    `;
    
    document.getElementById('transferOutForm').onsubmit = function(e) {
        e.preventDefault();
        processTransferOut(studentId);
    };
}

// Transfer Out (Mark Student as Left)
async function handleTransferOut(studentId) {
    const reasonInput = document.getElementById('transfer-out-reason');
    const exitDateInput = document.getElementById('transfer-out-date');

    const exitReason = reasonInput ? reasonInput.value.trim() : 'Transferred Out';
    const exitDate = exitDateInput ? exitDateInput.value : new Date().toISOString().split('T')[0];

    const success = await FirestoreService.saveStudent({
        id: studentId,
        status: 'Left',
        exitReason: exitReason,
        exitDate: exitDate
    });

    if (success) {
        showToast('Student status updated to Left.', 'success');
        closeModal();

        const container = document.getElementById('main-content') || document.getElementById('student-registry-container');
        if (container) renderStudentRegistry(container);
    } else {
        showToast('Failed to update status in cloud.', 'error');
    }
}

// Reactivate Student
async function reactivateStudent(studentId) {
    if (!confirm(`Are you sure you want to reactivate student ID: ${studentId}?`)) return;

    const success = await FirestoreService.saveStudent({
        id: studentId,
        status: 'Active',
        exitReason: null,
        exitDate: null
    });

    if (success) {
        showToast('Student reactivated successfully!', 'success');

        const container = document.getElementById('main-content') || document.getElementById('student-registry-container');
        if (container) renderStudentRegistry(container);
    } else {
        showToast('Failed to reactivate student.', 'error');
    }
}

// ============================================================================
// 5. VIEWS & RENDERING COMPONENTS
// ============================================================================

/**
 * Creates lightweight HTML table snippet for dashboard/recent students component.
 */
function createRecentStudentsTable(students) {
    if (!students || students.length === 0) {
        return `<div class="p-4 text-center text-gray-500">No recent students found.</div>`;
    }

    return `
        <div class="table-wrapper border rounded-lg overflow-hidden">
            <table class="table w-full border-collapse">
                <thead>
                    <tr class="bg-indigo-50 border-b-2 border-indigo-200">
                        <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider border-r border-indigo-100">Name</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider border-r border-indigo-100">Class</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider border-r border-indigo-100">Sex</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider">Admission Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map((student, i) => `
                        <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors duration-150">
                            <td class="px-4 py-3 text-sm text-gray-800 border-r border-gray-100 font-medium">${escapeHtml(student.name)}</td>
                            <td class="px-4 py-3 text-sm text-gray-600 border-r border-gray-100">
                                <span class="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-semibold">${escapeHtml(student.class)}</span>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-600 border-r border-gray-100">
                                <span class="${student.sex === 'Female' ? 'text-pink-600' : 'text-blue-600'}">
                                    <i class="fas ${student.sex === 'Female' ? 'fa-venus' : 'fa-mars'} mr-1"></i>
                                    ${escapeHtml(student.sex)}
                                </span>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-600">${student.admissionDate ? formatDate(student.admissionDate) : 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Standard Student List View with ID-based Event Delegation.
 */
function renderStudents(container) {
    if (!container) return;
    let students = DataService.get('students') || [];
    
    // Create copy for sorted display (Female first, then Name)
    const sortedStudents = [...students].sort((a, b) => {
        if (a.sex !== b.sex) return a.sex === 'Female' ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
    });
    
    container.innerHTML = `
        <div class="bg-white rounded-2xl shadow">
            <div class="p-6 border-b flex justify-between items-center">
                <h3 class="text-xl font-semibold">All Students (${sortedStudents.length})</h3>
                <button onclick="showAddStudentModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                    <i class="fas fa-plus"></i> Add Student
                </button>
            </div>
            
            <div class="overflow-x-auto">
                <table class="table w-full border-collapse">
                    <thead>
                        <tr class="bg-indigo-50 border-b-2 border-indigo-200">
                            <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider">ID</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider">Name</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider">Class</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider">Sex</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider">Age</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-indigo-800 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="students-table-body">
                        ${sortedStudents.map((student, index) => `
                            <tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50">
                                <td class="px-4 py-3 text-sm font-mono">${escapeHtml(student.id || 'N/A')}</td>
                                <td class="px-4 py-3 text-sm font-medium">${escapeHtml(student.name)}</td>
                                <td class="px-4 py-3 text-sm">
                                    <span class="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-semibold">${escapeHtml(student.class)}</span>
                                </td>
                                <td class="px-4 py-3 text-sm">
                                    <span class="${student.sex === 'Female' ? 'text-pink-600' : 'text-blue-600'}">
                                        <i class="fas ${student.sex === 'Female' ? 'fa-venus' : 'fa-mars'}"></i> 
                                        ${escapeHtml(student.sex)}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-sm">${student.age || 'N/A'}</td>
                                <td class="px-4 py-3">
                                    <button class="edit-btn text-indigo-600 hover:text-indigo-800 mr-4" data-id="${escapeHtml(student.id)}" title="Edit Student">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="delete-btn text-red-600 hover:text-red-800" data-id="${escapeHtml(student.id)}" title="Delete Student">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Event Delegation using Student ID
    const tbody = document.getElementById('students-table-body');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn');
            if (editBtn) {
                const studentId = editBtn.dataset.id;
                openEditStudentModal(studentId);
                return;
            }
            
            const deleteBtn = e.target.closest('.delete-btn');
            if (deleteBtn) {
                const studentId = deleteBtn.dataset.id;
                deleteStudent(studentId);
            }
        });
    }
}

// ============================================
// REQUEST CENTER 
// ============================================

function renderRequestCenter(container) {
    const phoneRequests = DataService.get('phoneUpdateRequests') || [];
    const pendingRequests = phoneRequests.filter(r => r.status === 'pending');
    const history = phoneRequests.filter(r => r.status !== 'pending');
    
    container.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="bg-white rounded-2xl shadow p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-2xl font-semibold text-gray-800">📱 Phone Update Requests</h3>
                    <div class="flex gap-3">
                        <span class="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-semibold">
                            ${pendingRequests.length} Pending
                        </span>
                        <span class="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-semibold">
                            ${history.length} History
                        </span>
                    </div>
                </div>
                
                <!-- Pending Requests Feed -->
                <div class="space-y-4">
                    ${pendingRequests.length === 0 ? `
                        <div class="text-center py-12 text-gray-400">
                            <i class="fas fa-check-circle text-4xl mb-3"></i>
                            <p>No pending phone update requests</p>
                            <p class="text-sm">All requests have been processed</p>
                        </div>
                    ` : `
                        ${pendingRequests.map((request, index) => `
                            <div class="border rounded-xl p-4 hover:shadow-md transition ${request.status === 'pending' ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}">
                                <div class="flex justify-between items-start">
                                    <div class="flex-1">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                                                <i class="fas fa-phone"></i>
                                            </div>
                                            <div>
                                                <p class="font-semibold text-gray-800">${escapeHtml(request.studentName)}</p>
                                                <p class="text-sm text-gray-500">${escapeHtml(request.studentId)}</p>
                                            </div>
                                            <span class="px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold ml-2">Pending</span>
                                        </div>
                                        <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <span class="text-gray-500">Current Phone:</span>
                                                <span class="font-medium">${escapeHtml(formatPhoneForDisplay(request.oldPhone))}</span>
                                            </div>
                                            <div>
                                                <span class="text-gray-500">New Phone:</span>
                                                <span class="font-medium text-amber-700">${escapeHtml(formatPhoneForDisplay(request.newPhone))}</span>
                                            </div>
                                            <div class="col-span-2">
                                                <span class="text-gray-500">Reason:</span>
                                                <span class="font-medium">${escapeHtml(request.reason || 'Not specified')}</span>
                                            </div>
                                            ${request.notes ? `
                                                <div class="col-span-2">
                                                    <span class="text-gray-500">Notes:</span>
                                                    <span class="font-medium">${escapeHtml(request.notes)}</span>
                                                </div>
                                            ` : ''}
                                            <div class="col-span-2 text-xs text-gray-400">
                                                Requested: ${formatDate(request.requestedAt)}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex flex-col gap-2 ml-4">
                                        <button onclick="approvePhoneRequest('${request.id}')" 
                                                class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                                            <i class="fas fa-check"></i> Approve
                                        </button>
                                        <button onclick="denyPhoneRequest('${request.id}')" 
                                                class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
                                            <i class="fas fa-times"></i> Deny
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    `}
                </div>
                
                <!-- History -->
                ${history.length > 0 ? `
                    <div class="mt-8 border-t pt-4">
                        <h4 class="text-sm font-semibold text-gray-600 mb-3">Request History</h4>
                        <div class="space-y-2">
                            ${history.slice(0, 10).map(request => `
                                <div class="flex justify-between items-center border-b border-gray-100 py-2">
                                    <div>
                                        <span class="font-medium">${escapeHtml(request.studentName)}</span>
                                        <span class="text-sm text-gray-500">${escapeHtml(request.studentId)}</span>
                                        <span class="text-xs text-gray-400 ml-2">${formatDate(request.requestedAt)}</span>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <span class="text-sm">${escapeHtml(formatPhoneForDisplay(request.oldPhone))} → ${escapeHtml(formatPhoneForDisplay(request.newPhone))}</span>
                                        <span class="px-2 py-1 ${request.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded-full text-xs font-semibold">
                                            ${request.status === 'approved' ? 'Approved' : 'Denied'}
                                        </span>
                                    </div>
                                </div>
                            `).join('')}
                            ${history.length > 10 ? `<div class="text-sm text-gray-400 text-center">... and ${history.length - 10} more</div>` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================
// PHONE REQUEST APPROVAL
// ============================================

function approvePhoneRequest(requestId) {
    if (!confirm('Approve this phone number update?')) return;
    
    const requests = DataService.get('phoneUpdateRequests') || [];
    const request = requests.find(r => r.id === requestId);
    
    if (!request) {
        showToast('Request not found!', 'error');
        return;
    }
    
    // Update the student's phone
    const students = DataService.get('students');
    const student = students.find(s => s.id === request.studentId);
    
    if (student) {
        student.parentPhone = request.newPhone;
        DataService.set('students', students);
    }
    
    // Mark request as approved
    request.status = 'approved';
    request.processedAt = new Date().toISOString();
    request.processedBy = currentUser?.name || 'Admin';
    DataService.set('phoneUpdateRequests', requests);
    
    // Log in history
    let phoneHistory = DataService.get('phoneUpdateHistory') || [];
    phoneHistory.push({
        studentId: request.studentId,
        studentName: request.studentName,
        oldPhone: request.oldPhone,
        newPhone: request.newPhone,
        reason: request.reason,
        notes: request.notes,
        approvedBy: currentUser?.name || 'Admin',
        approvedAt: new Date().toISOString()
    });
    DataService.set('phoneUpdateHistory', phoneHistory);
    
    showToast(`Phone update approved for ${request.studentName}`, 'success');
    Router.refresh();
}

function denyPhoneRequest(requestId) {
    if (!confirm('Deny this phone number update?')) return;
    
    const requests = DataService.get('phoneUpdateRequests') || [];
    const request = requests.find(r => r.id === requestId);
    
    if (!request) {
        showToast('Request not found!', 'error');
        return;
    }
    
    request.status = 'denied';
    request.processedAt = new Date().toISOString();
    request.processedBy = currentUser?.name || 'Admin';
    DataService.set('phoneUpdateRequests', requests);
    
    showToast(`Phone update denied for ${request.studentName}`, 'warning');
    Router.refresh();
}

// ============================================
// JCE GRADING (Form 1 & 2)
// ============================================

function getJCEGrade(score) {
    if (score === null || score === undefined) {
        return { grade: '-', remark: 'No Score' };
    }
    
    if (score >= 90) return { grade: 'A', remark: 'Excellent' };
    if (score >= 80) return { grade: 'B', remark: 'Very Good' };
    if (score >= 60) return { grade: 'C', remark: 'Good' };
    if (score >= 40) return { grade: 'D', remark: 'Average' };
    return { grade: 'F', remark: 'Fail' };
}

function calculateJCEResult(student, subjectScores, term, year) {
    const validScores = subjectScores.filter(s => s.score !== null);
    const subjectsSat = validScores.length;
    const subjectsPassed = validScores.filter(s => s.score >= JCE_PASS_MIN).length;
    const subjectsFailed = subjectsSat - subjectsPassed;
    const total = validScores.reduce((sum, s) => sum + s.score, 0);
    const average = subjectsSat > 0 ? Math.round(total / subjectsSat) : 0;
    
    // Check if English is passed
    const englishSubject = validScores.find(s => 
        s.subject.toLowerCase().includes('english')
    );
    const englishPassed = englishSubject ? englishSubject.score >= JCE_PASS_MIN : false;
    
    // Determine if student passed JCE
    const passed = subjectsPassed >= JCE_MIN_SUBJECTS && englishPassed;
    
    // Get overall grade
    const overallGrade = getJCEGrade(average);
    
    return {
        subjectsSat,
        subjectsPassed,
        subjectsFailed,
        total,
        average,
        overallGrade: overallGrade.grade,
        overallRemark: overallGrade.remark,
        passed,
        englishPassed,
        status: passed ? 'PASS' : 'FAIL',
        message: passed 
            ? `✅ Passed JCE! Passed ${subjectsPassed}/${subjectsSat} subjects including English.`
            : `❌ Failed JCE. ${!englishPassed ? 'English not passed. ' : ''}Passed ${subjectsPassed}/${subjectsSat} subjects (need ${JCE_MIN_SUBJECTS}).`
    };
}

// ============================================
// MSCE GRADING (Form 3 & 4)
// ============================================

function getMSCEGrade(score) {
    if (score === null || score === undefined) {
        return { grade: '-', remark: 'No Score' };
    }
    
    if (score >= 90) return { grade: '1', remark: 'Distinction' };
    if (score >= 85) return { grade: '2', remark: 'Distinction' };
    if (score >= 80) return { grade: '3', remark: 'Credit' };
    if (score >= 75) return { grade: '4', remark: 'Credit' };
    if (score >= 70) return { grade: '5', remark: 'Credit' };
    if (score >= 55) return { grade: '6', remark: 'Credit' };
    if (score >= 50) return { grade: '7', remark: 'Pass' };
    if (score >= 40) return { grade: '8', remark: 'Pass' };
    return { grade: '9', remark: 'Fail' };
}

function calculateMSCEResult(student, subjectScores, term, year) {
    const validScores = subjectScores.filter(s => s.score !== null);
    
    // Sort by score descending to get best subjects
    const sorted = [...validScores].sort((a, b) => b.score - a.score);
    
    // Check if English is in best subjects, include it
    let bestSubjects = [];
    let englishIncluded = false;
    
    // First pass: find English
    const englishIndex = sorted.findIndex(s => 
        s.subject.toLowerCase().includes('english')
    );
    
    // Take best 6, but ensure English is included if it exists
    if (englishIndex >= 0) {
        const english = sorted[englishIndex];
        const others = sorted.filter((_, i) => i !== englishIndex);
        const topOthers = others.slice(0, MSCE_BEST_SUBJECTS - 1);
        bestSubjects = [english, ...topOthers];
        englishIncluded = true;
    } else {
        // English not found, take top 6
        bestSubjects = sorted.slice(0, MSCE_BEST_SUBJECTS);
    }
    
    // Calculate points for best subjects
    const bestScores = bestSubjects.map(s => s.score);
    const totalBest = bestScores.reduce((sum, s) => sum + s, 0);
    const averageBest = bestScores.length > 0 ? Math.round(totalBest / bestScores.length) : 0;
    
    // Calculate points for each subject (lower is better)
    const subjectPoints = bestSubjects.map(sub => {
        const grade = getMSCEGrade(sub.score);
        return parseInt(grade.grade) || 0;
    });
    
    const totalPoints = subjectPoints.reduce((sum, p) => sum + p, 0);
    const aggregatePoints = totalPoints;
    
    // Overall grade based on average score
    const overallGrade = getMSCEGrade(averageBest);
    
    // Determine pass/fail
    const passed = averageBest >= MSCE_PASS_MIN;
    const failedSubjects = validScores.filter(s => s.score < MSCE_PASS_MIN).length;
    
    return {
        subjectsSat: validScores.length,
        bestSubjects: bestSubjects.map(s => s.subject),
        bestScores: bestScores,
        subjectPoints: subjectPoints,
        totalBest,
        averageBest,
        aggregatePoints,
        overallGrade: overallGrade.grade,
        overallRemark: overallGrade.remark,
        passed,
        failedSubjects,
        englishIncluded,
        status: passed ? 'PASS' : 'FAIL',
        message: passed 
            ? `✅ MSCE Passed! Points: ${aggregatePoints} (Best 6)`
            : `❌ MSCE Failed. Aggregate Points: ${aggregatePoints}. ${failedSubjects} subject(s) failed.`
    };
}

// ============================================
// UNIFIED GRADING SYSTEM
// ============================================

function calculateResults(student, term, year) {
    const termResults = DataService.get('termResults') || [];
    const subjects = DataService.get('subjects') || [];
    
    const studentResults = termResults.filter(r => 
        r.studentId === student.id && 
        r.term === parseInt(term) && 
        r.year === parseInt(year)
    );
    
    // Get all subject scores
    const subjectScores = subjects.map(sub => {
        const result = studentResults.find(r => r.subjectId === sub.id);
        return {
            subject: sub.name,
            score: result ? result.score : null,
            subjectId: sub.id
        };
    });
    
    const isJCEStudent = isJCE(student.class);
    const isMSCEStudent = isMSCE(student.class);
    
    if (isJCEStudent) {
        const jceResult = calculateJCEResult(student, subjectScores, term, year);
        return {
            type: 'JCE',
            ...jceResult,
            subjectScores,
            student
        };
    } else if (isMSCEStudent) {
        const msceResult = calculateMSCEResult(student, subjectScores, term, year);
        return {
            type: 'MSCE',
            ...msceResult,
            subjectScores,
            student
        };
    } else {
        // Unknown class level - default to simple grading
        return {
            type: 'UNKNOWN',
            subjectScores,
            student,
            status: 'PENDING',
            message: 'Class level not recognized'
        };
    }
}

/**
 * Determines whether a class string represents a Senior Class (MSCE level).
 */
function isSeniorClass(classLevel) {
    if (!classLevel) return false;
    const normalized = String(classLevel).toLowerCase().trim();
    return normalized.includes('form 3') || 
           normalized.includes('form 4') || 
           normalized.includes('senior') || 
           normalized.includes('msce');
}

/**
 * Calculates Grade/Points and Remarks based on your exact school grading scale:
 * 
 * MSCE (Forms 3-4):
 *   90 - 100 = 1 (Distinction)
 *   85 - 89  = 2 (Distinction)
 *   80 - 84  = 3 (Strong Credit)
 *   75 - 79  = 4 (Credit)
 *   70 - 74  = 5 (Credit)
 *   55 - 69  = 6 (Credit)
 *   50 - 54  = 7 (Pass)
 *   40 - 49  = 8 (Pass)
 *    0 - 39  = 9 (Fail)
 * 
 * JCE (Forms 1-2):
 *   90 - 100 = A (Excellent)
 *   80 - 89  = B (Very Good)
 *   60 - 79  = C (Good)
 *   40 - 59  = D (Pass)
 *    0 - 39  = F (Fail)
 */
function getGradeAndRemark(score, classLevel = '') {
    const numericScore = parseInt(score, 10);
    
    if (isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
        return { grade: '-', remark: '-' };
    }

    const isSenior = isSeniorClass(classLevel);

    if (isSenior) {
        // --- MSCE SENIOR CLASS GRADING ---
        if (numericScore >= 90) return { grade: '1', remark: 'Distinction' };
        if (numericScore >= 85) return { grade: '2', remark: 'Distinction' };
        if (numericScore >= 80) return { grade: '3', remark: 'Strong Credit' };
        if (numericScore >= 75) return { grade: '4', remark: 'Credit' };
        if (numericScore >= 70) return { grade: '5', remark: 'Credit' };
        if (numericScore >= 55) return { grade: '6', remark: 'Credit' };
        if (numericScore >= 50) return { grade: '7', remark: 'Pass' };
        if (numericScore >= 40) return { grade: '8', remark: 'Pass' };
        return { grade: '9', remark: 'Fail' };
    } else {
        // --- JCE JUNIOR CLASS GRADING ---
        if (numericScore >= 90) return { grade: 'A', remark: 'Excellent' };
        if (numericScore >= 80) return { grade: 'B', remark: 'Very Good' };
        if (numericScore >= 60) return { grade: 'C', remark: 'Good' };
        if (numericScore >= 40) return { grade: 'D', remark: 'Pass' };
        return { grade: 'F', remark: 'Fail' };
    }
}

/**
 * Standalone MSCE Helper (if referenced elsewhere in your legacy code)
 */
function getMSCEGrade(score) {
    return getGradeAndRemark(score, 'Form 3');
}

// Main Grades Page
function renderGrades(container) {
    container.innerHTML = `
        <div class="max-w-7xl mx-auto">
            <div class="bg-white rounded-2xl shadow p-6">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h3 class="text-2xl font-semibold text-gray-800">Grading & Examination System</h3>
                        <p class="text-gray-500">End of Term Results • Positions • Analysis</p>
                    </div>
                    <div class="flex gap-3"> 
                        <button onclick="showSubjectModal()" 
                                class="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                            <i class="fas fa-book"></i> Subjects
                        </button>
                        <button onclick="showScoreEntryModal()" 
                                class="bg-emerald-600 text-white px-5 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2">
                            <i class="fas fa-plus"></i> Enter Results
                        </button>
                        <button onclick="showCAModal()" 
                                class="bg-amber-600 text-white px-5 py-2.5 rounded-lg hover:bg-amber-700 flex items-center gap-2">
                            <i class="fas fa-chart-line"></i> CA Scores
                        </button>
                        <button onclick="viewCAResults()" 
                                class="bg-amber-800 text-white px-5 py-2.5 rounded-lg hover:bg-amber-900 flex items-center gap-2">
                            <i class="fas fa-eye"></i> View CA
                        </button>
                        <button onclick="showReportCardModal()" 
                                class="bg-purple-600 text-white px-5 py-2.5 rounded-lg hover:bg-purple-700 flex items-center gap-2">
                            <i class="fas fa-file-alt"></i> Report Card
                        </button>
                    </div>
                </div>

                <div class="flex flex-wrap gap-4 mb-6 bg-gray-50 p-4 rounded-xl">
                    <div>
                        <label class="block text-xs font-medium text-gray-500 mb-1">CLASS</label>
                        <select id="grade-class-filter" class="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500">
                            <option value="">Select Class</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-500 mb-1">TERM</label>
                        <select id="grade-term-filter" class="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500">
                            <option value="">Select Term</option>
                            <option value="1">Term 1</option>
                            <option value="2">Term 2</option>
                            <option value="3">Term 3</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-500 mb-1">YEAR</label>
                        <input type="number" id="grade-year-filter" value="${new Date().getFullYear()}" 
                               class="border border-gray-300 rounded-lg px-4 py-2 w-28 focus:outline-none focus:border-indigo-500">
                    </div>
                    <div class="flex items-end gap-2">
                        <button onclick="loadGradesResults()" 
                                class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
                            Load Results
                        </button>
                        <button onclick="showExportModal()" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-file-excel"></i> Export
                        </button>
                        <button onclick="showImportModal()" class="bg-amber-600 text-white px-6 py-2 rounded-lg hover:bg-amber-700">
                            <i class="fas fa-file-upload"></i> Bulk Import
                        </button>
                        <button onclick="showPublishReportsModal()" 
                        class="bg-purple-600 text-white px-5 py-2.5 rounded-lg hover:bg-purple-700 flex items-center gap-2">
                            <i class="fas fa-cloud-upload-alt"></i> Publish Reports
                        </button>
                    </div>
                </div>
                
                <div id="grades-results-container" class="min-h-[400px]">
                    <p class="text-center py-20 text-gray-400">
                        Select Class, Term and Year above, then click "Load Results"
                    </p>
                </div>
            </div>
        </div>
    `;

    // Populate classes
    populateClassFilter();
}

function populateClassFilter() {
    const students = DataService.get('students');
    // Standardize class names before getting unique values
    const uniqueClasses = [...new Set(students.map(s => standardizeClassName(s.class)))].sort();
    const select = document.getElementById('grade-class-filter');
    if (!select) return;
    
    // Clear existing options except the first one
    select.innerHTML = '<option value="">Select Class</option>';
    
    uniqueClasses.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls;
        option.textContent = cls;
        select.appendChild(option);
    });
}

/**
 * Loads and renders the class-wide assessment results overview table.
 * Supports both JCE (Forms 1-2) and MSCE (Forms 3-4) MANEB grading standards.
 */
function loadGradesResults() {
    const container = document.getElementById('grades-results-container');
    if (!container) return;
    
    const classFilter = document.getElementById('grade-class-filter')?.value;
    const termFilter = document.getElementById('grade-term-filter')?.value;
    const yearFilter = document.getElementById('grade-year-filter')?.value;
    
    if (!classFilter || !termFilter || !yearFilter) {
        container.innerHTML = `
            <div class="text-center py-20 text-gray-400">
                <i class="fas fa-filter text-4xl mb-3"></i>
                <p>Please select Class, Term, and Year, then click "Load Results"</p>
            </div>
        `;
        return;
    }
    
    const students = (DataService.get('students') || []).filter(s => s.class === classFilter);
    const termResults = DataService.get('termResults') || [];
    const subjects = DataService.get('subjects') || [];
    
    if (students.length === 0) {
        container.innerHTML = `<p class="text-center py-20 text-gray-400">No students found in ${escapeHtml(classFilter)}</p>`;
        return;
    }
    
    // Filter results matching class, term, and year safely using string comparison
    const filteredResults = termResults.filter(r => 
        r.class === classFilter && 
        String(r.term) === String(termFilter) && 
        String(r.year) === String(yearFilter)
    );
    
    // Get all subjects assigned to this class
    const classSubjects = subjects.filter(s => s.class === 'All' || s.class === classFilter);
    
    if (classSubjects.length === 0) {
        container.innerHTML = `<p class="text-center py-20 text-gray-400">No subjects assigned to ${escapeHtml(classFilter)}</p>`;
        return;
    }
    
    if (filteredResults.length === 0) {
        const allClassResults = termResults.filter(r => r.class === classFilter);
        container.innerHTML = `
            <div class="text-center py-20 text-gray-400">
                <i class="fas fa-info-circle text-4xl mb-3"></i>
                <p>No results found for ${escapeHtml(classFilter)}</p>
                <p class="text-sm mt-2">Term ${escapeHtml(termFilter)} • Year ${escapeHtml(yearFilter)}</p>
                ${allClassResults.length > 0 ? `<p class="text-xs text-gray-400 mt-4">${allClassResults.length} total results exist for other terms/years in this class.</p>` : ''}
            </div>
        `;
        return;
    }

    // Helper: Dynamic text color based on MANEB Grade (Supports A-F & 1-9)
    const getGradeColorClass = (grade) => {
        if (!grade || grade === '-') return 'text-gray-500';
        const g = String(grade).toUpperCase();
        if (['A', '1', '2'].includes(g)) return 'text-emerald-600 font-bold';
        if (['B', '3', '4'].includes(g)) return 'text-blue-600 font-bold';
        if (['C', '5', '6'].includes(g)) return 'text-indigo-600 font-bold';
        if (['D', '7', '8'].includes(g)) return 'text-amber-600 font-bold';
        if (['F', '9'].includes(g)) return 'text-rose-600 font-bold';
        return 'text-gray-800 font-bold';
    };

    // Calculate aggregated scores & overall grades per student
    const studentResults = students.map((student) => {
        const studentScores = classSubjects.map(sub => {
            const result = filteredResults.find(r => 
                r.studentId === student.id && 
                r.subjectId === sub.id
            );
            return result && result.score !== undefined ? result.score : null;
        });
        
        const validScores = studentScores.filter(s => s !== null);
        const total = validScores.reduce((sum, s) => sum + s, 0);
        const average = validScores.length > 0 ? Math.round(total / validScores.length) : 0;
        
        // Context-aware grade computation
        const gradeInfo = typeof getGradeAndRemark === 'function' 
            ? getGradeAndRemark(average, student.class) 
            : { grade: '-', remark: '' };
        
        return {
            student,
            scores: studentScores,
            total,
            average,
            grade: gradeInfo.grade,
            remark: gradeInfo.remark,
            validSubjects: validScores.length
        };
    });
    
    // Sort descending by average for positioning
    const sortedResults = [...studentResults].sort((a, b) => b.average - a.average);

    // Build Table Markup
    let html = `
        <div class="border rounded-lg overflow-hidden mt-4 shadow-sm bg-white">
            <div class="max-h-96 overflow-y-auto overflow-x-auto">
                <table class="table w-full border-collapse">
                    <thead class="sticky top-0 z-10 bg-indigo-50 border-b-2 border-indigo-200">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-indigo-800">#</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-indigo-800">Student</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-indigo-800">Sex</th>
                            ${classSubjects.map(sub => `
                                <th class="px-4 py-3 text-center text-sm font-semibold text-indigo-800">${escapeHtml(sub.name)}</th>
                            `).join('')}
                            <th class="px-4 py-3 text-center text-sm font-semibold text-indigo-800">Total</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-indigo-800">Avg</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-indigo-800">Grade</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-indigo-800">Position</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    sortedResults.forEach((result, index) => {
        const position = index + 1;
        const student = result.student;
        
        html += `
            <tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50/50 transition-colors">
                <td class="px-4 py-3 text-sm text-gray-500">${position}</td>
                <td class="px-4 py-3 text-sm font-medium text-gray-900">${escapeHtml(student.name)}</td>
                <td class="px-4 py-3 text-center text-sm text-gray-600">${escapeHtml(student.sex || '-')}</td>
                ${result.scores.map(score => {
                    if (score === null) {
                        return `<td class="px-4 py-3 text-center text-sm text-gray-300">-</td>`;
                    }
                    
                    // Retrieve class-specific score grade to highlight failures
                    const subGradeInfo = typeof getGradeAndRemark === 'function' 
                        ? getGradeAndRemark(score, student.class) 
                        : { grade: '' };
                    const isFail = subGradeInfo.grade === 'F' || subGradeInfo.grade === '9';

                    return `
                        <td class="px-4 py-3 text-center text-sm">
                            <span class="font-semibold ${isFail ? 'text-red-600' : 'text-gray-800'}">${score}</span>
                        </td>
                    `;
                }).join('')}
                <td class="px-4 py-3 text-center text-sm font-bold text-gray-900">${result.total}</td>
                <td class="px-4 py-3 text-center text-sm font-bold text-gray-900">${result.average}%</td>
                <td class="px-4 py-3 text-center text-sm">
                    <span class="${getGradeColorClass(result.grade)}">${result.grade}</span>
                </td>
                <td class="px-4 py-3 text-center text-sm font-bold text-gray-800">
                    ${position}${position === 1 ? ' 🏆' : ''}
                </td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
        <div class="mt-4 text-sm text-gray-500 flex justify-between items-center">
            <span>Showing ${students.length} students • ${classSubjects.length} subjects</span>
            <span>Term ${escapeHtml(termFilter)} • ${escapeHtml(yearFilter)}</span>
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================
// DATA EXPORT
// ============================================

function showExportModal() {
    console.log('showExportModal called!'); // Debug

    const students = DataService.get('students');
    const classes = DataService.get('classes') || [];
    const uniqueClasses = [...new Set(students.map(s => s.class))].sort();
    
    if (students.length === 0) {
        showToast('No students found! Please add students first.', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
       
    // Debug: Check if elements exist
    console.log('Modal element:', modal);
    console.log('Modal content element:', modalContent);
    
    if (!modal || !modalContent) {
        console.error('Modal or modal-content not found!');
        showToast('Modal not found!', 'error');
        return;
    }
    
    // Force modal to show
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    console.log('Modal forced to show'); // Debug

    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Export Results to Excel</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <form id="exportForm">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select id="export-class" required class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="all">All Classes (Multiple Sheets)</option>
                        ${uniqueClasses.map(cls => `
                            <option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>
                        `).join('')}
                    </select>
                    <p class="text-xs text-gray-400 mt-1">Select "All Classes" to export each class on a separate sheet</p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Term</label>
                    <select id="export-term" required class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="1">Term 1</option>
                        <option value="2">Term 2</option>
                        <option value="3">Term 3</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input type="number" id="export-year" value="${new Date().getFullYear()}" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                    <i class="fas fa-file-excel"></i> Export to Excel
                </button>
            </div>
        </form>
    `;
       
    console.log('Modal forced to show'); // Debug
    
    modal.classList.remove('hidden');
    modal.querySelector('.bg-white').classList.add('max-w-xl');
    
    document.getElementById('exportForm').onsubmit = function(e) {
        e.preventDefault();
        const classVal = document.getElementById('export-class').value;
        const term = document.getElementById('export-term').value;
        const year = document.getElementById('export-year').value;
        
        console.log('Export values:', { classVal, term, year }); // Debug
        if (classVal === 'all') {
            exportAllClasses(term, year);
        } else {
            exportSingleClass(classVal, term, year);
        }
    };
}

// ============================================
// EXCEL EXPORT - Core Functions
// ============================================

/**
 * Helper: Generates clean, short subject abbreviations for top table headers.
 */
function getShortSubjectName(sub) {
    if (!sub) return '';
    if (sub.code) return String(sub.code).toUpperCase();
    if (sub.shortName) return sub.shortName;
    
    const name = (typeof sub === 'string' ? sub : sub.name || '').trim();
    if (!name) return '';

    const knownMappings = {
        'mathematics': 'Math',
        'english': 'Eng',
        'english language': 'Eng',
        'english literature': 'Lit',
        'chichewa': 'Chi',
        'biology': 'Bio',
        'chemistry': 'Chem',
        'physics': 'Phys',
        'physical science': 'Phy Sci',
        'social studies': 'Soc St',
        'social & development studies': 'Soc St',
        'computer studies': 'Comp',
        'agriculture': 'Agric',
        'geography': 'Geo',
        'history': 'Hist',
        'bible knowledge': 'BK',
        'religious studies': 'BK',
        'life skills': 'Life Sk',
        'home economics': 'Home Ec',
        'business studies': 'Bus St',
        'expressive arts': 'Exp Arts'
    };

    const lower = name.toLowerCase();
    if (knownMappings[lower]) return knownMappings[lower];

    // Fallback: take first 4 characters for single words, or word initials for multi-words
    const words = name.split(/\s+/);
    if (words.length > 1) {
        return words.map(w => w[0].toUpperCase() + w.slice(1, 3)).join(' ');
    }
    return name.length > 5 ? name.substring(0, 4) : name;
}

/**
 * Shared Helper: Builds a compact, styled Excel worksheet with abbreviated subject headers,
 * centered title headings, and an isolated subject analysis section.
 */
function buildStyledClassWorksheet(className, term, year, students, subjects, termResults) {
    const isSenior = typeof isSeniorClass === 'function' 
        ? isSeniorClass(className) 
        : ['Form 3', 'Form 4', 'SS 3', 'SS 4', 'Senior'].some(f => className.toLowerCase().includes(f.toLowerCase()));

    const classSubjects = subjects.filter(s => s.class === 'All' || s.class === className);

    // 1. Process Student Performance Data
    const results = students.map(student => {
        const studentScores = classSubjects.map(sub => {
            const res = termResults.find(r => 
                String(r.studentId) === String(student.id) && 
                String(r.subjectId) === String(sub.id) && 
                String(r.term) === String(term) && 
                String(r.year) === String(year)
            );
            return res && res.score !== undefined ? parseInt(res.score, 10) : null;
        });

        const validScores = studentScores.filter(s => s !== null && !isNaN(s));
        const total = validScores.reduce((sum, s) => sum + s, 0);
        const average = validScores.length > 0 ? Math.round(total / validScores.length) : 0;
        
        const gradeInfo = typeof getGradeAndRemark === 'function' 
            ? getGradeAndRemark(average, className) 
            : { grade: '-', remark: '-' };

        let points = null;
        if (isSenior) {
            const bestSix = [...validScores].sort((a, b) => b - a).slice(0, 6);
            points = bestSix.reduce((sum, s) => {
                const g = typeof getGradeAndRemark === 'function' ? getGradeAndRemark(s, className) : { grade: '9' };
                return sum + (parseInt(g.grade, 10) || 9);
            }, 0);
        }

        return {
            student,
            scores: studentScores,
            total,
            average,
            grade: gradeInfo.grade,
            points,
            status: average >= 40 ? 'PASS' : 'FAIL'
        };
    });

    results.sort((a, b) => b.average - a.average);

    // 2. Construct Main Results Table Matrix
    const wsData = [];
    wsData.push(['BANDAWE GIRLS SECONDARY SCHOOL']);
    wsData.push([`END OF TERM RESULTS — CLASS: ${className.toUpperCase()} | TERM: ${term} | YEAR: ${year}`]);
    wsData.push([]); // Spacer row

    // Table Header using SHORTENED subject names (e.g., Bio, Math, Comp)
    const tableHeader = ['Pos', 'Student ID', 'Student Name', 'Sex'];
    classSubjects.forEach(sub => tableHeader.push(getShortSubjectName(sub)));
    tableHeader.push('Total');
    tableHeader.push(isSenior ? 'Points' : 'Avg %');
    tableHeader.push('Grade');
    tableHeader.push('Status');
    wsData.push(tableHeader);

    const mainHeaderRowIndex = 3;

    results.forEach((res, idx) => {
        const row = [
            idx + 1,
            res.student.id || 'N/A',
            res.student.name,
            res.student.sex || '-'
        ];
        res.scores.forEach(s => row.push(s !== null ? s : '-'));
        row.push(res.total);
        row.push(isSenior ? (res.points !== null ? res.points : 'N/A') : `${res.average}%`);
        row.push(res.grade);
        row.push(res.status);
        wsData.push(row);
    });

    const dataEndRowIndex = wsData.length - 1;

    // 3. Subject Performance Analysis Table Matrix (Uses FULL subject names)
    wsData.push([]); // Spacer
    const analysisHeaderIndex = wsData.length;
    wsData.push(['SUBJECT PERFORMANCE ANALYSIS']);

    const analysisSubHeaderIndex = wsData.length;
    const analysisCols = isSenior 
        ? ['Subject', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Total Sat', 'Passes', 'Pass Rate Visual']
        : ['Subject', 'A', 'B', 'C', 'D', 'F', 'Total Sat', 'Passes', 'Pass Rate Visual'];
    wsData.push(analysisCols);

    const grandGradeCounts = isSenior 
        ? { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 }
        : { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    let grandTotalSat = 0;
    let grandTotalPasses = 0;

    classSubjects.forEach((sub, subIdx) => {
        const subScores = results.map(r => r.scores[subIdx]).filter(s => s !== null && !isNaN(s));
        const counts = isSenior 
            ? { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 }
            : { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };

        let passes = 0;
        subScores.forEach(score => {
            const gInfo = typeof getGradeAndRemark === 'function' ? getGradeAndRemark(score, className) : { grade: 'F' };
            if (counts[gInfo.grade] !== undefined) {
                counts[gInfo.grade]++;
                grandGradeCounts[gInfo.grade]++;
            }
            if (score >= 40) passes++;
        });

        const totalSat = subScores.length;
        const passPct = totalSat > 0 ? Math.round((passes / totalSat) * 100) : 0;
        const filled = Math.round((passPct / 100) * 8);
        const sparkline = '█'.repeat(filled) + '░'.repeat(8 - filled) + ` ${passPct}%`;

        grandTotalSat += totalSat;
        grandTotalPasses += passes;

        // Uses full sub.name here for clarity
        wsData.push([sub.name, ...Object.values(counts), totalSat, passes, sparkline]);
    });

    const overallPassPct = grandTotalSat > 0 ? Math.round((grandTotalPasses / grandTotalSat) * 100) : 0;
    const overallFilled = Math.round((overallPassPct / 100) * 8);
    const overallSparkline = '█'.repeat(overallFilled) + '░'.repeat(8 - overallFilled) + ` ${overallPassPct}%`;

    const summaryRow = ['TOTAL ACCUMULATED', ...Object.values(grandGradeCounts), grandTotalSat, grandTotalPasses, overallSparkline];
    wsData.push(summaryRow);

    // 4. Create Sheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 5. Styles Configuration
    const styleTitle = {
        font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "1E3A8A" } },
        alignment: { horizontal: "center", vertical: "center" }
    };

    const styleSubtitle = {
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "475569" } },
        alignment: { horizontal: "center", vertical: "center" }
    };

    const styleBlueHeader = {
        fill: { fgColor: { rgb: "1E3A8A" } },
        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "medium", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "CBD5E1" } },
            right: { style: "thin", color: { rgb: "CBD5E1" } }
        }
    };

    const styleDataCell = (isEven, align = "center") => ({
        fill: { fgColor: { rgb: isEven ? "F8FAFC" : "FFFFFF" } },
        font: { name: "Calibri", sz: 9 },
        alignment: { horizontal: align, vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } }
        }
    });

    const styleSummaryRow = {
        fill: { fgColor: { rgb: "E2E8F0" } },
        font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "0F172A" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "medium", color: { rgb: "475569" } },
            bottom: { style: "double", color: { rgb: "475569" } },
            left: { style: "thin", color: { rgb: "CBD5E1" } },
            right: { style: "thin", color: { rgb: "CBD5E1" } }
        }
    };

    const styleAnalysisHeader = {
        fill: { fgColor: { rgb: "334155" } },
        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "left", vertical: "center" }
    };

    // 6. Cell-by-Cell Isolated Styling Application
    const range = XLSX.utils.decode_range(ws['!ref']);

    for (let R = range.s.r; R <= range.e.r; ++R) {
        // Restrict column iterations so Subject Analysis never bleeds beyond its own width
        const maxColForThisRow = (R >= analysisHeaderIndex) ? (analysisCols.length - 1) : (tableHeader.length - 1);

        for (let C = 0; C <= maxColForThisRow; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

            if (R === 0) ws[cellRef].s = styleTitle;
            else if (R === 1) ws[cellRef].s = styleSubtitle;
            else if (R === mainHeaderRowIndex) ws[cellRef].s = styleBlueHeader;
            else if (R > mainHeaderRowIndex && R <= dataEndRowIndex) {
                const align = C === 2 ? "left" : "center";
                ws[cellRef].s = styleDataCell(R % 2 === 0, align);
            }
            else if (R === analysisHeaderIndex) ws[cellRef].s = styleAnalysisHeader;
            else if (R === analysisSubHeaderIndex) ws[cellRef].s = styleBlueHeader;
            else if (R > analysisSubHeaderIndex && R < range.e.r) {
                const align = C === 0 || C === analysisCols.length - 1 ? "left" : "center";
                ws[cellRef].s = styleDataCell(R % 2 === 0, align);
            }
            else if (R === range.e.r) {
                ws[cellRef].s = styleSummaryRow;
            }
        }
    }

    // 7. Strict Dynamic Column Width Engine
    const colWidths = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxLen = 0;
        for (let R = mainHeaderRowIndex; R <= range.e.r; ++R) {
            if (R === analysisHeaderIndex) continue; // Ignore banner title
            
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (ws[cellRef] && ws[cellRef].v !== undefined && ws[cellRef].v !== null) {
                const strVal = String(ws[cellRef].v);
                if (strVal.length > maxLen) maxLen = strVal.length;
            }
        }
        
        // Custom tight width rules
        let width = maxLen + 2;
        if (C === 0) width = 4;           // Tight 'Pos' column
        else if (C === 3) width = 6;      // Tight 'Sex' column
        else width = Math.max(width, 5);  // General tight minimum

        colWidths.push({ wch: width });
    }
    ws['!cols'] = colWidths;

    // 8. Uncoupled Merges
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeader.length - 1 } }, // Centered title across main table
        { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeader.length - 1 } }, // Centered subtitle across main table
        { s: { r: analysisHeaderIndex, c: 0 }, e: { r: analysisHeaderIndex, c: analysisCols.length - 1 } } // Analysis header uncoupled
    ];

    ws['!rows'] = [
        { hpt: 22 }, // Title
        { hpt: 18 }, // Subtitle
        { hpt: 10 }, // Spacer
        { hpt: 22 }  // Header
    ];

    return ws;
}
/**
 * Export Single Class Results to Styled Excel Spreadsheet
 */
function exportSingleClass(className, term, year) {
    try {
        const students = (DataService.get('students') || []).filter(s => s.class === className);
        const subjects = DataService.get('subjects') || [];
        const termResults = DataService.get('termResults') || [];

        if (students.length === 0) {
            showToast(`No students found in ${className}!`, 'error');
            return;
        }

        if (typeof XLSX === 'undefined') {
            showToast('Excel exporter library not initialized. Please refresh.', 'error');
            return;
        }

        const wb = XLSX.utils.book_new();
        const ws = buildStyledClassWorksheet(className, term, year, students, subjects, termResults);

        const safeSheetName = className.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

        const fileName = `Results_${className}_Term${term}_${year}.xlsx`;
        XLSX.writeFile(wb, fileName);

        if (typeof closeModal === 'function') closeModal();
        showToast(`Exported ${students.length} students from ${className}`, 'success');

    } catch (error) {
        console.error('Error exporting single class:', error);
        showToast('Export failed: ' + error.message, 'error');
    }
}

/**
 * Export All Classes Results into Multi-Tab Styled Excel Workbook
 */
function exportAllClasses(term, year) {
    try {
        const students = DataService.get('students') || [];
        const subjects = DataService.get('subjects') || [];
        const termResults = DataService.get('termResults') || [];

        const uniqueClasses = [...new Set(students.map(s => s.class))].sort();

        if (uniqueClasses.length === 0) {
            showToast('No student classes found to export!', 'error');
            return;
        }

        if (typeof XLSX === 'undefined') {
            showToast('Excel exporter library not initialized. Please refresh.', 'error');
            return;
        }

        const wb = XLSX.utils.book_new();
        let exportedCount = 0;

        uniqueClasses.forEach(className => {
            const classStudents = students.filter(s => s.class === className);
            if (classStudents.length === 0) return;

            const ws = buildStyledClassWorksheet(className, term, year, classStudents, subjects, termResults);
            const safeSheetName = className.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 31);
            
            XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
            exportedCount++;
        });

        if (exportedCount === 0) {
            showToast('No class records to write.', 'error');
            return;
        }

        const fileName = `All_Classes_Results_Term${term}_${year}.xlsx`;
        XLSX.writeFile(wb, fileName);

        if (typeof closeModal === 'function') closeModal();
        showToast(`Exported workbook containing ${exportedCount} class tabs`, 'success');

    } catch (error) {
        console.error('Error exporting all classes:', error);
        showToast('Export failed: ' + error.message, 'error');
    }
}

// ============================================
// BULK IMPORT RESULTS
// ============================================

function showImportModal() {
    const students = DataService.get('students');
    const classes = DataService.get('classes') || [];
    const uniqueClasses = [...new Set(students.map(s => s.class))].sort();
    
    if (students.length === 0) {
        showToast('No students found! Please add students first.', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Bulk Import Results</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 class="text-sm font-semibold text-blue-800 mb-2">📋 Instructions</h4>
            <ul class="text-xs text-blue-700 space-y-1">
                <li>1. Download the template first to get the correct format</li>
                <li>2. Fill in student scores (use Student ID or Name to identify students)</li>
                <li>3. Upload the file and preview before saving</li>
                <li>4. All scores will be saved at once</li>
            </ul>
        </div>
        
        <form id="importForm">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select id="import-class" required class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        ${uniqueClasses.map(cls => `
                            <option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Term</label>
                    <select id="import-term" required class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="1">Term 1</option>
                        <option value="2">Term 2</option>
                        <option value="3">Term 3</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input type="number" id="import-year" value="${new Date().getFullYear()}" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Upload File (Excel or CSV)</label>
                    <input type="file" id="import-file" accept=".xlsx,.xls,.csv" required 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                <div>
                    <button type="button" onclick="downloadImportTemplate()" 
                            class="text-sm bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200">
                        <i class="fas fa-download"></i> Download Template
                    </button>
                </div>
            </div>
            
            <div id="import-preview" class="mt-4 hidden">
                <h4 class="text-sm font-semibold text-gray-700 mb-2">Preview Data</h4>
                <div id="import-preview-content" class="max-h-60 overflow-y-auto border rounded-lg"></div>
                <div class="mt-2 text-sm text-gray-500" id="import-summary"></div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" id="import-submit-btn" 
                        class="flex-1 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                    <i class="fas fa-upload"></i> Import Results
                </button>
            </div>
        </form>
    `;
    
    modal.querySelector('.bg-white').classList.add('max-w-3xl');
    
    // Handle file upload preview
    document.getElementById('import-file').addEventListener('change', function(e) {
        previewImportFile(this);
    });
    
    document.getElementById('importForm').onsubmit = function(e) {
        e.preventDefault();
        processImport();
    };
}

function downloadImportTemplate() {
    const className = document.getElementById('import-class').value;
    const subjects = DataService.get('subjects');
    const classSubjects = subjects.filter(s => s.class === 'All' || s.class === className);
    
    const wb = XLSX.utils.book_new();
    const wsData = [];
    
    // Header
    const header = ['Student ID', 'Name'];
    classSubjects.forEach(sub => header.push(sub.name));
    wsData.push(header);
    
    // Sample row
    const sampleRow = ['BAGSS_2026_001', 'Example Student'];
    classSubjects.forEach(() => sampleRow.push(''));
    wsData.push(sampleRow);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
        { wch: 18 }, // Student ID
        { wch: 25 }, // Name
        ...classSubjects.map(() => ({ wch: 12 }))
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, `Import_Template_${className}.xlsx`);
    showToast('Template downloaded!', 'success');
}

function previewImportFile(input) {
    const file = input.files[0];
    if (!file) return;
    
    const previewContainer = document.getElementById('import-preview');
    const previewContent = document.getElementById('import-preview-content');
    const summaryEl = document.getElementById('import-summary');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            
            previewContainer.classList.remove('hidden');
            
            if (jsonData.length === 0) {
                previewContent.innerHTML = '<p class="text-gray-400 text-center py-4">No data found in file</p>';
                summaryEl.textContent = '0 records found';
                return;
            }
            
            // Build preview table
            const headers = Object.keys(jsonData[0]);
            let html = '<table class="table w-full border-collapse text-sm">';
            html += '<thead><tr class="bg-gray-50 border-b">';
            headers.forEach(h => {
                html += `<th class="px-3 py-2 text-left text-xs font-semibold">${escapeHtml(h)}</th>`;
            });
            html += '</tr></thead><tbody>';
            
            jsonData.slice(0, 10).forEach((row, i) => {
                html += `<tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">`;
                headers.forEach(h => {
                    html += `<td class="px-3 py-2 text-xs">${escapeHtml(String(row[h] || ''))}</td>`;
                });
                html += '</tr>';
            });
            
            if (jsonData.length > 10) {
                html += `<tr><td colspan="${headers.length}" class="px-3 py-2 text-xs text-gray-400 text-center">... and ${jsonData.length - 10} more rows</td></tr>`;
            }
            
            html += '</tbody></table>';
            previewContent.innerHTML = html;
            
            summaryEl.textContent = `Found ${jsonData.length} student records`;
            
            // Store data for processing
            input.dataset.importData = JSON.stringify(jsonData);
            
        } catch (error) {
            console.error('Error reading file:', error);
            previewContainer.classList.add('hidden');
            showToast('Error reading file. Please check the format.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function processImport() {
    const className = document.getElementById('import-class').value;
    const term = parseInt(document.getElementById('import-term').value);
    const year = parseInt(document.getElementById('import-year').value);
    const fileInput = document.getElementById('import-file');
    
    if (!fileInput.files || !fileInput.files[0]) {
        showToast('Please select a file', 'error');
        return;
    }
    
    const jsonData = JSON.parse(fileInput.dataset.importData || '[]');
    
    if (jsonData.length === 0) {
        showToast('No data found in file', 'error');
        return;
    }
    
    if (!confirm(`Import ${jsonData.length} records for ${className}, Term ${term}, ${year}?`)) {
        return;
    }
    
    const students = DataService.get('students');
    const subjects = DataService.get('subjects');
    const classSubjects = subjects.filter(s => s.class === 'All' || s.class === className);
    const termResults = DataService.get('termResults') || [];
    
    let imported = 0;
    let errors = 0;
    
    jsonData.forEach(row => {
        // Find student by ID or Name
        let student = null;
        if (row['Student ID']) {
            student = students.find(s => s.id === row['Student ID']);
        }
        if (!student && row['Name']) {
            student = students.find(s => s.name.toLowerCase() === row['Name'].toLowerCase());
        }
        
        if (!student) {
            errors++;
            return;
        }
        
        // Process each subject score
        classSubjects.forEach(sub => {
            const score = parseFloat(row[sub.name]);
            if (!isNaN(score) && score >= 0 && score <= 100) {
                const result = getGradeAndRemark(score);
                const isSenior = ['Form 3', 'Form 4', 'SS 3', 'SS 4'].some(form => className.includes(form));
                
                let points = null;
                if (isSenior) {
                    if (score >= 90) points = 1;
                    else if (score >= 85) points = 2;
                    else if (score >= 80) points = 3;
                    else if (score >= 75) points = 4;
                    else if (score >= 70) points = 5;
                    else if (score >= 55) points = 6;
                    else if (score >= 50) points = 7;
                    else if (score >= 40) points = 8;
                    else points = 9;
                }
                
                // Remove existing entry
                const existingIndex = termResults.findIndex(r => 
                    r.studentId === student.id && 
                    r.subjectId === sub.id && 
                    r.term === term && 
                    r.year === year
                );
                
                const entry = {
                    studentId: student.id,
                    subjectId: sub.id,
                    class: className,
                    term: term,
                    year: year,
                    score: score,
                    grade: result.grade,
                    remark: result.remark,
                    points: points,
                    updatedAt: new Date().toISOString()
                };
                
                if (existingIndex >= 0) {
                    termResults[existingIndex] = entry;
                } else {
                    termResults.push(entry);
                }
            }
        });
        imported++;
    });
    
    DataService.set('termResults', termResults);
    closeModal();
    showToast(`Imported ${imported} students successfully! ${errors} errors.`, imported > 0 ? 'success' : 'error');
}

/**
 * Opens and renders the score entry modal.
 * Dynamically binds class contexts (JCE vs MSCE) and populates existing grades.
 */
function showScoreEntryModal() {
    const students = DataService.get('students') || [];
    const subjects = DataService.get('subjects') || [];
    
    if (students.length === 0) {
        showToast('Please add students first!', 'error');
        return;
    }
    
    if (subjects.length === 0) {
        showToast('Please create subjects first!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    if (!modal || !modalContent) {
        console.error('Modal or Modal Content element not found!');
        showToast('Modal container missing from DOM!', 'error');
        return;
    }
    
    // Determine unique classes and initial selections
    const classes = [...new Set(students.map(s => s.class))].sort();
    const firstClass = classes[0] || '';
    const studentsInClass = students.filter(s => s.class === firstClass);
    
    // Filter subjects applicable to the initial class
    const classSubjects = subjects.filter(sub => sub.class === 'All' || sub.class === firstClass);
    const firstSubjectId = classSubjects[0]?.id || '';
    const currentYear = new Date().getFullYear();
    const currentTerm = 1;

    // Build Modal Layout
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold text-gray-800">Enter End of Term Results</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 transition-colors">
                <i class="fas fa-times text-lg"></i>
            </button>
        </div>
        
        <form id="scoreEntryForm">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select id="score-class" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        ${classes.map(cls => `
                            <option value="${escapeHtml(cls)}" ${cls === firstClass ? 'selected' : ''}>${escapeHtml(cls)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <select id="score-subject" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        ${classSubjects.map(sub => `
                            <option value="${escapeHtml(sub.id)}" ${sub.id === firstSubjectId ? 'selected' : ''}>${escapeHtml(sub.name)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Term</label>
                    <select id="score-term" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="1" ${currentTerm === 1 ? 'selected' : ''}>Term 1</option>
                        <option value="2" ${currentTerm === 2 ? 'selected' : ''}>Term 2</option>
                        <option value="3" ${currentTerm === 3 ? 'selected' : ''}>Term 3</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input type="number" id="score-year" value="${currentYear}" 
                           class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
            </div>
            
            <div class="border rounded-lg overflow-hidden bg-white shadow-inner" style="height: 320px;">
                <div class="h-full overflow-y-auto">
                    <table class="table w-full border-collapse">
                        <thead class="sticky top-0 z-10 bg-gray-100 border-b border-gray-200">
                            <tr>
                                <th class="px-3 py-3 text-center text-sm font-semibold text-gray-700 w-12">#</th>
                                <th class="px-3 py-3 text-left text-sm font-semibold text-gray-700">Student Name</th>
                                <th class="px-3 py-3 text-center text-sm font-semibold text-gray-700 w-16">Sex</th>
                                <th class="px-3 py-3 text-center text-sm font-semibold text-gray-700 w-32">Score (0-100)</th>
                                <th class="px-3 py-3 text-center text-sm font-semibold text-gray-700 w-24 grade-header">${isSeniorClass(firstClass) ? 'Points (1-9)' : 'Grade'}</th>
                                <th class="px-3 py-3 text-center text-sm font-semibold text-gray-700 w-36">Remark</th>
                            </tr>
                        </thead>
                        <tbody id="score-entry-body">
                            ${renderStudentScoreRows(studentsInClass, firstSubjectId, currentTerm, currentYear)}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div id="score-entry-count" class="mt-3 text-sm text-gray-500">
                Showing ${studentsInClass.length} students in ${escapeHtml(firstClass)}
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors font-medium">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium shadow-sm">
                    <i class="fas fa-save mr-2"></i>Save Results
                </button>
            </div>
        </form>
    `;

    // Display modal container
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    const containerCard = modal.querySelector('.bg-white');
    if (containerCard) {
        containerCard.classList.add('max-w-4xl', 'w-full');
    }

    // Bind event handlers for real-time updates
    const classSelect = document.getElementById('score-class');
    const subjectSelect = document.getElementById('score-subject');
    const termSelect = document.getElementById('score-term');
    const yearInput = document.getElementById('score-year');

    // Handler when class selection changes
    classSelect.addEventListener('change', function() {
        const selectedClass = this.value;
        
        // Update subjects dropdown for chosen class
        const filteredSubjects = subjects.filter(sub => sub.class === 'All' || sub.class === selectedClass);
        subjectSelect.innerHTML = filteredSubjects.map(sub => `
            <option value="${escapeHtml(sub.id)}">${escapeHtml(sub.name)}</option>
        `).join('');

        refreshModalTable();
    });

    // Handler for remaining filter parameter changes
    [subjectSelect, termSelect, yearInput].forEach(elem => {
        elem.addEventListener('change', refreshModalTable);
        if (elem === yearInput) elem.addEventListener('input', refreshModalTable);
    });

    // Form submit listener
    document.getElementById('scoreEntryForm').onsubmit = function(e) {
        e.preventDefault();
        if (typeof saveTermResults === 'function') {
            saveTermResults();
        }
    };

    // Calculate initial grades for existing populated inputs
    document.querySelectorAll('.score-input').forEach(input => {
        if (input.value !== '') updateGradeAndRemark(input);
    });
}

/**
 * Helper: Renders HTML rows for student score entry with pre-populated values and explicit class datasets.
 */
function renderStudentScoreRows(studentsList, subjectId, term, year) {
    if (!studentsList || studentsList.length === 0) {
        return `<tr><td colspan="6" class="text-center py-8 text-gray-400">No students found for this class.</td></tr>`;
    }

    const termResults = (typeof DataService !== 'undefined' ? DataService.get('termResults') : []) || [];

    return studentsList.map((student, index) => {
        // Query existing result if present
        const existingRecord = termResults.find(r => 
            String(r.studentId) === String(student.id) &&
            String(r.subjectId) === String(subjectId) &&
            String(r.term) === String(term) &&
            String(r.year) === String(year)
        );

        const initialScore = existingRecord && existingRecord.score !== undefined ? existingRecord.score : '';

        return `
            <tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}" data-class-level="${escapeHtml(student.class)}">
                <td class="px-3 py-2 text-sm text-center text-gray-500">${index + 1}</td>
                <td class="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">${escapeHtml(student.name)}</td>
                <td class="px-3 py-2 text-sm text-center text-gray-600">${escapeHtml(student.sex || '-')}</td>
                <td class="px-3 py-2 text-center">
                    <input type="number" min="0" max="100" 
                           value="${initialScore}"
                           data-student-id="${student.id}"
                           data-class-level="${escapeHtml(student.class)}"
                           class="score-input w-20 px-2 py-1 text-center border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                           placeholder="Score"
                           oninput="updateGradeAndRemark(this)">
                </td>
                <td class="px-3 py-2 text-sm font-semibold text-center grade-display">-</td>
                <td class="px-3 py-2 text-sm text-center remark-display text-gray-600">-</td>
            </tr>
        `;
    }).join('');
}

/**
 * Helper: Refreshes student score inputs dynamically based on active filter controls.
 */
function refreshModalTable() {
    const selectedClass = document.getElementById('score-class')?.value;
    const selectedSubject = document.getElementById('score-subject')?.value;
    const selectedTerm = document.getElementById('score-term')?.value;
    const selectedYear = document.getElementById('score-year')?.value;

    const students = (typeof DataService !== 'undefined' ? DataService.get('students') : []) || [];
    const studentsInClass = students.filter(s => s.class === selectedClass);
    
    const tbody = document.getElementById('score-entry-body');
    const countDisplay = document.getElementById('score-entry-count');

    if (tbody) {
        tbody.innerHTML = renderStudentScoreRows(studentsInClass, selectedSubject, selectedTerm, selectedYear);
        
        // Trigger real-time grade calculations for any loaded values
        tbody.querySelectorAll('.score-input').forEach(input => {
            if (input.value !== '') updateGradeAndRemark(input);
        });
    }

    if (countDisplay) {
        countDisplay.textContent = `Showing ${studentsInClass.length} students in ${selectedClass}`;
    }
}

function updateModalTableHeader(classLevel) {
    const gradeHeader = document.querySelector('#scoreEntryForm th.grade-header');
    if (gradeHeader) {
        gradeHeader.textContent = isSeniorClass(classLevel) ? 'Points (1-9)' : 'Grade';
    }
}

function updateScoreEntryStudents(className) {
    const students = DataService.get('students');
    const filtered = students.filter(s => s.class === className);
    const tbody = document.getElementById('score-entry-body');
    
    if (!tbody) return;
    
    tbody.innerHTML = filtered.map((student, i) => `
        <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="px-3 py-2 text-sm text-center">${i + 1}</td>
            <td class="px-3 py-2 text-sm font-medium whitespace-nowrap">${escapeHtml(student.name)}</td>
            <td class="px-3 py-2 text-sm text-center">${escapeHtml(student.sex)}</td>
            <td class="px-3 py-2">
                <input type="number" min="0" max="100" 
                       data-student-id="${student.id}"
                       class="score-input w-20 px-2 py-1 border rounded focus:outline-none focus:border-indigo-500"
                       placeholder="Score"
                       oninput="updateGradeAndRemark(this)">
            </td>
            <td class="px-3 py-2 text-sm font-semibold text-center grade-display">-</td>
            <td class="px-3 py-2 text-sm remark-display text-center">-</td>
        </tr>
    `).join('');
}

/**
 * Real-time event handler for score inputs.
 * Calculates and updates grade displays dynamically for both JCE and MSCE grading standards.
 * 
 * @param {HTMLInputElement} input - The score input element triggering the change.
 */
function updateGradeAndRemark(input) {
    if (!input) return;
    
    const row = input.closest('tr');
    if (!row) return;

    const gradeDisplay = row.querySelector('.grade-display');
    const remarkDisplay = row.querySelector('.remark-display');
    
    const rawValue = input.value.trim();
    const score = parseInt(rawValue, 10);
    
    // Default base display class
    const baseDisplayClass = 'px-3 py-2 text-sm font-semibold text-center grade-display';

    // Handle empty or invalid inputs
    if (rawValue === '' || isNaN(score) || score < 0 || score > 100) {
        if (gradeDisplay) {
            gradeDisplay.textContent = '-';
            gradeDisplay.className = `${baseDisplayClass} text-gray-400`;
        }
        if (remarkDisplay) {
            remarkDisplay.textContent = '-';
        }
        return;
    }
    
    // Resolve student class level with multiple fallbacks
    const studentId = input.dataset.studentId;
    let classLevel = input.dataset.classLevel || row.dataset.classLevel || null;

    if (!classLevel && studentId && typeof DataService !== 'undefined') {
        const students = DataService.get('students') || [];
        const student = students.find(s => String(s.id) === String(studentId));
        if (student) {
            classLevel = student.class;
        }
    }

    // Fallback to active UI select filter if available
    if (!classLevel) {
        const activeFilter = document.getElementById('entry-class-filter') || document.getElementById('grade-class-filter');
        if (activeFilter) classLevel = activeFilter.value;
    }

    // Compute grade & remark using MANEB rules
    const result = typeof getGradeAndRemark === 'function' 
        ? getGradeAndRemark(score, classLevel) 
        : { grade: '-', remark: '-' };

    if (gradeDisplay) {
        gradeDisplay.textContent = result.grade || '-';
        gradeDisplay.className = baseDisplayClass;
        
        // Dynamic text color mapping for both JCE (A-F) & MSCE (1-9)
        const gradeStr = String(result.grade).toUpperCase();
        
        if (['A', '1', '2'].includes(gradeStr)) {
            gradeDisplay.classList.add('text-emerald-600'); // Excellent / Distinction
        } else if (['B', '3', '4'].includes(gradeStr)) {
            gradeDisplay.classList.add('text-blue-600');    // Very Good / Strong Credit
        } else if (['C', '5', '6'].includes(gradeStr)) {
            gradeDisplay.classList.add('text-indigo-600');  // Good / Credit
        } else if (['D', '7', '8'].includes(gradeStr)) {
            gradeDisplay.classList.add('text-amber-600');   // Pass
        } else if (['F', '9'].includes(gradeStr)) {
            gradeDisplay.classList.add('text-rose-600');    // Fail
        } else {
            gradeDisplay.classList.add('text-gray-800');
        }
    }

    if (remarkDisplay) {
        remarkDisplay.textContent = result.remark || '-';
    }
}

/**
 * Saves or overwrites term assessment results.
 * Accurately stores MSCE Points (1-9) for Senior classes and JCE Letter Grades (A-F) for Junior classes.
 */
function saveTermResults() {
    const subjectSelect = document.getElementById('score-subject');
    const subjectId = subjectSelect?.value;
    const term = document.getElementById('score-term')?.value;
    const year = document.getElementById('score-year')?.value;
    const className = document.getElementById('score-class')?.value;
    
    if (!subjectId || !term || !year || !className) {
        if (typeof showToast === 'function') showToast('Missing required form selection fields!', 'error');
        return;
    }
    
    const numericTerm = parseInt(term, 10);
    const numericYear = parseInt(year, 10);
    const scoreInputs = document.querySelectorAll('.score-input');
    const termResults = DataService.get('termResults') || [];
    
    // Determine senior class context
    const isSenior = typeof isSeniorClass === 'function' 
        ? isSeniorClass(className) 
        : ['FORM 3', 'FORM 4', 'SS 3', 'SS 4', 'SENIOR'].some(f => className.toUpperCase().includes(f));
    
    // Check if scores already exist for this class, subject, term, and year
    const existingResults = termResults.filter(r => 
        String(r.subjectId) === String(subjectId) && 
        String(r.term) === String(numericTerm) && 
        String(r.year) === String(numericYear) &&
        r.class === className
    );
    
    if (existingResults.length > 0) {
        const subjectName = subjectSelect.selectedOptions[0]?.text || 'this subject';
        const confirmSave = confirm(
            `⚠️ WARNING: Scores for "${subjectName}" already exist for ${className}, Term ${numericTerm}, ${numericYear}.\n\n` +
            `Existing scores will be OVERWRITTEN.\n\n` +
            `Click "OK" to overwrite or "Cancel" to go back.`
        );
        
        if (!confirmSave) return;
    }
    
    let savedCount = 0;
    
    scoreInputs.forEach(input => {
        const rawScore = input.value.trim();
        const score = parseInt(rawScore, 10);
        const studentId = input.dataset.studentId;
        
        if (studentId && rawScore !== '' && !isNaN(score) && score >= 0 && score <= 100) {
            // Get contextual grade and remark (MSCE points 1-9 for senior, JCE letter A-F for junior)
            const gradeInfo = typeof getGradeAndRemark === 'function'
                ? getGradeAndRemark(score, className)
                : { grade: '-', remark: '-' };
                
            let points = null;
            if (isSenior) {
                points = parseInt(gradeInfo.grade, 10);
                // Fallback check if gradeInfo wasn't numeric
                if (isNaN(points)) {
                    if (typeof getMSCEGrade === 'function') {
                        const msce = getMSCEGrade(score);
                        points = parseInt(msce.grade, 10) || 9;
                    } else {
                        points = 9;
                    }
                }
            }
            
            const existingIndex = termResults.findIndex(r => 
                String(r.studentId) === String(studentId) && 
                String(r.subjectId) === String(subjectId) && 
                String(r.term) === String(numericTerm) && 
                String(r.year) === String(numericYear)
            );
            
            const entry = {
                studentId: studentId,
                subjectId: subjectId,
                class: className,
                term: numericTerm,
                year: numericYear,
                score: score,
                grade: gradeInfo.grade, // Stores '1'-'9' for Senior, 'A'-'F' for Junior
                remark: gradeInfo.remark,
                points: points,         // Stores numeric 1-9 for Senior, null for Junior
                updatedAt: new Date().toISOString()
            };
            
            if (existingIndex >= 0) {
                termResults[existingIndex] = entry;
            } else {
                termResults.push(entry);
            }
            savedCount++;
        }
    });
    
    if (savedCount > 0) {
        DataService.set('termResults', termResults);
        
        if (typeof closeModal === 'function') closeModal();
        if (typeof showToast === 'function') {
            showToast(`${savedCount} result(s) saved successfully!`, 'success');
        }
        
        // Refresh active background results table if present
        if (typeof loadGradesResults === 'function') {
            loadGradesResults();
        }
    } else {
        if (typeof showToast === 'function') {
            showToast('No valid score entries were entered to save.', 'warning');
        }
    }
}

// ============================================
// SUBJECT MANAGEMENT
// ============================================

function showSubjectModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');

    // Debug: Check if elements exist
    if (!modal) {
        console.error('Modal not found!');
        showToast('Modal not found!', 'error');
        return;
    }
    if (!modalContent) {
        console.error('Modal content not found!');
        showToast('Modal content not found!', 'error');
        return;
    }
    
    // Show modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    
    const existingSubjects = DataService.get('subjects') || [];
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Manage Subjects</h3>
            <button onclick="showAddSubjectForm()" 
                    class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">
                <i class="fas fa-plus"></i> Add Subject
            </button>
        </div>
        
        <div id="subject-list" class="max-h-96 overflow-y-auto">
            ${existingSubjects.length === 0 ? `
                <p class="text-center py-8 text-gray-400">No subjects created yet. Click "Add Subject" to begin.</p>
                
                ` : `
                <div class="overflow-x-auto">
                 <table class="table w-full border-collapse">  <thead>
                            <tr class="bg-gray-50 border-b">
                                <th class="px-4 py-3 text-left text-sm font-semibold">Subject Name</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold">Class</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold">Teacher</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${existingSubjects.map((subject, index) => `
                                <tr class="border-b hover:bg-gray-50">
                                <td class="px-4 py-3 font-medium">${escapeHtml(subject.name)}</td>
                                <td class="px-4 py-3">
                                <span class="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs">${escapeHtml(subject.class || 'All')}</span>
                                </td>
                                <td class="px-4 py-3">${escapeHtml(subject.teacher || 'Not assigned')}</td>
                                <td class="px-4 py-3">
                                <button onclick="deleteSubject(${index})" class="text-red-600 hover:text-red-800">
                                <i class="fas fa-trash"></i>
                                </button>
                                </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        </div>
        
        <div class="mt-6">
            <button onclick="closeModal()" class="w-full py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
            </button>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

function showAddSubjectForm() {
    const modalContent = document.getElementById('modal-content');
    const students = DataService.get('students');
    const uniqueClasses = [...new Set(students.map(s => s.class))].sort();
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Add New Subject</h3>
        </div>
        <form id="subjectForm">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Subject Name *</label>
                    <input type="text" id="subject-name" required 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="e.g., Mathematics">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select id="subject-class" class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="">All Classes</option>
                        ${uniqueClasses.map(cls => `
                            <option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                    <input type="text" id="subject-teacher" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="Teacher's name">
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="showSubjectModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Back
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    Save Subject
                </button>
            </div>
        </form>
    `;
    
    document.getElementById('subjectForm').onsubmit = function(e) {
        e.preventDefault();
        saveSubject();
    };
}

function saveSubject() {
    const name = document.getElementById('subject-name').value.trim();
    const subjectClass = document.getElementById('subject-class').value;
    const teacher = document.getElementById('subject-teacher').value.trim();
    
    if (!name) {
        showToast('Subject name is required', 'error');
        return;
    }
    
    const subjects = DataService.get('subjects');
    subjects.push({
        id: DataService.generateId('SUB'),
        name: name,
        class: subjectClass || 'All',
        teacher: teacher || 'Not assigned',
        createdAt: new Date().toISOString()
    });
    
    DataService.set('subjects', subjects);
    showToast('Subject added successfully!', 'success');
    showSubjectModal(); // Refresh the list
}

function deleteSubject(index) {
    if (!confirm('Delete this subject?')) return;
    
    const subjects = DataService.get('subjects');
    subjects.splice(index, 1);
    DataService.set('subjects', subjects);
    showToast('Subject deleted', 'success');
    showSubjectModal(); // Refresh the list
}

// ============================================
// SCORE ENTRY
// ============================================
// ==================== HELPER GRADERS ====================
function getGradeAndPoints(score, isSenior) {
    if (score === null || score === undefined) {
        return { grade: '-', remark: 'No Score', points: null };
    }
    
    if (isSenior) {
        for (const [grade, config] of Object.entries(MSCE_GRADING)) {
            if (score >= config.min && score <= config.max) {
                return { grade: String(grade), remark: config.remark, points: Number(grade) };
            }
        }
        return { grade: '9', remark: 'Fail', points: 9 };
    } else {
        for (const [grade, config] of Object.entries(JCE_GRADING)) {
            if (score >= config.min && score <= config.max) {
                return { grade: grade, remark: config.remark, points: null };
            }
        }
        return { grade: 'F', remark: 'Fail', points: null };
    }
}

// ==================== MAIN REPORT CARD FUNCTION ====================
function viewReportCard(studentId, term, year, publish = false) {
    const students = DataService.get('students') || [];
    const student = students.find(s => s.id === studentId);
    
    if (!student) {
        if (!publish) showToast('Student not found!', 'error');
        return publish ? null : false;
    }
    
    const termResults = DataService.get('termResults') || [];
    const subjects = DataService.get('subjects') || [];
    const school = getSchoolSettings();
    
    const isSenior = isMSCE(student.class);
    
    const studentResults = termResults.filter(r => 
        r.studentId === studentId && 
        r.term === parseInt(term) && 
        r.year === parseInt(year)
    );
    
    if (studentResults.length === 0) {
        if (!publish) showToast('No results found for this student!', 'error');
        return publish ? null : false;
    }
    
    const classStudents = students.filter(s => s.class === student.class);
    const totalStudents = classStudents.length;
    
    // Evaluate Subject Scores
    const subjectScores = subjects.map(sub => {
        const result = studentResults.find(r => r.subjectId === sub.id);
        const score = result ? result.score : null;
        
        const { grade, remark, points } = getGradeAndPoints(score, isSenior);
        
        let studentsSatForSubject = 0;
        let subjectPosition = '-';
        
        if (score !== null) {
            const allSubjectScores = classStudents.map(s => {
                const results = termResults.filter(r => 
                    r.studentId === s.id && 
                    r.subjectId === sub.id && 
                    r.term === parseInt(term) && 
                    r.year === parseInt(year)
                );
                return { studentId: s.id, score: results.length > 0 ? results[0].score : null };
            });
            
            const validScores = allSubjectScores.filter(s => s.score !== null);
            studentsSatForSubject = validScores.length;
            
            const sorted = validScores.sort((a, b) => b.score - a.score);
            const pos = sorted.findIndex(s => s.studentId === studentId) + 1;
            subjectPosition = pos > 0 ? pos : '-';
        }
        
        return {
            subject: sub.name,
            score: score,
            grade: grade,
            remark: remark,
            points: points,
            position: subjectPosition,
            outOf: studentsSatForSubject || totalStudents,
            teacher: sub.teacher || 'Not assigned'
        };
    });
    
    // Best 6 Subjects Performance
    const validSubjectScores = subjectScores.filter(s => s.score !== null);
    const bestSix = [...validSubjectScores].sort((a, b) => b.score - a.score).slice(0, MSCE_BEST_SUBJECTS);
    const totalBestSix = bestSix.reduce((sum, s) => sum + s.score, 0);
    const averageBestSix = bestSix.length > 0 ? Math.round(totalBestSix / bestSix.length) : 0;
    
    // Overall Position calculation (based on top 6 average)
    const allBestSixAverages = classStudents.map(s => {
        const results = termResults.filter(r => 
            r.studentId === s.id && 
            r.term === parseInt(term) && 
            r.year === parseInt(year)
        );
        const scores = results.map(r => r.score).sort((a, b) => b - a).slice(0, MSCE_BEST_SUBJECTS);
        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        return { studentId: s.id, average: avg };
    });
    
    const sortedAverages = allBestSixAverages.sort((a, b) => b.average - a.average);
    const position = sortedAverages.findIndex(s => s.studentId === studentId) + 1;
    
    const subjectsSat = validSubjectScores.length;
    const subjectsPassed = validSubjectScores.filter(s => s.score >= MSCE_PASS_MIN).length;
    const subjectsFailed = subjectsSat - subjectsPassed;
    const passRate = subjectsSat > 0 ? Math.round((subjectsPassed / subjectsSat) * 100) : 0;
    
    const overallStatus = averageBestSix >= MSCE_PASS_MIN && subjectsPassed >= JCE_MIN_SUBJECTS ? 'PASS' : 'FAIL';

    // MSCE Points Aggregate (Sum of points for best 6 subjects)
    let pointsTotal = 'N/A';
    if (isSenior && bestSix.length > 0) {
        pointsTotal = bestSix.reduce((sum, s) => sum + (s.points || 0), 0);
    }
    
    // Remarks
    let performanceRemark = '';
    if (averageBestSix >= 80) performanceRemark = 'Excellent performance! Keep up the great work.';
    else if (averageBestSix >= 66) performanceRemark = 'Very good performance. Continue working hard.';
    else if (averageBestSix >= 56) performanceRemark = 'Good performance. Keep pushing for better results.';
    else if (averageBestSix >= 40) performanceRemark = 'Satisfactory performance. More effort needed.';
    else performanceRemark = 'Needs improvement. Please work harder next term.';
    
    let headTeacherRemark = '';
    if (overallStatus === 'PASS') {
        if (averageBestSix >= 80) headTeacherRemark = 'A commendable performance. Keep shining!';
        else if (averageBestSix >= 66) headTeacherRemark = 'Very impressive results. Continue striving for excellence.';
        else if (averageBestSix >= 56) headTeacherRemark = 'Good effort. Aim higher next term.';
        else headTeacherRemark = 'Satisfactory. Work harder to improve.';
    } else {
        headTeacherRemark = 'Needs significant improvement. Please seek extra support.';
    }
    
    const gradeInfo = getGradeAndPoints(averageBestSix, isSenior);

    // Export payload for publication
    if (publish) {
        return generateReportHTML(student, term, year, {
            subjectScores,
            totalBestSix,
            averageBestSix,
            position,
            subjectsSat,
            subjectsPassed,
            subjectsFailed,
            passRate,
            overallStatus,
            pointsTotal,
            performanceRemark,
            headTeacherRemark,
            gradeInfo,
            isSenior,
            totalStudents
        });
    }

    // Direct Window Display
    const reportWindow = window.open('', '_blank', 'width=900,height=800,scrollbars=yes,resizable=yes');
    
    if (!reportWindow) {
        showToast('Please allow popups for this site', 'error');
        return;
    }
    
    const maxPossibleScore = bestSix.length * 100;
    
    reportWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Report Card - ${escapeHtml(student.name)}</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Segoe UI', Arial, sans-serif; 
                    background: white; 
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }
                @media print {
                    body { background: white; padding: 0; margin: 0; }
                    .no-print { display: none !important; }
                    #report-card { 
                        margin: 0; 
                        border: none; 
                        box-shadow: none; 
                        border-radius: 0;
                        padding: 20px 25px;
                    }
                    .btn-container { display: none !important; }
                }
                #report-card {
                    background: white;
                    max-width: 210mm;
                    width: 100%;
                    min-height: 253mm;
                    padding: 18px 25px;
                    font-size: 12.5px;
                    border: 1px solid #ccc;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.1);
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: 700; }
                .font-semibold { font-weight: 600; }
                .font-medium { font-weight: 500; }
                .text-sm { font-size: 13px; }
                .text-lg { font-size: 16px; }
                .text-3xl { font-size: 26px; }
                .text-indigo-800 { color: #3730a3; }
                .text-indigo-600 { color: #4f46e5; }
                .border-b-2 { border-bottom: 2px solid #d1d5db; }
                .border-t { border-top: 1px solid #d1d5db; }
                .table { width: 100%; border-collapse: collapse; }
                .table th { 
                    background: #4f46e5; 
                    color: white; 
                    padding: 6px; 
                    text-align: left; 
                    font-size: 11px;
                    font-weight: 600;
                    border: 1px solid #4338ca;
                }
                .table td { 
                    padding: 5px 6px; 
                    border: 1px solid #d1d5db; 
                    font-size: 11.5px;
                }
                .table tr:nth-child(even) { background: #f9fafb; }
                .summary-table { width: 100%; border-collapse: collapse; }
                .summary-table td { 
                    padding: 4px 6px; 
                    border: 1px solid #d1d5db; 
                    font-size: 11px;
                }
                .summary-table .label { 
                    font-weight: 600; 
                    background: #f3f4f6; 
                    text-align: left;
                    font-size: 10px;
                }
                .summary-table .value { 
                    font-weight: 600; 
                    text-align: center; 
                    font-size: 11px;
                }
                .flex-between { display: flex; justify-content: space-between; align-items: center; }
                .remark-box {
                    padding: 5px 10px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    margin-top: 3px;
                    min-height: 28px;
                    font-size: 12.5px;
                    background: #fafafa;
                }
                .btn-container {
                    max-width: 210mm;
                    width: 100%;
                    padding: 16px 0;
                    display: flex;
                    gap: 16px;
                    justify-content: center;
                }
                .btn-print {
                    padding: 12px 36px;
                    background: #4f46e5;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 500;
                    cursor: pointer;
                    font-size: 15px;
                }
                .btn-print:hover { background: #4338ca; }
                .btn-close {
                    padding: 12px 36px;
                    background: white;
                    color: #374151;
                    border: 1px solid #9ca3af;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 15px;
                }
                .btn-close:hover { background: #f3f4f6; }
                .footer-info {
                    font-size: 12px;
                    border-top: 1px solid #d1d5db;
                    padding-top: 10px;
                    margin-top: 8px;
                }
            </style>
        </head>
        <body>
            <div id="report-card">
                <div>
                    <!-- School Header -->
                    <div class="border-b-2 pb-3 mb-2">
                        <div class="flex-between">
                            <div style="width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
                                ${localStorage.getItem('logo_left') ? 
                                    `<img src="${localStorage.getItem('logo_left')}" alt="Logo" style="max-width: 80px; max-height: 80px; object-fit: contain;">` :
                                    `<div style="border: 2px dashed #ccc; border-radius: 6px; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999;">LOGO 1</div>`
                                }
                            </div>
                            <div class="text-center" style="flex:1; padding:0 12px;">
                                <div class="text-3xl font-bold text-indigo-800">${escapeHtml(school.schoolName)}</div>
                                <div class="text-sm">${escapeHtml(school.address)}</div>
                                <div class="text-sm">${escapeHtml(school.email)}</div>
                                <div class="text-sm italic">${escapeHtml(school.motto)}</div>
                                <div class="text-lg font-semibold text-indigo-600 style="margin-top:4px;">END OF TERM REPORT CARD</div>
                                <div class="text-sm">Term ${term} • ${year}</div>
                            </div>
                            <div style="width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
                                ${localStorage.getItem('logo_right') ? 
                                    `<img src="${localStorage.getItem('logo_right')}" alt="Logo" style="max-width: 80px; max-height: 80px; object-fit: contain;">` :
                                    `<div style="border: 2px dashed #ccc; border-radius: 6px; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999;">LOGO 2</div>`
                                }
                            </div>
                        </div>
                    </div>
                    
                    <!-- Student Details -->
                    <div style="display:grid; grid-template-columns: repeat(4,1fr); gap:3px; font-size:13px; margin-bottom:6px;">
                        <div><span class="font-semibold">Name:</span> ${escapeHtml(student.name)}</div>
                        <div><span class="font-semibold">Admission:</span> ${escapeHtml(student.id)}</div>
                        <div><span class="font-semibold">Sex:</span> ${escapeHtml(student.sex)}</div>
                        <div><span class="font-semibold">Class:</span> ${escapeHtml(student.class)}</div>
                    </div>
                    
                    <!-- Results Table -->
                    <table class="table" style="margin-bottom: 8px;">
                        <thead>
                            <tr>
                                <th style="text-align:center; width:30px;">#</th>
                                <th>Subject</th>
                                <th style="text-align:center; width:60px;">Score</th>
                                <th style="text-align:center; width:50px;">Pos</th>
                                <th style="text-align:center; width:60px;">Out of</th>
                                <th style="text-align:center; width:50px;">Grade</th>
                                <th>Remark</th>
                                <th style="width:110px;">Teacher</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subjectScores.map((sub, i) => `
                                <tr>
                                    <td style="text-align:center;">${i + 1}</td>
                                    <td class="font-medium">${escapeHtml(sub.subject)}</td>
                                    <td style="text-align:center; font-weight:600;">${sub.score !== null ? sub.score : '-'}</td>
                                    <td style="text-align:center;">${sub.position}</td>
                                    <td style="text-align:center;">${sub.outOf}</td>
                                    <td style="text-align:center; font-weight:700; ${sub.grade === 'F' || sub.grade === '9' ? 'color:#dc2626;' : 'color:#4f46e5;'}">${sub.grade}</td>
                                    <td>${escapeHtml(sub.remark)}</td>
                                    <td style="font-size:11px;">${escapeHtml(sub.teacher)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <!-- Summary Table -->
                    <table class="summary-table" style="margin-bottom:6px; table-layout:fixed;">
                        <tr>
                            <td class="label" style="width:12%;">Subjects Sat</td>
                            <td class="value" style="width:10%;">${subjectsSat}</td>
                            <td class="label" style="width:10%;">Grade</td>
                            <td class="value" style="width:10%; font-weight:700; ${gradeInfo.grade === 'F' || gradeInfo.grade === '9' ? 'color:#dc2626;' : 'color:#4f46e5;'}">${gradeInfo.grade}</td>
                            <td class="label" style="width:14%;">Total Score</td>
                            <td class="value" style="width:14%; font-weight:700;">${totalBestSix}/${maxPossibleScore}</td>
                            ${isSenior ? `
                            <td class="label" style="width:10%;">Points</td>
                            <td class="value" style="width:10%; font-weight:700;">${pointsTotal}</td>
                            ` : ''}
                        </tr>
                        <tr>
                            <td class="label">Passed</td>
                            <td class="value" style="color:#15803d;">${subjectsPassed}</td>
                            <td class="label">Failed</td>
                            <td class="value" style="color:#dc2626;">${subjectsFailed}</td>
                            <td class="label">Position</td>
                            <td class="value" style="font-weight:700;">${position}/${totalStudents}</td>
                            ${isSenior ? `
                            <td class="label">Status</td>
                            <td class="value" style="font-weight:700; ${overallStatus === 'PASS' ? 'color:#15803d;' : 'color:#dc2626;'}">${overallStatus}</td>
                            ` : ''}
                        </tr>
                        ${!isSenior ? `
                        <tr>
                            <td class="label">Pass Rate</td>
                            <td class="value">${passRate}%</td>
                            <td class="label">Status</td>
                            <td class="value" colspan="5" style="font-weight:700; ${overallStatus === 'PASS' ? 'color:#15803d;' : 'color:#dc2626;'}">${overallStatus}</td>
                        </tr>
                        ` : ''}
                    </table>
                    
                    <!-- Remarks -->
                    <div style="margin-bottom:4px;">
                        <div class="font-semibold text-sm">Teacher's Remark:</div>
                        <div class="remark-box">${performanceRemark}</div>
                    </div>
                    
                    <div style="margin-bottom:4px;">
                        <div class="font-semibold text-sm">Head Teacher's Remark:</div>
                        <div class="remark-box">${headTeacherRemark}</div>
                    </div>
                    
                    <!-- Footer Info -->
                    <div class="footer-info">
                        <div class="flex-between">
                            <div><span class="font-semibold">Next Opening:</span> ${formatDate(school.nextOpeningDate)}</div>
                            <div><span class="font-semibold">Fees:</span> ${escapeHtml(school.fees)}</div>
                            <div><span class="font-semibold">Bank:</span> ${escapeHtml(school.accountName)}, ${escapeHtml(school.bank)} Acc ${escapeHtml(school.accountNumber)}</div>
                        </div>
                    </div>
                    
                    <!-- Stamp & Issue Date -->
                    <div class="flex-between style="margin-top:8px; padding-top:8px;" class="border-t">
                        <div style="width: 90px; height: 90px; display: flex; align-items: center; justify-content: center; border: 2px dashed #ccc; border-radius: 8px;">
                            ${localStorage.getItem('school_stamp') ? 
                                `<img src="${localStorage.getItem('school_stamp')}" alt="Stamp" style="max-width: 80px; max-height: 80px; object-fit: contain;">` :
                                `<span style="font-size: 9px; color: #999; text-align: center;">SCHOOL<br>STAMP</span>`
                            }
                        </div>
                        <div class="text-right">
                            <div class="text-sm">Issued:</div>
                            <div class="text-lg font-medium">${formatDate(new Date().toISOString())}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Action Controls -->
            <div class="no-print btn-container">
                <button onclick="window.print()" class="btn-print">🖨️ Print Report</button>
                <button onclick="window.close()" class="btn-close">✕ Close</button>
            </div>
        </body>
        </html>
    `);
    
    reportWindow.document.close();
}

// ==================== HELPER GRADERS ====================
function getGradeAndPoints(score, isSenior) {
    if (score === null || score === undefined) {
        return { grade: '-', remark: 'No Score', points: null };
    }
    
    if (isSenior) {
        for (const [grade, config] of Object.entries(MSCE_GRADING)) {
            if (score >= config.min && score <= config.max) {
                return { grade: String(grade), remark: config.remark, points: Number(grade) };
            }
        }
        return { grade: '9', remark: 'Fail', points: 9 };
    } else {
        for (const [grade, config] of Object.entries(JCE_GRADING)) {
            if (score >= config.min && score <= config.max) {
                return { grade: grade, remark: config.remark, points: null };
            }
        }
        return { grade: 'F', remark: 'Fail', points: null };
    }
}

// ==================== MAIN REPORT CARD FUNCTION ====================
function viewReportCard(studentId, term, year, publish = false) {
    const students = DataService.get('students') || [];
    const student = students.find(s => s.id === studentId);
    
    if (!student) {
        if (!publish) showToast('Student not found!', 'error');
        return publish ? null : false;
    }
    
    const termResults = DataService.get('termResults') || [];
    const subjects = DataService.get('subjects') || [];
    const school = getSchoolSettings();
    
    const isSenior = isMSCE(student.class);
    
    const studentResults = termResults.filter(r => 
        r.studentId === studentId && 
        r.term === parseInt(term) && 
        r.year === parseInt(year)
    );
    
    if (studentResults.length === 0) {
        if (!publish) showToast('No results found for this student!', 'error');
        return publish ? null : false;
    }
    
    const classStudents = students.filter(s => s.class === student.class);
    const totalStudents = classStudents.length;
    
    // Evaluate Subject Scores
    const subjectScores = subjects.map(sub => {
        const result = studentResults.find(r => r.subjectId === sub.id);
        const score = result ? result.score : null;
        
        const { grade, remark, points } = getGradeAndPoints(score, isSenior);
        
        let studentsSatForSubject = 0;
        let subjectPosition = '-';
        
        if (score !== null) {
            const allSubjectScores = classStudents.map(s => {
                const results = termResults.filter(r => 
                    r.studentId === s.id && 
                    r.subjectId === sub.id && 
                    r.term === parseInt(term) && 
                    r.year === parseInt(year)
                );
                return { studentId: s.id, score: results.length > 0 ? results[0].score : null };
            });
            
            const validScores = allSubjectScores.filter(s => s.score !== null);
            studentsSatForSubject = validScores.length;
            
            const sorted = validScores.sort((a, b) => b.score - a.score);
            const pos = sorted.findIndex(s => s.studentId === studentId) + 1;
            subjectPosition = pos > 0 ? pos : '-';
        }
        
        return {
            subject: sub.name,
            score: score,
            grade: grade,
            remark: remark,
            points: points,
            position: subjectPosition,
            outOf: studentsSatForSubject || totalStudents,
            teacher: sub.teacher || 'Not assigned'
        };
    });
    
    // Best 6 Subjects Performance
    const validSubjectScores = subjectScores.filter(s => s.score !== null);
    const bestSix = [...validSubjectScores].sort((a, b) => b.score - a.score).slice(0, MSCE_BEST_SUBJECTS);
    const totalBestSix = bestSix.reduce((sum, s) => sum + s.score, 0);
    const averageBestSix = bestSix.length > 0 ? Math.round(totalBestSix / bestSix.length) : 0;
    
    // Overall Position calculation (based on top 6 average)
    const allBestSixAverages = classStudents.map(s => {
        const results = termResults.filter(r => 
            r.studentId === s.id && 
            r.term === parseInt(term) && 
            r.year === parseInt(year)
        );
        const scores = results.map(r => r.score).sort((a, b) => b - a).slice(0, MSCE_BEST_SUBJECTS);
        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        return { studentId: s.id, average: avg };
    });
    
    const sortedAverages = allBestSixAverages.sort((a, b) => b.average - a.average);
    const position = sortedAverages.findIndex(s => s.studentId === studentId) + 1;
    
    const subjectsSat = validSubjectScores.length;
    const subjectsPassed = validSubjectScores.filter(s => s.score >= MSCE_PASS_MIN).length;
    const subjectsFailed = subjectsSat - subjectsPassed;
    const passRate = subjectsSat > 0 ? Math.round((subjectsPassed / subjectsSat) * 100) : 0;
    
    const overallStatus = averageBestSix >= MSCE_PASS_MIN && subjectsPassed >= JCE_MIN_SUBJECTS ? 'PASS' : 'FAIL';

    // MSCE Points Aggregate (Sum of points for best 6 subjects)
    let pointsTotal = 'N/A';
    if (isSenior && bestSix.length > 0) {
        pointsTotal = bestSix.reduce((sum, s) => sum + (s.points || 0), 0);
    }
    
    // Remarks
    let performanceRemark = '';
    if (averageBestSix >= 80) performanceRemark = 'Excellent performance! Keep up the great work.';
    else if (averageBestSix >= 66) performanceRemark = 'Very good performance. Continue working hard.';
    else if (averageBestSix >= 56) performanceRemark = 'Good performance. Keep pushing for better results.';
    else if (averageBestSix >= 40) performanceRemark = 'Satisfactory performance. More effort needed.';
    else performanceRemark = 'Needs improvement. Please work harder next term.';
    
    let headTeacherRemark = '';
    if (overallStatus === 'PASS') {
        if (averageBestSix >= 80) headTeacherRemark = 'A commendable performance. Keep shining!';
        else if (averageBestSix >= 66) headTeacherRemark = 'Very impressive results. Continue striving for excellence.';
        else if (averageBestSix >= 56) headTeacherRemark = 'Good effort. Aim higher next term.';
        else headTeacherRemark = 'Satisfactory. Work harder to improve.';
    } else {
        headTeacherRemark = 'Needs significant improvement. Please seek extra support.';
    }
    
    const gradeInfo = getGradeAndPoints(averageBestSix, isSenior);

    // Export payload for publication
    if (publish) {
        return generateReportHTML(student, term, year, {
            subjectScores,
            totalBestSix,
            averageBestSix,
            position,
            subjectsSat,
            subjectsPassed,
            subjectsFailed,
            passRate,
            overallStatus,
            pointsTotal,
            performanceRemark,
            headTeacherRemark,
            gradeInfo,
            isSenior,
            totalStudents
        });
    }

    // Direct Window Display
    const reportWindow = window.open('', '_blank', 'width=900,height=800,scrollbars=yes,resizable=yes');
    
    if (!reportWindow) {
        showToast('Please allow popups for this site', 'error');
        return;
    }
    
    const maxPossibleScore = bestSix.length * 100;
    
    reportWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Report Card - ${escapeHtml(student.name)}</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Segoe UI', Arial, sans-serif; 
                    background: white; 
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }
                @media print {
                    body { background: white; padding: 0; margin: 0; }
                    .no-print { display: none !important; }
                    #report-card { 
                        margin: 0; 
                        border: none; 
                        box-shadow: none; 
                        border-radius: 0;
                        padding: 20px 25px;
                    }
                    .btn-container { display: none !important; }
                }
                #report-card {
                    background: white;
                    max-width: 210mm;
                    width: 100%;
                    min-height: 253mm;
                    padding: 18px 25px;
                    font-size: 12.5px;
                    border: 1px solid #ccc;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.1);
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: 700; }
                .font-semibold { font-weight: 600; }
                .font-medium { font-weight: 500; }
                .text-sm { font-size: 13px; }
                .text-lg { font-size: 16px; }
                .text-3xl { font-size: 26px; }
                .text-indigo-800 { color: #3730a3; }
                .text-indigo-600 { color: #4f46e5; }
                .border-b-2 { border-bottom: 2px solid #d1d5db; }
                .border-t { border-top: 1px solid #d1d5db; }
                .table { width: 100%; border-collapse: collapse; }
                .table th { 
                    background: #4f46e5; 
                    color: white; 
                    padding: 6px; 
                    text-align: left; 
                    font-size: 11px;
                    font-weight: 600;
                    border: 1px solid #4338ca;
                }
                .table td { 
                    padding: 5px 6px; 
                    border: 1px solid #d1d5db; 
                    font-size: 11.5px;
                }
                .table tr:nth-child(even) { background: #f9fafb; }
                .summary-table { width: 100%; border-collapse: collapse; }
                .summary-table td { 
                    padding: 4px 6px; 
                    border: 1px solid #d1d5db; 
                    font-size: 11px;
                }
                .summary-table .label { 
                    font-weight: 600; 
                    background: #f3f4f6; 
                    text-align: left;
                    font-size: 10px;
                }
                .summary-table .value { 
                    font-weight: 600; 
                    text-align: center; 
                    font-size: 11px;
                }
                .flex-between { display: flex; justify-content: space-between; align-items: center; }
                .remark-box {
                    padding: 5px 10px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    margin-top: 3px;
                    min-height: 28px;
                    font-size: 12.5px;
                    background: #fafafa;
                }
                .btn-container {
                    max-width: 210mm;
                    width: 100%;
                    padding: 16px 0;
                    display: flex;
                    gap: 16px;
                    justify-content: center;
                }
                .btn-print {
                    padding: 12px 36px;
                    background: #4f46e5;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 500;
                    cursor: pointer;
                    font-size: 15px;
                }
                .btn-print:hover { background: #4338ca; }
                .btn-close {
                    padding: 12px 36px;
                    background: white;
                    color: #374151;
                    border: 1px solid #9ca3af;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 15px;
                }
                .btn-close:hover { background: #f3f4f6; }
                .footer-info {
                    font-size: 12px;
                    border-top: 1px solid #d1d5db;
                    padding-top: 10px;
                    margin-top: 8px;
                }
            </style>
        </head>
        <body>
            <div id="report-card">
                <div>
                    <!-- School Header -->
                    <div class="border-b-2 pb-3 mb-2">
                        <div class="flex-between">
                            <div style="width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
                                ${localStorage.getItem('logo_left') ? 
                                    `<img src="${localStorage.getItem('logo_left')}" alt="Logo" style="max-width: 80px; max-height: 80px; object-fit: contain;">` :
                                    `<div style="border: 2px dashed #ccc; border-radius: 6px; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999;">LOGO 1</div>`
                                }
                            </div>
                            <div class="text-center" style="flex:1; padding:0 12px;">
                                <div class="text-3xl font-bold text-indigo-800">${escapeHtml(school.schoolName)}</div>
                                <div class="text-sm">${escapeHtml(school.address)}</div>
                                <div class="text-sm">${escapeHtml(school.email)}</div>
                                <div class="text-sm italic">${escapeHtml(school.motto)}</div>
                                <div class="text-lg font-semibold text-indigo-600 style="margin-top:4px;">END OF TERM REPORT CARD</div>
                                <div class="text-sm">Term ${term} • ${year}</div>
                            </div>
                            <div style="width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
                                ${localStorage.getItem('logo_right') ? 
                                    `<img src="${localStorage.getItem('logo_right')}" alt="Logo" style="max-width: 80px; max-height: 80px; object-fit: contain;">` :
                                    `<div style="border: 2px dashed #ccc; border-radius: 6px; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999;">LOGO 2</div>`
                                }
                            </div>
                        </div>
                    </div>
                    
                    <!-- Student Details -->
                    <div style="display:grid; grid-template-columns: repeat(4,1fr); gap:3px; font-size:13px; margin-bottom:6px;">
                        <div><span class="font-semibold">Name:</span> ${escapeHtml(student.name)}</div>
                        <div><span class="font-semibold">Admission:</span> ${escapeHtml(student.id)}</div>
                        <div><span class="font-semibold">Sex:</span> ${escapeHtml(student.sex)}</div>
                        <div><span class="font-semibold">Class:</span> ${escapeHtml(student.class)}</div>
                    </div>
                    
                    <!-- Results Table -->
                    <table class="table" style="margin-bottom: 8px;">
                        <thead>
                            <tr>
                                <th style="text-align:center; width:30px;">#</th>
                                <th>Subject</th>
                                <th style="text-align:center; width:60px;">Score</th>
                                <th style="text-align:center; width:50px;">Pos</th>
                                <th style="text-align:center; width:60px;">Out of</th>
                                <th style="text-align:center; width:50px;">Grade</th>
                                <th>Remark</th>
                                <th style="width:110px;">Teacher</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subjectScores.map((sub, i) => `
                                <tr>
                                    <td style="text-align:center;">${i + 1}</td>
                                    <td class="font-medium">${escapeHtml(sub.subject)}</td>
                                    <td style="text-align:center; font-weight:600;">${sub.score !== null ? sub.score : '-'}</td>
                                    <td style="text-align:center;">${sub.position}</td>
                                    <td style="text-align:center;">${sub.outOf}</td>
                                    <td style="text-align:center; font-weight:700; ${sub.grade === 'F' || sub.grade === '9' ? 'color:#dc2626;' : 'color:#4f46e5;'}">${sub.grade}</td>
                                    <td>${escapeHtml(sub.remark)}</td>
                                    <td style="font-size:11px;">${escapeHtml(sub.teacher)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <!-- Summary Table -->
                    <table class="summary-table" style="margin-bottom:6px; table-layout:fixed;">
                        <tr>
                            <td class="label" style="width:12%;">Subjects Sat</td>
                            <td class="value" style="width:10%;">${subjectsSat}</td>
                            <td class="label" style="width:10%;">Grade</td>
                            <td class="value" style="width:10%; font-weight:700; ${gradeInfo.grade === 'F' || gradeInfo.grade === '9' ? 'color:#dc2626;' : 'color:#4f46e5;'}">${gradeInfo.grade}</td>
                            <td class="label" style="width:14%;">Total Score</td>
                            <td class="value" style="width:14%; font-weight:700;">${totalBestSix}/${maxPossibleScore}</td>
                            ${isSenior ? `
                            <td class="label" style="width:10%;">Points</td>
                            <td class="value" style="width:10%; font-weight:700;">${pointsTotal}</td>
                            ` : ''}
                        </tr>
                        <tr>
                            <td class="label">Passed</td>
                            <td class="value" style="color:#15803d;">${subjectsPassed}</td>
                            <td class="label">Failed</td>
                            <td class="value" style="color:#dc2626;">${subjectsFailed}</td>
                            <td class="label">Position</td>
                            <td class="value" style="font-weight:700;">${position}/${totalStudents}</td>
                            ${isSenior ? `
                            <td class="label">Status</td>
                            <td class="value" style="font-weight:700; ${overallStatus === 'PASS' ? 'color:#15803d;' : 'color:#dc2626;'}">${overallStatus}</td>
                            ` : ''}
                        </tr>
                        ${!isSenior ? `
                        <tr>
                            <td class="label">Pass Rate</td>
                            <td class="value">${passRate}%</td>
                            <td class="label">Status</td>
                            <td class="value" colspan="5" style="font-weight:700; ${overallStatus === 'PASS' ? 'color:#15803d;' : 'color:#dc2626;'}">${overallStatus}</td>
                        </tr>
                        ` : ''}
                    </table>
                    
                    <!-- Remarks -->
                    <div style="margin-bottom:4px;">
                        <div class="font-semibold text-sm">Teacher's Remark:</div>
                        <div class="remark-box">${performanceRemark}</div>
                    </div>
                    
                    <div style="margin-bottom:4px;">
                        <div class="font-semibold text-sm">Head Teacher's Remark:</div>
                        <div class="remark-box">${headTeacherRemark}</div>
                    </div>
                    
                    <!-- Footer Info -->
                    <div class="footer-info">
                        <div class="flex-between">
                            <div><span class="font-semibold">Next Opening:</span> ${formatDate(school.nextOpeningDate)}</div>
                            <div><span class="font-semibold">Fees:</span> ${escapeHtml(school.fees)}</div>
                            <div><span class="font-semibold">Bank:</span> ${escapeHtml(school.accountName)}, ${escapeHtml(school.bank)} Acc ${escapeHtml(school.accountNumber)}</div>
                        </div>
                    </div>
                    
                    <!-- Stamp & Issue Date -->
                    <div class="flex-between style="margin-top:8px; padding-top:8px;" class="border-t">
                        <div style="width: 90px; height: 90px; display: flex; align-items: center; justify-content: center; border: 2px dashed #ccc; border-radius: 8px;">
                            ${localStorage.getItem('school_stamp') ? 
                                `<img src="${localStorage.getItem('school_stamp')}" alt="Stamp" style="max-width: 80px; max-height: 80px; object-fit: contain;">` :
                                `<span style="font-size: 9px; color: #999; text-align: center;">SCHOOL<br>STAMP</span>`
                            }
                        </div>
                        <div class="text-right">
                            <div class="text-sm">Issued:</div>
                            <div class="text-lg font-medium">${formatDate(new Date().toISOString())}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Action Controls -->
            <div class="no-print btn-container">
                <button onclick="window.print()" class="btn-print">🖨️ Print Report</button>
                <button onclick="window.close()" class="btn-close">✕ Close</button>
            </div>
        </body>
        </html>
    `);
    
    reportWindow.document.close();
}

function calculateSubjectPositions(studentId, term, year, subjectScores, classStudents) {
    const termResults = DataService.get('termResults') || [];
    
    return subjectScores.map(sub => {
        let position = '-';
        let outOf = 0;
        
        if (sub.score !== null) {
            // Get all scores for this subject
            const allScores = classStudents.map(s => {
                const results = termResults.filter(r => 
                    r.studentId === s.id && 
                    r.subjectId === sub.subjectId && 
                    r.term === parseInt(term) && 
                    r.year === parseInt(year)
                );
                return { studentId: s.id, score: results.length > 0 ? results[0].score : null };
            });
            
            const validScores = allScores.filter(s => s.score !== null);
            outOf = validScores.length;
            
            // Sort descending and find position
            const sorted = validScores.sort((a, b) => b.score - a.score);
            const pos = sorted.findIndex(s => s.studentId === studentId) + 1;
            position = pos > 0 ? pos : '-';
        }
        
        return {
            ...sub,
            position: position,
            outOf: outOf
        };
    });
}

// PUBLISH REPORTS
// ============================================

function showPublishReportsModal() {
    if (!isAdmin()) {
        showToast('Access denied! Admin only.', 'error');
        return;
    }
    
    const students = DataService.get('students') || [];
    const activeStudents = students.filter(s => s.status !== 'Left');
    
    if (activeStudents.length === 0) {
        showToast('No active students found!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    const modalBox = modal.querySelector('.bg-white');
    
    // Reset and display modal
    modalBox.className = 'bg-white rounded-lg p-6 w-full max-w-xl shadow-xl';
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">📄 Publish Report Cards</h3>
            <button type="button" onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p class="text-sm text-blue-700">This will generate report cards for ALL active students and make them available to parents.</p>
            <p class="text-xs text-blue-500 mt-1">${activeStudents.length} active students eligible.</p>
        </div>
        
        <form id="publishForm">
            <div class="space-y-4">
                <div>
                    <label for="publish-term" class="block text-sm font-medium text-gray-700 mb-1">Term</label>
                    <select id="publish-term" required class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="1">Term 1</option>
                        <option value="2">Term 2</option>
                        <option value="3">Term 3</option>
                    </select>
                </div>
                <div>
                    <label for="publish-year" class="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input type="number" id="publish-year" value="${new Date().getFullYear()}" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500" required>
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                    <i class="fas fa-cloud-upload-alt mr-1"></i> Publish All
                </button>
            </div>
        </form>
    `;
    
    document.getElementById('publishForm').addEventListener('submit', function(e) {
        e.preventDefault();
        publishAllReportCards();
    });
}

function publishAllReportCards() {
    const term = parseInt(document.getElementById('publish-term').value, 10);
    const year = parseInt(document.getElementById('publish-year').value, 10);
    
    const students = DataService.get('students') || [];
    const activeStudents = students.filter(s => s.status !== 'Left');
    const termResults = DataService.get('termResults') || [];
    
    if (activeStudents.length === 0) {
        showToast('No active students found!', 'error');
        return;
    }
    
    showToast(`Generating report cards for ${activeStudents.length} students...`, 'info');
    
    const reports = [];
    let errors = 0;
    let noResults = 0;
    
    activeStudents.forEach((student) => {
        try {
            // String comparison safely handles mixed type IDs
            const hasResults = termResults.some(r => 
                String(r.studentId) === String(student.id) && 
                Number(r.term) === term && 
                Number(r.year) === year
            );
            
            if (!hasResults) {
                noResults++;
                return;
            }
            
            const reportHTML = viewReportCard(student.id, term, year, true);
            if (reportHTML) {
                reports.push({
                    studentId: String(student.id),
                    studentName: student.name,
                    class: student.class,
                    term: term,
                    year: year,
                    reportHTML: reportHTML,
                    publishedAt: new Date().toISOString()
                });
            } else {
                errors++;
            }
        } catch (e) {
            console.error(`Error generating report for ${student.name}:`, e);
            errors++;
        }
    });
    
    if (reports.length === 0) {
        closeModal();
        showToast(`No reports generated. ${noResults} students missing results for Term ${term}, ${year}.`, 'error');
        return;
    }
    
    // Update store while preserving non-overlapping terms/years
    let existingReports = DataService.get('publishedReports') || [];
    existingReports = existingReports.filter(r => !(Number(r.term) === term && Number(r.year) === year));
    
    const allReports = [...existingReports, ...reports];
    DataService.set('publishedReports', allReports);
    
    closeModal();
    showToast(`Published ${reports.length} report cards. (${noResults} missing data, ${errors} errors)`, 'success');
    
    if (typeof Router !== 'undefined' && Router.refresh) {
        Router.refresh();
    }
}

function getPublishedReports() {
    return DataService.get('publishedReports') || [];
}

function showReportCardModal() {
    const students = DataService.get('students');
    const activeStudents = students.filter(s => s.status !== 'Left');
    
    if (activeStudents.length === 0) {
        showToast('No active students found! Please add students first.', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Generate Report Card</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <form id="reportCardForm">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Select Student</label>
                    <select id="report-student" required class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        ${activeStudents.sort((a, b) => a.name.localeCompare(b.name)).map(s => `
                            <option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.class)})</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Term</label>
                    <select id="report-term" required class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="1">Term 1</option>
                        <option value="2">Term 2</option>
                        <option value="3">Term 3</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input type="number" id="report-year" value="${new Date().getFullYear()}" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                    <i class="fas fa-file-alt"></i> View Report
                </button>
            </div>
        </form>
    `;
    
    modal.querySelector('.bg-white').classList.add('max-w-xl');
    
    document.getElementById('reportCardForm').onsubmit = function(e) {
        e.preventDefault();
        console.log('Report card form submitted'); // Debug
        const studentId = document.getElementById('report-student').value;
        const term = document.getElementById('report-term').value;
        const year = document.getElementById('report-year').value;
        console.log('Viewing report for:', studentId, term, year); // Debug
        viewReportCard(studentId, term, year);
    };
}

function uploadLogo(position) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                showToast('Image too large! Max 2MB.', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = function(event) {
                localStorage.setItem(`logo_${position}`, event.target.result);
                showToast('Logo uploaded successfully!', 'success');
                // Refresh the report card if it's open
                const reportCard = document.getElementById('report-card');
                if (reportCard) {
                    // Reload the report card
                    const studentId = document.getElementById('report-student')?.value;
                    const term = document.getElementById('report-term')?.value;
                    const year = document.getElementById('report-year')?.value;
                    if (studentId && term && year) {
                        viewReportCard(studentId, term, year);
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

function clearLogos() {
    if (confirm('Clear uploaded logos?')) {
        localStorage.removeItem('logo_left');
        localStorage.removeItem('logo_right');
        showToast('Logos cleared!', 'success');
        // Refresh the report card if it's open
        const reportCard = document.getElementById('report-card');
        if (reportCard) {
            const studentId = document.getElementById('report-student')?.value;
            const term = document.getElementById('report-term')?.value;
            const year = document.getElementById('report-year')?.value;
            if (studentId && term && year) {
                viewReportCard(studentId, term, year);
            }
        }
    }
}

function uploadStamp() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            // Debug: Check file info
            console.log('Uploading stamp:', file.name, file.size, file.type);
            
            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                showToast('Image too large! Max 2MB.', 'error');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(event) {
                // Save to localStorage
                localStorage.setItem('school_stamp', event.target.result);
                
                // Debug: Verify saved
                const saved = localStorage.getItem('school_stamp');
                console.log('Stamp saved:', saved ? 'Yes' : 'No');
                console.log('Stamp length:', saved ? saved.length : 0);
                
                showToast('School stamp uploaded successfully!', 'success');
            };
            reader.onerror = function() {
                showToast('Error reading file!', 'error');
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

function clearStamp() {
    if (confirm('Clear the school stamp?')) {
        localStorage.removeItem('school_stamp');
        showToast('Stamp cleared!', 'success');
        // Refresh the report card
        const reportCard = document.getElementById('report-card');
        if (reportCard) {
            const studentId = document.getElementById('report-student')?.value;
            const term = document.getElementById('report-term')?.value;
            const year = document.getElementById('report-year')?.value;
            if (studentId && term && year) {
                viewReportCard(studentId, term, year);
            }
        }
    }
}

// ============================================
// CONTINUOUS ASSESSMENT (CA) SYSTEM
// ============================================

function showCAModal() {
    const students = DataService.get('students');
    const subjects = DataService.get('subjects');
    
    if (students.length === 0) {
        showToast('Please add students first!', 'error');
        return;
    }
    
    if (subjects.length === 0) {
        showToast('Please create subjects first!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');

    // Debug: Check if elements exist
    if (!modal) {
        console.error('Modal not found!');
        showToast('Modal not found!', 'error');
        return;
    }
    if (!modalContent) {
        console.error('Modal content not found!');
        showToast('Modal content not found!', 'error');
        return;
    }
    
    // Show modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    
    const classes = [...new Set(students.map(s => s.class))].sort();
    const firstClass = classes[0] || '';
    let studentsInClass = students.filter(s => s.class === firstClass);
    
    // Check for existing CA data to pre-fill
    const existingCA = DataService.get('continuousAssessments') || [];
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Continuous Assessment (CA) Scores</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <form id="caForm">
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select id="ca-class" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                        ${classes.map(cls => `
                            <option value="${escapeHtml(cls)}" ${cls === firstClass ? 'selected' : ''}>${escapeHtml(cls)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <select id="ca-subject" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                        ${subjects.map(sub => `
                            <option value="${escapeHtml(sub.id)}">${escapeHtml(sub.name)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Term</label>
                    <select id="ca-term" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="1">Term 1</option>
                        <option value="2">Term 2</option>
                        <option value="3">Term 3</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input type="number" id="ca-year" value="${new Date().getFullYear()}" 
                           class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
            </div>
            
            <div class="text-sm text-gray-500 mb-2">
                <span class="font-semibold">Task Max Scores:</span> CA1=20, CA2=20, CA3=20, CA4=20 (Total: 80)
            </div>
            
            <div class="border rounded-lg overflow-hidden" style="height: 230px;">
                <div class="h-full overflow-y-auto">
                    <table class="table w-full border-collapse">
                        <thead class="sticky top-0 z-10 bg-gray-50">
                            <tr class="border-b">
                                <th class="px-2 py-2 text-left text-sm font-semibold whitespace-nowrap">#</th>
                                <th class="px-2 py-2 text-left text-sm font-semibold whitespace-nowrap">Student</th>
                                <th class="px-1 py-2 text-center text-sm font-semibold whitespace-nowrap">CA1 (20)</th>
                                <th class="px-1 py-2 text-center text-sm font-semibold whitespace-nowrap">CA2 (20)</th>
                                <th class="px-1 py-2 text-center text-sm font-semibold whitespace-nowrap">CA3 (20)</th>
                                <th class="px-1 py-2 text-center text-sm font-semibold whitespace-nowrap">CA4 (20)</th>
                                <th class="px-2 py-2 text-center text-sm font-semibold whitespace-nowrap">Total</th>
                                <th class="px-2 py-2 text-center text-sm font-semibold whitespace-nowrap">%</th>
                                <th class="px-2 py-2 text-center text-sm font-semibold whitespace-nowrap">Grade</th>
                            </tr>
                        </thead>
                        <tbody id="ca-entry-body">
                            ${studentsInClass.map((student, i) => {
                                // Check if CA exists for this student, subject, term, year
                                const existing = existingCA.find(ca => 
                                    ca.studentId === student.id &&
                                    ca.subjectId === document.getElementById('ca-subject')?.value &&
                                    ca.term === parseInt(document.getElementById('ca-term')?.value || 1) &&
                                    ca.year === parseInt(document.getElementById('ca-year')?.value || new Date().getFullYear())
                                );
                                
                                return `
                                    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                                        <td class="px-2 py-1 text-sm text-center">${i + 1}</td>
                                        <td class="px-2 py-1 text-sm font-medium whitespace-nowrap">${escapeHtml(student.name)}</td>
                                        ${CA_TASKS.map(task => `
                                            <td class="px-1 py-1">
                                                <input type="number" min="0" max="${task.maxScore}" 
                                                       data-task="${task.id}"
                                                       data-student-id="${student.id}"
                                                       class="ca-input w-12 px-1 py-1 border rounded text-center text-sm focus:outline-none focus:border-indigo-500"
                                                       value="${existing ? existing[task.id] ?? '' : ''}"
                                                       placeholder="0"
                                                       oninput="updateCATotal(this)">
                                            </td>
                                        `).join('')}
                                        <td class="px-2 py-1 text-center text-sm font-semibold ca-total">${existing ? existing.total || 0 : 0}</td>
                                        <td class="px-2 py-1 text-center text-sm font-semibold ca-percentage">${existing ? existing.percentage || 0 : 0}</td>
                                        <td class="px-2 py-1 text-center text-sm font-bold ca-grade-display">${existing ? existing.grade || '-' : '-'}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="mt-4 text-sm text-gray-500">
                Showing ${studentsInClass.length} students in ${firstClass}
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    <i class="fas fa-save"></i> Save CA Scores
                </button>
            </div>
        </form>
    `;
    
    modal.classList.remove('hidden');
    modal.querySelector('.bg-white').classList.add('max-w-5xl');
    
    // Event listeners
    document.getElementById('ca-class').addEventListener('change', function() {
        updateCAStudents(this.value);
    });
    
    document.getElementById('ca-subject').addEventListener('change', function() {
        updateCAStudents(document.getElementById('ca-class').value);
    });
    
    document.getElementById('ca-term').addEventListener('change', function() {
        updateCAStudents(document.getElementById('ca-class').value);
    });
    
    document.getElementById('ca-year').addEventListener('change', function() {
        updateCAStudents(document.getElementById('ca-class').value);
    });
    
    document.getElementById('caForm').onsubmit = function(e) {
        e.preventDefault();
        saveCAScores();
    };
}

function updateCAStudents(className) {
    const students = DataService.get('students');
    const filtered = students.filter(s => s.class === className);
    const tbody = document.getElementById('ca-entry-body');
    const subjectId = document.getElementById('ca-subject')?.value;
    const term = parseInt(document.getElementById('ca-term')?.value || 1);
    const year = parseInt(document.getElementById('ca-year')?.value || new Date().getFullYear());
    const existingCA = DataService.get('continuousAssessments') || [];
    
    if (!tbody) return;
    
    tbody.innerHTML = filtered.map((student, i) => {
        const existing = existingCA.find(ca => 
            ca.studentId === student.id &&
            ca.subjectId === subjectId &&
            ca.term === term &&
            ca.year === year
        );
        
        return `
            <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                <td class="px-2 py-1 text-sm text-center">${i + 1}</td>
                <td class="px-2 py-1 text-sm font-medium whitespace-nowrap">${escapeHtml(student.name)}</td>
                ${CA_TASKS.map(task => `
                    <td class="px-1 py-1">
                        <input type="number" min="0" max="${task.maxScore}" 
                               data-task="${task.id}"
                               data-student-id="${student.id}"
                               class="ca-input w-12 px-1 py-1 border rounded text-center text-sm focus:outline-none focus:border-indigo-500"
                               value="${existing ? existing[task.id] ?? '' : ''}"
                               placeholder="0"
                               oninput="updateCATotal(this)">
                    </td>
                `).join('')}
                <td class="px-2 py-1 text-center text-sm font-semibold ca-total">${existing ? existing.total || 0 : 0}</td>
                <td class="px-2 py-1 text-center text-sm font-semibold ca-percentage">${existing ? existing.percentage || 0 : 0}</td>
                <td class="px-2 py-1 text-center text-sm font-bold ca-grade-display">${existing ? existing.grade || '-' : '-'}</td>
            </tr>
        `;
    }).join('');
}

function updateCATotal(input) {
    const row = input.closest('tr');
    const inputs = row.querySelectorAll('.ca-input');
    let total = 0;
    let maxPossible = CA_TOTAL_MAX;
    
    inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val) && val >= 0) {
            total += val;
        }
    });
    
    const totalDisplay = row.querySelector('.ca-total');
    const percentageDisplay = row.querySelector('.ca-percentage');
    const gradeDisplay = row.querySelector('.ca-grade-display');
    
    totalDisplay.textContent = total;
    
    const percentage = Math.round((total / maxPossible) * 100);
    percentageDisplay.textContent = percentage;
    
    // Get grade
    const gradeResult = getGradeAndRemark(percentage);
    gradeDisplay.textContent = gradeResult.grade;
    
    // Color code grade
    gradeDisplay.className = 'px-2 py-1 text-center text-sm font-bold ca-grade-display';
    if (gradeResult.grade === 'A') gradeDisplay.classList.add('text-green-600');
    else if (gradeResult.grade === 'B') gradeDisplay.classList.add('text-blue-600');
    else if (gradeResult.grade === 'C') gradeDisplay.classList.add('text-indigo-600');
    else if (gradeResult.grade === 'D') gradeDisplay.classList.add('text-yellow-600');
    else gradeDisplay.classList.add('text-red-600');
}

function saveCAScores() {
    const subjectId = document.getElementById('ca-subject').value;
    const className = document.getElementById('ca-class').value;
    const term = parseInt(document.getElementById('ca-term').value);
    const year = parseInt(document.getElementById('ca-year').value);
    
    const rows = document.querySelectorAll('#ca-entry-body tr');
    const caResults = DataService.get('continuousAssessments') || [];
    let savedCount = 0;
    
    rows.forEach(row => {
        const studentId = row.querySelector('.ca-input')?.dataset.studentId;
        if (!studentId) return;
        
        const inputs = row.querySelectorAll('.ca-input');
        const caData = {};
        let total = 0;
        let hasScore = false;
        
        inputs.forEach(inp => {
            const task = inp.dataset.task;
            const val = parseFloat(inp.value);
            if (!isNaN(val) && val >= 0) {
                caData[task] = val;
                total += val;
                hasScore = true;
            } else {
                caData[task] = null;
            }
        });
        
        if (!hasScore) return;
        
        const percentage = Math.round((total / CA_TOTAL_MAX) * 100);
        const gradeResult = getGradeAndRemark(percentage);
        
        // Check if CA already exists
        const existingIndex = caResults.findIndex(ca => 
            ca.studentId === studentId &&
            ca.subjectId === subjectId &&
            ca.term === term &&
            ca.year === year
        );
        
        const entry = {
            studentId: studentId,
            subjectId: subjectId,
            class: className,
            term: term,
            year: year,
            ...caData,
            total: total,
            percentage: percentage,
            grade: gradeResult.grade,
            remark: gradeResult.remark,
            updatedAt: new Date().toISOString()
        };
        
        if (existingIndex >= 0) {
            caResults[existingIndex] = entry;
        } else {
            caResults.push(entry);
        }
        savedCount++;
    });
    
    DataService.set('continuousAssessments', caResults);
    closeModal();
    showToast(`${savedCount} CA records saved successfully!`, 'success');
}

// ============================================
// VIEW CA RESULTS
// ============================================

function viewCAResults() {
    const students = DataService.get('students');
    const subjects = DataService.get('subjects');
    const caResults = DataService.get('continuousAssessments') || [];
    
    if (students.length === 0) {
        showToast('No students found!', 'error');
        return;
    }
    
    if (subjects.length === 0) {
        showToast('No subjects found!', 'error');
        return;
    }
    
    if (caResults.length === 0) {
        showToast('No CA scores entered yet!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');

    // Debug: Check if elements exist
    if (!modal) {
        console.error('Modal not found!');
        showToast('Modal not found!', 'error');
        return;
    }
    if (!modalContent) {
        console.error('Modal content not found!');
        showToast('Modal content not found!', 'error');
        return;
    }
    
    // Show modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    
    // Get unique classes, terms, years from CA results
    const classes = [...new Set(caResults.map(ca => ca.class))].sort();
    const terms = [...new Set(caResults.map(ca => ca.term))].sort((a, b) => a - b);
    const years = [...new Set(caResults.map(ca => ca.year))].sort((a, b) => a - b);
    
    const firstClass = classes[0] || '';
    const firstTerm = terms[0] || 1;
    const firstYear = years[0] || new Date().getFullYear();
    
    // Get subjects for the selected class
    const classSubjects = subjects.filter(s => s.class === 'All' || s.class === firstClass);
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Continuous Assessment (CA) Results</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="grid grid-cols-3 gap-4 mb-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Class</label>
                <select id="view-ca-class" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                    ${classes.map(cls => `
                        <option value="${escapeHtml(cls)}" ${cls === firstClass ? 'selected' : ''}>${escapeHtml(cls)}</option>
                    `).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Term</label>
                <select id="view-ca-term" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                    ${terms.map(t => `
                        <option value="${t}" ${t === firstTerm ? 'selected' : ''}>Term ${t}</option>
                    `).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <select id="view-ca-year" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                    ${years.map(y => `
                        <option value="${y}" ${y === firstYear ? 'selected' : ''}>${y}</option>
                    `).join('')}
                </select>
            </div>
        </div>
        
        <div class="border rounded-lg overflow-hidden" style="height: 400px;">
            <div class="h-full overflow-y-auto">
                <table class="table w-full border-collapse">
                    <thead class="sticky top-0 z-10 bg-indigo-50">
                        <tr class="border-b-2 border-indigo-200">
                            <th class="px-3 py-2 text-left text-sm font-semibold text-indigo-800">#</th>
                            <th class="px-3 py-2 text-left text-sm font-semibold text-indigo-800">Student</th>
                            <th class="px-3 py-2 text-left text-sm font-semibold text-indigo-800">Sex</th>
                            ${classSubjects.map(sub => `
                                <th class="px-2 py-2 text-center text-sm font-semibold text-indigo-800">${escapeHtml(sub.name)}</th>
                            `).join('')}
                            <th class="px-3 py-2 text-center text-sm font-semibold text-indigo-800">Total</th>
                            <th class="px-3 py-2 text-center text-sm font-semibold text-indigo-800">Avg %</th>
                            <th class="px-3 py-2 text-center text-sm font-semibold text-indigo-800">Grade</th>
                        </tr>
                    </thead>
                    <tbody id="view-ca-body">
                        <!-- Will be populated by JavaScript -->
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="mt-4 flex gap-3">
            <button type="button" onclick="closeModal()" 
                    class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
            </button>
            <button onclick="loadCAResults()" 
                    class="flex-1 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                <i class="fas fa-refresh"></i> Load Results
            </button>
        </div>
    `;
    
    modal.classList.remove('hidden');
    modal.querySelector('.bg-white').classList.add('max-w-6xl');
    
    // Auto-load results when filters change
    document.getElementById('view-ca-class').addEventListener('change', loadCAResults);
    document.getElementById('view-ca-term').addEventListener('change', loadCAResults);
    document.getElementById('view-ca-year').addEventListener('change', loadCAResults);
    
    // Load initial results
    loadCAResults();
}

function loadCAResults() {
    const className = document.getElementById('view-ca-class').value;
    const term = parseInt(document.getElementById('view-ca-term').value);
    const year = parseInt(document.getElementById('view-ca-year').value);
    const tbody = document.getElementById('view-ca-body');
    
    if (!tbody) return;
    
    const students = DataService.get('students').filter(s => s.class === className);
    const subjects = DataService.get('subjects');
    const caResults = DataService.get('continuousAssessments') || [];
    
    // Get subjects for this class
    const classSubjects = subjects.filter(s => s.class === 'All' || s.class === className);
    
    if (students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${classSubjects.length + 6}" class="text-center py-8 text-gray-400">
                    No students found in this class
                </td>
            </tr>
        `;
        return;
    }
    
    if (classSubjects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${classSubjects.length + 6}" class="text-center py-8 text-gray-400">
                    No subjects assigned to this class
                </td>
            </tr>
        `;
        return;
    }
    
    // Build results table
    let html = '';
    
    students.forEach((student, index) => {
        const studentResults = classSubjects.map(sub => {
            const result = caResults.find(ca => 
                ca.studentId === student.id &&
                ca.subjectId === sub.id &&
                ca.term === term &&
                ca.year === year
            );
            return result ? result.percentage || 0 : null;
        });
        
        const validScores = studentResults.filter(s => s !== null);
        const totalAvg = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
        const gradeInfo = getGradeAndRemark(totalAvg);
        
        html += `
            <tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50">
                <td class="px-3 py-2 text-sm text-center">${index + 1}</td>
                <td class="px-3 py-2 text-sm font-medium">${escapeHtml(student.name)}</td>
                <td class="px-3 py-2 text-sm text-center">${escapeHtml(student.sex)}</td>
                ${studentResults.map(score => `
                    <td class="px-2 py-2 text-sm text-center">
                        ${score !== null ? 
                            `<span class="font-semibold ${score >= 50 ? 'text-green-600' : 'text-red-600'}">${score}%</span>` : 
                            '<span class="text-gray-300">-</span>'
                        }
                    </td>
                `).join('')}
                <td class="px-3 py-2 text-sm text-center font-semibold">${validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0)) : '-'}</td>
                <td class="px-3 py-2 text-sm text-center font-bold">${totalAvg > 0 ? totalAvg + '%' : '-'}</td>
                <td class="px-3 py-2 text-sm text-center font-bold">
                    ${totalAvg > 0 ? 
                        `<span class="${gradeInfo.grade === 'A' ? 'text-green-600' : 
                                     gradeInfo.grade === 'B' ? 'text-blue-600' : 
                                     gradeInfo.grade === 'C' ? 'text-indigo-600' : 
                                     gradeInfo.grade === 'D' ? 'text-yellow-600' : 'text-red-600'}">
                            ${gradeInfo.grade}
                        </span>` : 
                        '-'
                    }
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// ============================================
// CLASS MANAGEMENT
// ============================================

function showClassModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    // Reset modal completely
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    // Reset modal box
    const modalBox = modal.querySelector('.bg-white');
    if (modalBox) {
        modalBox.className = 'bg-white rounded-2xl max-w-lg w-full mx-4';
        modalBox.style.cssText = '';
    }

    const existingClasses = DataService.get('classes') || [];
    const teachers = DataService.get('teachers') || [];
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Manage Classes</h3>
            <button onclick="showAddClassForm()" 
                    class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">
                <i class="fas fa-plus"></i> Add Class
            </button>
        </div>
        
        <div id="class-list" class="max-h-96 overflow-y-auto">
            ${existingClasses.length === 0 ? `
                <p class="text-center py-8 text-gray-400">No classes created yet. Click "Add Class" to begin.</p>
            ` : `
                <table class="table w-full border-collapse">
                    <thead>
                        <tr class="bg-gray-50 border-b">
                            <th class="px-4 py-3 text-left text-sm font-semibold">Class Name</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Academic Year</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Class Teacher</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Room</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Students</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Status</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${existingClasses.map((cls, index) => {
                            // Count students in this class
                            const students = DataService.get('students');
                            const studentCount = students.filter(s => s.class === cls.name).length;
                            
                            return `
                                <tr class="border-b hover:bg-gray-50">
                                    <td class="px-4 py-3 font-medium">${escapeHtml(cls.name)}</td>
                                    <td class="px-4 py-3">${escapeHtml(cls.academicYear || 'N/A')}</td>
                                    <td class="px-4 py-3">${escapeHtml(cls.classTeacher || 'Not assigned')}</td>
                                    <td class="px-4 py-3">${escapeHtml(cls.roomNumber || 'N/A')}</td>
                                    <td class="px-4 py-3">
                                        <span class="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-semibold">${studentCount}</span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <span class="px-2 py-1 ${cls.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} rounded-full text-xs font-semibold">
                                            ${escapeHtml(cls.status || 'Active')}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <button onclick="editClass(${index})" class="text-blue-600 hover:text-blue-800 mr-3">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button onclick="deleteClass(${index})" class="text-red-600 hover:text-red-800">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                        <button onclick="viewClassRoster('${escapeHtml(cls.name)}')" class="text-indigo-600 hover:text-indigo-800 ml-3">
                                            <i class="fas fa-users"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `}
        </div>
        
        <div class="mt-6">
            <button onclick="closeModal()" class="w-full py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
            </button>
        </div>
    `;
    
    modal.classList.remove('hidden');
    modal.querySelector('.bg-white').classList.add('max-w-5xl');
}

function showAddClassForm() {
    const modalContent = document.getElementById('modal-content');
    const teachers = DataService.get('teachers') || [];
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Add New Class</h3>
            <button onclick="showClassModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <form id="classForm">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class Name *</label>
                    <input type="text" id="class-name" required 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="e.g., Form 1A, Form 2B, JSS1A">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                    <input type="text" id="class-year" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="e.g., 2025" value="${new Date().getFullYear()}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class Teacher</label>
                    <input type="text" id="class-teacher" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="Teacher's name">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Room Number</label>
                    <input type="text" id="class-room" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="e.g., Room 101">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select id="class-status" class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="Active">Active</option>
                        <option value="Completed">Completed</option>
                    </select>
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="showClassModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    Save Class
                </button>
            </div>
        </form>
    `;
    
    document.getElementById('classForm').onsubmit = function(e) {
        e.preventDefault();
        saveClass();
    };
}

function saveClass() {
    const name = document.getElementById('class-name').value.trim();
    const academicYear = document.getElementById('class-year').value.trim();
    const classTeacher = document.getElementById('class-teacher').value.trim();
    const roomNumber = document.getElementById('class-room').value.trim();
    const status = document.getElementById('class-status').value;
    
    if (!name) {
        showToast('Class name is required', 'error');
        return;
    }
    
    const classes = DataService.get('classes');
    
    // Check for duplicate class name
    if (classes.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        showToast('Class name already exists!', 'error');
        return;
    }
    
    classes.push({
        id: DataService.generateId('CLS'),
        name: name,
        academicYear: academicYear || new Date().getFullYear().toString(),
        classTeacher: classTeacher || 'Not assigned',
        roomNumber: roomNumber || 'N/A',
        status: status || 'Active',
        createdAt: new Date().toISOString()
    });
    
    DataService.set('classes', classes);
    showToast('Class added successfully!', 'success');
    showClassModal();
}

function editClass(index) {
    const classes = DataService.get('classes');
    const cls = classes[index];
    
    if (!cls) {
        showToast('Class not found!', 'error');
        return;
    }
    
    const modalContent = document.getElementById('modal-content');
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Edit Class</h3>
            <button onclick="showClassModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <form id="classForm">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class Name *</label>
                    <input type="text" id="class-name" required 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           value="${escapeHtml(cls.name)}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                    <input type="text" id="class-year" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           value="${escapeHtml(cls.academicYear || '')}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class Teacher</label>
                    <input type="text" id="class-teacher" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           value="${escapeHtml(cls.classTeacher || '')}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Room Number</label>
                    <input type="text" id="class-room" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           value="${escapeHtml(cls.roomNumber || '')}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select id="class-status" class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="Active" ${cls.status === 'Active' ? 'selected' : ''}>Active</option>
                        <option value="Completed" ${cls.status === 'Completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="showClassModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    Update Class
                </button>
            </div>
        </form>
    `;
    
    document.getElementById('classForm').onsubmit = function(e) {
        e.preventDefault();
        updateClass(index);
    };
}

function updateClass(index) {
    const classes = DataService.get('classes');
    const name = document.getElementById('class-name').value.trim();
    const academicYear = document.getElementById('class-year').value.trim();
    const classTeacher = document.getElementById('class-teacher').value.trim();
    const roomNumber = document.getElementById('class-room').value.trim();
    const status = document.getElementById('class-status').value;
    
    if (!name) {
        showToast('Class name is required', 'error');
        return;
    }
    
    // Check for duplicate class name (excluding current class)
    if (classes.some((c, i) => i !== index && c.name.toLowerCase() === name.toLowerCase())) {
        showToast('Class name already exists!', 'error');
        return;
    }
    
    classes[index] = {
        ...classes[index],
        name: name,
        academicYear: academicYear || new Date().getFullYear().toString(),
        classTeacher: classTeacher || 'Not assigned',
        roomNumber: roomNumber || 'N/A',
        status: status || 'Active'
    };
    
    DataService.set('classes', classes);
    showToast('Class updated successfully!', 'success');
    showClassModal();
}

function deleteClass(index) {
    if (!confirm('Delete this class? This will not delete students but they will lose their class assignment.')) {
        return;
    }
    
    const classes = DataService.get('classes');
    classes.splice(index, 1);
    DataService.set('classes', classes);
    showToast('Class deleted successfully!', 'success');
    showClassModal();
}

function viewClassRoster(className) {
    console.log('=== ROSTER DEBUG ===');
    console.log('Looking for class:', className);
    
    const students = DataService.get('students');
    console.log('All students:', students.map(s => ({ name: s.name, class: s.class })));
    
    // Case-insensitive and trim match
    const classStudents = students.filter(s => {
        const studentClass = (s.class || '').trim().toLowerCase();
        const targetClass = className.trim().toLowerCase();
        return studentClass === targetClass;
    });
    
    console.log('Found students:', classStudents.length);
    
    // Get class details
    const classes = DataService.get('classes');
    const classInfo = classes.find(c => c.name.trim().toLowerCase() === className.trim().toLowerCase());
    
    // Get the modal and modal content
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    if (!modal) {
        console.error('Modal element not found!');
        showToast('Modal not found!', 'error');
        return;
    }
    
    if (!modalContent) {
        console.error('Modal content element not found!');
        showToast('Modal content not found!', 'error');
        return;
    }
    
    console.log('Modal found, setting content...');
    
    // Build the student table rows
    let studentRows = '';
    if (classStudents.length === 0) {
        studentRows = `
            <div class="text-center py-8 text-gray-400">
                <i class="fas fa-users text-4xl mb-3"></i>
                <p>No students found in ${escapeHtml(className)}</p>
                <p class="text-sm mt-2">To add students, edit a student's profile and set their class to "${escapeHtml(className)}"</p>
            </div>
        `;
    } else {
        studentRows = `
            <div class="overflow-x-auto max-h-96 overflow-y-auto">
                <table class="table w-full border-collapse">
                    <thead>
                        <tr class="bg-gray-50 border-b sticky top-0 z-10">
                            <th class="px-4 py-3 text-left text-sm font-semibold">#</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Student Name</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">ID</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Sex</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Age</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${classStudents.map((student, i) => `
                            <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                                <td class="px-4 py-2 text-sm text-center">${i + 1}</td>
                                <td class="px-4 py-2 text-sm font-medium">${escapeHtml(student.name)}</td>
                                <td class="px-4 py-2 text-sm font-mono">${escapeHtml(student.id)}</td>
                                <td class="px-4 py-2 text-sm">${escapeHtml(student.sex)}</td>
                                <td class="px-4 py-2 text-sm">${student.age}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // Set the modal content
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Class Roster: ${escapeHtml(className)}</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="mb-3 text-sm text-gray-500">
            <span class="font-semibold">Total Students in Class:</span> ${classStudents.length}
            ${classInfo ? ` • Teacher: ${escapeHtml(classInfo.classTeacher || 'Not assigned')}` : ''}
            ${classInfo ? ` • Room: ${escapeHtml(classInfo.roomNumber || 'N/A')}` : ''}
            <button onclick="showDebugInfo('${escapeHtml(className)}')" 
                    class="ml-4 text-xs text-indigo-600 hover:text-indigo-800 underline">
                🔍 Debug
            </button>
        </div>
        
        ${studentRows}
        
        <div class="mt-6 flex gap-3">
            <button onclick="closeModal()" class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
            </button>
            <button onclick="assignStudentsToClass('${escapeHtml(className)}')" 
                    class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                <i class="fas fa-user-plus"></i> Assign Students
            </button>
        </div>
    `;
    
    // FORCE THE MODAL TO SHOW
    console.log('Showing modal...');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    // Make the modal wider
    const modalBox = modal.querySelector('.bg-white');
    if (modalBox) {
        modalBox.classList.add('max-w-4xl');
    }
    
    console.log('Modal should now be visible');
    showToast(`Showing ${classStudents.length} students in ${className}`, 'success');
}

function standardizeClassName(className) {
    if (!className) return '';
    // Uppercase, trim extra spaces
    let standardized = className.toUpperCase().trim();
    // Replace multiple spaces with single space
    standardized = standardized.replace(/\s+/g, ' ');
    return standardized;
}

function showDebugInfo(className) {
    const students = DataService.get('students');
    let message = '=== ALL STUDENTS ===\n\n';
    
    students.forEach((s, i) => {
        message += `${i+1}. Name: "${s.name}" | Class: "${s.class || 'EMPTY'}"\n`;
    });
    
    message += `\n=== SEARCHING FOR: "${className}" ===\n\n`;
    
    const matched = students.filter(s => {
        const studentClass = (s.class || '').trim().toLowerCase();
        const targetClass = className.trim().toLowerCase();
        return studentClass === targetClass;
    });
    
    message += `Found ${matched.length} student(s) with exactly matching class.\n\n`;
    
    if (matched.length === 0) {
        message += 'TIP: Check if the class name in student profiles matches exactly with the class name.\n';
        message += 'Common issues:\n';
        message += '  - Extra spaces: "Form 1A " vs "Form 1A"\n';
        message += '  - Case sensitivity: "form 1a" vs "Form 1A"\n';
    }
    
    alert(message);
}

function assignStudentsToClass(className) {
    const students = DataService.get('students');
    
    // Case-insensitive matching for current students
    const currentStudents = students.filter(s => {
        const studentClass = (s.class || '').trim().toLowerCase();
        const targetClass = className.trim().toLowerCase();
        return studentClass === targetClass;
    });
    
    const unassignedStudents = students.filter(s => {
        const studentClass = (s.class || '').trim().toLowerCase();
        const targetClass = className.trim().toLowerCase();
        return studentClass !== targetClass;
    });
    
    const modalContent = document.getElementById('modal-content');
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Assign Students to ${escapeHtml(className)}</h3>
            <button onclick="viewClassRoster('${escapeHtml(className)}')" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="mb-4">
            <p class="text-sm text-gray-600">
                <span class="font-semibold">Current Students:</span> ${currentStudents.length}
                <span class="mx-2">|</span>
                <span class="font-semibold">Available Students:</span> ${unassignedStudents.length}
            </p>
        </div>
        
        <form id="assignStudentsForm">
            <div class="border rounded-lg overflow-hidden" style="height: 300px;">
                <div class="h-full overflow-y-auto">
                    <table class="table w-full border-collapse">
                        <thead>
                            <tr class="bg-gray-50 border-b sticky top-0 z-10">
                                <th class="px-4 py-2 text-left text-sm font-semibold">
                                    <input type="checkbox" id="select-all" onchange="toggleAllStudents(this)">
                                </th>
                                <th class="px-4 py-2 text-left text-sm font-semibold">Student Name</th>
                                <th class="px-4 py-2 text-left text-sm font-semibold">Current Class</th>
                                <th class="px-4 py-2 text-left text-sm font-semibold">ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.map((student, i) => {
                                const isInClass = (student.class || '').trim().toLowerCase() === className.trim().toLowerCase();
                                return `
                                    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isInClass ? 'bg-green-50' : ''}">
                                        <td class="px-4 py-2">
                                            <input type="checkbox" 
                                                   class="student-checkbox" 
                                                   data-student-id="${escapeHtml(student.id)}"
                                                   ${isInClass ? 'checked' : ''}>
                                        </td>
                                        <td class="px-4 py-2 text-sm font-medium ${isInClass ? 'text-green-700' : ''}">
                                            ${escapeHtml(student.name)}
                                            ${isInClass ? ' <span class="text-xs text-green-600">(Current)</span>' : ''}
                                        </td>
                                        <td class="px-4 py-2 text-sm">${escapeHtml(student.class || 'Unassigned')}</td>
                                        <td class="px-4 py-2 text-sm font-mono">${escapeHtml(student.id)}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="mt-4 flex gap-3">
                <button type="button" onclick="viewClassRoster('${escapeHtml(className)}')" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    <i class="fas fa-save"></i> Save Assignments
                </button>
            </div>
        </form>
    `;
    
    document.getElementById('assignStudentsForm').onsubmit = function(e) {
        e.preventDefault();
        saveStudentAssignments(className);
    };
}

function toggleAllStudents(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.student-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
    });
}

function saveStudentAssignments(className) {
    const checkboxes = document.querySelectorAll('.student-checkbox');
    const students = DataService.get('students');
    let updatedCount = 0;
    
    checkboxes.forEach(cb => {
        const studentId = cb.dataset.studentId;
        const student = students.find(s => s.id === studentId);
        if (student) {
            const newClass = cb.checked ? className : '';
            if (student.class !== newClass) {
                student.class = newClass;
                updatedCount++;
            }
        }
    });
    
    DataService.set('students', students);
    showToast(`${updatedCount} students updated successfully!`, 'success');
    viewClassRoster(className);
}

function renderClasses(container) {
    const classes = DataService.get('classes') || [];
    const students = DataService.get('students');
    
    container.innerHTML = `
        <div class="bg-white rounded-2xl shadow">
            <div class="p-6 border-b flex justify-between items-center">
                <h3 class="text-xl font-semibold">All Classes (${classes.length})</h3>
                <button onclick="showClassModal()" 
                        class="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition">
                    <i class="fas fa-plus"></i> Manage Classes
                </button>
            </div>
            
            ${classes.length === 0 ? `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-chalkboard text-6xl mb-4"></i>
                    <p>No classes created yet. Click "Manage Classes" to get started.</p>
                </div>
            ` : `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                    ${classes.map(cls => {
                        const studentCount = students.filter(s => s.class === cls.name).length;
                        return `
                            <div class="border rounded-xl p-5 hover:shadow-lg transition-shadow ${cls.status === 'Active' ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-gray-50'}">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <h4 class="text-lg font-semibold text-gray-800">${escapeHtml(cls.name)}</h4>
                                        <p class="text-sm text-gray-500">${escapeHtml(cls.academicYear || 'N/A')}</p>
                                    </div>
                                    <span class="px-2 py-1 ${cls.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} rounded-full text-xs font-semibold">
                                        ${escapeHtml(cls.status || 'Active')}
                                    </span>
                                </div>
                                <div class="mt-3 space-y-1 text-sm text-gray-600">
                                    <p><i class="fas fa-user-tie w-5 text-indigo-500"></i> ${escapeHtml(cls.classTeacher || 'Not assigned')}</p>
                                    <p><i class="fas fa-door-open w-5 text-indigo-500"></i> ${escapeHtml(cls.roomNumber || 'N/A')}</p>
                                    <p><i class="fas fa-users w-5 text-indigo-500"></i> ${studentCount} students</p>
                                </div>
                                <div class="mt-4 flex gap-2">
                                    <button onclick="viewClassRoster('${escapeHtml(cls.name)}')" class="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200">
                                        <i class="fas fa-users"></i> Roster
                                    </button>
                                    <button onclick="showClassModal()" class="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200">
                                        <i class="fas fa-cog"></i> Manage
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

// ============================================
// TEACHERS MANAGEMENT
// ============================================

function showTeacherModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    // Reset modal first
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    const existingTeachers = DataService.get('teachers') || [];
    const subjects = DataService.get('subjects') || [];
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Manage Teachers</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div id="teacher-list" class="max-h-96 overflow-y-auto">
            ${existingTeachers.length === 0 ? `
                <p class="text-center py-8 text-gray-400">No teachers added yet. Click "Add Teacher" to begin.</p>
            ` : `
                <table class="table w-full border-collapse">
                    <thead>
                        <tr class="bg-gray-50 border-b">
                            <th class="px-4 py-3 text-left text-sm font-semibold">#</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Name</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Email</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Phone</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Subjects</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Class</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Status</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${existingTeachers.map((teacher, index) => {
                            // Get subjects for this teacher
                            const teacherSubjects = subjects.filter(s => s.teacher === teacher.name);
                            
                            return `
                                <tr class="border-b hover:bg-gray-50">
                                    <td class="px-4 py-3 text-sm">${index + 1}</td>
                                    <td class="px-4 py-3 font-medium">${escapeHtml(teacher.name)}</td>
                                    <td class="px-4 py-3 text-sm">${escapeHtml(teacher.email || 'N/A')}</td>
                                    <td class="px-4 py-3 text-sm">${escapeHtml(teacher.phone || 'N/A')}</td>
                                    <td class="px-4 py-3">
                                        ${teacherSubjects.length > 0 ? 
                                            teacherSubjects.map(s => 
                                                `<span class="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-semibold inline-block mb-1">${escapeHtml(s.name)}</span>`
                                            ).join(' ') : 
                                            '<span class="text-gray-400 text-sm">No subjects</span>'
                                        }
                                    </td>
                                    <td class="px-4 py-3 text-sm">
                                        ${teacher.class ? 
                                            `<span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">${escapeHtml(teacher.class)}</span>` : 
                                            '<span class="text-gray-400 text-sm">Not assigned</span>'
                                        }
                                    </td>
                                    <td class="px-4 py-3">
                                        <span class="px-2 py-1 ${teacher.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} rounded-full text-xs font-semibold">
                                            ${escapeHtml(teacher.status || 'Active')}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <button onclick="editTeacher(${index})" class="text-blue-600 hover:text-blue-800 mr-3">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button onclick="deleteTeacher(${index})" class="text-red-600 hover:text-red-800">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                        <button onclick="assignSubjectsToTeacher(${index})" class="text-indigo-600 hover:text-indigo-800 ml-3">
                                            <i class="fas fa-book"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `}
        </div>
        
        <div class="mt-6 flex gap-3">
            <button onclick="closeModal()" class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
            </button>
            <button onclick="showAddTeacherForm()" 
                    class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                <i class="fas fa-plus"></i> Add Teacher
            </button>
        </div>
    `;
    
    // Make modal wider
    const modalBox = modal.querySelector('.bg-white');
    if (modalBox) {
        modalBox.classList.add('max-w-6xl');
    }
}

// ============================================
// ADD TEACHER FORM
// ============================================

function showAddTeacherForm() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    const classes = DataService.get('classes') || [];
    
    // Reset modal first
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Add New Teacher</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <form id="teacherForm">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input type="text" id="teacher-name" required 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="e.g., Mr. John Banda">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" id="teacher-email" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="john.banda@school.mw">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="text" id="teacher-phone" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="+265 888 123 456">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class Teacher (Optional)</label>
                    <select id="teacher-class" class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="">None</option>
                        ${classes.map(cls => `
                            <option value="${escapeHtml(cls.name)}">${escapeHtml(cls.name)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select id="teacher-status" class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    Save Teacher
                </button>
            </div>
        </form>
    `;
    
    // Make modal wider
    const modalBox = modal.querySelector('.bg-white');
    if (modalBox) {
        modalBox.classList.add('max-w-xl');
    }
    
    // Form submission
    document.getElementById('teacherForm').onsubmit = function(e) {
        e.preventDefault();
        saveTeacher();
    };
}

function saveTeacher() {
    const name = document.getElementById('teacher-name').value.trim();
    const email = document.getElementById('teacher-email').value.trim();
    const phone = document.getElementById('teacher-phone').value.trim();
    const teacherClass = document.getElementById('teacher-class').value;
    const status = document.getElementById('teacher-status').value;
    
    if (!name) {
        showToast('Teacher name is required', 'error');
        return;
    }
    
    const teachers = DataService.get('teachers') || [];
    
    // Check for duplicate
    if (teachers.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        showToast('Teacher already exists!', 'error');
        return;
    }
    
    teachers.push({
        id: DataService.generateId('TCH'),
        name: name,
        email: email || '',
        phone: phone || '',
        class: teacherClass || '',  // This stores the class name
        status: status || 'Active',
        createdAt: new Date().toISOString()
    });
    
    DataService.set('teachers', teachers);
    closeModal();
    showToast('Teacher added successfully!', 'success');
    Router.navigate('teachers');
}

function editTeacher(index) {
    const teachers = DataService.get('teachers');
    const teacher = teachers[index];
    
    if (!teacher) {
        showToast('Teacher not found!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    const classes = DataService.get('classes') || [];
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Edit Teacher</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <form id="teacherForm">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input type="text" id="teacher-name" required 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           value="${escapeHtml(teacher.name)}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" id="teacher-email" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           value="${escapeHtml(teacher.email || '')}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="text" id="teacher-phone" 
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           value="${escapeHtml(teacher.phone || '')}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class Teacher</label>
                    <select id="teacher-class" class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="">None</option>
                        ${classes.map(cls => `
                            <option value="${escapeHtml(cls.name)}" ${teacher.class === cls.name ? 'selected' : ''}>${escapeHtml(cls.name)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select id="teacher-status" class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                        <option value="Active" ${teacher.status === 'Active' ? 'selected' : ''}>Active</option>
                        <option value="Inactive" ${teacher.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    Update Teacher
                </button>
            </div>
        </form>
    `;
    
    const modalBox = modal.querySelector('.bg-white');
    if (modalBox) {
        modalBox.classList.add('max-w-xl');
    }
    
    document.getElementById('teacherForm').onsubmit = function(e) {
        e.preventDefault();
        updateTeacher(index);
    };
}

function updateTeacher(index) {
    const teachers = DataService.get('teachers');
    const name = document.getElementById('teacher-name').value.trim();
    const email = document.getElementById('teacher-email').value.trim();
    const phone = document.getElementById('teacher-phone').value.trim();
    const teacherClass = document.getElementById('teacher-class').value;
    const status = document.getElementById('teacher-status').value;
    
    if (!name) {
        showToast('Teacher name is required', 'error');
        return;
    }
    
    // Check for duplicate (excluding current)
    if (teachers.some((t, i) => i !== index && t.name.toLowerCase() === name.toLowerCase())) {
        showToast('Teacher already exists!', 'error');
        return;
    }
    
    const oldName = teachers[index].name;
    
    teachers[index] = {
        ...teachers[index],
        name: name,
        email: email || '',
        phone: phone || '',
        class: teacherClass || '',
        status: status || 'Active'
    };
    
    DataService.set('teachers', teachers);
    
    // If name changed, update subjects and classes
    if (oldName !== name) {
        const subjects = DataService.get('subjects') || [];
        subjects.forEach(sub => {
            if (sub.teacher === oldName) {
                sub.teacher = name;
            }
        });
        DataService.set('subjects', subjects);
        
        const classes = DataService.get('classes') || [];
        classes.forEach(cls => {
            if (cls.classTeacher === oldName) {
                cls.classTeacher = name;
            }
        });
        DataService.set('classes', classes);
    }
    
    closeModal();
    showToast('Teacher updated successfully!', 'success');
    Router.navigate('teachers');
}

function deleteTeacher(index) {
    if (!confirm('Delete this teacher? This will remove them from subjects and classes.')) {
        return;
    }
    
    const teachers = DataService.get('teachers');
    const teacher = teachers[index];
    
    // Remove teacher from subjects
    const subjects = DataService.get('subjects') || [];
    subjects.forEach(sub => {
        if (sub.teacher === teacher.name) {
            sub.teacher = 'Not assigned';
        }
    });
    DataService.set('subjects', subjects);
    
    // Remove teacher from classes
    const classes = DataService.get('classes') || [];
    classes.forEach(cls => {
        if (cls.classTeacher === teacher.name) {
            cls.classTeacher = 'Not assigned';
        }
    });
    DataService.set('classes', classes);
    
    teachers.splice(index, 1);
    DataService.set('teachers', teachers);
    showToast('Teacher deleted successfully!', 'success');
    showTeacherModal();
}

function assignSubjectsToTeacher(index) {
    const teachers = DataService.get('teachers');
    const teacher = teachers[index];
    const subjects = DataService.get('subjects') || [];
    
    if (!teacher) {
        showToast('Teacher not found!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    // Get current subjects assigned to this teacher
    const assignedSubjects = subjects.filter(s => s.teacher === teacher.name);
    const availableSubjects = subjects.filter(s => s.teacher !== teacher.name && s.teacher !== 'Not assigned');
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Assign Subjects to ${escapeHtml(teacher.name)}</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
            <div>
                <h4 class="font-semibold text-sm mb-2 text-green-700">Assigned Subjects (${assignedSubjects.length})</h4>
                <div class="border rounded-lg p-3 max-h-60 overflow-y-auto bg-green-50">
                    ${assignedSubjects.length === 0 ? `
                        <p class="text-sm text-gray-400">No subjects assigned</p>
                    ` : `
                        ${assignedSubjects.map(sub => `
                            <div class="flex justify-between items-center py-1 border-b border-gray-200">
                                <span class="text-sm">${escapeHtml(sub.name)}</span>
                                <button onclick="removeSubjectFromTeacher(${index}, '${escapeHtml(sub.name)}')" 
                                        class="text-red-600 hover:text-red-800 text-sm">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                    `}
                </div>
            </div>
            <div>
                <h4 class="font-semibold text-sm mb-2 text-blue-700">Available Subjects</h4>
                <div class="border rounded-lg p-3 max-h-60 overflow-y-auto bg-blue-50">
                    ${availableSubjects.length === 0 ? `
                        <p class="text-sm text-gray-400">No available subjects</p>
                    ` : `
                        ${availableSubjects.map(sub => `
                            <div class="flex justify-between items-center py-1 border-b border-gray-200">
                                <span class="text-sm">${escapeHtml(sub.name)}</span>
                                <button onclick="assignSubjectToTeacher(${index}, '${escapeHtml(sub.name)}')" 
                                        class="text-green-600 hover:text-green-800 text-sm">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        `).join('')}
                    `}
                </div>
            </div>
        </div>
        
        <div class="mt-6">
            <button onclick="closeModal()" class="w-full py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Done
            </button>
        </div>
    `;
    
    const modalBox = modal.querySelector('.bg-white');
    if (modalBox) {
        modalBox.classList.add('max-w-4xl');
    }
}

function assignSubjectToTeacher(teacherIndex, subjectName) {
    const subjects = DataService.get('subjects') || [];
    const teachers = DataService.get('teachers');
    const teacher = teachers[teacherIndex];
    
    const subject = subjects.find(s => s.name === subjectName);
    if (subject) {
        subject.teacher = teacher.name;
        DataService.set('subjects', subjects);
        showToast(`Subject "${subject.name}" assigned to ${teacher.name}`, 'success');
        assignSubjectsToTeacher(teacherIndex);
    }
}

function removeSubjectFromTeacher(teacherIndex, subjectName) {
    const subjects = DataService.get('subjects') || [];
    const teachers = DataService.get('teachers');
    const teacher = teachers[teacherIndex];
    
    const subject = subjects.find(s => s.name === subjectName);
    if (subject) {
        subject.teacher = 'Not assigned';
        DataService.set('subjects', subjects);
        showToast(`Subject "${subject.name}" removed from ${teacher.name}`, 'success');
        assignSubjectsToTeacher(teacherIndex);
    }
}

function renderTeachers(container) {
    const teachers = DataService.get('teachers') || [];
    const classes = DataService.get('classes') || [];
    const subjects = DataService.get('subjects') || [];
    
    container.innerHTML = `
        <div class="bg-white rounded-2xl shadow">
            <div class="p-6 border-b flex justify-between items-center flex-wrap gap-2">
                <h3 class="text-xl font-semibold">All Teachers (${teachers.length})</h3>
                <div class="flex gap-2">
                    <button onclick="showTeacherModal()" 
                            class="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition">
                        <i class="fas fa-cog"></i> Manage Teachers
                    </button>
                </div>
            </div>
            
            ${teachers.length === 0 ? `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-chalkboard-teacher text-6xl mb-4"></i>
                    <p>No teachers added yet. Click "Add Teacher" to get started.</p>
                </div>
            ` : `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                    ${teachers.map((teacher, index) => {
                        const teacherSubjects = subjects.filter(s => s.teacher === teacher.name);
                        
                        return `
                            <div class="border rounded-xl p-5 hover:shadow-lg transition-shadow ${teacher.status === 'Active' ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-gray-50'}">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <h4 class="text-lg font-semibold text-gray-800">${escapeHtml(teacher.name)}</h4>
                                        <p class="text-sm text-gray-500">${escapeHtml(teacher.email || 'No email')}</p>
                                        <p class="text-sm text-gray-500">${escapeHtml(teacher.phone || 'No phone')}</p>
                                    </div>
                                    <span class="px-2 py-1 ${teacher.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} rounded-full text-xs font-semibold">
                                        ${escapeHtml(teacher.status || 'Active')}
                                    </span>
                                </div>
                                <div class="mt-3 space-y-1 text-sm text-gray-600">
                                    <p><i class="fas fa-book w-5 text-indigo-500"></i> ${teacherSubjects.length} subject(s)</p>
                                    <p><i class="fas fa-chalkboard w-5 text-indigo-500"></i> ${teacher.class ? escapeHtml(teacher.class) : 'Not a class teacher'}</p>
                                </div>
                                <div class="mt-4 flex gap-2 flex-wrap">
                                    <button onclick="editTeacher(${index})" class="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200">
                                        <i class="fas fa-edit"></i> Edit
                                    </button>
                                    <button onclick="deleteTeacher(${index})" class="text-sm bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200">
                                        <i class="fas fa-trash"></i> Delete
                                    </button>
                                    <button onclick="assignSubjectsToTeacher(${index})" class="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200">
                                        <i class="fas fa-book"></i> Subjects
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

// ============================================
// ATTENDANCE MODULE
// ============================================

function showAttendanceModal() {
    console.log('showAttendanceModal called'); // Debug log

    const students = DataService.get('students');
    const classes = DataService.get('classes') || [];
    
    if (students.length === 0) {
        showToast('Please add students first!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');

    // Reset modal first
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    
    // Get unique classes from students
    const classNames = [...new Set(students.map(s => s.class))].sort();
    const firstClass = classNames[0] || '';
    let studentsInClass = students.filter(s => s.class === firstClass);
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Mark Attendance</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <form id="attendanceForm">
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select id="attendance-class" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                        ${classNames.map(cls => `
                            <option value="${escapeHtml(cls)}" ${cls === firstClass ? 'selected' : ''}>${escapeHtml(cls)}</option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input type="date" id="attendance-date" value="${today}" 
                           class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
            </div>
            
            <div class="text-sm text-gray-500 mb-2">
                <span class="font-semibold">Status:</span> 
                <span class="text-green-600">● Present</span> 
                <span class="text-red-600 ml-2">● Absent</span>
                <span class="text-yellow-600 ml-2">● Late</span>
                <span class="text-blue-600 ml-2">● Excused</span>
            </div>
            
            <div class="border rounded-lg overflow-hidden" style="height: 300px;">
                <div class="h-full overflow-y-auto">
                    <table class="table w-full border-collapse">
                        <thead class="sticky top-0 z-10 bg-gray-50">
                            <tr class="border-b">
                                <th class="px-3 py-2 text-left text-sm font-semibold">#</th>
                                <th class="px-3 py-2 text-left text-sm font-semibold">Student Name</th>
                                <th class="px-3 py-2 text-left text-sm font-semibold">Sex</th>
                                <th class="px-3 py-2 text-left text-sm font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody id="attendance-body">
                            ${studentsInClass.map((student, i) => {
                                // Check if attendance already recorded for today
                                const existing = attendanceRecords.find(a => 
                                    a.studentId === student.id && 
                                    a.date === today &&
                                    a.class === firstClass
                                );
                                
                                return `
                                    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                                        <td class="px-3 py-2 text-sm text-center">${i + 1}</td>
                                        <td class="px-3 py-2 text-sm font-medium">${escapeHtml(student.name)}</td>
                                        <td class="px-3 py-2 text-sm text-center">${escapeHtml(student.sex)}</td>
                                        <td class="px-3 py-2">
                                            <select data-student-id="${student.id}" 
                                                    class="attendance-status w-32 px-2 py-1 border rounded focus:outline-none focus:border-indigo-500 text-sm">
                                                <option value="Present" ${existing?.status === 'Present' ? 'selected' : ''}>Present</option>
                                                <option value="Absent" ${existing?.status === 'Absent' ? 'selected' : ''}>Absent</option>
                                                <option value="Late" ${existing?.status === 'Late' ? 'selected' : ''}>Late</option>
                                                <option value="Excused" ${existing?.status === 'Excused' ? 'selected' : ''}>Excused</option>
                                            </select>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="mt-4 text-sm text-gray-500">
                Showing ${studentsInClass.length} students in ${firstClass}
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    <i class="fas fa-save"></i> Save Attendance
                </button>
            </div>
        </form>
    `;
    
    modal.classList.remove('hidden');
    modal.querySelector('.bg-white').classList.add('max-w-4xl');
    
    // Update students when class changes
    document.getElementById('attendance-class').addEventListener('change', function() {
        updateAttendanceStudents(this.value, document.getElementById('attendance-date').value);
    });
    
    document.getElementById('attendance-date').addEventListener('change', function() {
        updateAttendanceStudents(document.getElementById('attendance-class').value, this.value);
    });
    
    document.getElementById('attendanceForm').onsubmit = function(e) {
        e.preventDefault();
        saveAttendance();
    };
}

function updateAttendanceStudents(className, date) {
    const students = DataService.get('students');
    const filtered = students.filter(s => s.class === className);
    const tbody = document.getElementById('attendance-body');
    const existingRecords = DataService.get('attendance') || [];
    
    if (!tbody) return;
    
    tbody.innerHTML = filtered.map((student, i) => {
        const existing = existingRecords.find(a => 
            a.studentId === student.id && 
            a.date === date &&
            a.class === className
        );
        
        return `
            <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                <td class="px-3 py-2 text-sm text-center">${i + 1}</td>
                <td class="px-3 py-2 text-sm font-medium">${escapeHtml(student.name)}</td>
                <td class="px-3 py-2 text-sm text-center">${escapeHtml(student.sex)}</td>
                <td class="px-3 py-2">
                    <select data-student-id="${student.id}" 
                            class="attendance-status w-32 px-2 py-1 border rounded focus:outline-none focus:border-indigo-500 text-sm">
                        <option value="Present" ${existing?.status === 'Present' ? 'selected' : ''}>Present</option>
                        <option value="Absent" ${existing?.status === 'Absent' ? 'selected' : ''}>Absent</option>
                        <option value="Late" ${existing?.status === 'Late' ? 'selected' : ''}>Late</option>
                        <option value="Excused" ${existing?.status === 'Excused' ? 'selected' : ''}>Excused</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');
}

function saveAttendance() {
    const className = document.getElementById('attendance-class').value;
    const date = document.getElementById('attendance-date').value;
    const selects = document.querySelectorAll('.attendance-status');
    const attendance = DataService.get('attendance') || [];
    let savedCount = 0;
    
    selects.forEach(select => {
        const studentId = select.dataset.studentId;
        const status = select.value;
        
        // Check if attendance already exists for this student, date, class
        const existingIndex = attendance.findIndex(a => 
            a.studentId === studentId && 
            a.date === date &&
            a.class === className
        );
        
        const entry = {
            studentId: studentId,
            class: className,
            date: date,
            status: status,
            recordedAt: new Date().toISOString()
        };
        
        if (existingIndex >= 0) {
            attendance[existingIndex] = entry;
        } else {
            attendance.push(entry);
        }
        savedCount++;
    });
    
    DataService.set('attendance', attendance);
    closeModal();
    showToast(`Attendance saved for ${savedCount} students!`, 'success');
}

// ============================================
// VIEW ATTENDANCE
// ============================================

function viewAttendance() {
    console.log('viewAttendance called'); // Debug log

    const students = DataService.get('students');
    const attendance = DataService.get('attendance') || [];
    
    if (students.length === 0) {
        showToast('No students found!', 'error');
        return;
    }
    
    if (attendance.length === 0) {
        showToast('No attendance records found!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');

    // Reset modal first
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    // Get unique classes from students
    const classNames = [...new Set(students.map(s => s.class))].sort();
    const firstClass = classNames[0] || '';
    const today = new Date().toISOString().split('T')[0];
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Attendance Records</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="grid grid-cols-3 gap-4 mb-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Class</label>
                <select id="view-attendance-class" class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
                    ${classNames.map(cls => `
                        <option value="${escapeHtml(cls)}" ${cls === firstClass ? 'selected' : ''}>${escapeHtml(cls)}</option>
                    `).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" id="view-attendance-date" value="${today}" 
                       class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500">
            </div>
            <div class="flex items-end">
                <button onclick="loadAttendanceReport()" 
                        class="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                    <i class="fas fa-search"></i> Load
                </button>
            </div>
        </div>
        
        <div id="attendance-report-container" class="min-h-[300px]">
            <div class="text-center py-12 text-gray-400">
                <i class="fas fa-calendar-check text-4xl mb-3"></i>
                <p>Select Class and Date above, then click "Load"</p>
            </div>
        </div>
        
        <div class="mt-6">
            <button onclick="closeModal()" class="w-full py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
            </button>
        </div>
    `;
    
    modal.classList.remove('hidden');
    modal.querySelector('.bg-white').classList.add('max-w-4xl');
}

function loadAttendanceReport() {
    console.log('loadAttendanceReport called');
    
    const container = document.getElementById('attendance-report-container');
    const className = document.getElementById('view-attendance-class').value;
    const date = document.getElementById('view-attendance-date').value;
    
    if (!className || !date) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <p>Please select Class and Date</p>
            </div>
        `;
        return;
    }
    
    // Get active students only (exclude those who left)
    const allStudents = DataService.get('students');
    const activeStudents = allStudents.filter(s => s.class === className && s.status !== 'Left');
    const attendance = DataService.get('attendance') || [];
    
    if (activeStudents.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <p>No active students found in ${escapeHtml(className)}</p>
            </div>
        `;
        return;
    }
    
    // Get attendance for this date and class - only for active students
    const activeStudentIds = new Set(activeStudents.map(s => s.id));
    const records = attendance.filter(a => 
        a.date === date && 
        a.class === className &&
        activeStudentIds.has(a.studentId)
    );

    // Calculate summary
    const totalStudents = activeStudents.length;
    const present = records.filter(r => r.status === 'Present').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const late = records.filter(r => r.status === 'Late').length;
    const excused = records.filter(r => r.status === 'Excused').length;
    const notMarked = totalStudents - records.length;
    const presentPercentage = totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 0;
    
    const formattedDate = formatDate(date);
    
    let html = `
        <div class="grid grid-cols-5 gap-3 mb-4">
            <div class="bg-green-50 border border-green-200 rounded p-2 text-center">
                <p class="text-xs text-gray-500">Present</p>
                <p class="text-lg font-bold text-green-600">${present}</p>
            </div>
            <div class="bg-red-50 border border-red-200 rounded p-2 text-center">
                <p class="text-xs text-gray-500">Absent</p>
                <p class="text-lg font-bold text-red-600">${absent}</p>
            </div>
            <div class="bg-yellow-50 border border-yellow-200 rounded p-2 text-center">
                <p class="text-xs text-gray-500">Late</p>
                <p class="text-lg font-bold text-yellow-600">${late}</p>
            </div>
            <div class="bg-blue-50 border border-blue-200 rounded p-2 text-center">
                <p class="text-xs text-gray-500">Excused</p>
                <p class="text-lg font-bold text-blue-600">${excused}</p>
            </div>
            <div class="bg-gray-50 border border-gray-200 rounded p-2 text-center">
                <p class="text-xs text-gray-500">Not Marked</p>
                <p class="text-lg font-bold text-gray-600">${notMarked}</p>
            </div>
        </div>
        
        <div class="bg-gray-100 rounded p-3 mb-4 text-center">
            <p class="text-sm font-semibold">📅 ${formattedDate}</p>
            <p class="text-sm font-semibold">Present Rate: ${presentPercentage}%</p>
        </div>
        
        <div class="overflow-x-auto max-h-60 overflow-y-auto">
            <table class="table w-full border-collapse">
                <thead>
                    <tr class="bg-gray-50 border-b sticky top-0 z-10">
                        <th class="px-3 py-2 text-left text-sm font-semibold">#</th>
                        <th class="px-3 py-2 text-left text-sm font-semibold">Student</th>
                        <th class="px-3 py-2 text-left text-sm font-semibold">Sex</th>
                        <th class="px-3 py-2 text-left text-sm font-semibold">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${activeStudents.map((student, i) => {
                        const record = records.find(r => r.studentId === student.id);
                        const status = record ? record.status : 'Not Marked';
                        const statusColor = status === 'Present' ? 'text-green-600' : 
                                           status === 'Absent' ? 'text-red-600' : 
                                           status === 'Late' ? 'text-yellow-600' : 
                                           status === 'Excused' ? 'text-blue-600' : 'text-gray-400';
                        
                        return `
                            <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                                <td class="px-3 py-2 text-sm text-center">${i + 1}</td>
                                <td class="px-3 py-2 text-sm font-medium">${escapeHtml(student.name)}</td>
                                <td class="px-3 py-2 text-sm text-center">${escapeHtml(student.sex)}</td>
                                <td class="px-3 py-2 text-sm font-semibold ${statusColor}">${status}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="mt-3 text-xs text-gray-500 text-center">
            ${formattedDate} • ${className} • ${totalStudents} students
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================
// ATTENDANCE SUMMARY (Student View)
// ============================================

function viewStudentAttendance(studentId) {
    console.log('viewStudentAttendance called for:', studentId);
    
    const students = DataService.get('students');
    const student = students.find(s => s.id === studentId);
    
    if (!student) {
        showToast('Student not found!', 'error');
        return;
    }
    
    const attendance = DataService.get('attendance') || [];
    const records = attendance.filter(a => a.studentId === studentId);
    
    if (records.length === 0) {
        showToast(`No attendance records for ${student.name}`, 'info');
        return;
    }
    
    const modalContent = document.getElementById('modal-content');
    
    const totalDays = records.length;
    const present = records.filter(r => r.status === 'Present').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const late = records.filter(r => r.status === 'Late').length;
    const excused = records.filter(r => r.status === 'Excused').length;
    const presentPercentage = totalDays > 0 ? Math.round((present / totalDays) * 100) : 0;
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Attendance Summary: ${escapeHtml(student.name)}</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-green-50 border border-green-200 rounded p-3 text-center">
                <p class="text-xs text-gray-500">Present</p>
                <p class="text-2xl font-bold text-green-600">${present}</p>
            </div>
            <div class="bg-red-50 border border-red-200 rounded p-3 text-center">
                <p class="text-xs text-gray-500">Absent</p>
                <p class="text-2xl font-bold text-red-600">${absent}</p>
            </div>
            <div class="bg-yellow-50 border border-yellow-200 rounded p-3 text-center">
                <p class="text-xs text-gray-500">Late</p>
                <p class="text-2xl font-bold text-yellow-600">${late}</p>
            </div>
            <div class="bg-blue-50 border border-blue-200 rounded p-3 text-center">
                <p class="text-xs text-gray-500">Excused</p>
                <p class="text-2xl font-bold text-blue-600">${excused}</p>
            </div>
        </div>
        
        <div class="bg-gray-100 rounded p-3 mb-4 text-center">
            <p class="text-sm font-semibold">Attendance Rate: ${presentPercentage}% (${present}/${totalDays} days)</p>
        </div>
        
        <div class="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            <table class="table w-full border-collapse">
                <thead>
                    <tr class="bg-gray-50 border-b sticky top-0 z-10">
                        <th class="px-3 py-2 text-left text-sm font-semibold">#</th>
                        <th class="px-3 py-2 text-left text-sm font-semibold">Date</th>
                        <th class="px-3 py-2 text-left text-sm font-semibold">Class</th>
                        <th class="px-3 py-2 text-left text-sm font-semibold">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.sort((a, b) => a.date.localeCompare(b.date)).map((record, i) => {
                        const statusColor = record.status === 'Present' ? 'text-green-600' : 
                                           record.status === 'Absent' ? 'text-red-600' : 
                                           record.status === 'Late' ? 'text-yellow-600' : 'text-blue-600';
                        return `
                            <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                                <td class="px-3 py-2 text-sm text-center">${i + 1}</td>
                                <td class="px-3 py-2 text-sm">${formatDate(record.date)}</td>
                                <td class="px-3 py-2 text-sm">${escapeHtml(record.class)}</td>
                                <td class="px-3 py-2 text-sm font-semibold ${statusColor}">${record.status}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="mt-6">
            <button onclick="closeModal()" class="w-full py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
            </button>
        </div>
    `;
}

function renderAttendance(container) {
    const students = DataService.get('students');
    const attendance = DataService.get('attendance') || [];
    const classes = DataService.get('classes') || [];
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    container.innerHTML = `
        <div class="max-w-7xl mx-auto">
            <div class="bg-white rounded-2xl shadow p-6">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h3 class="text-2xl font-semibold text-gray-800">Attendance Management</h3>
                        <p class="text-gray-500">Track daily attendance • Reports • Student summaries</p>
                    </div>
                    <div class="flex gap-3">
                        <button onclick="showAttendanceModal()" 
                                class="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                            <i class="fas fa-clipboard-check"></i> Mark Attendance
                        </button>
                        <button onclick="viewAttendance()" 
                                class="bg-emerald-600 text-white px-5 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2">
                            <i class="fas fa-chart-bar"></i> View Reports
                        </button>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div class="bg-gray-50 rounded-xl p-4 text-center">
                        <p class="text-sm text-gray-500">Total Students</p>
                        <p class="text-2xl font-bold text-indigo-600">${students.length}</p>
                    </div>
                    <div class="bg-gray-50 rounded-xl p-4 text-center">
                        <p class="text-sm text-gray-500">Today's Records</p>
                        <p class="text-sm text-gray-500">Today (${formatDate(today)})</p>
                        <p class="text-2xl font-bold text-emerald-600">${attendance.filter(a => a.date === today).length}</p>
                    </div>
                    <div class="bg-gray-50 rounded-xl p-4 text-center">
                        <p class="text-sm text-gray-500">Total Records</p>
                        <p class="text-2xl font-bold text-amber-600">${attendance.length}</p>
                    </div>
                    <div class="bg-gray-50 rounded-xl p-4 text-center">
                        <p class="text-sm text-gray-500">Classes</p>
                        <p class="text-2xl font-bold text-purple-600">${classes.length}</p>
                    </div>
                </div>
                
                <div class="border-t pt-4">
                    <h4 class="text-sm font-semibold text-gray-600 mb-3">Quick Actions</h4>
                    <div class="flex flex-wrap gap-3">
                        <button onclick="showAttendanceModal()" 
                                class="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
                            <i class="fas fa-user-check"></i> Mark Today's Attendance
                        </button>
                        <button onclick="viewAttendance()" 
                                class="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-200 text-sm flex items-center gap-2">
                            <i class="fas fa-calendar-alt"></i> View Reports
                        </button>
                        <button onclick="showStudentAttendanceSelector()" 
                                class="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-200 text-sm flex items-center gap-2">
                            <i class="fas fa-user-graduate"></i> Student Summary
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function showStudentAttendanceSelector() {
    console.log('Student Summary button clicked!'); // Debug log

    const students = DataService.get('students');
    
    if (students.length === 0) {
        showToast('No students found!', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');

     // Reset modal FIRST
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Select Student</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="space-y-2 max-h-96 overflow-y-auto">
            ${students.sort((a, b) => a.name.localeCompare(b.name)).map(student => `
                <button onclick="viewStudentAttendance('${escapeHtml(student.id)}')" 
                        class="w-full text-left px-4 py-3 border rounded-lg hover:bg-indigo-50 transition flex justify-between items-center">
                    <span class="font-medium">${escapeHtml(student.name)}</span>
                    <span class="text-sm text-gray-500">${escapeHtml(student.class)}</span>
                </button>
            `).join('')}
        </div>
        
        <div class="mt-6">
            <button onclick="closeModal()" class="w-full py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
            </button>
        </div>
    `;
    
    modal.classList.remove('hidden');
    modal.querySelector('.bg-white').classList.add('max-w-xl');
}

// ============================================
// USER MANAGEMENT (Admin Only - Firebase & DB Synced)
// ============================================

/**
 * Helper: Creates a user in Firebase Auth using a secondary app instance
 * so the currently logged-in Admin session is NOT interrupted or logged out.
 */
async function createSecondaryFirebaseUser(email, password) {
    // If Firebase Auth modular SDK is attached to window/global scope
    if (window.firebaseAuth && window.createUserWithEmailAndPassword) {
        let secondaryApp = window.firebaseApps?.find(a => a.name === 'SecondaryApp');
        if (!secondaryApp && window.initializeApp) {
            secondaryApp = window.initializeApp(window.firebaseConfig, 'SecondaryApp');
        }
        const secondaryAuth = window.getAuth ? window.getAuth(secondaryApp) : secondaryApp.auth();
        const userCredential = await window.createUserWithEmailAndPassword(secondaryAuth, email, password);
        return userCredential.user;
    } 
    // If using Firebase v8 / Compat SDK
    else if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        let secondaryApp = firebase.apps.find(app => app.name === 'SecondaryApp');
        if (!secondaryApp) {
            secondaryApp = firebase.initializeApp(window.firebaseConfig || {}, 'SecondaryApp');
        }
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
        return userCredential.user;
    }
    
    // Local fallback mode if Firebase Auth is not active
    return { uid: 'usr_' + Date.now() };
}

function showUserModal() {
    if (!isAdmin()) {
        showToast('Access denied! Admin only.', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';

    const existingUsers = DataService.get('users') || [];
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <div>
                <h3 class="text-xl font-semibold text-gray-800">Manage System Users</h3>
                <p class="text-xs text-gray-500">Create, view, and manage accounts for Teachers, Admins, and Accountants</p>
            </div>
            <button onclick="showAddUserForm()" 
                    class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium transition flex items-center gap-1.5">
                <i class="fas fa-user-plus"></i> Add User
            </button>
        </div>
        
        <div id="user-list" class="max-h-96 overflow-y-auto rounded-xl border border-gray-100">
            ${existingUsers.length === 0 ? `
                <div class="text-center py-12 bg-gray-50">
                    <i class="fas fa-users-slash text-4xl text-gray-300 mb-2"></i>
                    <p class="text-gray-500 text-sm">No users found in database.</p>
                </div>
            ` : `
                <table class="w-full border-collapse text-left">
                    <thead>
                        <tr class="bg-gray-50 border-b text-xs uppercase font-semibold text-gray-500">
                            <th class="px-4 py-3">Username / Email</th>
                            <th class="px-4 py-3">Full Name</th>
                            <th class="px-4 py-3">Role</th>
                            <th class="px-4 py-3">Created</th>
                            <th class="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 text-sm">
                        ${existingUsers.map((user, index) => `
                            <tr class="hover:bg-indigo-50/30 transition">
                                <td class="px-4 py-3">
                                    <div class="font-medium text-gray-800">${escapeHtml(user.username)}</div>
                                    <div class="text-xs text-gray-400">${escapeHtml(user.email || user.username + '@school.internal')}</div>
                                </td>
                                <td class="px-4 py-3 text-gray-700">${escapeHtml(user.fullName || user.name || '-')}</td>
                                <td class="px-4 py-3">
                                    <span class="px-2.5 py-1 ${
                                        user.role === 'Admin' ? 'bg-purple-100 text-purple-800 border border-purple-200' : 
                                        user.role === 'Teacher' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 
                                        user.role === 'Accountant' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 
                                        'bg-gray-100 text-gray-600'
                                    } rounded-full text-xs font-semibold">
                                        ${escapeHtml(user.role || 'User')}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-xs text-gray-500">${typeof formatDate === 'function' ? formatDate(user.createdAt) : user.createdAt?.split('T')[0] || '-'}</td>
                                <td class="px-4 py-3 text-right">
                                    <button onclick="deleteUser(${index})" class="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition" title="Delete User">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>
        
        <div class="mt-6">
            <button onclick="closeModal()" class="w-full py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition">
                Close
            </button>
        </div>
    `;
    
    const modalBox = modal.querySelector('.bg-white');
    if (modalBox) {
        modalBox.classList.add('max-w-3xl');
    }
}

function showAddUserForm() {
    if (!isAdmin()) {
        showToast('Access denied! Admin only.', 'error');
        return;
    }
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6 border-b pb-4">
            <div>
                <h3 class="text-xl font-semibold text-gray-800">Add New User</h3>
                <p class="text-xs text-gray-500">Create login credentials for school staff</p>
            </div>
            <button onclick="showUserModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times text-lg"></i>
            </button>
        </div>

        <form id="userForm" onsubmit="handleSaveUserSubmit(event)">
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Username *</label>
                    <input type="text" id="user-username" required 
                           class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                           placeholder="e.g. pechimono">
                </div>

                <div>
                    <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Email Address *</label>
                    <input type="email" id="user-email" required 
                           class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                           placeholder="e.g. pechimono@school.com">
                    <p class="text-[11px] text-gray-400 mt-1">Used for Firebase login authentication</p>
                </div>

                <div>
                    <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Full Name *</label>
                    <input type="text" id="user-fullName" required 
                           class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                           placeholder="e.g. Pearson Chimono">
                </div>

                <div>
                    <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Password *</label>
                    <input type="password" id="user-password" required minlength="6"
                           class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                           placeholder="Minimum 6 characters">
                </div>

                <div>
                    <label class="block text-xs font-semibold uppercase text-gray-600 mb-1">Role *</label>
                    <select id="user-role-select" required class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm">
                        <option value="Teacher">Teacher</option>
                        <option value="Admin">Admin</option>
                        <option value="Accountant">Accountant</option>
                    </select>
                </div>
            </div>
            
            <div class="mt-6 flex gap-3 pt-4 border-t">
                <button type="button" onclick="showUserModal()" 
                        class="flex-1 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition">
                    Cancel
                </button>
                <button type="submit" id="save-user-submit-btn"
                        class="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition flex items-center justify-center gap-2">
                    <span>Save User</span>
                </button>
            </div>
        </form>
    `;
}

async function handleSaveUserSubmit(event) {
    if (event) event.preventDefault();

    const username = document.getElementById('user-username')?.value?.trim();
    const emailInput = document.getElementById('user-email')?.value?.trim();
    const password = document.getElementById('user-password')?.value?.trim();
    const role = document.getElementById('user-role')?.value || 'Teacher';
    const fullName = document.getElementById('user-fullname')?.value?.trim() || username;

    if (!username || !password) {
        showToast('Please provide both a username and a password.', 'error');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters long.', 'error');
        return;
    }

    const email = emailInput || `${username.toLowerCase()}@school.com`;
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Saving...`;
    }

    try {
        // 1. Save to Local DataService
        const users = DataService.get('users') || [];
        const existingIndex = users.findIndex(u => u.username?.toLowerCase() === username.toLowerCase());

        const newUserObj = {
            id: existingIndex >= 0 ? users[existingIndex].id : Date.now().toString(),
            username,
            email,
            password,
            role,
            fullName,
            createdAt: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            users[existingIndex] = newUserObj;
        } else {
            users.push(newUserObj);
        }

        DataService.set('users', users);

        // 2. Secondary Firebase Auth Sync (Runs quietly in background)
        if (window.firebaseConfig && typeof firebase !== 'undefined') {
            try {
                let secondaryApp = firebase.apps.find(app => app.name === 'SecondaryApp');
                if (!secondaryApp) {
                    secondaryApp = firebase.initializeApp(window.firebaseConfig, 'SecondaryApp');
                }
                await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
                await secondaryApp.auth().signOut();
            } catch (fbErr) {
                // Silently handle existing accounts without throwing user-facing tech errors
                console.warn('Background account sync status:', fbErr.code);
            }
        }

        // 3. User-Friendly Notification
        showToast('User added successfully!', 'success');

        // Close Modal & Refresh User List
        if (typeof closeModal === 'function') closeModal('user-modal');
        if (typeof renderUsersPage === 'function') renderUsersPage();
        refreshCurrentPage();

    } catch (err) {
        console.error('Save user error:', err);
        showToast('Failed to save user. Please try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Save User';
        }
    }
}

function deleteUser(index) {
    if (!isAdmin()) {
        showToast('Access denied! Admin only.', 'error');
        return;
    }
    
    const users = DataService.get('users') || [];
    const user = users[index];
    
    // Prevent deleting the last admin
    const adminCount = users.filter(u => u.role === 'Admin').length;
    if (user.role === 'Admin' && adminCount <= 1) {
        showToast('Cannot delete the last admin user!', 'error');
        return;
    }
    
    if (!confirm(`Delete user "${user.username}"?`)) {
        return;
    }
    
    users.splice(index, 1);
    DataService.set('users', users);
    showToast('User deleted successfully!', 'success');
    
    showUserModal();
}

function renderUsers(container) {
    if (!isAdmin()) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl shadow p-8 text-center max-w-xl mx-auto mt-8">
                <i class="fas fa-lock text-5xl text-red-400 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-700">Access Denied</h3>
                <p class="text-gray-500 text-sm mt-1">You do not have permission to view User Management.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-7xl mx-auto">
            <div class="p-6 border-b flex justify-between items-center">
                <div>
                    <h3 class="text-xl font-bold text-gray-800">User Management</h3>
                    <p class="text-xs text-gray-500 mt-0.5">Manage system logins and role permissions</p>
                </div>
                <button onclick="showUserModal()" 
                        class="bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 font-medium text-sm flex items-center gap-2 transition shadow-sm">
                    <i class="fas fa-users-cog"></i> Manage Users
                </button>
            </div>
            <div class="p-12 text-center text-gray-500">
                <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">
                    <i class="fas fa-user-shield"></i>
                </div>
                <h4 class="font-bold text-gray-700 text-lg mb-1">User Administrative Panel</h4>
                <p class="text-sm text-gray-500 max-w-md mx-auto mb-6">Click the button below to view all system accounts, create new Teacher or Accountant logins, or manage credentials.</p>
                <button onclick="showUserModal()" class="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-6 py-2.5 rounded-xl font-semibold text-sm transition">
                    Open User Manager
                </button>
            </div>
        </div>
    `;
}

function updateUserProfile() {
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    
    if (typeof currentUser !== 'undefined' && currentUser) {
        if (nameEl) nameEl.textContent = currentUser.fullName || currentUser.name || currentUser.username || 'User';
        if (roleEl) roleEl.textContent = currentUser.role || 'User';
    } else {
        if (nameEl) nameEl.textContent = 'Guest';
        if (roleEl) roleEl.textContent = 'Not logged in';
    }
}

// ============================================
// RESULTS PORTAL ADMIN CONTROLS
// ============================================

function showPortalSettings() {
    console.log('showPortalSettings called'); // Debug

    if (!isAdmin()) {
        showToast('Access denied! Admin only.', 'error');
        return;
    }
    
    const settings = DataService.get('portalSettings') || {
        isOpen: false,
        openingDate: null,
        closingDate: null,
        message: 'Results will be available soon.'
    };
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalContent.innerHTML = '';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">Results Portal Settings</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <form id="portalSettingsForm">
            <div class="space-y-4">
                <!-- Portal Status -->
                <div class="flex items-center gap-4 p-4 rounded-lg ${settings.isOpen ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
                    <div class="flex-1">
                        <p class="font-semibold ${settings.isOpen ? 'text-green-700' : 'text-red-700'}">
                            Portal is ${settings.isOpen ? '🔓 OPEN' : '🔒 CLOSED'}
                        </p>
                        <p class="text-xs text-gray-500">${settings.isOpen ? 'Parents can view and download results' : 'Parents cannot access results'}</p>
                    </div>
                    <button type="button" onclick="togglePortal()" 
                            class="px-4 py-2 rounded-lg ${settings.isOpen ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white transition text-sm">
                        ${settings.isOpen ? 'Close Portal' : 'Open Portal'}
                    </button>
                </div>
                
                <!-- Opening Date -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Opening Date</label>
                    <input type="date" id="portal-opening-date" 
                           value="${settings.openingDate || ''}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Closing Date -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Closing Date</label>
                    <input type="date" id="portal-closing-date" 
                           value="${settings.closingDate || ''}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Portal Message -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Portal Message</label>
                    <textarea id="portal-message" rows="3" 
                              class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                              placeholder="Message to display when portal is closed">${settings.message || 'Results will be available soon.'}</textarea>
                </div>
                
                <!-- Current Status Summary -->
                <div class="bg-gray-50 rounded-lg p-4">
                    <p class="text-sm font-semibold text-gray-700">Portal Status Summary</p>
                    <div class="grid grid-cols-2 gap-2 mt-2 text-sm">
                        <div>
                            <span class="text-gray-500">Status:</span>
                            <span class="font-semibold ${settings.isOpen ? 'text-green-600' : 'text-red-600'}">${settings.isOpen ? 'OPEN' : 'CLOSED'}</span>
                        </div>
                        <div>
                            <span class="text-gray-500">Opens:</span>
                            <span class="font-semibold">${settings.openingDate ? formatDate(settings.openingDate) : 'Not set'}</span>
                        </div>
                        <div>
                            <span class="text-gray-500">Closes:</span>
                            <span class="font-semibold">${settings.closingDate ? formatDate(settings.closingDate) : 'Not set'}</span>
                        </div>
                        <div>
                            <span class="text-gray-500">Message:</span>
                            <span class="font-semibold text-xs">${settings.message ? 'Set' : 'Not set'}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Close
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    <i class="fas fa-save"></i> Save Settings
                </button>
            </div>
        </form>
    `;
    
    modal.querySelector('.bg-white').classList.add('max-w-xl');
    
    document.getElementById('portalSettingsForm').onsubmit = function(e) {
        e.preventDefault();
        savePortalSettings();
    };
}
function togglePortal() {
    console.log('togglePortal called'); // Debug
    
    const settings = DataService.get('portalSettings') || {
        isOpen: false,
        openingDate: null,
        closingDate: null,
        message: 'Results will be available soon.'
    };
    
    settings.isOpen = !settings.isOpen;
    DataService.set('portalSettings', settings);
    
    console.log('Portal toggled to:', settings.isOpen); // Debug
    
    showToast(`Portal ${settings.isOpen ? 'opened' : 'closed'} successfully!`, 'success');
    
    // Close any open modal first
    closeModal();
    
    // Refresh the portal page
    const container = document.getElementById('content');
    if (container) {
        renderPortal(container);
    }
}

function savePortalSettings() {
    console.log('savePortalSettings called'); // Debug
    
    const settings = DataService.get('portalSettings') || {
        isOpen: false,
        openingDate: null,
        closingDate: null,
        message: 'Results will be available soon.'
    };
    
    // Get values from form
    const openingDate = document.getElementById('portal-opening-date').value;
    const closingDate = document.getElementById('portal-closing-date').value;
    const message = document.getElementById('portal-message').value.trim();
    
    console.log('Saving values:', { openingDate, closingDate, message }); // Debug
    
    settings.openingDate = openingDate || null;
    settings.closingDate = closingDate || null;
    settings.message = message || 'Results will be available soon.';
    
    DataService.set('portalSettings', settings);
    
    console.log('Settings saved:', DataService.get('portalSettings')); // Debug
    
    showToast('Portal settings saved successfully!', 'success');
    
    // Close modal
    const modal = document.getElementById('modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
    
    // Refresh the portal page
    const container = document.getElementById('content');
    if (container) {
        renderPortal(container);
    }
}

function getPortalLink() {
    const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
    const portalUrl = baseUrl + 'results-portal.html';
    
    // Copy to clipboard
    navigator.clipboard.writeText(portalUrl).then(() => {
        showToast('Portal link copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback
        prompt('Copy this link:', portalUrl);
    });
}

function renderPortal(container) {
    console.log('renderPortal called');
    
    if (!isAdmin()) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl shadow p-8 text-center">
                <i class="fas fa-lock text-6xl text-red-400 mb-4"></i>
                <h3 class="text-2xl font-semibold text-gray-600">Access Denied</h3>
                <p class="text-gray-500 mt-2">You do not have permission to view this page.</p>
            </div>
        `;
        return;
    }
    
    // Get settings - handle empty array case
    let settings = DataService.get('portalSettings');
    
    // If settings is empty array or not an object, set defaults
    if (Array.isArray(settings) || Object.keys(settings).length === 0) {
        settings = {
            isOpen: false,
            openingDate: null,
            closingDate: null,
            message: 'Results will be available soon.'
        };
        DataService.set('portalSettings', settings);
    }
    
    console.log('Portal settings:', settings);

    const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
    const portalUrl = baseUrl + 'results-portal.html';
    
    // Format dates for display
    const openingDisplay = settings.openingDate ? formatDate(settings.openingDate) : 'Not set';
    const closingDisplay = settings.closingDate ? formatDate(settings.closingDate) : 'Not set';
    
    container.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <div class="bg-white rounded-2xl shadow p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-2xl font-semibold text-gray-800">Results Portal Management</h3>
                    <button onclick="showPortalSettings()" 
                            class="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition">
                        <i class="fas fa-cog"></i> Settings
                    </button>
                </div>
                
                <!-- Portal Status Card -->
                <div class="rounded-xl p-6 mb-6 ${settings.isOpen ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-2xl font-bold ${settings.isOpen ? 'text-green-700' : 'text-red-700'}">
                                ${settings.isOpen ? '🔓 Portal is OPEN' : '🔒 Portal is CLOSED'}
                            </p>
                            <p class="text-sm text-gray-600 mt-1">${settings.isOpen ? 'Parents can access results' : 'Parents cannot access results at this time'}</p>
                        </div>
                        <button onclick="togglePortal()" 
                                class="px-6 py-3 rounded-lg ${settings.isOpen ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white transition font-medium">
                            ${settings.isOpen ? 'Close Portal' : 'Open Portal'}
                        </button>
                    </div>
                </div>
                
                <!-- Portal Info -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">Portal Link</p>
                        <p class="text-sm font-mono text-indigo-600 break-all">${portalUrl}</p>
                        <button onclick="getPortalLink()" class="mt-2 text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200">
                            <i class="fas fa-copy"></i> Copy Link
                        </button>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">Portal Message</p>
                        <p class="text-sm text-gray-700">${settings.message || 'Results will be available soon.'}</p>
                    </div>
                </div>
                
                <!-- Dates -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-50 rounded-lg p-4 text-center">
                        <p class="text-sm text-gray-500">Opening Date</p>
                        <p class="text-lg font-semibold ${settings.openingDate ? 'text-green-600' : 'text-gray-400'}">
                            ${openingDisplay}
                        </p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4 text-center">
                        <p class="text-sm text-gray-500">Closing Date</p>
                        <p class="text-lg font-semibold ${settings.closingDate ? 'text-red-600' : 'text-gray-400'}">
                            ${closingDisplay}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// RATE LIMITING & SESSION MANAGEMENT
// ============================================

// Rate limiting for portal login attempts
const loginAttempts = {};

function checkRateLimit(ip) {
    const now = Date.now();
    const attempts = loginAttempts[ip] || [];
    
    // Remove attempts older than 1 hour
    const recentAttempts = attempts.filter(t => now - t < 3600000);
    
    if (recentAttempts.length >= 5) {
        return false; // Blocked
    }
    
    return true;
}

function recordLoginAttempt(ip, success) {
    const now = Date.now();
    if (!loginAttempts[ip]) {
        loginAttempts[ip] = [];
    }
    loginAttempts[ip].push(now);
    
    // Clean old attempts
    loginAttempts[ip] = loginAttempts[ip].filter(t => now - t < 3600000);
}

// Session management
let sessionTimer = null;
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function resetSessionTimer() {
    if (sessionTimer) {
        clearTimeout(sessionTimer);
    }
    sessionTimer = setTimeout(() => {
        // Auto-logout
        showToast('Session expired due to inactivity. Please login again.', 'warning');
        if (currentUser) {
            currentUser = null;
            localStorage.removeItem('currentUser');
            showLoginPage();
        }
    }, SESSION_TIMEOUT);
}

// Reset timer on user activity
function setupSessionMonitoring() {
    if (!document) return;
    
    const events = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart'];
    events.forEach(event => {
        document.addEventListener(event, resetSessionTimer);
    });
    
    resetSessionTimer();
}

// ============================================
// SECURITY: INPUT SANITIZATION
// ============================================

// Sanitize input to prevent injection attacks
function sanitizeInput(input) {
    if (!input) return '';
    // Remove any potentially dangerous characters
    return String(input)
        .replace(/[<>]/g, '')           // Remove < and >
        .replace(/['"]/g, '')            // Remove quotes
        .replace(/[&]/g, '&amp;')        // Escape ampersands
        .replace(/[\n\r]/g, ' ');        // Remove newlines
}

// Validate input against allowed patterns
function validateInput(input, type = 'text') {
    const patterns = {
        text: /^[a-zA-Z0-9\s\-_.,()'@]+$/,
        name: /^[a-zA-Z\s\-']+$/,
        phone: /^(?:\+265|0)\d{9}$/,
        email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        id: /^[a-zA-Z0-9\/\-_]+$/,
        class: /^[a-zA-Z0-9\s\-]+$/,
        number: /^\d+$/
    };
    
    const pattern = patterns[type] || patterns.text;
    return pattern.test(String(input).trim());
}

// Sanitize object recursively
function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = sanitizeInput(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }
    
    return sanitized;
}

// Validate all fields in an object
function validateFields(obj, schema) {
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
        const value = obj[field];
        
        // Required check
        if (rules.required && (!value || String(value).trim() === '')) {
            errors.push(`${field} is required`);
            continue;
        }
        
        // Type check
        if (value && rules.type) {
            if (rules.type === 'string' && typeof value !== 'string') {
                errors.push(`${field} must be a string`);
            }
            if (rules.type === 'number' && isNaN(Number(value))) {
                errors.push(`${field} must be a number`);
            }
        }
        
        // Pattern check
        if (value && rules.pattern && !rules.pattern.test(String(value))) {
            errors.push(`${field} has invalid format`);
        }
        
        // Min/Max length
        if (value && rules.minLength && String(value).length < rules.minLength) {
            errors.push(`${field} must be at least ${rules.minLength} characters`);
        }
        if (value && rules.maxLength && String(value).length > rules.maxLength) {
            errors.push(`${field} must not exceed ${rules.maxLength} characters`);
        }
        
        // Min/Max value
        if (value && rules.min !== undefined && Number(value) < rules.min) {
            errors.push(`${field} must be at least ${rules.min}`);
        }
        if (value && rules.max !== undefined && Number(value) > rules.max) {
            errors.push(`${field} must not exceed ${rules.max}`);
        }
    }
    
    return errors;
}

// Validation schemas
const VALIDATION_SCHEMAS = {
    student: {
        name: { required: true, type: 'string', minLength: 2, maxLength: 100 },
        class: { required: true, type: 'string', minLength: 2, maxLength: 50 },
        sex: { required: true, type: 'string', pattern: /^(Female|Male)$/ },
        age: { required: true, type: 'number', min: 10, max: 25 },
        parentPhone: { required: true, type: 'string', pattern: /^(?:\+265|0)\d{9}$/ },
        admissionYear: { required: true, type: 'number', min: 2000, max: 2100 }
    },
    portal: {
        studentId: { required: true, type: 'string', minLength: 5, maxLength: 30 },
        studentName: { required: true, type: 'string', minLength: 2, maxLength: 100 },
        parentPhone: { required: true, type: 'string', pattern: /^(?:\+265|0)\d{9}$/ }
    }
};

// ============================================
// SECURE DATA ENCRYPTION
// ============================================

// Simple encryption for sensitive data (phone numbers)
function encryptData(data) {
    // In production, use a proper encryption library
    // For local storage, we'll do basic obfuscation
    if (!data) return data;
    return btoa(encodeURIComponent(data));
}

function decryptData(encrypted) {
    if (!encrypted) return encrypted;
    try {
        return decodeURIComponent(atob(encrypted));
    } catch {
        return encrypted;
    }
}

// Store sensitive data with encryption
function storeSecureData(key, data) {
    const secureData = {
        data: data,
        encrypted: true,
        timestamp: Date.now()
    };
    
    // For sensitive fields, encrypt the data
    if (typeof data === 'object' && data !== null) {
        // Encrypt sensitive fields
        const sensitiveFields = ['parentPhone', 'parentPhone'];
        const cloned = { ...data };
        sensitiveFields.forEach(field => {
            if (cloned[field]) {
                cloned[field] = encryptData(cloned[field]);
            }
        });
        secureData.data = cloned;
    }
    
    localStorage.setItem(key, JSON.stringify(secureData));
}

function getSecureData(key) {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    
    try {
        const secureData = JSON.parse(stored);
        if (!secureData.encrypted) return secureData.data;
        
        // Decrypt sensitive fields
        const sensitiveFields = ['parentPhone'];
        const data = { ...secureData.data };
        sensitiveFields.forEach(field => {
            if (data[field]) {
                data[field] = decryptData(data[field]);
            }
        });
        
        return data;
    } catch {
        return null;
    }
}

// ============================================
// SCHOOL SETTINGS
// ============================================

function showSchoolSettings() {
    if (!isAdmin()) {
        showToast('Access denied! Admin only.', 'error');
        return;
    }
    
    const settings = DataService.get('schoolSettings') || {
        schoolName: 'BANDAWE GIRLS SECONDARY SCHOOL',
        address: 'Private Bag 11, Chintheche',
        email: 'bandawegirlssecondary@gmail.com',
        phone: '+265 993 819 599',
        motto: 'Dedicated to Excellence',
        nextOpeningDate: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 14).toISOString().split('T')[0],
        fees: 'MK450,000',
        accountName: 'Bandawe Girls Sec School',
        bank: 'NBM',
        branch: 'Mzuzu Branch',
        accountNumber: '1467627',
        currency: 'MK'
    };
    
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    modalContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold">🏫 School Settings</h3>
            <button type="button" onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="text-sm text-gray-500 mb-4">Update your school information. These will appear on report cards.</div>
        
        <form id="schoolSettingsForm">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-1">
                <!-- School Name -->
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">School Name *</label>
                    <input type="text" id="school-name" required 
                           value="${escapeHtml(settings.schoolName || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Address -->
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input type="text" id="school-address" 
                           value="${escapeHtml(settings.address || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Email -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" id="school-email" 
                           value="${escapeHtml(settings.email || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Phone -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="text" id="school-phone" 
                           value="${escapeHtml(settings.phone || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Motto -->
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">School Motto</label>
                    <input type="text" id="school-motto" 
                           value="${escapeHtml(settings.motto || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <div class="border-t border-gray-200 col-span-2 my-2 pt-2">
                    <p class="text-sm font-semibold text-gray-700">Report Card Information</p>
                </div>
                
                <!-- Next Opening Date -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Next Opening Date</label>
                    <input type="date" id="school-opening-date" 
                           value="${settings.nextOpeningDate || ''}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Fees -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fees Amount</label>
                    <input type="text" id="school-fees" 
                           value="${escapeHtml(settings.fees || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="e.g., MK450,000">
                </div>
                
                <div class="border-t border-gray-200 col-span-2 my-2 pt-2">
                    <p class="text-sm font-semibold text-gray-700">Bank Details</p>
                </div>
                
                <!-- Account Holder Name -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Account Holder Name</label>
                    <input type="text" id="account-name" 
                           value="${escapeHtml(settings.accountName || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Bank -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                    <input type="text" id="bank-name" 
                           value="${escapeHtml(settings.bank || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="e.g., NBM, NBS Bank">
                </div>
                
                <!-- Branch -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                    <input type="text" id="bank-branch" 
                           value="${escapeHtml(settings.branch || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Account Number -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                    <input type="text" id="account-number" 
                           value="${escapeHtml(settings.accountNumber || '')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500">
                </div>
                
                <!-- Currency -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Currency Symbol</label>
                    <input type="text" id="bank-currency" 
                           value="${escapeHtml(settings.currency || 'MK')}"
                           class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-indigo-500"
                           placeholder="e.g., MK, $, K">
                </div>
            </div>
            
            <div class="mt-6 flex gap-3">
                <button type="button" onclick="closeModal()" 
                        class="flex-1 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    <i class="fas fa-save"></i> Save Settings
                </button>
            </div>
        </form>
    `;
    
    const innerCard = modal.querySelector('.bg-white');
    if (innerCard) {
        innerCard.classList.add('max-w-2xl');
    }
    
    document.getElementById('schoolSettingsForm').onsubmit = function(e) {
        e.preventDefault();
        saveSchoolSettings();
    };
}

function saveSchoolSettings() {
    const form = document.getElementById('schoolSettingsForm');
    if (!form) return;

    // Grab values directly from form controls safely
    const schoolName = form.querySelector('#school-name')?.value.trim() || '';
    
    if (!schoolName) {
        showToast('School name is required. Please enter a school name.', 'error');
        return;
    }
    
    const settings = {
        schoolName: schoolName,
        address: form.querySelector('#school-address')?.value.trim() || '',
        email: form.querySelector('#school-email')?.value.trim() || '',
        phone: form.querySelector('#school-phone')?.value.trim() || '',
        motto: form.querySelector('#school-motto')?.value.trim() || '',
        nextOpeningDate: form.querySelector('#school-opening-date')?.value || null,
        fees: form.querySelector('#school-fees')?.value.trim() || '',
        accountName: form.querySelector('#account-name')?.value.trim() || '',
        bank: form.querySelector('#bank-name')?.value.trim() || '',
        branch: form.querySelector('#bank-branch')?.value.trim() || '',
        accountNumber: form.querySelector('#account-number')?.value.trim() || '',
        currency: form.querySelector('#bank-currency')?.value.trim() || 'MK'
    };
    
    // Persist data
    DataService.set('schoolSettings', settings);
    showToast('School settings saved successfully!', 'success');
    closeModal();
    
    // Refresh the view page
    const container = document.getElementById('content');
    if (container) {
        renderSchoolSettings(container);
    }
}

function renderSchoolSettings(container) {
    if (!isAdmin()) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl shadow p-8 text-center">
                <i class="fas fa-lock text-6xl text-red-400 mb-4"></i>
                <h3 class="text-2xl font-semibold text-gray-600">Access Denied</h3>
                <p class="text-gray-500 mt-2">You do not have permission to view this page.</p>
            </div>
        `;
        return;
    }
    
    // Fetch saved settings first, default only if no saved settings exist at all
    const saved = DataService.get('schoolSettings');
    const s = saved || {
        schoolName: 'BANDAWE GIRLS SECONDARY SCHOOL',
        address: 'Private Bag 11, Chintheche',
        email: 'bandawegirlssecondary@gmail.com',
        phone: '+265 993 819 599',
        motto: 'Dedicated to Excellence',
        nextOpeningDate: '',
        fees: 'MK450,000',
        accountName: 'Bandawe Girls Sec School',
        bank: 'NBM',
        branch: 'Mzuzu Branch',
        accountNumber: '1467627',
        currency: 'MK'
    };
    
    container.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <div class="bg-white rounded-2xl shadow p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-2xl font-semibold text-gray-800">🏫 School Settings</h3>
                    <button onclick="showSchoolSettings()" 
                            class="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition">
                        <i class="fas fa-edit"></i> Edit Settings
                    </button>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">School Name</p>
                        <p class="font-semibold">${escapeHtml(s.schoolName || 'N/A')}</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">Address</p>
                        <p class="font-semibold">${escapeHtml(s.address || 'N/A')}</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">Email</p>
                        <p class="font-semibold">${escapeHtml(s.email || 'N/A')}</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">Phone</p>
                        <p class="font-semibold">${escapeHtml(s.phone || 'N/A')}</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">Motto</p>
                        <p class="font-semibold">"${escapeHtml(s.motto || 'N/A')}"</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">Next Opening Date</p>
                        <p class="font-semibold">${s.nextOpeningDate ? formatDate(s.nextOpeningDate) : 'Not set'}</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">Fees</p>
                        <p class="font-semibold">${escapeHtml(s.fees || 'N/A')}</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <p class="text-sm text-gray-500">Bank Details</p>
                        <p class="font-semibold text-sm">${escapeHtml(s.accountName || 'N/A')}</p>
                        <p class="font-semibold text-sm">${escapeHtml(s.bank || '')}, ${escapeHtml(s.branch || '')}</p>
                        <p class="font-semibold text-sm">Acc: ${escapeHtml(s.accountNumber || 'N/A')}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// PHONE REQUESTS DATA MANAGEMENT
// ============================================
// Get all requests from storage with dynamic data normalization
function getPhoneRequests() {
    try {
        const raw = JSON.parse(localStorage.getItem('phoneChangeRequests')) || [];
        
        // Auto-heal legacy or mismatched object structures on read
        return raw.map(req => {
            const normalizedStatus = (req.status || 'pending').toLowerCase();
            const validDate = req.createdAt || req.date || new Date().toISOString();
            
            return {
                id: req.id || 'REQ-' + Date.now(),
                studentId: req.studentId || req.reqStudentId || 'N/A',
                studentName: req.studentName || req.reqStudentName || 'N/A',
                currentPhone: req.currentPhone || 'N/A',
                newPhone: req.newPhone || req.reqNewPhone || 'N/A',
                reason: req.reason || req.reqReason || 'N/A',
                status: normalizedStatus, // Force lowercase ('pending', 'approved', 'rejected')
                createdAt: validDate,
                processedAt: req.processedAt || null,
                processedBy: req.processedBy || null,
                adminNotes: req.adminNotes || ''
            };
        });
    } catch (e) {
        console.error('Error parsing phone requests from storage:', e);
        return [];
    }
}

// Save requests back to localStorage
function savePhoneRequests(requests) {
    localStorage.setItem('phoneChangeRequests', JSON.stringify(requests));
}

// Helper: Safe date formatter to prevent "Invalid Date"
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const parsedDate = new Date(dateString);
    if (isNaN(parsedDate.getTime())) return 'N/A';
    return parsedDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Admin System: Approve or Reject a request
function processPhoneRequest(requestId, action, adminNotes = '') {
    const requests = getPhoneRequests();
    const reqIndex = requests.findIndex(r => r.id === requestId);

    if (reqIndex === -1) return { success: false, message: 'Request not found' };

    const req = requests[reqIndex];
    const targetStatus = action.toLowerCase();
    
    req.status = targetStatus; // 'approved' or 'rejected'
    req.processedAt = new Date().toISOString();
    req.adminNotes = adminNotes;

    if (targetStatus === 'approved') {
        // Retrieve and update student registry record
        const students = JSON.parse(localStorage.getItem('students')) || [];
        const studentIndex = students.findIndex(s => 
            String(s.id || s.studentId).toLowerCase() === String(req.studentId).toLowerCase()
        );

        if (studentIndex !== -1) {
            students[studentIndex].phone = req.newPhone;
            students[studentIndex].phoneLastUpdated = new Date().toISOString();
            students[studentIndex].phoneUpdateReason = `Portal Request (${req.id}): ${req.reason}`;
            localStorage.setItem('students', JSON.stringify(students));
        } else {
            return { success: false, message: `Student ID "${req.studentId}" not found in registry.` };
        }
    }

    savePhoneRequests(requests);
    return { success: true, message: `Request successfully ${targetStatus}` };
}

// ============================================
// ADMIN REQUEST CENTER PAGE
// ============================================
function renderRequestCenter(container) {
    if (!container) return;
    
    const requests = getPhoneRequests();
    
    // Calculate counts (case-insensitive checks)
    const pending = requests.filter(r => r.status === 'pending').length;
    
    // Count approvals processed today
    const todayStr = new Date().toDateString();
    const approved = requests.filter(r => {
        if (r.status !== 'approved') return false;
        if (!r.processedAt) return true; // Fallback if processedAt is missing
        return new Date(r.processedAt).toDateString() === todayStr;
    }).length;
    
    const rejected = requests.filter(r => r.status === 'rejected').length;

    container.innerHTML = `
        <div class="space-y-6 p-6">
            <!-- Header Stats -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-white border-l-4 border-yellow-500 p-4 rounded-lg shadow-sm">
                    <p class="text-xs uppercase text-gray-500 font-semibold">Pending Requests</p>
                    <h3 class="text-2xl font-bold text-yellow-600">${pending}</h3>
                </div>
                <div class="bg-white border-l-4 border-emerald-500 p-4 rounded-lg shadow-sm">
                    <p class="text-xs uppercase text-gray-500 font-semibold">Approved Today</p>
                    <h3 class="text-2xl font-bold text-emerald-600">${approved}</h3>
                </div>
                <div class="bg-white border-l-4 border-rose-500 p-4 rounded-lg shadow-sm">
                    <p class="text-xs uppercase text-gray-500 font-semibold">Rejected</p>
                    <h3 class="text-2xl font-bold text-rose-600">${rejected}</h3>
                </div>
            </div>

            <!-- Requests Table -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="p-4 border-b bg-gray-50/50 flex justify-between items-center">
                    <h2 class="text-base font-bold text-gray-800">Phone Update Submissions</h2>
                    <button onclick="if(window.Router && Router.refresh) { Router.refresh(); } else { location.reload(); }" class="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                        <i class="fas fa-sync-alt mr-1"></i> Refresh
                    </button>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead class="bg-gray-50 text-gray-600 font-semibold text-xs uppercase border-b">
                            <tr>
                                <th class="p-3">Req ID</th>
                                <th class="p-3">Student Info</th>
                                <th class="p-3">New Phone</th>
                                <th class="p-3">Reason</th>
                                <th class="p-3">Submitted</th>
                                <th class="p-3">Status</th>
                                <th class="p-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${requests.length === 0 ? `
                                <tr>
                                    <td colspan="7" class="text-center py-8 text-gray-400">No phone update requests found.</td>
                                </tr>
                            ` : requests.map(req => {
                                const status = (req.status || 'pending').toLowerCase();
                                const isPending = status === 'pending';
                                
                                return `
                                <tr class="hover:bg-gray-50/50 transition-colors">
                                    <td class="p-3 font-mono text-xs text-indigo-600 font-bold">${req.id}</td>
                                    <td class="p-3">
                                        <div class="font-medium text-gray-800">${req.studentName}</div>
                                        <div class="text-xs text-gray-400">ID: ${req.studentId}</div>
                                    </td>
                                    <td class="p-3 font-semibold text-gray-700">${req.newPhone}</td>
                                    <td class="p-3 text-gray-600 max-w-xs text-xs truncate" title="${req.reason}">${req.reason}</td>
                                    <td class="p-3 text-xs text-gray-500">${formatDate(req.createdAt)}</td>
                                    <td class="p-3">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                                            status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                                            'bg-yellow-100 text-yellow-800'
                                        }">
                                            ${status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td class="p-3 text-right space-x-1">
                                        ${isPending ? `
                                            <button onclick="handleAdminProcessRequest('${req.id}', 'approved')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium transition-colors">
                                                <i class="fas fa-check mr-1"></i> Approve
                                            </button>
                                            <button onclick="handleAdminProcessRequest('${req.id}', 'rejected')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium transition-colors">
                                                <i class="fas fa-times mr-1"></i> Reject
                                            </button>
                                        ` : `
                                            <span class="text-xs text-gray-400 italic">Processed</span>
                                        `}
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// Handler for Approve / Reject button clicks
function handleAdminProcessRequest(requestId, action) {
    const res = processPhoneRequest(requestId, action);
    if (res.success) {
        if (typeof showToast === 'function') {
            showToast(`Request ${action} successfully!`, 'success');
        } else {
            alert(`Request ${action} successfully!`);
        }
        
        if (window.Router && typeof Router.refresh === 'function') {
            Router.refresh();
        } else if (typeof renderRequestCenter === 'function') {
            const container = document.getElementById('admin-content') || document.querySelector('main');
            if (container) renderRequestCenter(container);
        }
    } else {
        if (typeof showToast === 'function') {
            showToast(res.message, 'error');
        } else {
            alert(res.message);
        }
    }
}

// ============================================
// PLACEHOLDER PAGES
// ============================================


// ============================================
//  UTILITIES & DATA SANITIZATION
// ============================================================================

/** Safe HTML string escaping to protect against XSS */
const escapeHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/** Sanitizes and formats phone numbers for display */
const formatPhone = (phone) => {
    if (!phone) return 'N/A';
    return String(phone).trim();
};

function closeModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    // Hide the modal
    modal.classList.add('hidden');
    modal.style.display = 'none';
    
    // Clear the content
    if (modalContent) {
        modalContent.innerHTML = '';
    }
    
    // Reset modal box styles
    const modalBox = modal.querySelector('.bg-white');
    if (modalBox) {
        // Remove all added classes
        modalBox.className = 'bg-white rounded-2xl max-w-lg w-full mx-4';
        modalBox.style.cssText = '';
    }
}

function addNewRecord() {
    const currentPage = Router.current;
    if (currentPage === 'students') {
        showAddStudentModal();
    } else if (currentPage === 'teachers') {
        showAddTeacherForm();
    } else if (currentPage === 'classes') {
        showAddClassForm();
    } else {
        showToast(`Add new record for ${currentPage} coming soon!`, 'info');
    }
}

// ============================================
// DATE FORMATTING
// ============================================
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        // Check if it's a date input value (YYYY-MM-DD)
        if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const parts = dateString.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        // If it's an ISO date string or Date object
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateString;
    }
}

// ============================================
// SEED DATA (for testing) - Updated for Malawi
// ============================================
function seedData() {
    const students = DataService.get('students');
    if (students.length === 0) {
        showToast('Welcome! Start by adding your first student.', 'info');
    }
}

// ============================================
// 1. SIDEBAR TOGGLE & BROWSER STATE
// ============================================
function setupSidebar() {
    const sidebar = document.getElementById("sidebar");
    const toggleBtn = document.getElementById("sidebar-collapse");
    const mobileBtn = document.getElementById("header-menu-btn");

    if (!sidebar) return;

    const desktop = window.matchMedia("(min-width:1024px)");

    // Desktop collapse/expand
    if (toggleBtn) {
        toggleBtn.addEventListener("click", function() {
            sidebar.classList.toggle("collapsed");
            
            // Update collapse arrow icon
            const icon = document.getElementById("collapse-icon");
            if (icon) {
                icon.className = sidebar.classList.contains("collapsed") 
                    ? "fas fa-chevron-right text-xs" 
                    : "fas fa-chevron-left text-xs";
            }
            
            // Save state in browser memory
            localStorage.setItem("sidebarCollapsed", sidebar.classList.contains("collapsed"));
        });
    }

    // Mobile menu toggle
    if (mobileBtn) {
        mobileBtn.addEventListener("click", function() {
            sidebar.classList.toggle("mobile-open");
        });
    }

    // Restore saved state when reloading on desktop
    if (desktop.matches) {
        if (localStorage.getItem("sidebarCollapsed") === "true") {
            sidebar.classList.add("collapsed");
            const icon = document.getElementById("collapse-icon");
            if (icon) {
                icon.className = "fas fa-chevron-right text-xs";
            }
        }
    }

    // Close mobile sidebar on outside click
    document.addEventListener("click", function(e) {
        if (window.innerWidth < 1024) {
            const isSidebar = sidebar.contains(e.target);
            const isToggle = mobileBtn && mobileBtn.contains(e.target);
            if (!isSidebar && !isToggle) {
                sidebar.classList.remove("mobile-open");
            }
        }
    });

    // Handle screen resize
    window.addEventListener("resize", function() {
        if (window.innerWidth >= 1024) {
            sidebar.classList.remove("mobile-open");
        }
    });
}

// ============================================
// 2. CLOUD/STATIC ROUTING (HASH-BASED)
// ============================================
let activeModuleId = 'dashboard';

/**
 * Renders and updates the sidebar navigation links based on user role
 */
function renderSidebar() {
    const sidebarNav = document.getElementById('sidebar-nav') || 
                       document.getElementById('sidebar-menu') || 
                       document.querySelector('.sidebar-nav') ||
                       document.querySelector('#sidebar ul');

    if (!sidebarNav) return;

    const currentRole = typeof getUserRole === 'function' ? getUserRole() : (currentUser?.role || 'Admin');
    const currentRoute = (typeof Router !== 'undefined' && Router.current) ? Router.current : getDashboardForRole();

    // Default module list if APP_MODULES is not globally accessible
    const modules = (typeof APP_MODULES !== 'undefined' && Array.isArray(APP_MODULES)) ? APP_MODULES : [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt', roles: ['Admin', 'Teacher', 'Accountant'] },
        { id: 'teacher-dashboard', label: 'Teacher Portal', icon: 'fa-chalkboard-teacher', roles: ['Teacher'] },
        { id: 'accountant-dashboard', label: 'Finance Portal', icon: 'fa-calculator', roles: ['Accountant'] },
        { id: 'students', label: 'Students', icon: 'fa-user-graduate', roles: ['Admin', 'Teacher'] },
        { id: 'teachers', label: 'Teachers', icon: 'fa-users', roles: ['Admin'] },
        { id: 'academics', label: 'Academics', icon: 'fa-book', roles: ['Admin', 'Teacher'] },
        { id: 'finance', label: 'Finance', icon: 'fa-wallet', roles: ['Admin', 'Accountant'] },
        { id: 'users', label: 'User Management', icon: 'fa-user-cog', roles: ['Admin'] },
        { id: 'settings', label: 'Settings', icon: 'fa-cog', roles: ['Admin'] }
    ];

    // Filter modules based on user role
    const allowedModules = modules.filter(mod => {
        if (!mod.roles) return true;
        return mod.roles.includes(currentRole);
    });

    // Generate Sidebar Links HTML
    sidebarNav.innerHTML = allowedModules.map(mod => {
        const isActive = (mod.id === currentRoute || (mod.id === 'dashboard' && currentRoute.includes('dashboard')));
        return `
            <li class="nav-item">
                <a href="#${mod.id}" 
                   class="nav-link ${isActive ? 'active' : ''}" 
                   data-page="${mod.id}"
                   onclick="event.preventDefault(); navigateTo('${mod.id}');">
                    <i class="fas ${mod.icon || 'fa-folder'} nav-icon mr-2"></i>
                    <span>${mod.label}</span>
                </a>
            </li>
        `;
    }).join('');
}

function navigateTo(moduleId) {
    const targetModule = APP_MODULES.find(m => m.id === moduleId);
    if (!targetModule) return;

    activeModuleId = moduleId;

    // Keep Hash URL synced for refresh support on hosted environments
    if (window.location.hash !== `#${moduleId}`) {
        window.location.hash = moduleId;
    }

    renderSidebar();

    const mainContainer = document.getElementById('main-content');
    if (mainContainer && typeof targetModule.render === 'function') {
        mainContainer.innerHTML = '';
        targetModule.render(mainContainer);
    }
}

function handleInitialRoute() {
    const hash = window.location.hash.replace('#', '');
    const validModule = APP_MODULES.find(m => m.id === hash);
    const initialModule = validModule ? validModule.id : 'dashboard';
    
    navigateTo(initialModule);
}

// ============================================
// 3. EVENT LISTENERS SETUP
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    setupSidebar();
    handleInitialRoute();
});

window.addEventListener('hashchange', handleInitialRoute);

// ============================================
// COMPLETE APP INITIALIZATION & AUTH SYSTEM
// ============================================
function hideLoadingSpinner() {
    // 1. Hide full-screen loaders or modal overlays
    const loaderElements = document.querySelectorAll(
        '#loading, #app-loader, #auth-spinner, #loading-spinner, .spinner-overlay, .loading-screen, #login-modal'
    );
    loaderElements.forEach(el => {
        el.classList.add('hidden');
        el.style.display = 'none';
    });

    // 2. Restore any spinning login/submit buttons
    document.querySelectorAll('button[type="submit"], #login-btn').forEach(btn => {
        btn.disabled = false;
        if (btn.innerHTML.includes('fa-spinner') || btn.innerHTML.includes('Authenticating')) {
            btn.innerHTML = btn.dataset.originalText || 'Login';
        }
    });

    // 3. Ensure body scroll is re-enabled if locked by a modal
    document.body.classList.remove('overflow-hidden', 'modal-open');
}

let currentUser = null;

/**
 * Main application initializer - transitions UI from Login view to Main App view
 */
function initApp() {
    // 1. Hide Login Screen / Modal / Form Container
    const loginContainers = document.querySelectorAll('#login-screen, #login-modal, #login-container, .login-wrapper');
    loginContainers.forEach(el => {
        el.style.display = 'none';
        el.classList.add('hidden');
    });

    // 2. Show Main App Layout Container & Sidebar
    const appContainers = document.querySelectorAll('#app-layout, #main-layout, #app-container, .app-wrapper, #sidebar');
    appContainers.forEach(el => {
        el.style.display = '';
        el.classList.remove('hidden');
    });

    // 3. Render Sidebar items dynamically for logged-in user
    renderSidebar();

    // 4. Update Header Profile & User Info
    if (typeof updateUserProfile === 'function') {
        updateUserProfile();
    }

    // 5. Dismiss all spinning indicators
    hideLoadingSpinner();
}

/**
 * Show Fullscreen Login Page
 */
function showLoginPage() {
    document.body.innerHTML = `
        <div class="min-h-screen bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
                <div class="text-center mb-8">
                    <h1 class="text-2xl font-bold text-gray-800">Bandawe Girls Secondary School</h1>
                    <p class="text-gray-500 text-sm">Information Management System</p>
                    <div class="border-t border-gray-200 my-4"></div>
                    <p class="text-gray-600 font-semibold">Login to continue</p>
                </div>
                
                <form id="loginForm">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Username or Email</label>
                            <input type="text" id="login-username" required 
                                   class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                   placeholder="Enter your username or email">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <input type="password" id="login-password" required 
                                   class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                   placeholder="Enter your password">
                        </div>
                    </div>
                    
                    <div id="login-error" class="mt-3 text-red-600 text-sm hidden"></div>
                    
                    <button type="submit" id="btn-login-submit"
                            class="mt-6 w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition font-semibold flex items-center justify-center">
                        <i class="fas fa-sign-in-alt mr-2"></i> <span>Login</span>
                    </button>
                </form>
                
                <div class="mt-6 text-center text-xs text-gray-400">
                    <p>Demo Admin: admin@school.com | password: admin123</p>
                    <p class="mt-1">Demo Teacher: teacher@school.com | password: teacher123</p>
                </div>
            </div>
        </div>
    `;
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.onsubmit = function(e) {
            e.preventDefault();
            loginUser();
        };
    }
}

function renderLoginForm() {
    showLoginPage();
}

async function loginUser(event) {
    if (event) event.preventDefault();

    // 1. Get Login Button & Show Spinner
    const loginForm = document.getElementById('loginForm') || document.forms['loginForm'];
    const loginBtn = document.getElementById('login-btn') || 
                     (loginForm ? loginForm.querySelector('button[type="submit"]') : null) || 
                     document.querySelector('button[type="submit"]');
                     
    const originalBtnHtml = loginBtn ? loginBtn.innerHTML : 'Login';

    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Authenticating...`;
    }

    const resetBtn = () => {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = originalBtnHtml;
        }
    };

    try {
        const identifierInput = (
            document.getElementById('login-username')?.value || 
            document.getElementById('email')?.value || ''
        ).trim();

        const passwordInput = (
            document.getElementById('login-password')?.value || 
            document.getElementById('password')?.value || ''
        ).trim();

        if (!identifierInput || !passwordInput) {
            showToast('Please enter both username/email and password.', 'error');
            resetBtn();
            return;
        }

        // 2. Resolve User Profile from Local Database
        const users = DataService.get('users') || [];
        const matchedUser = users.find(u => 
            (u.username && u.username.toLowerCase() === identifierInput.toLowerCase()) || 
            (u.email && u.email.toLowerCase() === identifierInput.toLowerCase())
        );

        let targetEmail = identifierInput;
        if (matchedUser && matchedUser.email) {
            targetEmail = matchedUser.email;
        } else if (!identifierInput.includes('@')) {
            targetEmail = `${identifierInput.toLowerCase()}@school.com`;
        }

        let authenticatedUser = null;

        // 3. Attempt Firebase Authentication
        try {
            let userCredential = null;
            if (window.firebaseAuth && window.signInWithEmailAndPassword) {
                userCredential = await window.signInWithEmailAndPassword(window.firebaseAuth, targetEmail, passwordInput);
            } else if (typeof firebase !== 'undefined' && firebase.auth) {
                userCredential = await firebase.auth().signInWithEmailAndPassword(targetEmail, passwordInput);
            }

            if (userCredential) {
                authenticatedUser = matchedUser || {
                    uid: userCredential.user.uid,
                    username: identifierInput,
                    email: userCredential.user.email,
                    role: 'Teacher'
                };
            }
        } catch (fbErr) {
            console.warn("Firebase authentication bypassed; falling back to local verification.");
        }

        // 4. Local Database Verification Fallback
        if (!authenticatedUser && matchedUser && matchedUser.password === passwordInput) {
            authenticatedUser = matchedUser;
        }
        
        // Inside loginUser() -- Handle Successful Authentication Block:
        if (authenticatedUser) {
            window.currentUser = authenticatedUser;
            currentUser = authenticatedUser;
            localStorage.setItem('currentUser', JSON.stringify(authenticatedUser));

            showToast('Logged in successfully!', 'success');

            // Instantly transition view from Login to App Layout
            initApp();

            // Resolve role target page
            const targetPage = getDashboardForRole();

            // Navigate without refreshing
            if (typeof navigateTo === 'function') {
                navigateTo(targetPage);
            } else if (typeof Router !== 'undefined' && Router.navigate) {
                Router.navigate(targetPage);
            }

            // Sync navigation highlight and page content
            refreshApp();
            return;
        }

        // 6. Handle Invalid Credentials
        showToast('Invalid username/email or password.', 'error');
        resetBtn();

    } catch (err) {
        console.error("Login process error:", err);
        showToast('Invalid username or password.', 'error');
        hideLoadingSpinner(); 
    }
}

/**
 * Logout Handlers
 */
async function logoutUser() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            if (typeof auth !== 'undefined' && auth) await auth.signOut();
        } catch (e) {
            console.error("Logout Error:", e);
        }
        currentUser = null;
        localStorage.removeItem('currentUser');
        window.location.reload();
    }
}

function handleLogout() {
    logoutUser();
}

/**
 * Update Sidebar & Top Header Profile Info
 */
function updateUserProfile() {
    if (!currentUser) return;

    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    if (nameEl) nameEl.textContent = currentUser.fullName || currentUser.username || 'User';
    if (roleEl) roleEl.textContent = currentUser.role || 'Member';

    const headerInfoEl = document.getElementById('user-header-info');
    if (headerInfoEl) {
        headerInfoEl.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-sm font-medium text-gray-700 hidden sm:inline-block">${currentUser.email}</span>
                <button onclick="handleLogout()" class="text-gray-500 hover:text-red-600 transition p-1" title="Logout">
                    <i class="fas fa-sign-out-alt text-lg"></i>
                </button>
            </div>
        `;
    }
}

/**
 * Auth Guard Checks
 */
function checkAuth() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            return true;
        } catch (e) {
            localStorage.removeItem('currentUser');
        }
    }
    if (typeof auth !== 'undefined' && auth.currentUser) return true;
    return false;
}

function getUserRole() { return currentUser ? currentUser.role : null; }
function isAdmin() { return getUserRole() === 'Admin'; }
function isTeacher() { return getUserRole() === 'Teacher'; }
function isAccountant() { return getUserRole() === 'Accountant'; }
function hasAccess(allowedRoles) {
    if (!currentUser) return false;
    return allowedRoles.includes(currentUser.role);
}

function requireAuth() {
    if (!checkAuth()) {
        showLoginPage();
        return false;
    }
    return true;
}

/**
 * DOM Loaded & Auth Observer Entry Points
 */
// ============================================
// INITIALIZATION & ROUTE HANDLERS
// ============================================

/**
 * Handles initial page load and hash changes (F5 / Back / Forward)
 */
function handleInitialRoute() {
    // 1. Ensure user session is hydrated from localStorage if memory state was cleared by refresh
    if (!currentUser) {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            try {
                currentUser = JSON.parse(savedUser);
                window.currentUser = currentUser;
            } catch (e) {
                console.error("Error parsing saved session user:", e);
            }
        }
    }

    // 2. If no user is logged in, show login page
    if (!currentUser && (!window.firebaseAuth || !window.firebaseAuth.currentUser)) {
        if (typeof showLoginPage === 'function') showLoginPage();
        return;
    }

    // 3. Resolve target module route
    const hash = window.location.hash.replace('#', '');
    const validModule = (typeof APP_MODULES !== 'undefined') ? APP_MODULES.find(m => m.id === hash) : null;

    // Fall back to role-specific dashboard (NOT hardcoded 'dashboard')
    const targetModule = validModule ? validModule.id : getDashboardForRole();

    // 4. Navigate and run full app refresh
    if (typeof navigateTo === 'function') {
        navigateTo(targetModule);
    } else if (typeof Router !== 'undefined' && typeof Router.navigate === 'function') {
        Router.navigate(targetModule);
    }

    // 5. Sync UI states, user profiles, and navigation links
    if (typeof refreshApp === 'function') {
        refreshApp();
    }
}

// Single, clean DOMContentLoaded Event Listener
document.addEventListener('DOMContentLoaded', () => {
    // Restore session if available
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser && !currentUser) {
        try {
            currentUser = JSON.parse(savedUser);
            window.currentUser = currentUser;
        } catch (e) {}
    }

    if (currentUser) {
        if (typeof initApp === 'function') initApp();
        handleInitialRoute();
    } else {
        if (typeof showLoginPage === 'function') showLoginPage();
    }
});

// Firebase Auth Observer (Preserves Local DB sessions during fallback)
if (typeof auth !== 'undefined' && auth) {
    auth.onAuthStateChanged(async (fbUser) => {
        if (fbUser) {
            // Fetch/Sync user details from Firestore if connected
            if (!currentUser || currentUser.uid !== fbUser.uid) {
                currentUser = {
                    uid: fbUser.uid,
                    email: fbUser.email,
                    username: fbUser.email ? fbUser.email.split('@')[0] : 'User',
                    role: 'Admin'
                };

                try {
                    if (typeof db !== 'undefined' && db) {
                        const docSnap = await db.collection('users').doc(fbUser.uid).get();
                        if (docSnap.exists) {
                            const data = docSnap.data();
                            currentUser.role = data.role || 'Admin';
                            currentUser.fullName = data.fullName || fbUser.displayName;
                        }
                    }
                } catch (e) {
                    console.warn("Firestore sync warning:", e);
                }

                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                window.currentUser = currentUser;
            }

            if (typeof initApp === 'function') initApp();
            if (typeof refreshApp === 'function') refreshApp();

        } else {
            // BEFORE WIPING: Check if user exists via Local DB login backup
            const savedUser = localStorage.getItem('currentUser');
            if (savedUser) {
                try {
                    currentUser = JSON.parse(savedUser);
                    window.currentUser = currentUser;
                    // Preserve local user without clearing session
                    return;
                } catch (e) {}
            }

            // No active session in Firebase or Local DB -> Clear and redirect to login
            currentUser = null;
            window.currentUser = null;
            localStorage.removeItem('currentUser');
            if (typeof showLoginPage === 'function') showLoginPage();
        }
    });
}

// Listen for page refresh and browser history back/forward actions
window.addEventListener('DOMContentLoaded', handleInitialRoute);
window.addEventListener('hashchange', handleInitialRoute);

// Global scope exports for console debugging and HTML handlers
window.initApp = initApp;
window.showLoginPage = showLoginPage;
window.renderLoginForm = renderLoginForm;
window.handleLogout = handleLogout;
window.logoutUser = logoutUser;
window.showToast = showToast;
window.closeModal = closeModal;
window.addNewRecord = addNewRecord;
window.DataService = DataService;