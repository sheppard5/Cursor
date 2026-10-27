import { createQrCredentials, QR_SESSION_TTL_MS, type QrCredentials } from "./qr-pair";
import { TunerError } from "./errors";
import { randomBytes } from "node:crypto";

export type QrSession = QrCredentials & {
  id: string;
  createdAt: number;
  expiresAt: number;
  cancelled: boolean;
};

type GlobalStore = {
  sessions: Map<string, QrSession>;
};

function store(): GlobalStore {
  const globalState = globalThis as typeof globalThis & { __tabletQrSessions?: GlobalStore };
  if (!globalState.__tabletQrSessions) {
    globalState.__tabletQrSessions = { sessions: new Map() };
  }
  return globalState.__tabletQrSessions;
}

function prune(now = Date.now()) {
  const sessions = store().sessions;
  for (const [id, session] of sessions) {
    if (session.cancelled || session.expiresAt <= now) sessions.delete(id);
  }
}

export function createQrSession(): QrSession {
  prune();
  const credentials = createQrCredentials();
  const now = Date.now();
  const session: QrSession = {
    id: randomBytes(16).toString("hex"),
    ...credentials,
    createdAt: now,
    expiresAt: now + QR_SESSION_TTL_MS,
    cancelled: false,
  };
  store().sessions.set(session.id, session);
  return session;
}

export function getQrSession(id: string): QrSession {
  prune();
  const session = store().sessions.get(id);
  if (!session || session.cancelled) {
    throw new TunerError("Сесію QR не знайдено. Відкрийте сполучення ще раз.", 404);
  }
  if (session.expiresAt <= Date.now()) {
    store().sessions.delete(id);
    throw new TunerError("QR уже недійсний. Згенеруйте новий код.", 410);
  }
  return session;
}

export function cancelQrSession(id: string) {
  const session = store().sessions.get(id);
  if (session) {
    session.cancelled = true;
    store().sessions.delete(id);
  }
}

export function completeQrSession(id: string) {
  store().sessions.delete(id);
}
