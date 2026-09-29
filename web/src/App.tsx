import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, OFFICE, RequireRole, useAuth } from './lib/auth';

const ParentSignIn = lazy(() => import('./screens/parent/SignIn'));
const ParentHome = lazy(() => import('./screens/parent/Home'));
const ParentProgress = lazy(() => import('./screens/parent/Progress'));
const ParentInbox = lazy(() => import('./screens/parent/Inbox'));
const Signup = lazy(() => import('./screens/parent/Signup'));
const LearnerPin = lazy(() => import('./screens/learner/Pin'));
const LearnerWeek = lazy(() => import('./screens/learner/Week'));
const LearnerTask = lazy(() => import('./screens/learner/Task'));
const TutorHome = lazy(() => import('./screens/tutor/Home'));
const TutorQueue = lazy(() => import('./screens/tutor/Queue'));
const TutorFeedback = lazy(() => import('./screens/tutor/Feedback'));
const TutorRegister = lazy(() => import('./screens/tutor/Register'));
const TutorNewTask = lazy(() => import('./screens/tutor/NewTask'));
const TutorLearners = lazy(() => import('./screens/tutor/Learners'));
const TutorLearnerProfile = lazy(() => import('./screens/tutor/LearnerProfile'));
const AdminOverview = lazy(() => import('./screens/admin/Overview'));
const AdminPlacement = lazy(() => import('./screens/admin/Placement'));
const AdminPayments = lazy(() => import('./screens/admin/Payments'));
const AdminRenewals = lazy(() => import('./screens/admin/Renewals'));
const AdminLearners = lazy(() => import('./screens/admin/Learners'));
const AdminLearnerProfile = lazy(() => import('./screens/admin/LearnerProfile'));
const AdminClasses = lazy(() => import('./screens/admin/Classes'));
const AdminReports = lazy(() => import('./screens/admin/Reports'));
const AdminAnnounce = lazy(() => import('./screens/admin/Announcements'));
const AdminImport = lazy(() => import('./screens/admin/Import'));
const AdminStaff = lazy(() => import('./screens/admin/Staff'));
const AdminAudit = lazy(() => import('./screens/admin/Audit'));
const StaffSignIn = lazy(() => import('./screens/StaffSignIn'));
const DevAccounts = lazy(() => import('./screens/DevAccounts'));

function Landing() {
  const { session, profile, loading } = useAuth();
  if (loading || (session && !profile)) return <div className="full-center">Loading…</div>;
  return <Navigate to={session && profile ? homeFor(profile.role) : '/signin'} replace />;
}

const office = (el: React.ReactNode, roles = OFFICE) => <RequireRole roles={roles} signin="/staff/signin">{el}</RequireRole>;
const teaching = (el: React.ReactNode) => <RequireRole roles={['tutor', 'lead_tutor', 'owner']} signin="/staff/signin">{el}</RequireRole>;
const parent = (el: React.ReactNode) => <RequireRole roles={['parent']}>{el}</RequireRole>;
const learner = (el: React.ReactNode) => <RequireRole roles={['learner']} signin="/learn">{el}</RequireRole>;

export default function App() {
  return (
    <Suspense fallback={<div className="full-center">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<ParentSignIn />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/staff/signin" element={<StaffSignIn />} />
        {import.meta.env.DEV && <Route path="/dev" element={<DevAccounts />} />}

        <Route path="/parent" element={parent(<ParentHome />)} />
        <Route path="/parent/progress" element={parent(<ParentProgress />)} />
        <Route path="/parent/messages" element={parent(<ParentInbox />)} />

        <Route path="/learn" element={<LearnerPin />} />
        <Route path="/learn/week" element={learner(<LearnerWeek />)} />
        <Route path="/learn/task/:taskId" element={learner(<LearnerTask />)} />

        <Route path="/tutor" element={teaching(<TutorHome />)} />
        <Route path="/tutor/c/:classId" element={teaching(<TutorQueue />)} />
        <Route path="/tutor/c/:classId/review/:submissionId?" element={teaching(<TutorFeedback />)} />
        <Route path="/tutor/c/:classId/register/:sessionId?" element={teaching(<TutorRegister />)} />
        <Route path="/tutor/c/:classId/tasks/new" element={teaching(<TutorNewTask />)} />
        <Route path="/tutor/c/:classId/learners" element={teaching(<TutorLearners />)} />
        <Route path="/tutor/c/:classId/learners/:learnerId" element={teaching(<TutorLearnerProfile />)} />

        <Route path="/admin" element={office(<AdminOverview />)} />
        <Route path="/admin/placement" element={office(<AdminPlacement />, ['owner', 'lead_tutor'])} />
        <Route path="/admin/payments" element={office(<AdminPayments />, ['owner', 'customer_service'])} />
        <Route path="/admin/renewals" element={office(<AdminRenewals />, ['owner', 'customer_service'])} />
        <Route path="/admin/learners" element={office(<AdminLearners />)} />
        <Route path="/admin/learners/:learnerId" element={office(<AdminLearnerProfile />)} />
        <Route path="/admin/classes" element={office(<AdminClasses />)} />
        <Route path="/admin/reports" element={office(<AdminReports />)} />
        <Route path="/admin/announcements" element={office(<AdminAnnounce />)} />
        <Route path="/admin/import" element={office(<AdminImport />, ['owner'])} />
        <Route path="/admin/staff" element={office(<AdminStaff />, ['owner'])} />
        <Route path="/admin/audit" element={office(<AdminAudit />, ['owner'])} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
