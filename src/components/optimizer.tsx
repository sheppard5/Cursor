"use client";

import { useEffect, useRef, useState } from "react";
import { BatteryMedium, Check, HardDrive, Loader2, MemoryStick, QrCode, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { QrPairDialog, type QrPairResult } from "@/components/qr-pair-dialog";
import { adviceFor, batteryPhrase, deviceTitle, formatKb, formatTemp, formatUptime, usedPercent } from "@/lib/format";
import { OPTION_CATALOG } from "@/lib/plan";
import { DEFAULT_HOST, DEFAULT_PORT, defaultOptions, type DeviceSnapshot, type OptimizeOptions, type StepResult } from "@/lib/types";

type Health = { ok: boolean; adb?: boolean; version?: string; message?: string };

const STORAGE_KEY = "tablet-optimizer";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) throw new Error(data?.message || "Запит не вдався.");
  return data as T;
}

function endpointError(port: string): string | null {
  if (!/^\d+$/.test(port.trim())) return "Порт має бути цілим числом від 1 до 65535.";
  const value = Number(port);
  if (value < 1 || value > 65535) return "Порт має бути цілим числом від 1 до 65535.";
  return null;
}

function scaleLabel(value: string): string {
  const numeric = Number(value);
  if (!value || value === "null" || !Number.isFinite(numeric)) return "стандарт";
  return `${numeric.toLocaleString("uk-UA", { maximumFractionDigits: 1 })}×`;
}

export function Optimizer() {
  const [host, setHost] = useState(DEFAULT_HOST);
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [options, setOptions] = useState<OptimizeOptions>(defaultOptions);
  const [pairOpen, setPairOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [pairPort, setPairPort] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [device, setDevice] = useState<DeviceSnapshot | null>(null);
  const [results, setResults] = useState<StepResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [ready, setReady] = useState(false);
  const originalTimeout = useRef<string | null>(null);
  const nudgedBattery = useRef(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as { host?: string; port?: number; options?: Partial<OptimizeOptions> };
        if (typeof saved.host === "string" && saved.host) setHost(saved.host);
        if (typeof saved.port === "number" && saved.port >= 1 && saved.port <= 65535) {
          setPort(String(saved.port));
        }
        if (saved.options) {
          setOptions((current) => {
            const next = { ...current };
            for (const key of Object.keys(current) as (keyof OptimizeOptions)[]) {
              if (typeof saved.options?.[key] === "boolean") next[key] = saved.options[key];
            }
            return next;
          });
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setReady(true);
    fetch("/api/health")
      .then((response) => response.json())
      .then((data: Health) => setHealth(data))
      .catch(() => setHealth({ ok: false, adb: false, message: "Не вдалося перевірити adb." }));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const parsedPort = Number(port);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        host,
        port: Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : DEFAULT_PORT,
        options,
      }),
    );
  }, [ready, host, port, options]);

  function remember(next: DeviceSnapshot) {
    setDevice(next);
    if (originalTimeout.current == null && /^\d+$/.test(next.screenOffTimeoutMs)) {
      originalTimeout.current = next.screenOffTimeoutMs;
    }
    if (!nudgedBattery.current && next.batteryLevel != null && next.batteryLevel < 20 && !next.plugged) {
      nudgedBattery.current = true;
      setOptions((current) => ({ ...current, dexopt: false }));
    }
  }

  function payload() {
    return { host: host.trim(), port: Number(port) };
  }

  async function readState() {
    const invalid = endpointError(port);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy("Зчитую батарею, пам’ять і сховище…");
    setError(null);
    setNotice(null);
    setResults(null);
    try {
      const data = await postJson<{ device: DeviceSnapshot }>("/api/audit", payload());
      remember(data.device);
    } catch (cause) {
      setDevice(null);
      setError(cause instanceof Error ? cause.message : "Не вдалося зчитати планшет.");
    } finally {
      setBusy(null);
    }
  }

  async function pair() {
    const invalid = endpointError(pairPort);
    if (invalid) {
      setError(invalid.replace("Порт", "Порт сполучення"));
      return;
    }
    if (!/^\d{6}$/.test(pairCode.trim())) {
      setError("Код сполучення — це 6 цифр з екрана планшета.");
      return;
    }
    setBusy("Сполучаю комп’ютер із планшетом…");
    setError(null);
    setNotice(null);
    try {
      const data = await postJson<{ message: string }>("/api/pair", {
        host: host.trim(),
        pairPort: Number(pairPort),
        code: pairCode.trim(),
      });
      setPairCode("");
      setNotice(data.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Сполучення не вдалося.");
    } finally {
      setBusy(null);
    }
  }

  function handleQrPaired(result: QrPairResult) {
    setHost(result.host);
    if (result.port != null) setPort(String(result.port));
    setError(null);
    setNotice(result.message);
    setPairOpen(false);
    if (result.connected && result.port != null) {
      void (async () => {
        setBusy("Зчитую батарею, пам’ять і сховище…");
        try {
          const data = await postJson<{ device: DeviceSnapshot }>("/api/audit", {
            host: result.host,
            port: result.port,
          });
          remember(data.device);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Не вдалося зчитати планшет після QR.");
        } finally {
          setBusy(null);
        }
      })();
    }
  }

  async function optimize() {
    const invalid = endpointError(port);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!Object.values(options).some(Boolean)) {
      setError("Оберіть хоча б один крок.");
      return;
    }
    setBusy("Застосовую профіль. Це може тривати близько хвилини…");
    setError(null);
    setNotice(null);
    try {
      const data = await postJson<{ ok: boolean; results: StepResult[]; device: DeviceSnapshot | null }>(
        "/api/optimize",
        { ...payload(), options },
      );
      setResults(data.results);
      if (data.device) remember(data.device);
      setNotice(data.ok ? "Профіль застосовано." : "Частину кроків планшет не прийняв. Деталі нижче.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Оптимізація не вдалася.");
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    const invalid = endpointError(port);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy("Повертаю стандартні анімації й сканування…");
    setError(null);
    setNotice(null);
    try {
      const data = await postJson<{ ok: boolean; results: StepResult[]; device: DeviceSnapshot | null }>(
        "/api/restore",
        { ...payload(), screenOffTimeoutMs: originalTimeout.current },
      );
      setResults(data.results);
      if (data.device) setDevice(data.device);
      setNotice(data.ok ? "Стандартні значення повернуто." : "Деякі значення не повернулись.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вдалося повернути значення.");
    } finally {
      setBusy(null);
    }
  }

  const selected = OPTION_CATALOG.filter((item) => options[item.key]).length;
  const title = device ? deviceTitle(device.manufacturer, device.model) : host.trim() || DEFAULT_HOST;

  return (
    <div className="relative min-h-dvh">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,oklch(0.36_0.07_130/0.55),transparent_52%),radial-gradient(ellipse_at_top_right,oklch(0.42_0.08_95/0.16),transparent_42%)]"
      />
      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[0.72rem] tracking-[0.22em] text-primary uppercase">Планшет · ADB</p>
            <h1 className="font-heading mt-3 break-words text-4xl leading-[0.95] font-medium tracking-tight md:text-6xl">
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Безпечний профіль для Android по Wi-Fi. Коротші анімації, менше фонового радіо, очищення кешу.
              Програми, фото й облікові записи залишаються на місці.
            </p>
          </div>
          <Badge variant="outline" className="h-7 px-3 font-mono text-[0.7rem] tracking-wide">
            {health == null ? "перевіряю adb" : health.adb ? `adb ${health.version}` : "adb не знайдено"}
          </Badge>
        </header>

        {error ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            {notice}
          </p>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Підключення</CardTitle>
              <CardDescription>Адреса з екрана «Бездротове налагодження».</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="host">IP-адреса</Label>
                  <Input
                    id="host"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 font-mono"
                    disabled={busy != null}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="port">Порт</Label>
                  <Input
                    id="port"
                    inputMode="numeric"
                    value={port}
                    onChange={(event) => setPort(event.target.value)}
                    className="h-10 font-mono"
                    disabled={busy != null}
                  />
                </div>
              </div>
              <Button type="button" className="h-11 w-full" onClick={readState} disabled={busy != null || qrOpen}>
                {busy?.startsWith("Зчитую") ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Зчитати стан
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full"
                onClick={() => {
                  setError(null);
                  setNotice(null);
                  setQrOpen(true);
                }}
                disabled={busy != null || qrOpen}
              >
                <QrCode />
                Сполучити через QR
              </Button>
              <button
                type="button"
                className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setPairOpen((open) => !open)}
              >
                {pairOpen ? "Сховати код сполучення" : "Є код сполучення"}
              </button>
              {pairOpen ? (
                <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="pair-port">Порт коду</Label>
                      <Input
                        id="pair-port"
                        inputMode="numeric"
                        value={pairPort}
                        onChange={(event) => setPairPort(event.target.value)}
                        className="h-10 font-mono"
                        disabled={busy != null}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="pair-code">6 цифр</Label>
                      <Input
                        id="pair-code"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={6}
                        value={pairCode}
                        onChange={(event) => setPairCode(event.target.value)}
                        className="h-10 font-mono tracking-[0.2em]"
                        disabled={busy != null}
                      />
                    </div>
                  </div>
                  <Button type="button" variant="secondary" className="h-10" onClick={pair} disabled={busy != null}>
                    {busy?.startsWith("Сполучаю") ? <Loader2 className="animate-spin" /> : null}
                    Сполучити
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            {device ? (
              <DevicePanel device={device} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Як відкрити планшет</CardTitle>
                  <CardDescription>
                    Ця сторінка керує планшетом лише з комп’ютера в тій самій мережі. З хмари до 192.168.1.83 маршруту немає.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-4 text-sm leading-relaxed">
                    <li className="flex gap-3">
                      <span className="font-mono text-primary">01</span>
                      <span>На планшеті: Налаштування → Про планшет → сім натискань на «Номер збірки», доки не з’явиться режим розробника.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-mono text-primary">02</span>
                      <span>У «Для розробників» увімкніть «Бездротове налагодження». Планшет і комп’ютер мають бути в одному Wi-Fi.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-mono text-primary">03</span>
                      <span>
                        Найпростіше: натисніть «Сполучити через QR», на планшеті відкрийте «Сполучити пристрій через QR-код» і наведіть камеру на код зі сторінки.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-mono text-primary">04</span>
                      <span>
                        Або вручну: з рядка «IP-адреса й порт» перенесіть адресу й порт ліворуч (часто не 5555). Якщо треба код — відкрийте «Є код сполучення».
                      </span>
                    </li>
                  </ol>
                  <p className="mt-5 text-sm text-muted-foreground">
                    На Android 10 і старіших QR немає. Один раз підключіть кабель і виконайте <span className="font-mono text-foreground">adb tcpip 5555</span>. Після цього порт 5555 слухає Wi-Fi.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Профіль</CardTitle>
                <CardDescription>
                  {selected} {selected === 1 ? "крок" : selected >= 2 && selected <= 4 ? "кроки" : "кроків"}. Нічого не видаляється і планшет не скидається.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {OPTION_CATALOG.map((item, index) => (
                  <div key={item.key}>
                    {index > 0 ? <Separator className="mb-4" /> : null}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Label htmlFor={item.key}>{item.title}</Label>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                      </div>
                      <Switch
                        id={item.key}
                        checked={options[item.key]}
                        disabled={busy != null}
                        onCheckedChange={(checked) => setOptions((current) => ({ ...current, [item.key]: checked }))}
                      />
                    </div>
                  </div>
                ))}
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <Button type="button" className="h-11 flex-1" onClick={optimize} disabled={busy != null}>
                    {busy?.startsWith("Застосовую") ? <Loader2 className="animate-spin" /> : null}
                    Застосувати профіль
                  </Button>
                  <Button type="button" variant="outline" className="h-11 sm:w-auto" onClick={restore} disabled={busy != null}>
                    {busy?.startsWith("Повертаю") ? <Loader2 className="animate-spin" /> : null}
                    Повернути стандарт
                  </Button>
                </div>
                {busy ? <p className="text-sm text-muted-foreground">{busy}</p> : null}
              </CardContent>
            </Card>

            {results ? (
              <Card>
                <CardHeader>
                  <CardTitle>Що змінилося</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {results.map((step) => (
                    <div key={step.id} className="flex gap-3 text-sm">
                      {step.ok ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : <X className="mt-0.5 size-4 shrink-0 text-destructive" />}
                      <div>
                        <p className="font-medium">{step.title}</p>
                        <p className="text-muted-foreground">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </main>

      <QrPairDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        onPaired={handleQrPaired}
        onError={(message) => {
          setNotice(null);
          setError(message);
        }}
      />
    </div>
  );
}

function Meter({ value }: { value: number | null }) {
  const width = value ?? 0;
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10">
      <div
        className={width >= 90 ? "h-full rounded-full bg-destructive" : "h-full rounded-full bg-primary"}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function DevicePanel({ device }: { device: DeviceSnapshot }) {
  const memoryUsed = usedPercent(Math.max(0, device.memTotalKb - device.memAvailableKb), device.memTotalKb);
  const storageUsed = usedPercent(device.storageUsedKb, device.storageTotalKb);
  const notes = adviceFor(device);
  const peak = device.processes[0]?.pssKb ?? 1;

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-muted-foreground">
              <BatteryMedium className="size-4" /> Батарея
            </span>
            <p className="font-heading text-2xl tabular-nums">{batteryPhrase(device.batteryStatus, device.plugged, device.batteryLevel)}</p>
            <p className="text-muted-foreground">{formatTemp(device.batteryTempC)} · працює {formatUptime(device.uptimeSec)}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-muted-foreground">
              <MemoryStick className="size-4" /> Пам’ять
            </span>
            <p className="font-heading text-2xl tabular-nums">{formatKb(device.memAvailableKb)} вільно</p>
            <p className="text-muted-foreground">з {formatKb(device.memTotalKb)}</p>
            <Meter value={memoryUsed} />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="size-4" /> Сховище
            </span>
            <p className="font-heading text-2xl tabular-nums">{storageUsed == null ? "—" : `${storageUsed}%`}</p>
            <p className="text-muted-foreground">{formatKb(device.storageAvailKb)} вільно з {formatKb(device.storageTotalKb)}</p>
            <Meter value={storageUsed} />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col gap-1">
            <span className="text-muted-foreground">Система</span>
            <p className="font-heading text-2xl">Android {device.android || "—"}</p>
            <p className="text-muted-foreground">
              SDK {device.sdk || "—"} · анімації {scaleLabel(device.animations.window)} · {device.userPackages} програм
            </p>
          </CardContent>
        </Card>
      </div>

      {notes.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Що тримає пам’ять</CardTitle>
          <CardDescription>{device.build || device.serial}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {device.processes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Прошивка не віддала список процесів.</p>
          ) : (
            device.processes.map((process) => (
              <div key={process.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium">{process.label}</p>
                    <p className="shrink-0 font-mono text-xs text-muted-foreground">{formatKb(process.pssKb)}</p>
                  </div>
                  {process.label !== process.name ? <p className="truncate font-mono text-xs text-muted-foreground">{process.name}</p> : null}
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.max(6, Math.round((process.pssKb / peak) * 100))}%` }} />
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
