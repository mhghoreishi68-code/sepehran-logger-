# Sepehran Logger — Android project (stage 1)

نصب سریع روی موبایل / first installable build.

The approved UI runs in a WebView from `app/src/main/assets/www/index.html`; NFC, camera,
local storage, vibration, audit and Android back navigation are **real native features**
exposed through `SepehranBridge`. Screens migrate to Compose one at a time later without
changing that contract. Package `ir.sepehran.logger` (debug installs as `…​.debug`),
label **Sepehran Logger / دیتالاگر سپهران**.

---

## A. ساخت APK بدون اندروید استودیو (ساده‌ترین راه)

اگر فقط می‌خواهید فایل نصبی را روی گوشی بگذارید، لازم نیست چیزی روی کامپیوتر نصب کنید:

1. یک مخزن (repository) خالی در GitHub بسازید — می‌تواند private باشد.
2. کل محتویات این پوشه را در آن آپلود کنید (دکمه **Add file → Upload files**؛ پوشه
   `.github` را هم حتماً آپلود کنید — اگر GitHub آن را نشان نداد، از طریق Git یا
   drag-and-drop کل پوشه اقدام کنید).
3. به تب **Actions** بروید → workflow با نام **Build APK** → دکمه **Run workflow**.
4. حدود ۴ تا ۶ دقیقه صبر کنید. پس از پایان، در همان صفحه بخش **Artifacts** ظاهر می‌شود:
   `SepehranLogger-debug-apk` را دانلود کنید (یک فایل zip است).
5. zip را باز کنید → `SepehranLogger-debug.apk` را به گوشی منتقل کنید → روی آن بزنید →
   اجازه «نصب برنامه‌های ناشناس» را بدهید → نصب.

فایل workflow در `.github/workflows/build-apk.yml` قرار دارد و از Gradle مستقیم استفاده
می‌کند، چون فایل باینری `gradle-wrapper.jar` در این بسته نیست.

## B. ساخت با اندروید استودیو

1. پوشه را به `SepehranLogger` تغییر نام دهید.
2. Android Studio (Ladybug یا جدیدتر) → **Open** → همین پوشه (جایی که
   `settings.gradle.kts` هست) → **Trust Project**.
3. اگر برای Gradle wrapper پیام داد، اجازه بدهید بسازد، یا در ترمینال:
   `gradle wrapper --gradle-version 8.9`.
4. SDK Platform **35** و JDK **17** لازم است
   (Settings → Build → Gradle → Gradle JDK → 17).
5. **File → Sync Project with Gradle Files**.
6. **Build → Build Bundle(s)/APK(s) → Build APK(s)** یا در ترمینال `./gradlew assembleDebug`.

خروجی:

```
app/build/outputs/apk/debug/SepehranLogger-debug.apk
```

نصب با USB: `adb install -r app/build/outputs/apk/debug/SepehranLogger-debug.apk`

---

## نقشه پوشه‌ها

```
SepehranLogger/
├─ .github/workflows/build-apk.yml   ساخت ابری APK
├─ settings.gradle.kts · build.gradle.kts · gradle.properties
├─ gradle/wrapper/gradle-wrapper.properties
└─ app/
   ├─ build.gradle.kts · proguard-rules.pro
   └─ src/main/
      ├─ AndroidManifest.xml
      ├─ java/ir/sepehran/logger/
      │   ├─ SepehranApplication.kt   WebView debugging on debug builds
      │   ├─ MainActivity.kt          WebView host, NFC dispatch, camera intent, back
      │   └─ SepehranBridge.kt        window.SepehranAndroid — the native surface
      ├─ assets/www/index.html        رابط کاربری کامل (EN + FA/RTL)
      └─ res/  values, values-fa, values-night, drawable, mipmap, xml
```

## آنچه در این نسخه کار می‌کند

اسپلش ← ورود (`m.rahimi` + هر گذرواژه‌ای؛ نام کاربری دیگر خطای اعتبارسنجی می‌دهد) ←
خانه/مسیر شیفت ← جست‌وجوی تجهیزات با فیلتر زنده و چیپ ناحیه ← اسکن NFC (شامل حالت
تگ ثبت‌نشده و NFC خاموش) ← سربرگ تجهیز ← ثبت پارامتر با طبقه‌بندی زنده
عادی / غیرعادی / بحرانی / ثبت‌نشده ← سیاست عکس هر پارامتر (اجباری، اختیاری، غیرفعال) ←
مشاهدات تا ۴۰۰ نویسه با شمارنده ← ذخیره محلی و صفحه تأیید ← داشبورد سرپرست
(تکمیل، تأخیر، ثبت‌نشده، غیرعادی در سطح تجهیز و پارامتر) ← داده پایه (فهرست تجهیزات
و پارامترها) ← صف همگام‌سازی.

کلید **فا / EN** در هدر، کل برنامه را به فارسی و چیدمان راست‌به‌چپ می‌برد.
کلید **روشن / شب** هم رابط و هم نوارهای سیستمی را عوض می‌کند.

تگ NFC ثبت‌شده مستقیماً تجهیزش را باز می‌کند (UIDها در `MASTER.equipment[].nfc` هستند —
با شماره تگ‌های واقعی خودتان جایگزین کنید). UID ناشناس، حالت خطای قابل‌بازگشت نشان می‌دهد.

## محدودیت‌های این مرحله

- **فونت‌ها:** Barlow و Vazirmatn بسته‌بندی نشده‌اند و فونت سیستم جایگزین می‌شود. برای
  تطابق دقیق با طرح، فایل‌های `Barlow-Regular.ttf`، `Barlow-SemiBold.ttf`،
  `BarlowCondensed-SemiBold.ttf` و `Vazirmatn-Regular.ttf` را در
  `assets/www/fonts/` بگذارید و `@font-face` اضافه کنید.
- داده پایه هنوز در شیء `MASTER` جاوااسکریپت است، نه Room. همگام‌سازی واقعی،
  اعمال RBAC و زمان‌بندی خودکار در فازهای بعدی می‌آید.
- عکس‌ها به ۱۲۸۰ پیکسل و JPEG 80 کاهش می‌یابند و فقط در حافظه خصوصی برنامه ذخیره می‌شوند.
- آیکون برنامه یک وکتور موقت (عقربه گیج) است؛ با طرح نهایی جایگزین شود.

## مرحله بعد

طبق جدول فازها در سند **Sepehran Logger — Build Spec**: اسکیمای Room و احراز هویت
(فازهای ۲ تا ۴)، صفحه بومی NFC (۵)، CameraX (۶)، همگام‌سازی با WorkManager (۷)،
زمان‌بندی و داشبورد (۸). هر فاز یک متد از پل بومی را با مخزن واقعی جایگزین می‌کند تا
در نهایت `MainActivity` به یک NavHost کامپوز تبدیل شود.
