export const EVENT_TYPES = ['bug.reported','bug.commented','bug.status_changed','bug.priority_changed','bug.assignee_changed','bug.image_removed','bug.pdf_attached','bug.pdf_removed'] as const;
export type EventType = typeof EVENT_TYPES[number];
export type SubjectType = 'bug_report';
export type ActorRef = { kind: 'user' | 'google_chat' | 'import'; userId: string } | { kind: 'system' };
