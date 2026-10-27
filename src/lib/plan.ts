import { sanitizeTimeout } from "./endpoint";
import type { OptimizeOptions, StepResult } from "./types";

export type PlannedStep = {
  id: string;
  title: string;
  shell: string;
  expect: (chunk: string) => { ok: boolean; detail: string };
};

export type OptionKey = keyof OptimizeOptions;

export const OPTION_CATALOG: {
  key: OptionKey;
  title: string;
  detail: string;
}[] = [
  {
    key: "animations",
    title: "Коротші анімації",
    detail: "Вікна, переходи й аніматори на 0,5×. Інтерфейс відгукується швидше і лишається плавним.",
  },
  {
    key: "scans",
    title: "Менше фонового сканування",
    detail: "Вимикає постійний пошук Wi-Fi і Bluetooth. Економить батарею. Геолокація в приміщенні може стати трохи грубішою.",
  },
  {
    key: "adaptiveBattery",
    title: "Адаптивна батарея",
    detail: "Система обмежує програми, якими давно не користувались, і вмикає режим очікування.",
  },
  {
    key: "trimCaches",
    title: "Очистити кеш",
    detail: "Забирає кеш програм. Фото, завантаження й облікові записи не чіпає. Перший запуск після цього може бути довшим.",
  },
  {
    key: "dexopt",
    title: "Прискорити запуск програм",
    detail: "Ставить у чергу фонову оптимізацію ART. Кілька хвилин планшет може бути теплішим.",
  },
  {
    key: "fstrim",
    title: "Обслуговування сховища",
    detail: "Надсилає fstrim для внутрішньої пам’яті. На старих планшетах це повертає швидкість запису.",
  },
  {
    key: "memoryLimit",
    title: "Ліміт фонових процесів",
    detail: "Не більше 4 кешованих процесів. Може затримувати сповіщення, тому вимкнено, доки самі не увімкнете.",
  },
  {
    key: "screenTimeout",
    title: "Гасити екран через хвилину",
    detail: "Тайм-аут екрана 60 секунд, якщо планшет часто лишається увімкненим.",
  },
];

function readValue(chunk: string, key: string): string | null {
  const match = chunk.match(new RegExp(`(?:^|\\n)${key}=([^\\n\\r]*)`));
  if (!match) return null;
  const value = match[1].trim();
  return value === "" ? null : value;
}

function asNumber(value: string | null): number | null {
  if (value == null || value === "null") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function near(value: number | null, target: number, epsilon = 0.02): boolean {
  return value != null && Math.abs(value - target) <= epsilon;
}

function failed(chunk: string, why: string): { ok: false; detail: string } {
  const extra = chunk
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("@@") && !line.includes("="))
    .slice(-2)
    .join(" · ");
  const detail = extra ? `${why} ${extra}` : why;
  return { ok: false, detail: detail.slice(0, 280) };
}

const STEPS: Record<OptionKey, PlannedStep> = {
  animations: {
    id: "animations",
    title: "Коротші анімації",
    shell: `
settings put global window_animation_scale 0.5
settings put global transition_animation_scale 0.5
settings put global animator_duration_scale 0.5
echo window=$(settings get global window_animation_scale)
echo transition=$(settings get global transition_animation_scale)
echo animator=$(settings get global animator_duration_scale)
`.trim(),
    expect: (chunk) => {
      const windowScale = asNumber(readValue(chunk, "window"));
      const transition = asNumber(readValue(chunk, "transition"));
      const animator = asNumber(readValue(chunk, "animator"));
      if (near(windowScale, 0.5) && near(transition, 0.5) && near(animator, 0.5)) {
        return { ok: true, detail: "Вікно, переходи й аніматори стоять на 0,5×." };
      }
      return failed(chunk, "Планшет не підтвердив шкалу 0,5×.");
    },
  },
  scans: {
    id: "scans",
    title: "Менше фонового сканування",
    shell: `
settings put global wifi_scan_always_enabled 0
settings put global ble_scan_always_enabled 0
echo wifi=$(settings get global wifi_scan_always_enabled)
echo ble=$(settings get global ble_scan_always_enabled)
`.trim(),
    expect: (chunk) => {
      if (readValue(chunk, "wifi") === "0" && readValue(chunk, "ble") === "0") {
        return { ok: true, detail: "Постійне сканування Wi-Fi і Bluetooth вимкнено." };
      }
      return failed(chunk, "Сканування лишилось увімкненим.");
    },
  },
  adaptiveBattery: {
    id: "battery",
    title: "Адаптивна батарея",
    shell: `
settings put global adaptive_battery_management_enabled 1
settings put global app_standby_enabled 1
echo adaptive=$(settings get global adaptive_battery_management_enabled)
echo standby=$(settings get global app_standby_enabled)
`.trim(),
    expect: (chunk) => {
      const adaptive = readValue(chunk, "adaptive");
      const standby = readValue(chunk, "standby");
      if (adaptive === "1") {
        return { ok: true, detail: "Адаптивну батарею й режим очікування програм увімкнено." };
      }
      if ((adaptive == null || adaptive === "null") && standby === "1") {
        return {
          ok: true,
          detail: "Режим очікування програм увімкнено. Ця прошивка не має окремого ключа адаптивної батареї.",
        };
      }
      return failed(chunk, "Планшет не підтвердив адаптивну батарею.");
    },
  },
  trimCaches: {
    id: "trim",
    title: "Очистити кеш",
    shell: `
pm trim-caches 34359738368 2>&1
trim_status=$?
if [ "$trim_status" -ne 0 ]; then
  cmd package trim-caches 34359738368 2>&1
  trim_status=$?
fi
echo trim_exit=$trim_status
`.trim(),
    expect: (chunk) => {
      if (readValue(chunk, "trim_exit") === "0") {
        return { ok: true, detail: "Кеш програм урізано. Файли й облікові записи не чіпались." };
      }
      return failed(chunk, "Очистити кеш не вдалося.");
    },
  },
  dexopt: {
    id: "dexopt",
    title: "Прискорити запуск програм",
    shell: `
cmd package bg-dexopt-job 2>&1
echo dex_exit=$?
`.trim(),
    expect: (chunk) => {
      const exit = readValue(chunk, "dex_exit");
      if (exit === "0" || /success|already running/i.test(chunk)) {
        return { ok: true, detail: "Фонову оптимізацію запуску програм поставлено в чергу." };
      }
      return failed(chunk, "Ця прошивка не прийняла фонову оптимізацію.");
    },
  },
  fstrim: {
    id: "fstrim",
    title: "Обслуговування сховища",
    shell: `
sm fstrim 2>&1
echo fs_exit=$?
`.trim(),
    expect: (chunk) => {
      if (readValue(chunk, "fs_exit") === "0") {
        return { ok: true, detail: "Сховище отримало команду обслуговування." };
      }
      return failed(chunk, "fstrim недоступний без додаткових прав. Решта кроків від цього не залежить.");
    },
  },
  memoryLimit: {
    id: "memory",
    title: "Ліміт фонових процесів",
    shell: `
settings put global background_process_limit 4
echo bg_limit=$(settings get global background_process_limit)
`.trim(),
    expect: (chunk) => {
      if (readValue(chunk, "bg_limit") === "4") {
        return { ok: true, detail: "Кешованих фонових процесів тепер не більше 4." };
      }
      return failed(chunk, "Ліміт фонових процесів не застосувався.");
    },
  },
  screenTimeout: {
    id: "timeout",
    title: "Гасити екран через хвилину",
    shell: `
settings put system screen_off_timeout 60000
echo screen_timeout=$(settings get system screen_off_timeout)
`.trim(),
    expect: (chunk) => {
      if (readValue(chunk, "screen_timeout") === "60000") {
        return { ok: true, detail: "Екран гасне через 60 секунд бездіяльності." };
      }
      return failed(chunk, "Тайм-аут екрана не змінився.");
    },
  },
};

const OPTION_ORDER: OptionKey[] = [
  "animations",
  "scans",
  "adaptiveBattery",
  "trimCaches",
  "dexopt",
  "fstrim",
  "memoryLimit",
  "screenTimeout",
];

export function buildOptimizePlan(options: OptimizeOptions): PlannedStep[] {
  return OPTION_ORDER.filter((key) => options[key]).map((key) => STEPS[key]);
}

export function buildRestorePlan(screenOffTimeoutMs?: string): PlannedStep[] {
  const previousTimeout = sanitizeTimeout(screenOffTimeoutMs);
  const steps: PlannedStep[] = [
    {
      id: "animations",
      title: "Стандартні анімації",
      shell: `
settings put global window_animation_scale 1
settings put global transition_animation_scale 1
settings put global animator_duration_scale 1
echo window=$(settings get global window_animation_scale)
echo transition=$(settings get global transition_animation_scale)
echo animator=$(settings get global animator_duration_scale)
`.trim(),
      expect: (chunk) => {
        const ok =
          near(asNumber(readValue(chunk, "window")), 1) &&
          near(asNumber(readValue(chunk, "transition")), 1) &&
          near(asNumber(readValue(chunk, "animator")), 1);
        return ok
          ? { ok: true, detail: "Анімації повернуто на 1×." }
          : failed(chunk, "Анімації лишились скороченими.");
      },
    },
    {
      id: "scans",
      title: "Фонове сканування",
      shell: `
settings put global wifi_scan_always_enabled 1
settings put global ble_scan_always_enabled 1
echo wifi=$(settings get global wifi_scan_always_enabled)
echo ble=$(settings get global ble_scan_always_enabled)
`.trim(),
      expect: (chunk) => {
        if (readValue(chunk, "wifi") === "1" && readValue(chunk, "ble") === "1") {
          return { ok: true, detail: "Постійне сканування Wi-Fi і Bluetooth знову ввімкнено." };
        }
        return failed(chunk, "Сканування не повернулось.");
      },
    },
    {
      id: "memory",
      title: "Стандартний ліміт процесів",
      shell: `
settings delete global background_process_limit
echo bg_limit=$(settings get global background_process_limit)
`.trim(),
      expect: (chunk) => {
        const limit = readValue(chunk, "bg_limit");
        if (limit == null || limit === "null") {
          return { ok: true, detail: "Ліміт фонових процесів знову вирішує система." };
        }
        return failed(chunk, "Ліміт процесів лишився зміненим.");
      },
    },
  ];

  if (previousTimeout) {
    steps.push({
      id: "timeout",
      title: "Попередній тайм-аут екрана",
      shell: `
settings put system screen_off_timeout ${previousTimeout}
echo screen_timeout=$(settings get system screen_off_timeout)
`.trim(),
      expect: (chunk) => {
        if (readValue(chunk, "screen_timeout") === previousTimeout) {
          return {
            ok: true,
            detail: `Тайм-аут екрана повернуто на ${Math.round(Number(previousTimeout) / 1000)} с.`,
          };
        }
        return failed(chunk, "Тайм-аут екрана не повернувся.");
      },
    });
  }

  return steps;
}

export function renderScript(steps: PlannedStep[]): string {
  const body = steps
    .map((step) => `echo @@STEP:${step.id}@@\n${step.shell}\necho @@END:${step.id}@@`)
    .join("\n");
  return `set +e\n${body}\n`;
}

export function parseStepOutput(raw: string, steps: PlannedStep[]): StepResult[] {
  return steps.map((step) => {
    const match = raw.match(new RegExp(`@@STEP:${step.id}@@\\n([\\s\\S]*?)@@END:${step.id}@@`));
    if (!match) {
      return {
        id: step.id,
        title: step.title,
        ok: false,
        detail: "Планшет не повернув результат цього кроку.",
      };
    }
    const outcome = step.expect(match[1]);
    return { id: step.id, title: step.title, ok: outcome.ok, detail: outcome.detail };
  });
}
