"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, QrCode, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type QrStart = {
  sessionId: string;
  qrDataUrl: string;
  payload: string;
  expiresAt: number;
  message: string;
};

type QrPoll =
  | { status: "waiting"; message: string; expiresAt: number }
  | { status: "connected" | "unauthorized" | "paired"; message: string; host: string; port: number | null };

export type QrPairResult = {
  host: string;
  port: number | null;
  message: string;
  connected: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaired: (result: QrPairResult) => void;
  onError: (message: string) => void;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) throw new Error(data?.message || "Запит не вдався.");
  return data as T;
}

async function cancelSession(sessionId: string | null) {
  if (!sessionId) return;
  await fetch("/api/pair/qr", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => undefined);
}

export function QrPairDialog({ open, onOpenChange, onPaired, onError }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const [session, setSession] = useState<QrStart | null>(null);
  const [status, setStatus] = useState("Готую QR…");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sessionIdRef = useRef<string | null>(null);
  const onPairedRef = useRef(onPaired);
  const onErrorRef = useRef(onError);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onPairedRef.current = onPaired;
    onErrorRef.current = onError;
    onOpenChangeRef.current = onOpenChange;
  }, [onPaired, onError, onOpenChange]);

  useEffect(() => {
    if (!open || !session) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, session]);

  useEffect(() => {
    if (!open) {
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      setSession(null);
      setBusy(false);
      setStatus("Готую QR…");
      void cancelSession(id);
      return;
    }

    let cancelled = false;
    const abort = new AbortController();

    async function run() {
      setBusy(true);
      setStatus("Готую QR…");
      try {
        const started = await readJson<QrStart>(
          await fetch("/api/pair/qr", { method: "POST", signal: abort.signal }),
        );
        if (cancelled) {
          await cancelSession(started.sessionId);
          return;
        }
        sessionIdRef.current = started.sessionId;
        setSession(started);
        setNow(Date.now());
        setStatus(started.message);

        while (!cancelled) {
          if (Date.now() > started.expiresAt) {
            throw new Error("QR уже недійсний. Відкрийте сполучення ще раз.");
          }
          const polled = await readJson<QrPoll>(
            await fetch("/api/pair/qr", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: started.sessionId }),
              signal: abort.signal,
            }),
          );
          if (cancelled) return;
          setStatus(polled.message);
          if (polled.status === "waiting") {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          sessionIdRef.current = null;
          onPairedRef.current({
            host: polled.host,
            port: polled.port,
            message: polled.message,
            connected: polled.status === "connected" || polled.status === "unauthorized",
          });
          onOpenChangeRef.current(false);
          return;
        }
      } catch (cause) {
        if (cancelled || abort.signal.aborted) return;
        await cancelSession(sessionIdRef.current);
        sessionIdRef.current = null;
        onErrorRef.current(cause instanceof Error ? cause.message : "Сполучення через QR не вдалося.");
        onOpenChangeRef.current(false);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const secondsLeft = session ? Math.max(0, Math.ceil((session.expiresAt - now) / 1000)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Закрити"
        className="absolute inset-0 bg-black/70"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-10 grid w-full max-w-xl gap-4 rounded-xl bg-popover p-5 text-sm text-popover-foreground shadow-2xl ring-1 ring-foreground/15"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2 pr-8">
            <h2 id={titleId} className="font-heading flex items-center gap-2 text-base font-medium">
              <QrCode className="size-4 text-primary" />
              Сполучення через QR
            </h2>
            <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
              На телефоні: Бездротове налагодження → «Сполучити пристрій через QR-код» → наведіть камеру на цей код.
              Комп’ютер і телефон мають бути в одному Wi-Fi.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3"
            onClick={() => onOpenChange(false)}
          >
            <XIcon />
            <span className="sr-only">Закрити</span>
          </Button>
        </div>

        <div className="flex flex-col items-center gap-4 py-1">
          {session ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.qrDataUrl}
              alt="QR-код сполучення ADB"
              width={480}
              height={480}
              className="h-auto w-full max-w-[min(480px,calc(100vw-5rem))] rounded-xl bg-[#F3F7E4] ring-1 ring-foreground/10"
            />
          ) : (
            <div className="flex aspect-square w-full max-w-[min(480px,calc(100vw-5rem))] items-center justify-center rounded-xl bg-muted">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          )}
          <p role="status" className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
            {status}
          </p>
          {session ? (
            <p className="font-mono text-xs text-muted-foreground">дійсний ще {secondsLeft} с</p>
          ) : null}
        </div>

        <div className="-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          {busy ? (
            <span className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Чекаю телефон
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
