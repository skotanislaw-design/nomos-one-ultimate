import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({ baseURL: API_URL });

// Auto-attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nomos_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/login')) {
      localStorage.removeItem('nomos_token');
      localStorage.removeItem('nomos_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ═══════════════ AUTH ═══════════════
export const authApi = {
  login: (email: string, password: string) => api.post('/api/auth/login', { email, password }),
  me: () => api.get('/api/auth/me'),
  changePassword: (current_password: string, new_password: string) => api.post('/api/auth/change-password', { current_password, new_password }),
};

// ═══════════════ USERS ═══════════════
export const usersApi = {
  list: () => api.get('/api/users'),
  create: (data: any) => api.post('/api/users', data),
  update: (id: string, data: any) => api.put(`/api/users/${id}`, data),
  delete: (id: string) => api.delete(`/api/users/${id}`),
  lawyers: () => api.get('/api/users/lawyers'),
};

// ═══════════════ CLIENTS ═══════════════
export const clientsApi = {
  list: () => api.get('/api/clients'),
  get: (id: string) => api.get(`/api/clients/${id}`),
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
  fill: (id: string, data: any) => api.post(`/api/templates/${id}/fill`, data),
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
};

// ═══════════════ SETTINGS ═══════════════
export const settingsApi = {
  get: () => api.get('/api/settings'),
  update: (data: any) => api.put('/api/settings', data),
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

export default api;
