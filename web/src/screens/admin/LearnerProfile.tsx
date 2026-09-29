import { useParams } from 'react-router-dom';
import { LearnerProfile } from '../../components/LearnerProfile';
import { AdminShell } from '../../components/shells';

export default function AdminLearnerProfile() {
  const { learnerId } = useParams();
  return <AdminShell><LearnerProfile learnerId={learnerId!} manage /></AdminShell>;
}
