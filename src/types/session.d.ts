import 'express-session';

// Extra fields we store on the server-side session.
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    isAdmin?: boolean;
    email?: string;
  }
}
