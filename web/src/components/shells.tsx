import { useQuery } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { rpc } from '../lib/api';
import { ROLE } from '../lib/format';
import { useAuth, type Role } from '../lib/auth';

// ─── phone frame (parent + learner) ─────────────────────────────────────────
export function Phone({ children, tall, style }: { children: ReactNode; tall?: boolean; style?: CSSProperties }) {
  return (
    <div className="phone-wrap">
      <div className={`phone${tall ? ' tall' : ''}`} style={style}>{children}</div>
    </div>
  );
}

export function ParentTabs() {
  return (
    <nav className="phone-tabs" aria-label="Parent">
      <NavLink to="/parent" end>Home</NavLink>
      <NavLink to="/parent/progress">Progress</NavLink>
      <NavLink to="/parent/messages">Messages</NavLink>
    </nav>
  );
}

// ─── admin (office staff) ───────────────────────────────────────────────────
interface NavItem { to: string; label: string; roles: Role[]; count?: 'place' | 'pay' | 'ren'; end?: boolean }

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', roles: ['owner', 'lead_tutor', 'customer_service'], end: true },
  { to: '/admin/placement', label: 'Placement queue', roles: ['owner', 'lead_tutor'], count: 'place' },
  { to: '/admin/payments', label: 'Payment approvals', roles: ['owner', 'customer_service'], count: 'pay' },
  { to: '/admin/renewals', label: 'Renewals', roles: ['owner', 'customer_service'], count: 'ren' },
  { to: '/admin/learners', label: 'Learners', roles: ['owner', 'lead_tutor', 'customer_service'] },
  { to: '/admin/classes', label: 'Classes', roles: ['owner', 'lead_tutor', 'customer_service'] },
  { to: '/admin/reports', label: 'Reports', roles: ['owner', 'lead_tutor', 'customer_service'] },
  { to: '/admin/announcements', label: 'Announcements', roles: ['owner', 'lead_tutor', 'customer_service'] },
  { to: '/admin/import', label: 'Import learners', roles: ['owner'] },
  { to: '/admin/staff', label: 'Staff & roles', roles: ['owner'] },
  { to: '/admin/audit', label: 'Audit log', roles: ['owner'] },
];

export const useAdminCounts = () =>
  useQuery({ queryKey: ['admin-counts'], queryFn: () => rpc<{ place: number; pay: number; ren: number }>('admin_counts') });

function Who() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <div className="side-who">
      <span>{profile.display_name || profile.full_name} · {ROLE[profile.role]}</span>
      <button type="button" onClick={signOut}>Sign out</button>
    </div>
  );
}

export function AdminShell({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { profile } = useAuth();
  const { data: counts } = useAdminCounts();
  const items = ADMIN_NAV.filter((n) => profile && n.roles.includes(profile.role));
  return (
    <div className="panel with-nav">
      <aside className="side">
        <Link to="/admin" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>Flying Colours</Link>
        <Who />
        <nav className="side-nav" aria-label="Admin">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}>
              {n.label}
              {n.count && counts && counts[n.count] > 0 && <span className="count">{counts[n.count]}</span>}
            </NavLink>
          ))}
          {profile && ['owner', 'lead_tutor'].includes(profile.role) && (
            <NavLink to="/tutor" className="nav-pill">Teaching view</NavLink>
          )}
        </nav>
      </aside>
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column', ...style }}>{children}</main>
    </div>
  );
}

// ─── tutor ──────────────────────────────────────────────────────────────────
export interface MyClass { id: string; name: string; to_review: number; learners: number; tutor_name: string | null }

export const useMyClasses = () =>
  useQuery({ queryKey: ['my-classes'], queryFn: () => rpc<MyClass[]>('my_classes') });

export function TutorShell({ children }: { children: ReactNode }) {
  const { classId } = useParams();
  const { profile } = useAuth();
  const loc = useLocation();
  const { data: classes } = useMyClasses();
  const current = classes?.find((c) => c.id === classId);
  const base = `/tutor/c/${classId}`;
  const office = profile && ['owner', 'lead_tutor'].includes(profile.role);
  return (
    <div className="panel with-nav">
      <aside className="side">
        <Link to="/tutor" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>Flying Colours</Link>
        <Who />
        <div className="side-section" style={{ paddingTop: 8 }}>{office ? 'All classes' : 'My classes'}</div>
        <nav className="side-nav" aria-label="Classes">
          {classes?.map((c) => (
            <NavLink key={c.id} to={`/tutor/c/${c.id}`} className={() => `nav-pill${c.id === classId ? ' active' : ''}`}>
              {c.name}<span className="count">{c.to_review}</span>
            </NavLink>
          ))}
        </nav>
        {current && (
          <>
            <div className="side-section">{current.name}</div>
            <nav className="side-nav" aria-label={current.name}>
              <NavLink to={base} end className={({ isActive }) => `nav-link${isActive || loc.pathname.includes('/review') ? ' active' : ''}`}>This week</NavLink>
              <NavLink to={`${base}/register`} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Attendance</NavLink>
              <NavLink to={`${base}/tasks/new`} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Tasks</NavLink>
              <NavLink to={`${base}/learners`} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Learners · {current.learners}</NavLink>
            </nav>
          </>
        )}
        {office && <nav className="side-nav" style={{ marginTop: 16 }}><Link to="/admin" className="nav-link">← Admin</Link></nav>}
      </aside>
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>{children}</main>
    </div>
  );
}
