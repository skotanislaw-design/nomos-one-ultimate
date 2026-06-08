import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({ baseURL: API_URL });

// Auto-attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nomos_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401; payment gate block on 402
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/login')) {
      localStorage.removeItem('nomos_token');
      localStorage.removeItem('nomos_user');
      window.location.href = '/login';
    }
    if (err.response?.status === 402) {
      const detail = err.response.data?.detail || err.response.data || {};
      window.dispatchEvent(new CustomEvent('payment-gate-block', { detail: typeof detail === 'string' ? { message: detail } : detail }));
    }
    return Promise.reject(err);
  }
);

// ═══════════════ AUTH ═══════════════
export const authApi = {
  login: (email: string, password: string) => api.post('/api/auth/login', { email, password }),
  me: () => api.get('/api/auth/me'),
  changePassword: (current_password: string, new_password: string) => api.post('/api/auth/change-password', { current_password, new_password }),
  verifyPassword: (current_password: string) => api.post('/api/auth/verify-password', { current_password }),
};

// ═══════════════ USERS ═══════════════
export const profileApi = {
  update: (data: { full_name?: string; email?: string; phone?: string }) =>
    api.put('/api/users/me', data),
};

export const usersApi = {
  list: () => api.get('/api/users'),
  create: (data: any) => api.post('/api/users', data),
  update: (id: string, data: any) => api.put(`/api/users/${id}`, data),
  delete: (id: string) => api.delete(`/api/users/${id}`),
  lawyers: () => api.get('/api/users/lawyers'),
  // User registration and approval
  register: (data: any) => api.post('/api/auth/register', data),
  listPendingUsers: () => api.get('/api/admin/pending-users'),
  approveUser: (id: string) => api.post(`/api/admin/users/${id}/approve`),
  rejectUser: (id: string) => api.post(`/api/admin/users/${id}/reject`),
};

// ═══════════════ CLIENTS ═══════════════
export const clientsApi = {
  list: () => api.get('/api/clients'),
  get: (id: string) => api.get(`/api/clients/${id}`),
  getCases: (id: string) => api.get(`/api/clients/${id}/cases`),
  create: (data: any) => api.post('/api/clients', data),
  update: (id: string, data: any) => api.put(`/api/clients/${id}`, data),
  export: (id: string) => api.get(`/api/clients/${id}/export`),
};

// ═══════════════ CASES ═══════════════
export const casesApi = {
  list: (status?: string) => api.get('/api/cases', { params: status ? { status } : {} }),
  get: (id: string) => api.get(`/api/cases/${id}`),
  create: (data: any) => api.post('/api/cases', data),
  update: (id: string, data: any) => api.put(`/api/cases/${id}`, data),
  updateStatus: (id: string, data: any) => api.patch(`/api/cases/${id}/status`, data),
  export: (id: string) => api.get(`/api/cases/${id}/export`),
  stagnant: () => api.get('/api/cases/stagnant'),
  // Documents per case
  getDocuments: (id: string) => api.get(`/api/cases/${id}/documents`),
  uploadDocument: (id: string, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post(`/api/cases/${id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  // Notes per case
  getNotes: (id: string) => api.get(`/api/cases/${id}/notes`),
  addNote: (id: string, data: any) => api.post(`/api/cases/${id}/notes`, data),
  // Financials per case
  getFinancials: (id: string) => api.get(`/api/cases/${id}/financials`),
  addFinancial: (id: string, data: any) => api.post(`/api/cases/${id}/financials`, data),
  updateFinancial: (id: string, entryId: string, data: any) => api.put(`/api/cases/${id}/financials/${entryId}`, data),
  deleteFinancial: (id: string, entryId: string) => api.delete(`/api/cases/${id}/financials/${entryId}`),
  // Parties per case
  getParties: (id: string) => api.get(`/api/cases/${id}/parties`),
  addParty: (id: string, data: any) => api.post(`/api/cases/${id}/parties`, data),
  updateParty: (id: string, partyId: string, data: any) => api.put(`/api/cases/${id}/parties/${partyId}`, data),
  deleteParty: (id: string, partyId: string) => api.delete(`/api/cases/${id}/parties/${partyId}`),
  // Deadlines per case
  getDeadlines: (id: string) => api.get(`/api/cases/${id}/deadlines`),
  // Invoices per case
  getInvoices: (id: string) => api.get(`/api/cases/${id}/invoices`),
  // Invoicing context: expenses + grammatia + rates
  getInvoicingContext: (id: string) => api.get(`/api/cases/${id}/invoicing-context`),
  // Checklist per case
  getChecklist: (id: string) => api.get(`/api/cases/${id}/checklist`),
  checkItem: (id: string, idx: number, done: boolean) => api.patch(`/api/cases/${id}/checklist/${idx}`, null, { params: { done } }),
  resetChecklist: (id: string) => api.post(`/api/cases/${id}/checklist/reset`),
  // Workflow per case
  updateWorkflow: (id: string, data: any) => api.patch(`/api/cases/${id}/workflow`, data),
};

// ═══════════════ DOCUMENTS ═══════════════
export const documentsApi = {
  download: (id: string) => api.get(`/api/documents/${id}/download`, { responseType: 'blob' }),
  archive: (id: string) => api.patch(`/api/documents/${id}/archive`),
  delete: (id: string) => api.delete(`/api/documents/${id}`),
};

// ═══════════════ DEADLINES ═══════════════
export const deadlinesApi = {
  list: () => api.get('/api/deadlines'),
  upcoming: (days = 14) => api.get('/api/deadlines/upcoming', { params: { days } }),
  create: (data: any) => api.post('/api/deadlines', data),
  update: (id: string, data: any) => api.put(`/api/deadlines/${id}`, data),
  delete: (id: string) => api.delete(`/api/deadlines/${id}`),
};

// ═══════════════ CALENDAR ENGINE ═══════════════
export const calendarApi = {
  holidays:      (year: number) => api.get('/api/calendar/holidays', { params: { year } }),
  vacations:     (year: number) => api.get('/api/calendar/vacations', { params: { year } }),
  deadlineTypes: () => api.get('/api/calendar/deadline-types'),
  calculate:     (data: { start_date: string; law_code: string; deadline_type_id: string; notes?: string }) =>
                   api.post('/api/calendar/calculate', data),
  week:          (date?: string) => api.get('/api/calendar/week', { params: date ? { date } : {} }),
};

// ═══════════════ INVOICING ═══════════════
export const invoicingApi = {
  calculate: (data: any) => api.post('/api/invoicing/calculate', data),
  create: (data: any) => api.post('/api/invoices', data),
  list: () => api.get('/api/invoices'),
  get: (id: string) => api.get(`/api/invoices/${id}`),
};

// ═══════════════ TEMPLATES ═══════════════
export const templatesApi = {
  list: () => api.get('/api/templates'),
  get: (id: string) => api.get(`/api/templates/${id}`),
  fill: (id: string, params: { case_id?: string; client_id?: string }) =>
    api.post(`/api/templates/${id}/fill`, null, { params }),
  generate: (id: string, data: any) => api.post(`/api/templates/${id}/generate`, data, { responseType: 'blob' }),
};

// ═══════════════ EXPENSES ═══════════════
export const expensesApi = {
  list: () => api.get('/api/expenses'),
  create: (data: any) => api.post('/api/expenses', data),
  delete: (id: string) => api.delete(`/api/expenses/${id}`),
};

// ═══════════════ SEARCH ═══════════════
export const searchApi = {
  search: (q: string) => api.get('/api/search', { params: { q } }),
};

// ═══════════════ DASHBOARD ═══════════════
export const dashboardApi = {
  stats: () => api.get('/api/dashboard/stats'),
  kpi: () => api.get('/api/kpi/summary'),
};

// ═══════════════ AUDIT ═══════════════
export const auditApi = {
  logs: (params?: any) => api.get('/api/audit-logs', { params }),
  listByCaseId: (caseId: string) => api.get(`/api/audit-logs?case_id=${caseId}`),
};

// ═══════════════ SETTINGS ═══════════════
export const settingsApi = {
  get: () => api.get('/api/settings'),
  update: (data: any) => api.put('/api/settings', data),
  sendTestEmail: (to_email: string) => api.post('/api/email/send', {
    to_email,
    to_name: 'Admin',
    subject: 'NOMOS ONE — Δοκιμαστικό Email',
    body_html: '<div style="font-family:Arial,sans-serif;padding:24px"><h2 style="color:#C6A75E">NOMOS ONE</h2><p>Το SMTP λειτουργεί σωστά! ✓</p><p style="color:#888;font-size:12px">Σκοτάνης &amp; Συνεργάτες</p></div>',
    body_text: 'NOMOS ONE — Το SMTP λειτουργεί σωστά!',
  }),
};

// ═══════════════ PIPELINE / LEADS ═══════════════
export const leadsApi = {
  list: () => api.get('/api/leads'),
  pipeline: () => api.get('/api/leads/pipeline'),
  get: (id: string) => api.get(`/api/leads/${id}`),
  create: (data: any) => api.post('/api/leads', data),
  update: (id: string, data: any) => api.put(`/api/leads/${id}`, data),
  updateStage: (id: string, data: any) => api.patch(`/api/leads/${id}/stage`, data),
  delete: (id: string) => api.delete(`/api/leads/${id}`),
};

// ═══════════════ WORKFLOW ═══════════════
export const workflowApi = {
  templates: () => api.get('/api/workflow/templates'),
  stuckCases: () => api.get('/api/cases/workflow/stuck'),
  noNextAction: () => api.get('/api/cases/workflow/no-next-action'),
  checklists: () => api.get('/api/checklists/templates'),
};

// ═══════════════ BILLING ENGINE ═══════════════
export const billingApi = {
  reminders: () => api.get('/api/billing/reminders'),
  createReminder: (data: any) => api.post('/api/billing/reminders', data),
  advanceReminder: (id: string) => api.patch(`/api/billing/reminders/${id}/advance`),
  updateReminderStatus: (id: string, data: any) => api.patch(`/api/billing/reminders/${id}/status`, data),
  collectionRate: () => api.get('/api/billing/collection-rate'),
  overdue: () => api.get('/api/billing/overdue'),
};

// ═══════════════ PAYMENTS ═══════════════
export const paymentsApi = {
  list: (params?: { case_id?: string; client_id?: string }) => api.get('/api/payments', { params }),
  get: (id: string) => api.get(`/api/payments/${id}`),
  create: (data: any) => api.post('/api/payments', data),
  delete: (id: string) => api.delete(`/api/payments/${id}`),
  forCase: (caseId: string) => api.get(`/api/cases/${caseId}/payments`),
};

// ═══════════════ HEARINGS ═══════════════
export const hearingsApi = {
  list: () => api.get('/api/hearings'),
  forCase: (caseId: string) => api.get(`/api/cases/${caseId}/hearings`),
  create: (data: any) => api.post('/api/hearings', data),
  update: (id: string, data: any) => api.put(`/api/hearings/${id}`, data),
  delete: (id: string) => api.delete(`/api/hearings/${id}`),
};

// ═══════════════ EMAIL ═══════════════
export const emailApi = {
  send: (data: {
    to_email: string; to_name?: string; subject: string;
    body_html: string; body_text?: string; invoice_id?: string;
  }) => api.post('/api/email/send', data),
  logs: () => api.get('/api/email/logs'),
};

// ═══════════════ ΠΙΝΑΚΕΙΑ ═══════════════
export const pinakiaApi = {
  list: () => api.get('/api/pinakia'),
  get: (id: string) => api.get(`/api/pinakia/${id}`),
  byDate: (date: string) => api.get(`/api/pinakia/hearings?date=${date}`),
  search: (q: string) => api.get(`/api/pinakia/search?q=${encodeURIComponent(q)}`),
  upload: (formData: FormData) => api.post('/api/pinakia/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (id: string) => api.delete(`/api/pinakia/${id}`),
};

// ═══════════════ LINDY AI ═══════════════
export const lindyApi = {
  forward: (data: { message?: string; source?: string; metadata?: any }) =>
    api.post('/api/lindy/forward', data),
};

// ═══════════════ EXPORT ═══════════════
export const exportApi = {
  invoicePdf: (id: string) => api.get(`/api/invoices/${id}/pdf`, { responseType: 'blob' }),
  invoicesExcel: () => api.get('/api/invoices/export/excel', { responseType: 'blob' }),
  clientsExcel: () => api.get('/api/clients/export/excel', { responseType: 'blob' }),
  casesExcel: () => api.get('/api/cases/export/excel', { responseType: 'blob' }),
};

// ═══════════════ HEALTH ═══════════════
export const healthApi = {
  check: () => api.get('/api/health'),
};

// ═══════════════ PORTAL ═══════════════
// Separate API instance for portal with portal token
const portalApi_instance = axios.create({ baseURL: API_URL });

// Auto-attach portal JWT token
portalApi_instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('nomos_portal_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401 for portal
portalApi_instance.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url?.includes('/api/portal/auth')) {
      localStorage.removeItem('nomos_portal_token');
      window.location.href = '/portal/login';
    }
    return Promise.reject(err);
  }
);

export const portalApi = {
  // Portal authentication
  login: (name: string, case_category: string, portal_code: string, source?: string) =>
    portalApi_instance.post('/api/portal/auth', { name, case_category, portal_code, ...(source ? { source } : {}) }),

  // Portal case access
  getCase: () => portalApi_instance.get('/api/portal/my-case'),
  getEvents: () => portalApi_instance.get('/api/portal/case-events'),

  // Portal messaging
  sendMessage: (content: string, subject?: string) =>
    portalApi_instance.post('/api/portal/messages', { content, subject }),
  getMessages: () => portalApi_instance.get('/api/portal/messages'),

  // Portal progress (hearings + deadlines)
  getProgress: () => portalApi_instance.get('/api/portal/progress'),

  // Portal financials (detailed)
  getFinancials: () => portalApi_instance.get('/api/portal/financials'),

  // Portal document upload (staged → confirm)
  uploadDocument: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return portalApi_instance.post('/api/portal/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  confirmUpload: () => portalApi_instance.post('/api/portal/upload-confirm'),

  // Portal forgot password
  forgotPassword: (name: string, case_category: string) =>
    portalApi_instance.post('/api/portal/forgot-password', { name, case_category }),

  // Accept mandate on first login
  acceptMandate: () => portalApi_instance.post('/api/portal/accept-mandate'),
};

// ═══════════════ ADMIN PORTAL MANAGEMENT ═══════════════
export const notificationsApi = {
  list: () => api.get('/api/notifications'),
};


export const adminPortalApi = {
  generatePortalAccess: (client_id: string, case_id: string, permissions: string[]) =>
    api.post(`/api/admin/clients/${client_id}/generate-portal-access`, { case_id, permissions }),

  updatePortalPermissions: (case_id: string, permissions: string[]) =>
    api.patch(`/api/admin/cases/${case_id}/portal-permissions`, { permissions }),

  listPortalAccess:    () => api.get('/api/admin/portal-access'),
  listResetRequests:   () => api.get('/api/admin/portal-reset-requests'),
  listPortalDocuments: () => api.get('/api/admin/portal-documents'),

  approveResetRequest: (request_id: string) =>
    api.post(`/api/admin/portal-reset-requests/${request_id}/approve`),
  rejectResetRequest: (request_id: string) =>
    api.post(`/api/admin/portal-reset-requests/${request_id}/reject`),

  approvePortalDocument: (doc_id: string) =>
    api.post(`/api/admin/portal-documents/${doc_id}/approve`),
  rejectPortalDocument: (doc_id: string) =>
    api.post(`/api/admin/portal-documents/${doc_id}/reject`),

  deletePortalAccess: (code_id: string) =>
    api.delete(`/api/admin/portal-access/${code_id}`),

  // Admin portal message inbox
  listPortalMessages:    () => api.get('/api/admin/portal-messages'),
  markMessageRead:       (msg_id: string) => api.patch(`/api/admin/portal-messages/${msg_id}/read`),
  replyToPortalMessage:  (msg_id: string, content: string) =>
    api.post(`/api/admin/portal-messages/${msg_id}/reply`, { content }),
};

// ═══════════════ LINDA AI ═══════════════
export const lindaApi = {
  chat: (message: string, history: { role: string; content: string }[]) =>
    api.post('/api/linda/chat', { message, history }, { responseType: 'stream' }),
};



export const intakeApi = {
  analyze: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/api/intake/analyze', fd);
  },
  confirm: (payload: { extracted: any; file_b64: string; filename: string; media_type: string }) =>
    api.post('/api/intake/confirm', payload),
};

export const gdriveApi = {
  status: () => api.get('/api/integrations/gdrive/status'),
  setup: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/api/integrations/gdrive/setup', fd);
  },
};
export const aiApi = {
  extractDocument: (file: File, documentType: string = 'auto') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('document_type', documentType);
    return api.post('/api/ai/extract-document', fd);
  }
};
// ═══════════════ CRIMINAL CASES ═══════════════
export const criminalApi = {
  // Cases
  list: () => api.get('/api/criminal/cases'),
  create: (data: any) => api.post('/api/criminal/cases', data),
  get: (id: string) => api.get(`/api/criminal/cases/${id}`),
  update: (id: string, data: any) => api.patch(`/api/criminal/cases/${id}`, data),
  delete: (id: string) => api.delete(`/api/criminal/cases/${id}`),
  health: (id: string) => api.get(`/api/criminal/cases/${id}/health`),
  // Parties
  listParties: (id: string) => api.get(`/api/criminal/cases/${id}/parties`),
  createParty: (id: string, data: any) => api.post(`/api/criminal/cases/${id}/parties`, data),
  deleteParty: (id: string, partyId: string) => api.delete(`/api/criminal/cases/${id}/parties/${partyId}`),
  // Events
  listEvents: (id: string) => api.get(`/api/criminal/cases/${id}/events`),
  createEvent: (id: string, data: any) => api.post(`/api/criminal/cases/${id}/events`, data),
  deleteEvent: (id: string, eventId: string) => api.delete(`/api/criminal/cases/${id}/events/${eventId}`),
  // Documents
  listDocuments: (id: string) => api.get(`/api/criminal/cases/${id}/documents`),
  uploadDocument: (id: string, formData: FormData) => api.post(`/api/criminal/cases/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' }}),
  deleteDocument: (id: string, docId: string) => api.delete(`/api/criminal/cases/${id}/documents/${docId}`),
  // Evidence
  listEvidence: (id: string) => api.get(`/api/criminal/cases/${id}/evidence`),
  createEvidence: (id: string, data: any) => api.post(`/api/criminal/cases/${id}/evidence`, data),
  deleteEvidence: (id: string, evId: string) => api.delete(`/api/criminal/cases/${id}/evidence/${evId}`),
  // Issues
  listIssues: (id: string) => api.get(`/api/criminal/cases/${id}/issues`),
  createIssue: (id: string, data: any) => api.post(`/api/criminal/cases/${id}/issues`, data),
  deleteIssue: (id: string, issueId: string) => api.delete(`/api/criminal/cases/${id}/issues/${issueId}`),
  // Tasks
  listTasks: (id: string) => api.get(`/api/criminal/cases/${id}/tasks`),
  createTask: (id: string, data: any) => api.post(`/api/criminal/cases/${id}/tasks`, data),
  updateTask: (id: string, taskId: string, data: any) => api.patch(`/api/criminal/cases/${id}/tasks/${taskId}`, data),
  deleteTask: (id: string, taskId: string) => api.delete(`/api/criminal/cases/${id}/tasks/${taskId}`),
  // Outputs
  listOutputs: (id: string) => api.get(`/api/criminal/cases/${id}/outputs`),
  generateOutput: (id: string, data: any) => api.post(`/api/criminal/cases/${id}/outputs/generate`, data),
  updateOutput: (id: string, outId: string, data: any) => api.patch(`/api/criminal/cases/${id}/outputs/${outId}`, data),
  deleteOutput: (id: string, outId: string) => api.delete(`/api/criminal/cases/${id}/outputs/${outId}`),
  exportOutput: (id: string, outId: string, format: string) => api.get(`/api/criminal/cases/${id}/outputs/${outId}/export?format=${format}`, { responseType: 'blob' }),
  // Audit
  caseAudit: (id: string) => api.get(`/api/criminal/cases/${id}/audit`),
};

export default api;
