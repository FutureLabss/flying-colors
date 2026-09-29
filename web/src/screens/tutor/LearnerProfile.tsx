import { useParams } from 'react-router-dom';
import { LearnerProfile } from '../../components/LearnerProfile';
import { TutorShell } from '../../components/shells';

export default function TutorLearnerProfile() {
  const { learnerId } = useParams();
  return <TutorShell><LearnerProfile learnerId={learnerId!} manage={false} /></TutorShell>;
}
