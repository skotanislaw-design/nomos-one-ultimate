import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import {
  LayoutDashboard, Users, Briefcase, Calendar, FileText, Receipt, CreditCard,
  BarChart3, Settings, LogOut, ChevronLeft, ChevronRight, X, Menu, Bell,
  ChevronDown, User, Shield, Scale, TrendingUp, ClipboardList, GitBranch,
  FileCheck, Bot, Lock, Activity, Sliders, HardDrive, Inbox, Banknote, Sparkles, Gavel,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { notificationsApi } from '@/lib/api';
import { applyPreferences } from '@/lib/applyPreferences';
import { getPrefs } from '@/lib/prefs';
import { usePermissions } from '@/hooks/usePermissions';

// PWA Components
import PWAInstallPrompt from '@/components/mobile/PWAInstallPrompt';
import OfflineIndicator from '@/components/mobile/OfflineIndicator';

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
import ClientDetailPage from '@/pages/ClientDetailPage';
import LindaPage from '@/pages/LindaPage';
import LexisPage from '@/pages/LexisPage';
import PinakioPage from '@/pages/PinakioPage';
import CriminalCasesPage from '@/pages/CriminalCasesPage';
import CriminalCaseDetailPage from '@/pages/CriminalCaseDetailPage';

type NavItem = { id: string; path: string; label: string; icon: React.ElementType; section: string };

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { id: 'clients', path: '/clients', label: 'Πελάτες', icon: Users, section: 'clients' },
  { id: 'cases', path: '/cases', label: 'Υποθέσεις', icon: Briefcase, section: 'cases' },
  { id: 'documents', path: '/documents', label: 'Θησαυροφυλάκιο', icon: HardDrive, section: 'cases' },
  { id: 'calendar', path: '/calendar', label: 'Ημερολόγιο', icon: Calendar, section: 'calendar' },
  { id: 'pinakia', path: '/pinakia', label: 'Πινάκια', icon: Gavel, section: 'calendar' },
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

export default function AppShell() {
  const { user, logout } = useAuth();
  const perms = usePermissions();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('nomos_preferences') || '{}');
      return prefs.sidebarCollapsed ?? false;
    } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifRead, setNotifRead] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [clock, setClock] = useState('');
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Apply user preferences on mount and when changed
  useEffect(() => {
    const load = () => {
      try {
        const prefs = JSON.parse(localStorage.getItem('nomos_preferences') || '{}');
        applyPreferences(prefs);
      } catch {}
    };
    load();
    window.addEventListener('storage', load);
    window.addEventListener('nomos-prefs-changed', load);
    return () => {
      window.removeEventListener('storage', load);
      window.removeEventListener('nomos-prefs-changed', load);
    };
  }, []);

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
    '/settings': 'Ρυθμίσεις', '/profile': 'Προφίλ', '/bot': 'Nomos AI', '/linda': 'Λίντα — Προσωπικός Βοηθός', '/lexis': 'LEXIS — 12 Νομικοί Specialists',
    '/intake': 'AI Document Intake', '/documents': 'Θησαυροφυλάκιο', '/preferences': 'Προτιμήσεις',
    '/payments': 'Πληρωμές', '/admin-portal': 'Διαχείριση Πύλης Πελάτη',
    '/criminal': 'Ποινικές Υποθέσεις',
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await notificationsApi.list();
        const prefs = getPrefs();
        const all: any[] = res.data || [];
        const filtered = all.filter(n => {
          if (n.type === 'deadline' && prefs.notifyDeadlines === false) return false;
          if (n.type === 'overdue'  && prefs.notifyInvoices  === false) return false;
          if (n.type === 'stagnant' && prefs.notifyStagnant  === false) return false;
          if (n.type === 'message'  && prefs.notifyMessages  === false) return false;
          return true;
        });
        setNotifications(filtered);
        setNotifRead(false);
      } catch { setNotifications([]); }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    window.addEventListener('nomos-prefs-changed', fetchNotifications);
    return () => {
      clearInterval(interval);
      window.removeEventListener('nomos-prefs-changed', fetchNotifications);
    };
  }, []);

  // Mobile bottom nav items (most used)
  const BOTTOM_NAV = [
    { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients',   path: '/clients',  label: 'Πελάτες',    icon: Users },
    { id: 'cases',     path: '/cases',    label: 'Υποθέσεις',  icon: Briefcase },
    { id: 'calendar',  path: '/calendar', label: 'Ημερολόγιο', icon: Calendar },
    { id: 'more',      path: '__more__',  label: 'Περισσότερα',icon: Menu },
  ];

  const NAV_GROUPS = [
    { label: 'Κύρια', items: [
      { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
      { id: 'intake', path: '/intake', label: 'AI Intake', icon: Inbox, section: 'dashboard' },
    ]},
    { label: 'AI Εργαλεία', items: [
      { id: 'lexis', path: '/lexis', label: 'LEXIS',    icon: Scale,    section: 'dashboard' },
      { id: 'bot',   path: '/bot',   label: 'Nomos AI', icon: Bot,      section: 'dashboard' },
      { id: 'linda', path: '/linda', label: 'Λίντα',    icon: Sparkles, section: 'dashboard' },
    ]},
    { label: 'Πελάτες & Υποθέσεις', items: [
      { id: 'clients',   path: '/clients',   label: 'Πελάτες',         icon: Users,     section: 'clients' },
      { id: 'cases',     path: '/cases',     label: 'Υποθέσεις',       icon: Briefcase, section: 'cases' },
      { id: 'criminal',  path: '/criminal',  label: 'Ποινικές',        icon: Scale,     section: 'cases' },
      { id: 'documents', path: '/documents', label: 'Θησαυροφυλάκιο', icon: HardDrive, section: 'cases' },
      { id: 'calendar',  path: '/calendar',  label: 'Ημερολόγιο',      icon: Calendar,  section: 'calendar' },
      { id: 'pinakia',   path: '/pinakia',   label: 'Πινάκια',         icon: Gavel,     section: 'calendar' },
    ]},
    { label: 'Οικονομικά', items: [
      { id: 'invoicing', path: '/invoicing', label: 'Τιμολόγηση',    icon: CreditCard, section: 'invoicing' },
      { id: 'payments',  path: '/payments',  label: 'Πληρωμές',      icon: Banknote,   section: 'invoicing' },
      { id: 'receipt',   path: '/receipt',   label: 'Αποδείξεις',    icon: Receipt,    section: 'invoicing' },
      { id: 'expenses',  path: '/expenses',  label: 'Έξοδα',         icon: Receipt,    section: 'expenses' },
      { id: 'billing',   path: '/billing',   label: 'Billing Engine', icon: TrendingUp, section: 'billing' },
    ]},
    { label: 'Εργαλεία', items: [
      { id: 'crm-workflow', path: '/crm-workflow', label: 'CRM & Workflow', icon: GitBranch, section: 'crm' },
      { id: 'templates',    path: '/templates',    label: 'Πρότυπα',        icon: FileCheck, section: 'templates' },
      { id: 'reports',      path: '/reports',      label: 'Αναφορές',       icon: BarChart3, section: 'reports' },
    ]},
    { label: 'Διαχείριση', items: [
      { id: 'users',        path: '/users',        label: 'Χρήστες',      icon: Shield,   section: 'users' },
      { id: 'admin-portal', path: '/admin-portal', label: 'Πύλη Πελάτη', icon: Lock,     section: 'users' },
      { id: 'settings',     path: '/settings',     label: 'Ρυθμίσεις',   icon: Settings, section: 'settings' },
    ]},
  ];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,#071220 0%,#0a1929 40%,#071220 100%)' }}>
      <OfflineIndicator />
      <PWAInstallPrompt />

      {/* Mobile drawer overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-sm" onClick={() => setMobileOpen(false)} />}

      {/* ═══ SIDEBAR (desktop always visible / mobile as drawer) ═══ */}
      <aside className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-300
        ${collapsed ? 'lg:w-[72px]' : 'lg:w-[260px]'}
        ${mobileOpen ? 'w-[280px] translate-x-0 shadow-2xl' : 'w-[280px] -translate-x-full lg:translate-x-0'}`}
        style={{ background: 'linear-gradient(180deg,#071220,#0a1929 50%,#071220)', borderRight: '1px solid rgba(26,58,92,0.5)' }}>

        {/* Logo area */}
        <div className={`flex items-center gap-3 border-b border-[#1a3a5c]/40 transition-all duration-300
          ${collapsed ? 'justify-center px-3 py-4' : 'px-4 py-3'}`}>
          <img
            src="/logo.png" alt="Nomos One"
            className={`rounded-full object-cover flex-shrink-0 ring-1 ring-[#C6A75E]/30 transition-all duration-300 ${collapsed ? 'w-10 h-10' : 'w-12 h-12'}`}
            style={{ boxShadow: '0 2px 16px rgba(198,167,94,0.18)' }}
          />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold tracking-wide text-[#C6A75E] leading-tight">NOMOS ONE</p>
              <p className="text-[10px] text-[#4a6a8a] tracking-widest uppercase leading-tight">Legal Operations</p>
            </div>
          )}
          <button onClick={() => setMobileOpen(false)} className="lg:hidden ml-auto p-1 text-[#5a7a9a] hover:text-[#C6A75E]"><X size={18} /></button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 py-2 px-2 overflow-y-auto scrollbar-thin">
          {NAV_GROUPS.map(group => {
            const groupItems = group.items.filter(item => perms.canView(item.section as any));
            if (groupItems.length === 0) return null;
            return (
              <div key={group.label} className="mb-1">
                {!collapsed
                  ? <p className="px-3 pt-3 pb-1 text-[9px] font-semibold tracking-[0.12em] uppercase text-[#3a5a7a]">{group.label}</p>
                  : <div className="my-2 mx-3 h-px bg-[#1a3a5c]/40" />
                }
                {groupItems.map(item => {
                  const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));
                  const Icon = item.icon;
                  const readOnly = perms.isReadOnly(item.section as any);
                  return (
                    <button key={item.id} onClick={() => navigate(item.path)}
                      className={`w-full flex items-center gap-3 rounded-xl mb-0.5 transition-all duration-150 group relative cursor-pointer
                        ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
                        ${isActive
                          ? 'bg-[#C6A75E]/10 text-[#C6A75E] border border-[#C6A75E]/20'
                          : 'text-[#5a7a9a] hover:text-[#b8cce0] hover:bg-[#0d2035]/60 border border-transparent'
                        }`}>
                      {isActive && !collapsed && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-[#C6A75E]" />}
                      <Icon size={16} className={`flex-shrink-0 ${isActive ? 'text-[#C6A75E]' : 'text-[#4a6a8a] group-hover:text-[#8aaac8]'}`} />
                      {!collapsed && (
                        <span className={`text-[13px] flex-1 text-left ${isActive ? 'font-semibold text-[#E8C97A]' : 'font-medium'}`}>
                          {item.label}
                        </span>
                      )}
                      {!collapsed && readOnly && <Lock size={10} className="text-amber-500/40 flex-shrink-0" />}
                      {collapsed && (
                        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#0d2035] text-[#d4dce8] text-xs rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-all whitespace-nowrap z-50 border border-[#1a3a5c]/60 shadow-xl">
                          {item.label}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:flex justify-center py-2 border-t border-[#1a3a5c]/40">
          <button onClick={() => setCollapsed(!collapsed)} className="p-2 rounded-lg text-[#4a6a8a] hover:text-[#C6A75E] hover:bg-[#0d2035]/60 transition-all">
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Logout */}
        <div className={`px-2 pb-4 pt-2 border-t border-[#1a3a5c]/40 ${collapsed ? '' : 'px-3'}`}>
          <button onClick={logout} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#5a7a9a] hover:text-red-400 hover:bg-red-500/8 transition-all ${collapsed ? 'justify-center' : ''}`}>
            <LogOut size={16} />
            {!collapsed && <span className="text-[13px] font-medium">Αποσύνδεση</span>}
          </button>
        </div>
      </aside>

      {/* ═══ MAIN AREA ═══ */}
      <div className="relative z-10 transition-all duration-300 lg:ml-[var(--sidebar-w)]" style={{ '--sidebar-w': `${sidebarW}px` } as any}>

        {/* TOPBAR */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 flex items-center justify-between px-3 lg:px-6"
          style={{ background: 'rgba(7,18,32,0.92)', borderBottom: '1px solid rgba(26,58,92,0.4)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>

          <div className="flex items-center gap-2 lg:gap-4">
            {/* Mobile: logo + title. Desktop: just title */}
            <img src="/logo.png" alt="" className="w-8 h-8 rounded-full object-cover lg:hidden ring-1 ring-[#C6A75E]/20" />
            <div>
              <h2 className="text-[15px] lg:text-lg font-semibold text-[#e0e8f0] leading-tight">{pageTitles[currentPath] || 'Nomos One'}</h2>
              <p className="text-[10px] text-[#4a6a8a] hidden sm:block">
                {new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Clock (desktop only) */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d2035]/60 border border-[#1a3a5c]/40">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-[#7a9ab8]">{clock}</span>
            </div>

            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button onClick={() => { setShowNotifications(!showNotifications); setNotifRead(true); }}
                className="relative p-2 rounded-xl text-[#6a8aaa] hover:text-[#C6A75E] hover:bg-[#132B45]/60 transition-all">
                <Bell size={18} />
                {!notifRead && notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-[#071220] flex items-center justify-center text-[9px] font-bold text-white">
                    {notifications.length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 glass-card border border-[#1a3a5c] overflow-hidden shadow-2xl">
                  <div className="px-4 py-3 border-b border-[#1a3a5c]/40 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[#d4dce8]">Ειδοποιήσεις</h4>
                    <span className="text-[10px] text-[#5a7a9a]">{notifications.length} νέες</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0
                      ? <p className="text-xs text-[#4a6a8a] text-center py-6">Δεν υπάρχουν ειδοποιήσεις</p>
                      : notifications.map(n => (
                          <button key={n.id} onClick={() => navigate(n.path)}
                            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#0d2035]/60 transition-all text-left border-b border-[#1a3a5c]/20 last:border-0">
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                              n.type === 'overdue' ? 'bg-red-400' : n.type === 'deadline' ? 'bg-amber-400' : n.type === 'warning' ? 'bg-orange-400' : 'bg-blue-400'
                            }`} />
                            <p className="text-xs text-[#d4dce8] flex-1 min-w-0">{n.msg}</p>
                          </button>
                        ))
                    }
                  </div>
                  <div className="px-4 py-2 border-t border-[#1a3a5c]/40">
                    <button onClick={() => { setShowNotifications(false); navigate('/audit'); }} className="text-xs text-[#C6A75E] hover:text-[#E8C97A] w-full text-center">Όλες οι ειδοποιήσεις</button>
                  </div>
                </div>
              )}
            </div>

            {/* User dropdown */}
            <div className="relative" ref={profileMenuRef}>
              <button onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-[#132B45]/60 transition-all">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-[#071220]">{initials}</span>
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-medium text-[#d4dce8] max-w-[110px] truncate">{user?.name}</p>
                  <p className="text-[10px] text-[#4a6a8a]">{perms.roleLabel}</p>
                </div>
                <ChevronDown size={13} className={`hidden sm:block text-[#4a6a8a] transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 top-full mt-2 w-60 glass-card p-2 border border-[#1a3a5c] shadow-2xl">
                  <div className="px-3 py-3 mb-1 border-b border-[#1a3a5c]/40">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C6A75E] to-[#A8893D] flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#071220]">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#d4dce8] truncate">{user?.name}</p>
                        <p className="text-[10px] text-[#4a6a8a] truncate">{user?.email}</p>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#C6A75E]/10 text-[#C6A75E] border border-[#C6A75E]/20 font-medium mt-0.5 inline-block">{perms.roleLabel}</span>
                      </div>
                    </div>
                  </div>
                  {[
                    { icon: User,     path: '/profile',     label: 'Το Προφίλ μου' },
                    { icon: Sliders,  path: '/preferences', label: 'Προτιμήσεις' },
                    { icon: Activity, path: '/audit',       label: 'Audit Log' },
                    { icon: Bot,      path: '/bot',         label: 'Nomos AI' },
                  ].map(({ icon: Icon, path, label }) => (
                    <button key={path} onClick={() => navigate(path)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#b0c4d8] hover:bg-[#0d2035]/60 hover:text-[#C6A75E] rounded-lg transition-all">
                      <Icon size={13} className="text-[#4a6a8a]" /> {label}
                    </button>
                  ))}
                  <div className="border-t border-[#1a3a5c]/40 mt-1 pt-1">
                    <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/5 rounded-lg transition-all">
                      <LogOut size={13} /> Αποσύνδεση
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* CONTENT — extra bottom padding on mobile for bottom nav */}
        <main className="p-3 lg:p-6 pb-24 lg:pb-6 max-w-[1440px] mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
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
            <Route path="/linda" element={<LindaPage />} />
            <Route path="/lexis" element={<LexisPage />} />
            <Route path="/intake" element={<AIIntakePage />} />
            <Route path="/documents" element={<DocumentVaultPage />} />
            <Route path="/preferences" element={<PreferencesPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/pinakia" element={<PinakioPage />} />
            <Route path="/criminal" element={<CriminalCasesPage />} />
            <Route path="/criminal/:id" element={<CriminalCaseDetailPage />} />
          </Routes>
        </main>

        <footer className="hidden lg:block px-6 py-3 border-t border-[#1a3a5c]/30">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between">
            <p className="text-[11px] text-[#3a5a7a]">Nomos One v3.0 — Σκοτάνης & Συνεργάτες</p>
            <p className="text-[11px] text-[#2a4a6a]">Εμπιστευτική Πλατφόρμα Νομικών Λειτουργιών</p>
          </div>
        </footer>
      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
        style={{ background: 'rgba(7,18,32,0.97)', borderTop: '1px solid rgba(26,58,92,0.5)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {BOTTOM_NAV.map(item => {
          const isMore = item.path === '__more__';
          const isActive = !isMore && (currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path)));
          const isMoreActive = isMore && mobileOpen;
          const Icon = item.icon;
          return (
            <button key={item.id}
              onClick={() => isMore ? setMobileOpen(o => !o) : navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all duration-150 cursor-pointer
                ${isActive || isMoreActive ? 'text-[#C6A75E]' : 'text-[#3a5a7a]'}`}>
              <div className={`relative p-1.5 rounded-xl transition-all ${isActive || isMoreActive ? 'bg-[#C6A75E]/12' : ''}`}>
                <Icon size={20} strokeWidth={isActive || isMoreActive ? 2.2 : 1.8} />
                {isActive && <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#C6A75E]" />}
              </div>
              <span className={`text-[10px] font-medium leading-none ${isActive || isMoreActive ? 'text-[#C6A75E]' : 'text-[#3a5a7a]'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
