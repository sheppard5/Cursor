import { sanitizeTimeout } from "./endpoint";
import type { OptimizeOptions, StepResult } from "./types";
import { hyperPackageScript, refreshApplyScript, refreshRestoreScript } from "./xiaomi";

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
  group?: string;
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
    key: "refresh",
    title: "Екран 144 Гц",
    detail:
      "Пік 144 Гц і підлога 60 Гц — рідна матриця Xiaomi 14T Pro. Прокрутка лишається плавною, простій економить батарею.",
    group: "Xiaomi 14T Pro",
  },
  {
    key: "appFreezer",
    title: "Заморожувати кеш програм",
    detail: "Android тримає фонові програми замороженими, доки вони не потрібні. Менше фонової роботи.",
    group: "Xiaomi 14T Pro",
  },
  {
    key: "doze",
    title: "Глибокий сон",
    detail: "Увімкнути Doze, щоб телефон спав між перевірками мережі, коли екран вимкнений.",
    group: "Xiaomi 14T Pro",
  },
  {
    key: "hyperAds",
    title: "Реклама HyperOS",
    detail:
      "Ховає для вашого користувача аналітику Xiaomi, карусель екрана блокування, GetApps, Game Center і тихі служби Facebook. На HyperOS 2 вимкнення системних пакетів заборонене, тому такі пакети знімаються лише для користувача 0 і повертаються кнопкою «Повернути стандарт». Камера, дзвінки, лаунчер, Joyose і PowerKeeper не чіпаються.",
    group: "Xiaomi 14T Pro",
  },
  {
    key: "trimCaches",
    title: "Очистити кеш",
    detail: "Забирає кеш програм. Фото, завантаження й облікові записи не чіпає. Перший запуск після цього може бути довшим.",
  },
  {
    key: "dexopt",
    title: "Прискорити запуск програм",
    detail: "Ставить у чергу фонову оптимізацію ART. Кілька хвилин телефон може бути теплішим.",
  },
  {
    key: "fstrim",
    title: "Обслуговування сховища",
    detail: "Надсилає fstrim для внутрішньої пам’яті. Повертає швидкість запису, коли накопичилось сміття флеш-пам’яті.",
  },
  {
    key: "memoryLimit",
    title: "Ліміт фонових процесів",
    detail:
      "Не більше 4 кешованих процесів. На 14T Pro не вмикайте: 12 ГБ вистачає, а ліміт затримує сповіщення.",
  },
  {
    key: "screenTimeout",
    title: "Гасити екран через хвилину",
    detail: "Тайм-аут екрана 60 секунд, якщо телефон часто лишається увімкненим.",
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

function hz(value: string | null, target: number): boolean {
  return near(asNumber(value), target, 0.05);
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
      return failed(chunk, "Телефон не підтвердив шкалу 0,5×.");
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
      return failed(chunk, "Телефон не підтвердив адаптивну батарею.");
    },
  },
  refresh: {
    id: "refresh",
    title: "Екран 144 Гц",
    shell: refreshApplyScript(),
    expect: (chunk) => {
      if (hz(readValue(chunk, "peak"), 144) && hz(readValue(chunk, "min"), 60)) {
        return { ok: true, detail: "Пік екрана 144 Гц, у спокої матриця може спадати до 60 Гц." };
      }
      return failed(chunk, "Телефон не підтвердив 144/60 Гц.");
    },
  },
  appFreezer: {
    id: "freezer",
    title: "Заморожувати кеш програм",
    shell: `
settings put global cached_apps_freezer enabled
echo freezer=$(settings get global cached_apps_freezer)
`.trim(),
    expect: (chunk) => {
      if (readValue(chunk, "freezer") === "enabled") {
        return { ok: true, detail: "Кеш фонових програм заморожується, доки програма не потрібна." };
      }
      return failed(chunk, "Прошивка не прийняла заморозку кешу.");
    },
  },
  doze: {
    id: "doze",
    title: "Глибокий сон",
    shell: `
dumpsys deviceidle enable >/dev/null 2>&1
echo doze=$(dumpsys deviceidle enabled 2>/dev/null | tr -d '[:space:]')
`.trim(),
    expect: (chunk) => {
      const value = (readValue(chunk, "doze") ?? "").toLowerCase();
      if (value === "1" || value === "true" || value === "enabled") {
        return { ok: true, detail: "Doze увімкнено: телефон спить між перевірками мережі." };
      }
      return failed(chunk, "Прошивка не підтвердила глибокий сон.");
    },
  },
  hyperAds: {
    id: "hyper",
    title: "Реклама HyperOS",
    shell: hyperPackageScript("disable"),
    expect: (chunk) => {
      const failedCount = readValue(chunk, "hyper_failed");
      const disabled = readValue(chunk, "hyper_disabled");
      const skipped = readValue(chunk, "hyper_skipped");
      if (failedCount == null || disabled == null) {
        return failed(chunk, "Телефон не повернув результат вимкнення реклами.");
      }
      if (failedCount !== "0") {
        const names = (readValue(chunk, "hyper_failed_names") ?? "").trim();
        const suffix = names ? ` ${names}` : "";
        return { ok: false, detail: `Не вдалося вимкнути:${suffix}`.slice(0, 280) };
      }
      if (disabled === "0") {
        return {
          ok: true,
          detail: "Рекламних пакетів Xiaomi на цьому телефоні немає. Камеру, дзвінки й лаунчер не чіпали.",
        };
      }
      return {
        ok: true,
        detail: `Вимкнено служб: ${disabled}. Немає на прошивці: ${skipped ?? "0"}. Камера, дзвінки, лаунчер і Joyose на місці.`,
      };
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
  "refresh",
  "appFreezer",
  "doze",
  "hyperAds",
  "trimCaches",
  "dexopt",
  "fstrim",
  "memoryLimit",
  "screenTimeout",
];

export function buildOptimizePlan(options: OptimizeOptions): PlannedStep[] {
  return OPTION_ORDER.filter((key) => options[key]).map((key) => STEPS[key]);
}

export type RefreshRestore = {
  peak?: string;
  min?: string;
};

function hyperRestoreStep(): PlannedStep {
  return {
    id: "hyper",
    title: "Реклама HyperOS знову ввімкнена",
    shell: hyperPackageScript("enable"),
    expect: (chunk) => {
      const failedCount = readValue(chunk, "hyper_failed");
      const enabled = readValue(chunk, "hyper_enabled");
      if (failedCount == null || enabled == null) {
        return failed(chunk, "Телефон не повернув результат увімкнення служб Xiaomi.");
      }
      if (failedCount !== "0") {
        const names = (readValue(chunk, "hyper_failed_names") ?? "").trim();
        return { ok: false, detail: `Не вдалося увімкнути: ${names || "частину служб"}.`.slice(0, 280) };
      }
      if (enabled === "0") {
        return { ok: true, detail: "Рекламних пакетів Xiaomi на телефоні немає, вмикати нічого." };
      }
      return { ok: true, detail: `Знову ввімкнено служб HyperOS: ${enabled}.` };
    },
  };
}

function refreshRestoreStep(refresh: RefreshRestore): PlannedStep {
  return {
    id: "refresh",
    title: "Попередня частота екрана",
    shell: refreshRestoreScript(refresh.peak, refresh.min),
    expect: (chunk) => {
      const peak = readValue(chunk, "peak");
      const min = readValue(chunk, "min");
      const absent = (value: string | null) => value == null || value === "null";
      const peakOk = refresh.peak ? hz(peak, Number(refresh.peak)) : absent(peak);
      const minOk = refresh.min ? hz(min, Number(refresh.min)) : absent(min);
      if (peakOk && minOk) {
        if (!refresh.peak && !refresh.min) {
          return { ok: true, detail: "Частоту екрана знову вирішує HyperOS." };
        }
        const peakLabel = refresh.peak ?? "авто";
        const minLabel = refresh.min ?? "авто";
        return { ok: true, detail: `Частоту екрана повернуто: пік ${peakLabel} Гц, підлога ${minLabel} Гц.` };
      }
      return failed(chunk, "Частота екрана не повернулась.");
    },
  };
}

export function buildRestorePlan(screenOffTimeoutMs?: string, refresh?: RefreshRestore): PlannedStep[] {
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
    hyperRestoreStep(),
  ];

  if (refresh) steps.push(refreshRestoreStep(refresh));

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
