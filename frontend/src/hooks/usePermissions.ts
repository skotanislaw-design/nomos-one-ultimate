import { useAuth } from '@/contexts/AuthContext';

export type Role = 'admin' | 'lawyer' | 'secretary' | 'trainee';

type Section = 'dashboard' | 'clients' | 'cases' | 'calendar' | 'documents' | 'expenses'
  | 'invoicing' | 'billing' | 'pipeline' | 'workflow' | 'templates' | 'reports'
  | 'audit' | 'users' | 'settings' | 'profile' | 'sop' | 'bot';

const VIEW: Record<Role, Section[]> = {
  admin:     ['dashboard','clients','cases','calendar','documents','expenses','invoicing','billing','pipeline','workflow','templates','reports','audit','users','settings','profile','sop','bot'],
  lawyer:    ['dashboard','clients','cases','calendar','documents','expenses','invoicing','billing','pipeline','workflow','templates','reports','profile','bot'],
  secretary: ['dashboard','clients','cases','calendar','documents','expenses','templates','profile','bot'],
  trainee:   ['dashboard','cases','calendar','documents','profile','bot'],
};

const EDIT: Record<Role, Section[]> = {
  admin:     ['clients','cases','calendar','documents','expenses','invoicing','billing','pipeline','workflow','templates','reports','users','settings'],
  lawyer:    ['clients','cases','calendar','documents','expenses','invoicing','billing','pipeline','workflow','templates'],
  secretary: ['clients','cases','calendar','documents','expenses','templates'],
  trainee:   ['documents'],
};

export function usePermissions() {
  const { user } = useAuth();
  const rawRole = user?.role as string;
  const normalizedRole = rawRole === 'administrator' ? 'admin' : rawRole;
  const role: Role = (normalizedRole as Role) || 'trainee';

  const canView = (s: Section) => VIEW[role]?.includes(s) ?? false;
  const canEdit = (s: Section) => EDIT[role]?.includes(s) ?? false;
  const canCreate = (s: Section) => canEdit(s);
  const canDelete = (s: Section) => role === 'admin';
  const isAdmin = role === 'admin';
  const isReadOnly = (s: Section) => canView(s) && !canEdit(s);

  const roleLabel: Record<Role, string> = { admin: 'Διαχειριστής', lawyer: 'Δικηγόρος', secretary: 'Γραμματεία', trainee: 'Ασκούμενος' };

  return { role, roleLabel: roleLabel[role], canView, canEdit, canCreate, canDelete, isAdmin, isReadOnly };
}
