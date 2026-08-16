import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Rooms are deleted eagerly when the last person leaves; this is only for the
// ones everybody closed the tab on. Nightly is plenty — a stale room already
// falls out of the public browser after ROOM_LIST_TTL_MS.
crons.daily('sweep abandoned rooms', { hourUTC: 3, minuteUTC: 0 }, internal.rooms.sweep, {});

export default crons;
