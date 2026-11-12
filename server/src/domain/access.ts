import { DemoRole } from '@proofpay/shared';
import { HttpError } from '../errors';

interface ProjectParties {
  clientId: string;
  freelancerId: string | null;
}
interface Actor {
  id: string;
  role: DemoRole;
}

/** Is this user the client or the assigned freelancer of the project? */
export function isProjectParty(project: ProjectParties, user: Actor): boolean {
  return user.role === 'CLIENT'
    ? project.clientId === user.id
    : project.freelancerId === user.id;
}

export function assertProjectParty(project: ProjectParties, user: Actor): void {
  if (!isProjectParty(project, user)) {
    throw new HttpError(403, 'NOT_PROJECT_PARTICIPANT', 'You are not a participant in this project.');
  }
}
