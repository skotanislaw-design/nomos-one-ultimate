import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import {
  LayoutDashboard, Users, Briefcase, Calendar, FileText, Receipt, CreditCard,
  BarChart3, Settings, LogOut, ChevronLeft, ChevronRight, X, Menu, Bell,
  ChevronDown, User, Shield, Scale, TrendingUp, ClipboardList, GitBranch,
  FileCheck, Bot, Lock, Activity, Sliders, HardDrive, Inbox, Banknote,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';

// Pages
import Dashboard from '@/pages/Dashboard';
import ClientsPage from '@/pages/ClientsPage';
import CasesPage from '@/pages/CasesPage';
import CaseDetailPage from '@/pages/CaseDetailPage';
import CalendarPage from '@/pages/CalendarPage';
import ExpensesPage from '@/pages/ExpensesPage';
import InvoicingPage from '@/pages/InvoicingPage';
import BillingPage from '@/pages/BillingPage';
import CRMWorkflowPage from '@/pages/CRMWorkflowPage';
import ReceiptPage from '@/pages/ReceiptPage';
import TemplatesPage from '@/pages/TemplatesPage';
import ReportsPage from '@/pages/ReportsPage';
import AuditPage from '@/pages/AuditPage';
import UsersPage from '@/pages/UsersPage';
import SettingsPage from '@/pages/SettingsPage';
import ProfilePage from '@/pages/ProfilePage';
import SkotanisBot from '@/pages/SkotanisBot';
import AIIntakePage from '@/pages/AIIntakePage';
import DocumentVaultPage from '@/pages/DocumentVaultPage';
import PreferencesPage from '@/pages/PreferencesPage';
import PaymentsPage from '@/pages/PaymentsPage';
import AdminPortalPage from '@/pages/AdminPortalPage';

type NavItem = { id: string; path: string; label: string; icon: React.ElementType; section: string };

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { id: 'clients', path: '/clients', label: 'Πελάτες', icon: Users, section: 'clients' },
  { id: 'cases', path: '/cases', label: 'Υποθέσεις', icon: Briefcase, section: 'cases' },
  { id: 'documents', path: '/documents', label: 'Θησαυροφυλάκιο', icon: HardDrive, section: 'cases' },
  { id: 'calendar', path: '/calendar', label: 'Ημερολόγιο', icon: Calendar, section: 'calendar' },
  { id: 'expenses', path: '/expenses', label: 'Έξοδα', icon: Receipt, section: 'expenses' },
  { id: 'invoicing', path: '/invoicing', label: 'Τιμολόγηση', icon: CreditCard, section: 'invoicing' },
  { id: 'receipt', path: '/receipt', label: 'Αποδείξεις', icon: Receipt, section: 'invoicing' },
  { id: 'payments', path: '/payments', label: 'Πληρωμές', icon: Banknote, section: 'invoicing' },
  { id: 'billing', path: '/billing', label: 'Billing Engine', icon: TrendingUp, section: 'billing' },
  { id: 'intake', path: '/intake', label: 'AI Intake', icon: Inbox, section: 'dashboard' },
  { id: 'crm-workflow', path: '/crm-workflow', label: 'CRM & Workflow', icon: GitBranch, section: 'crm' },
  { id: 'templates', path: '/templates', label: 'Πρότυπα', icon: FileCheck, section: 'templates' },
  { id: 'reports', path: '/reports', label: 'Αναφορές', icon: BarChart3, section: 'reports' },
  { id: 'users', path: '/users', label: 'Χρήστες', icon: Shield, section: 'users' },
  { id: 'admin-portal', path: '/admin-portal', label: 'Πύλη Πελάτη', icon: Lock, section: 'users' },
  { id: 'settings', path: '/settings', label: 'Ρυθμίσεις', icon: Settings, section: 'settings' },
];

// Fake notification count — in a real app this comes from the backend
const NOTIF_COUNT = 3;

export default function AppShell() {
  const { user, logout } = useAuth();
  const perms = usePermissions();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifRead, setNotifRead] = useState(false);
  const [clock, setClock] = useState('');
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000);
    return () => clearInterval(t);
  }, []);

  // Path tracking
  useEffect(() => {
    const handleNav = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handleNav);
    return () => window.removeEventListener('popstate', handleNav);
  }, []);

  // Click outside to close dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setMobileOpen(false);
    setShowProfileMenu(false);
    setShowNotifications(false);
  };

  const visibleNav = NAV_ITEMS.filter(n => perms.canView(n.section as any));
  const sidebarW = collapsed ? 72 : 260;
  const initials = (user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const pageTitles: Record<string, string> = {
    '/': 'Dashboard', '/clients': 'Πελάτες', '/cases': 'Υποθέσεις', '/calendar': 'Ημερολόγιο',
    '/expenses': 'Έξοδα', '/invoicing': 'Τιμολόγηση', '/billing': 'Billing Engine',
    '/crm-workflow': 'CRM & Workflow', '/receipt': 'Αποδείξεις', '/templates': 'Πρότυπα',
    '/reports': 'Αναφορές', '/audit': 'Audit Log', '/users': 'Χρήστες',
    '/settings': 'Ρυθμίσεις', '/profile': 'Προφίλ', '/bot': 'Nomos AI',
    '/intake': 'AI Document Intake', '/documents': 'Θησαυροφυλάκιο', '/preferences': 'Προτιμήσεις',
    '/payments': 'Πληρωμές', '/admin-portal': 'Διαχείριση Πύλης Πελάτη',
  };

  // Mock notifications
  const notifications = [
    { id: 1, type: 'overdue', msg: '3 ληξιπρόθεσμα τιμολόγια', time: 'πριν 5λ', path: '/billing' },
    { id: 2, type: 'deadline', msg: 'Προθεσμία αύριο: Υπόθεση Α123', time: 'πριν 1ω', path: '/calendar' },
    { id: 3, type: 'ai', msg: 'Lindy AI: Νέο έγγραφο επεξεργάστηκε', time: 'πριν 2ω', path: '/intake' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,#071220 0%,#0a1929 40%,#071220 100%)' }}>
      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* ═══ SIDEBAR ═══ */}
      <aside className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-300
        ${collapsed ? 'lg:w-[72px]' : 'lg:w-[260px]'}
        ${mobileOpen ? 'w-[260px] translate-x-0' : 'w-[260px] -translate-x-full lg:translate-x-0'}`}
        style={{ background: 'linear-gradient(180deg,#071220,#0a1929 50%,#071220)', borderRight: '1px solid rgba(26,58,92,0.5)' }}>

        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-[#1a3a5c]/40 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center flex-shrink-0">
            <Scale size={20} className="text-[#071220]" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold tracking-wide text-[#C6A75E]">NOMOS ONE</h1>
              <p className="text-[10px] text-[#6a8aaa] tracking-widest uppercase">Legal Operations</p>
            </div>
          )}
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-[#6a8aaa] hover:text-[#C6A75E]"><X size={18} /></button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto">
          <div className={`text-[10px] font-semibold uppercase tracking-widest text-[#4a6a8a] mb-3 ${collapsed ? 'text-center' : 'px-3'}`}>
            {collapsed ? '•••' : 'Πλοήγηση'}
          </div>
          {visibleNav.map((item) => {
            const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));
            const Icon = item.icon;
            const readOnly = perms.isReadOnly(item.section as any);
            return (
              <button key={item.id} onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 rounded-lg mb-0.5 transition-all duration-200 group relative
                  ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
                  ${isActive ? 'bg-[#132B45]/80 text-[#C6A75E]' : 'text-[#7a9ab8] hover:text-[#c0d0e0] hover:bg-[#0d2035]/60'}`}>
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-[#C6A75E]" />}
                <Icon size={18} className={isActive ? 'text-[#C6A75E]' : ''} />
                {!collapsed && <span className={`text-sm flex-1 text-left ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>}
                {!collapsed && readOnly && <Lock size={11} className="text-amber-500/60" />}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-[#132B45] text-[#d4dce8] text-xs rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-[#1a3a5c]">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}

          {/* AI section */}
          <div className={`text-[10px] font-semibold uppercase tracking-widest text-[#4a6a8a] mt-4 mb-3 ${collapsed ? 'text-center' : 'px-3'}`}>
            {collapsed ? 'AI' : 'Νοητική Νομοσύνη'}
          </div>
          <button onClick={() => navigate('/bot')}
            className={`w-full flex items-center gap-3 rounded-lg mb-0.5 px-3 py-2.5 transition-all duration-200 group relative
              ${currentPath === '/bot' ? 'bg-[#132B45]/80 text-[#C6A75E]' : 'text-[#7a9ab8] hover:text-[#c0d0e0] hover:bg-[#0d2035]/60'}
              ${collapsed ? 'justify-center px-2' : ''}`}>
            {currentPath === '/bot' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-[#C6A75E]" />}
            <Bot size={18} className={currentPath === '/bot' ? 'text-[#C6A75E]' : ''} />
            {!collapsed && <span className={`text-sm ${currentPath === '/bot' ? 'font-semibold' : 'font-medium'}`}>Nomos AI</span>}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-[#132B45] text-[#d4dce8] text-xs rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-[#1a3a5c]">
                Nomos AI
              </div>
            )}
          </button>
        </nav>

        {/* Collapse toggle */}
        <div className="hidden lg:flex justify-center py-2 border-t border-[#1a3a5c]/40">
          <button onClick={() => setCollapsed(!collapsed)} className="p-2 rounded-lg text-[#5a7a9a] hover:text-[#C6A75E] hover:bg-[#0d2035]/60 transition-all">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Logout */}
        <div className="px-2 pb-4 border-t border-[#1a3a5c]/40 pt-3">
          <button onClick={logout} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-[#7a9ab8] hover:text-red-400 hover:bg-red-500/5 transition-all ${collapsed ? 'justify-center' : ''}`}>
            <LogOut size={18} />
            {!collapsed && <span className="text-sm font-medium">Αποσύνδεση</span>}
          </button>
        </div>
      </aside>

      {/* ═══ MAIN AREA ═══ */}
      <div className="relative z-10 transition-all duration-300 lg:ml-[var(--sidebar-w)]" style={{ '--sidebar-w': `${sidebarW}px` } as any}>

        {/* TOPBAR */}
        <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-4 lg:px-6"
          style={{ background: 'linear-gradient(90deg,rgba(11,28,45,0.95),rgba(7,18,32,0.98))', borderBottom: '1px solid rgba(26,58,92,0.4)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 rounded-lg text-[#7a9ab8] hover:text-[#C6A75E]"><Menu size={20} /></button>
            <div>
              <h2 className="text-lg font-semibold text-[#e0e8f0]">{pageTitles[currentPath] || 'Nomos One'}</h2>
              <p className="text-[11px] text-[#5a7a9a] hidden sm:block">
                {new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Clock */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d2035]/60 border border-[#1a3a5c]/40">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-[#8aa0b8]">{clock}</span>
            </div>

            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => { setShowNotifications(!showNotifications); setNotifRead(true); }}
                className="relative p-2 rounded-lg text-[#7a9ab8] hover:text-[#C6A75E] hover:bg-[#132B45]/60 transition-all">
                <Bell size={18} />
                {!notifRead && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-[#071220] flex items-center justify-center text-[9px] font-bold text-white">
                    {NOTIF_COUNT}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 glass-card border border-[#1a3a5c] overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1a3a5c]/40 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[#d4dce8]">Ειδοποιήσεις</h4>
                    <span className="text-[10px] text-[#5a7a9a]">{notifications.length} νέες</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.map(n => (
                      <button key={n.id} onClick={() => navigate(n.path)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#0d2035]/60 transition-all text-left border-b border-[#1a3a5c]/20 last:border-0">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          n.type === 'overdue' ? 'bg-red-400' : n.type === 'deadline' ? 'bg-amber-400' : 'bg-purple-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#d4dce8]">{n.msg}</p>
                          <p className="text-[10px] text-[#5a7a9a] mt-0.5">{n.time}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="px-4 py-2 border-t border-[#1a3a5c]/40">
                    <button className="text-xs text-[#C6A75E] hover:text-[#E8C97A] w-full text-center">Όλες οι ειδοποιήσεις</button>
                  </div>
                </div>
              )}
            </div>

            {/* User dropdown */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#132B45]/60 transition-all">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[#071220]">{initials}</span>
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-medium text-[#d4dce8] max-w-[120px] truncate">{user?.name}</p>
                  <p className="text-[10px] text-[#5a7a9a]">{perms.roleLabel}</p>
                </div>
                <ChevronDown size={14} className={`hidden sm:block text-[#5a7a9a] transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 top-full mt-2 w-60 glass-card p-2 border border-[#1a3a5c]">
                  {/* User info header */}
                  <div className="px-3 py-3 mb-1 border-b border-[#1a3a5c]/40">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#071220]">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#d4dce8] truncate">{user?.name}</p>
                        <p className="text-[10px] text-[#5a7a9a] truncate">{user?.email}</p>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#C6A75E]/10 text-[#C6A75E] border border-[#C6A75E]/20 font-medium mt-0.5 inline-block">
                          {perms.roleLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <button onClick={() => navigate('/profile')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#c0d0e0] hover:bg-[#0d2035]/60 hover:text-[#C6A75E] rounded-lg transition-all">
                    <User size={14} className="text-[#5a7a9a]" /> Το Προφίλ μου
                  </button>

                  <button onClick={() => navigate('/preferences')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#c0d0e0] hover:bg-[#0d2035]/60 hover:text-[#C6A75E] rounded-lg transition-all">
                    <Sliders size={14} className="text-[#5a7a9a]" /> Προτιμήσεις
                  </button>

                  <button onClick={() => navigate('/audit')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#c0d0e0] hover:bg-[#0d2035]/60 hover:text-[#C6A75E] rounded-lg transition-all">
                    <Activity size={14} className="text-[#5a7a9a]" /> Audit Log
                  </button>

                  <button onClick={() => navigate('/bot')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#c0d0e0] hover:bg-[#0d2035]/60 hover:text-[#C6A75E] rounded-lg transition-all">
                    <Bot size={14} className="text-[#5a7a9a]" /> Nomos AI
                  </button>

                  <div className="border-t border-[#1a3a5c]/40 mt-1 pt-1">
                    <button onClick={logout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/5 rounded-lg transition-all">
                      <LogOut size={14} /> Αποσύνδεση
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="p-4 lg:p-6 max-w-[1400px] mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/cases" element={<CasesPage />} />
            <Route path="/cases/:id" element={<CaseDetailPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/invoicing" element={<InvoicingPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/crm-workflow" element={<CRMWorkflowPage />} />
            <Route path="/receipt" element={<ReceiptPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/admin-portal" element={<AdminPortalPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/bot" element={<SkotanisBot />} />
            <Route path="/intake" element={<AIIntakePage />} />
            <Route path="/documents" element={<DocumentVaultPage />} />
            <Route path="/preferences" element={<PreferencesPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
          </Routes>
        </main>

        <footer className="px-6 py-4 border-t border-[#1a3a5c]/30 mt-8">
          <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-[11px] text-[#4a6a8a]">Nomos One v3.0 — Σκοτάνης & Συνεργάτες</p>
            <p className="text-[11px] text-[#3a5a7a]">Εμπιστευτική Πλατφόρμα Νομικών Λειτουργιών</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
