import { Navigate } from 'react-router-dom';
import { useMyClasses } from '../../components/shells';
import { ErrorNote } from '../../components/ui';

/** Opens the tutor's first class. */
export default function TutorHome() {
  const { data, isLoading, error } = useMyClasses();
  if (isLoading) return <div className="full-center">Loading…</div>;
  if (error) return <div className="panel"><ErrorNote error={error} /></div>;
  if (!data?.length) return <div className="panel"><div className="empty">You don’t have a class yet. The lead tutor will assign you one.</div></div>;
  return <Navigate to={`/tutor/c/${data[0].id}`} replace />;
}
