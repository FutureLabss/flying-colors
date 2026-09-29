import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CodeBoxes, Dialog, useAction } from '../../components/ui';
import { fn, must } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { setUpLearnerDevice } from './SignIn';

export interface Child { id: string; first_name: string; age: number | null; status: string; class_name: string | null; pin_set: boolean }

export function useChildren() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['children', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const rows = must(await supabase.from('learners')
        .select('id, first_name, age, status, pin_set, classes!learners_class_id_fkey(name)')
        .eq('guardian_id', profile!.id).neq('status', 'exited').order('age'));
      return rows.map((r): Child => ({
        id: r.id, first_name: r.first_name, age: r.age, status: r.status, pin_set: r.pin_set ?? false,
        class_name: (r.classes as { name: string } | null)?.name ?? null,
      }));
    },
  });
}

/** The selected child, kept in ?child= so tabs survive navigation. */
export function useSelectedChild() {
  const { data: children, isLoading } = useChildren();
  const [params, setParams] = useSearchParams();
  const id = params.get('child');
  const child = children?.find((c) => c.id === id) ?? children?.[0] ?? null;
  const select = (cid: string) => setParams((p) => { p.set('child', cid); return p; }, { replace: true });
  return { children: children ?? [], child, select, isLoading };
}

/** Header name that opens the account menu (child PINs, device setup, sign out). */
export function AccountMenu() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [pinFor, setPinFor] = useState(false);
  const act = useAction();
  const navigate = useNavigate();
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: 'var(--color-neutral-700)' }}>
        {profile?.display_name || profile?.full_name || 'Account'}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 24, zIndex: 5, background: '#fff', borderRadius: 18, boxShadow: 'var(--shadow-lg)', padding: 6, minWidth: 220, display: 'grid' }}>
          <button type="button" className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => { setOpen(false); setPinFor(true); }}>Children’s PINs</button>
          <button type="button" className="btn" style={{ justifyContent: 'flex-start' }}
            onClick={() => act(async () => { await setUpLearnerDevice(); setOpen(false); navigate('/learn'); })}>
            Hand this phone to my child
          </button>
          <button type="button" className="btn" style={{ justifyContent: 'flex-start', color: 'var(--color-accent-700)' }} onClick={signOut}>Sign out</button>
        </div>
      )}
      {pinFor && <PinDialog onClose={() => setPinFor(false)} />}
    </div>
  );
}

function PinDialog({ onClose }: { onClose: () => void }) {
  const { data: children } = useChildren();
  const [sel, setSel] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const act = useAction();
  const qc = useQueryClient();
  useEffect(() => { if (!sel && children?.length) setSel(children[0].id); }, [children, sel]);
  const child = children?.find((c) => c.id === sel);
  return (
    <Dialog title="Children’s PINs" body="Children sign in on this phone with a 4-digit PIN. Pick something they’ll remember." onClose={onClose}>
      <div className="pills full">
        {children?.map((c) => (
          <button key={c.id} type="button" aria-pressed={c.id === sel} onClick={() => { setSel(c.id); setPin(''); }}>
            {c.first_name}{c.pin_set ? ' · set' : ''}
          </button>
        ))}
      </div>
      <CodeBoxes value={pin} onChange={setPin} length={4} />
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" disabled={pin.length !== 4 || !child}
          onClick={() => act(async () => {
            await fn('learner-auth', { action: 'set-pin', learner_id: child!.id, pin });
            await qc.invalidateQueries({ queryKey: ['children'] });
            setPin('');
          }, `${child?.first_name}’s PIN is saved.`)}>
          Save PIN
        </button>
      </div>
    </Dialog>
  );
}
