# Xiaomi 14T Pro

Безпечна оптимізація Xiaomi 14T Pro (HyperOS) по Wi-Fi. Профіль скорочує анімації, вимикає постійне сканування Wi-Fi і Bluetooth, вмикає адаптивну батарею і Doze, ставить екран на 144 Гц з підлогою 60 Гц, заморожує кеш програм, вимикає рекламу HyperOS для користувача, чистить кеш, ставить у чергу оптимізацію запуску і надсилає обслуговування сховища.

Камера, дзвінки, лаунчер, Joyose, PowerKeeper, фото, облікові записи й системні сервіси не чіпаються. Телефон не скидається. Рекламні пакети лише вимикаються і повертаються кнопкою «Повернути стандарт».

Оптимізатор має працювати на комп’ютері в тій самій мережі, що й телефон. З віддаленої машини домашню адресу не видно.

## Підготовка телефону

1. Налаштування → Про телефон → сім натискань на «Версія HyperOS» (якщо пункту немає — на «Номер збірки»).
2. Додаткові налаштування → Для розробників → увімкнути «Бездротове налагодження». Екран не гасіть.
3. На Android 11 і новіших найпростіше сполучити через QR: у веб-інтерфейсі «Сполучити через QR», на телефоні — «Сполучити пристрій через QR-код».
4. Альтернатива: код сполучення (порт коду і порт підключення різні).

Потрібен [Android Debug Bridge](https://developer.android.com/tools/adb) у `PATH`.

Linux:

```bash
sudo apt install adb
```

Windows, якщо `adb` «не є внутрішньою чи зовнішньою командою»:

```bat
winget install -e --id Google.PlatformTools
```

Закрийте вікно `cmd` і відкрийте нове. Код сполучення живе, лише поки на телефоні відкрите вікно з цифрами, тому після встановлення візьміть новий код. Порт коду і порт підключення різні.

```bat
adb pair 192.168.1.59:ПОРТ_КОДУ КОД
adb connect 192.168.1.59:ПОРТ_ПІДКЛЮЧЕННЯ
adb devices -l
```

Якщо `winget` немає, розпакуйте [platform-tools-latest-windows.zip](https://dl.google.com/android/repository/platform-tools-latest-windows.zip) у `C:\platform-tools` і викликайте `C:\platform-tools\adb.exe`.

## Запуск

```bash
npm install
npm run dev
```

Відкрийте http://127.0.0.1:43117. Натисніть «Сполучити через QR», на телефоні відкрийте «Сполучити пристрій через QR-код» і наведіть камеру на код. Після сполучення зчитайте стан і застосуйте профіль.

Те саме з термінала через QR:

```bash
npm run optimize -- --qr
```

Або вручну, порт підставте свій:

```bash
npm run optimize -- --host 192.168.1.20 --port 41555
```

Сполучення кодом:

```bash
npm run optimize -- --host 192.168.1.20 --pair-port 37123 --code 123456 --port 41555
```

Повернути анімації, сканування, ліміт процесів і рекламні служби HyperOS. Частоту екрана веб-інтерфейс повертає сам; з термінала передайте значення, які були до оптимізації:

```bash
npm run optimize -- --host 192.168.1.20 --port 41555 --restore --peak 120 --min 60
```

Подивитись команди, не торкаючись телефону:

```bash
npm run optimize -- --dry-run
```

Без кроків 14T Pro (частота, сон, заморозка, реклама HyperOS):

```bash
npm run optimize -- --dry-run --no-xiaomi
```

Додаткові кроки, вимкнені за замовчуванням. Ліміт фонових процесів на 14T Pro краще не вмикати: він затримує сповіщення.

```bash
npm run optimize -- --with-memory-limit --with-screen-timeout
```

## Реклама / шпигунські додатки

Спочатку dry-run, потім застосування (Settings, GMS, камера, лаунчер і Joyose не чіпає):

```bash
npm run optimize -- --detox-dry-run --host 192.168.1.20 --port 44853
npm run optimize -- --detox --host 192.168.1.20 --port 44853
```

На Windows без Node — скрипт у `scripts/detox-tablet.ps1` (запускати з папки `platform-tools`):

```powershell
powershell -ExecutionPolicy Bypass -File C:\path\to\Cursor\scripts\detox-tablet.ps1 -Serial 192.168.1.20:44853 -DryRun
powershell -ExecutionPolicy Bypass -File C:\path\to\Cursor\scripts\detox-tablet.ps1 -Serial 192.168.1.20:44853
.\adb -s 192.168.1.20:44853 reboot
```

## Перевірка

```bash
npm test
npm run lint
```
