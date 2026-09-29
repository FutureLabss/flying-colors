import { useQuery } from '@tanstack/react-query';
import { rpc } from '../../lib/api';

export interface QueueRow {
  id: string; first_name: string; last_name: string; age: number | null;
  submission_id: string | null; submitted_at: string | null; duration_seconds: number | null; late: boolean | null;
  feedback_id: string | null; release_at: string | null; nudged_at: string | null;
}

export interface QueueData {
  class: { id: string; name: string; age_min: number; age_max: number; level: string; capacity: number; live_schedule: string } | null;
  filled: number;
  task: { id: string; title: string; response_type: string; release_at: string; due_at: string } | null;
  rows: QueueRow[];
  sessions: { id: string; starts_at: string; recording_attached_at: string | null; register_saved_at: string | null; present: number; absent: number }[];
  tasks: { id: string; title: string; release_at: string; due_at: string }[];
  week: { week: number; today: string; monday: string; sunday: string };
}

export type RowStatus = 'Submitted' | 'Late' | 'Missing' | 'Reviewed';

export function rowStatus(r: QueueRow): RowStatus {
  if (r.feedback_id) return 'Reviewed';
  if (!r.submission_id) return 'Missing';
  return r.late ? 'Late' : 'Submitted';
}

export const STATUS_TAG: Record<RowStatus, string> = {
  Submitted: 'tag-grey', Late: 'tag-accent', Missing: 'tag-violet', Reviewed: 'tag-ink',
};

export const useQueue = (classId: string | undefined, taskId?: string) =>
  useQuery({
    queryKey: ['queue', classId, taskId ?? null],
    enabled: !!classId,
    queryFn: () => rpc<QueueData>('tutor_queue', { p_class: classId!, p_task: taskId }),
  });
