/* =============================================================================
   sepehran-core.js — the single data + authentication layer.

   Web admin and the mobile app both load THIS file. There is one user table,
   one master-data store and one session, shared between them (same browser
   origin → same localStorage). Creating a user in the web admin lets that user
   sign in on mobile; deactivating them there denies mobile authentication.

   ── Replacing this with the real backend ───────────────────────────────────
   Every read/write goes through Core.api.<method>(). Each method mirrors an
   endpoint from §E of the architecture document, so switching to SQL Server is
   editing this one file:

       list(entity, filter)        →  GET  /api/v1/{entity}
       create(entity, values)      →  PUT  /api/v1/{entity}/{id}
       update(entity, id, values)  →  PUT  /api/v1/{entity}/{id}
       setStatus(entity, id, st)   →  POST /api/v1/master-data/{e}/{id}/status
       references(entity, id)      →  GET  /api/v1/master-data/references/{e}/{id}
       remove(entity, id)          →  DELETE (refused when referenced)
       login / logout / session    →  POST /api/v1/auth/*

   Business rules live here, not in the screens, so web and mobile cannot drift.
   ========================================================================== */
(function (global) {
  "use strict";

  var KEY = "sepehran.db.v1";
  /* Client identity: web and mobile share the user table but NOT the session.
     Set with <script src="sepehran-core.js" data-client="web"> or via
     SepehranCore.init({client:"mobile"}). */
  function detectClient() {
    var tag = document.currentScript ||
      document.querySelector('script[src*="sepehran-core"]');
    var c = tag && tag.getAttribute("data-client");
    return c || "web";
  }
  var CLIENT = detectClient();
  var SESSION_KEY = "sepehran.session." + CLIENT + ".v1";
  var THEME_KEY = "sepehran.theme.v1";
  var LANG_KEY = "sepehran.lang.v1";

  /* ── Schema ───────────────────────────────────────────────────────────
     Mirrors the SQL Server tables. `refs` declares which columns in other
     entities point here — that is what makes delete protection real rather
     than a hidden button.                                                  */
  var SCHEMA = {
    site: {
      table: "md.Site", key: "siteCode", label: "Sites",
      fields: [
        { k: "siteCode", label: "Site code", labelFa: "کد سایت", required: true, unique: true, upper: true, width: 90 },
        { k: "nameFa", label: "Name (FA)", labelFa: "نام فارسی", required: true },
        { k: "nameEn", label: "Name (EN)", labelFa: "نام انگلیسی", required: true },
        { k: "location", label: "Location", labelFa: "موقعیت" },
        { k: "description", label: "Description", labelFa: "توضیحات", type: "textarea" }
      ],
      refs: [["equipment", "siteId"], ["group", "siteId"], ["area", "siteId"], ["record", "siteId"]]
    },
    area: {
      table: "md.Area", key: "areaCode", label: "Areas",
      fields: [
        { k: "areaCode", label: "Area code", labelFa: "کد ناحیه", required: true, unique: true, upper: true, width: 110 },
        { k: "siteId", label: "Site", labelFa: "سایت", required: true, type: "ref", ref: "site" },
        { k: "nameFa", label: "Name (FA)", labelFa: "نام فارسی", required: true },
        { k: "nameEn", label: "Name (EN)", labelFa: "نام انگلیسی", required: true }
      ],
      refs: [["equipment", "areaId"]]
    },
    equipmentType: {
      table: "md.EquipmentType", key: "typeCode", label: "Equipment types",
      fields: [
        { k: "typeCode", label: "Type code", labelFa: "کد نوع", required: true, unique: true, upper: true, width: 110 },
        { k: "nameFa", label: "Name (FA)", labelFa: "نام فارسی", required: true },
        { k: "nameEn", label: "Name (EN)", labelFa: "نام انگلیسی", required: true }
      ],
      refs: [["equipment", "equipmentTypeId"]]
    },
    unit: {
      table: "md.Unit", key: "unitCode", label: "Units of measurement",
      fields: [
        { k: "unitCode", label: "Unit code", labelFa: "کد واحد", required: true, unique: true, upper: true, width: 100 },
        { k: "symbol", label: "Symbol", labelFa: "نماد", required: true, unique: true, width: 90 },
        { k: "nameFa", label: "Name (FA)", labelFa: "نام فارسی", required: true },
        { k: "nameEn", label: "Name (EN)", labelFa: "نام انگلیسی", required: true },
        { k: "kind", label: "Kind", labelFa: "نوع واحد", type: "enum",
          options: ["NUMERIC", "BOOLEAN", "ENUM"], def: "NUMERIC", required: true, width: 110 },
        { k: "trueLabel", label: "True label", labelFa: "برچسب حالت مثبت", showWhen: { kind: "BOOLEAN" }, width: 120 },
        { k: "falseLabel", label: "False label", labelFa: "برچسب حالت منفی", showWhen: { kind: "BOOLEAN" }, width: 120 },
        { k: "enumOptions", label: "Options (comma separated)", labelFa: "گزینه‌ها (با کاما جدا شود)",
          showWhen: { kind: "ENUM" } }
      ],
      refs: [["parameter", "unitId"], ["reading", "unitId"]]
    },
    group: {
      table: "md.EquipmentGroup", key: "groupCode", label: "Equipment groups",
      fields: [
        { k: "groupCode", label: "Group code", labelFa: "کد گروه", required: true, unique: true, upper: true, width: 120 },
        { k: "siteId", label: "Site", labelFa: "سایت", required: true, type: "ref", ref: "site" },
        { k: "nameFa", label: "Name (FA)", labelFa: "نام فارسی", required: true },
        { k: "nameEn", label: "Name (EN)", labelFa: "نام انگلیسی", required: true },
        { k: "description", label: "Description", labelFa: "توضیحات", type: "textarea" }
      ],
      refs: [["equipment", "groupId"]]
    },
    equipment: {
      table: "md.Equipment", key: "tagNumber", label: "Equipment",
      fields: [
        { k: "tagNumber", label: "Tag number", labelFa: "شماره تگ", required: true, unique: true, upper: true, width: 110 },
        { k: "equipmentCode", label: "Equipment code", labelFa: "کد تجهیز", required: true, unique: true, upper: true, width: 120 },
        { k: "siteId", label: "Site", labelFa: "سایت", required: true, type: "ref", ref: "site" },
        { k: "equipmentTypeId", label: "Type", labelFa: "نوع", required: true, type: "ref", ref: "equipmentType" },
        { k: "groupId", label: "Group", labelFa: "گروه", type: "ref", ref: "group", optional: true },
        { k: "areaId", label: "Area", labelFa: "ناحیه", type: "ref", ref: "area", optional: true },
        { k: "nameFa", label: "Name (FA)", labelFa: "نام فارسی", required: true },
        { k: "nameEn", label: "Name (EN)", labelFa: "نام انگلیسی", required: true },
        { k: "location", label: "Location", labelFa: "موقعیت" },
        { k: "nfcTagId", label: "NFC tag UID", labelFa: "شناسه NFC", unique: true, upper: true, width: 150 },
        { k: "criticality", label: "Criticality", labelFa: "اهمیت", type: "enum",
          options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], def: "MEDIUM", width: 110 },
        { k: "manufacturer", label: "Manufacturer", labelFa: "سازنده" },
        { k: "model", label: "Model", labelFa: "مدل" },
        { k: "serialNo", label: "Serial number", labelFa: "شماره سریال" },
        { k: "notes", label: "Notes", labelFa: "یادداشت", type: "textarea" }
      ],
      refs: [["equipmentParameter", "equipmentId"], ["record", "equipmentId"], ["schedule", "equipmentId"]]
    },
    parameter: {
      table: "md.Parameter", key: "parameterCode", label: "Parameters",
      fields: [
        { k: "parameterCode", label: "Parameter code", labelFa: "کد پارامتر", required: true, unique: true, upper: true, width: 130 },
        { k: "nameFa", label: "Name (FA)", labelFa: "نام فارسی", required: true },
        { k: "nameEn", label: "Name (EN)", labelFa: "نام انگلیسی", required: true },
        { k: "dataType", label: "Data type", labelFa: "نوع داده", type: "enum",
          options: ["NUMERIC", "BOOLEAN", "TEXT"], def: "NUMERIC", required: true, width: 110 },
        { k: "unitId", label: "Unit", labelFa: "واحد", type: "ref", ref: "unit",
          requiredWhen: { dataType: "NUMERIC" }, optional: true, width: 100 },
        { k: "decimals", label: "Decimals", labelFa: "اعشار", type: "number", def: 2,
          showWhen: { dataType: "NUMERIC" }, width: 90 },
        { k: "photoPolicy", label: "Photo", labelFa: "عکس", type: "enum",
          options: ["REQUIRED", "OPTIONAL", "DISABLED"], def: "OPTIONAL", required: true, width: 110 },
        { k: "isCritical", label: "Critical parameter", labelFa: "پارامتر بحرانی", type: "bool", def: false }
      ],
      refs: [["equipmentParameter", "parameterId"], ["reading", "parameterId"]]
    },
    equipmentParameter: {
      table: "md.EquipmentParameter", key: "id", label: "Equipment ↔ parameter",
      fields: [
        { k: "equipmentId", label: "Equipment", labelFa: "تجهیز", required: true, type: "ref", ref: "equipment" },
        { k: "parameterId", label: "Parameter", labelFa: "پارامتر", required: true, type: "ref", ref: "parameter" },
        { k: "displayOrder", label: "Order", labelFa: "ترتیب", type: "number", def: 0, width: 80 },
        { k: "isRequired", label: "Required", labelFa: "الزامی", type: "bool", def: true, width: 100 },
        { k: "photoPolicyOverride", label: "Photo requirement", labelFa: "الزام عکس", type: "enum",
          options: ["OPTIONAL", "REQUIRED", "DISABLED"], def: "OPTIONAL", width: 130 },
        { k: "normalMinOverride", label: "Normal minimum", labelFa: "حداقل عادی", type: "number",
          requiredWhen: { _numericParam: true }, width: 110 },
        { k: "normalMaxOverride", label: "Normal maximum", labelFa: "حداکثر عادی", type: "number",
          requiredWhen: { _numericParam: true }, width: 110 },
        { k: "expectedBoolOverride", label: "Expected state", labelFa: "حالت عادی", type: "enum",
          options: ["YES", "NO"], def: "YES", requiredWhen: { _booleanParam: true }, width: 120 }
      ],
      composite: ["equipmentId", "parameterId"],
      refs: [["reading", "equipmentParameterId"]]
    },
    shift: {
      table: "sec.Shift", key: "shiftCode", label: "Shifts",
      fields: [
        { k: "shiftCode", label: "Shift code", labelFa: "کد شیفت", required: true, unique: true, upper: true, width: 100 },
        { k: "nameFa", label: "Name (FA)", labelFa: "نام فارسی", required: true },
        { k: "nameEn", label: "Name (EN)", labelFa: "نام انگلیسی", required: true },
        { k: "startTime", label: "Start (HH:MM)", labelFa: "شروع", required: true, def: "06:00", width: 110 },
        { k: "endTime", label: "End (HH:MM)", labelFa: "پایان", required: true, def: "14:00", width: 110 },
        { k: "supervisorId", label: "Shift supervisor", labelFa: "سرپرست شیفت", type: "ref", ref: "user", optional: true },
        { k: "opsManagerId", label: "Head of operations", labelFa: "رئیس بهره‌برداری", type: "ref", ref: "user", optional: true }
      ],
      refs: [["record", "shiftId"], ["user", "shiftId"]]
    },
    schedule: {
      table: "ops.CollectionSchedule", key: "id", label: "Collection schedules",
      fields: [
        { k: "scope", label: "Scope", labelFa: "دامنه", type: "enum",
          options: ["SITE", "AREA", "GROUP", "EQUIPMENT"], def: "SITE", required: true, width: 110 },
        { k: "siteId", label: "Site", labelFa: "سایت", type: "ref", ref: "site",
          requiredWhen: { scope: "SITE" }, showWhen: { scope: "SITE" } },
        { k: "areaId", label: "Area", labelFa: "ناحیه", type: "ref", ref: "area",
          requiredWhen: { scope: "AREA" }, showWhen: { scope: "AREA" } },
        { k: "groupId", label: "Equipment group", labelFa: "گروه تجهیزات", type: "ref", ref: "group",
          requiredWhen: { scope: "GROUP" }, showWhen: { scope: "GROUP" } },
        { k: "equipmentId", label: "Equipment", labelFa: "تجهیز", type: "ref", ref: "equipment",
          requiredWhen: { scope: "EQUIPMENT" }, showWhen: { scope: "EQUIPMENT" } },
        { k: "shiftId", label: "Shift", labelFa: "شیفت", type: "ref", ref: "shift", optional: true, width: 110 },
        { k: "intervalMinutes", label: "Interval (minutes)", labelFa: "بازه (دقیقه)", type: "number", def: 120, required: true, width: 140 },
        { k: "graceMinutes", label: "Grace (minutes)", labelFa: "مهلت (دقیقه)", type: "number", def: 30, required: true, width: 130 }
      ],
      refs: []
    },
    role: {
      table: "sec.Role", key: "roleCode", label: "Roles",
      fields: [
        { k: "roleCode", label: "Role code", labelFa: "کد نقش", required: true, unique: true, upper: true, width: 150 },
        { k: "nameFa", label: "Name (FA)", labelFa: "نام فارسی", required: true },
        { k: "nameEn", label: "Name (EN)", labelFa: "نام انگلیسی", required: true },
        { k: "permissions", label: "Permissions", labelFa: "دسترسی‌ها", type: "permissions" }
      ],
      refs: [["user", "roleId"]]
    },
    user: {
      table: "sec.User", key: "username", label: "Users & personnel",
      fields: [
        { k: "username", label: "Username", labelFa: "نام کاربری", required: true, unique: true, lower: true, width: 130 },
        { k: "password", label: "Password", labelFa: "گذرواژه", type: "password",
          hint: "At least 6 characters. Leave blank when editing to keep the current password." },
        { k: "personnelCode", label: "Personnel code", labelFa: "کد پرسنلی", required: true, unique: true, upper: true, width: 120 },
        { k: "fullNameFa", label: "Full name (FA)", labelFa: "نام کامل فارسی", required: true },
        { k: "fullNameEn", label: "Full name (EN)", labelFa: "نام کامل انگلیسی", required: true },
        { k: "roleId", label: "Role", labelFa: "نقش", required: true, type: "ref", ref: "role" },
        { k: "shiftId", label: "Default shift", labelFa: "شیفت پیش‌فرض", type: "ref", ref: "shift", optional: true },
        { k: "siteAccess", label: "Site access", labelFa: "دسترسی سایت", type: "sites" },
        { k: "photo", label: "Photo", labelFa: "عکس پرسنلی", type: "photo" },
        { k: "jobTitle", label: "Job title", labelFa: "سمت" },
        { k: "mobile", label: "Mobile", labelFa: "شماره تماس" }
      ],
      refs: [["record", "userId"]]
    }
  };

  /* ── Permission tree ───────────────────────────────────────────────────
     One node per screen, with view / create / edit / delete leaves under the
     master-data screens. Mirrors sec.Permission; codes are stable strings so
     adding a screen later is a seed row, never a code branch.              */
  var PERM_TREE = [
    { group: "Operations", groupFa: "عملیات", nodes: [
      { key: "dashboard", label: "Dashboard", labelFa: "داشبورد", acts: ["view"] },
      { key: "collection", label: "Data collection", labelFa: "ثبت داده", acts: ["view","create","edit"] },
      { key: "history",    label: "Reading history", labelFa: "سوابق ثبت داده", acts: ["view"] },
      { key: "report",     label: "Reports", labelFa: "گزارش‌ها", acts: ["view","export"] }
    ]},
    { group: "Master data", groupFa: "داده پایه", nodes: [
      { key: "site",       label: "Sites", labelFa: "سایت‌ها", acts: ["view","create","edit","delete"] },
      { key: "area",       label: "Areas", labelFa: "ناحیه‌ها", acts: ["view","create","edit","delete"] },
      { key: "equipmentType", label: "Equipment types", labelFa: "نوع تجهیز", acts: ["view","create","edit","delete"] },
      { key: "group",      label: "Equipment groups", labelFa: "گروه تجهیزات", acts: ["view","create","edit","delete"] },
      { key: "equipment",  label: "Equipment", labelFa: "تجهیزات", acts: ["view","create","edit","delete"] },
      { key: "unit",       label: "Units", labelFa: "واحدها", acts: ["view","create","edit","delete"] },
      { key: "parameter",  label: "Parameters", labelFa: "پارامترها", acts: ["view","create","edit","delete"] },
      { key: "equipmentParameter", label: "Equipment ↔ parameter", labelFa: "تخصیص پارامتر", acts: ["view","create","edit","delete"] },
      { key: "schedule",   label: "Collection schedules", labelFa: "زمان‌بندی", acts: ["view","create","edit","delete"] },
      { key: "import",     label: "Excel import", labelFa: "ورود از اکسل", acts: ["run"] }
    ]},
    { group: "Administration", groupFa: "مدیریت سامانه", nodes: [
      { key: "user",  label: "Users & personnel", labelFa: "کاربران", acts: ["view","create","edit","delete"] },
      { key: "role",  label: "Roles & permissions", labelFa: "نقش‌ها", acts: ["view","create","edit","delete"] },
      { key: "shift", label: "Shifts", labelFa: "شیفت‌ها", acts: ["view","create","edit","delete"] },
      { key: "audit", label: "Audit log", labelFa: "گزارش ممیزی", acts: ["view"] },
      { key: "setting", label: "Settings", labelFa: "تنظیمات", acts: ["view","edit"] }
    ]}
  ];

  var ACT_LABEL = {
    view:   { en: "View",   fa: "مشاهده" },
    create: { en: "Create", fa: "ایجاد" },
    edit:   { en: "Edit",   fa: "ویرایش" },
    "delete": { en: "Delete", fa: "حذف" },
    export: { en: "Export", fa: "خروجی" },
    run:    { en: "Run",    fa: "اجرا" }
  };

  /* Flat list, derived — the storage format stays a simple array of codes. */
  var PERMISSIONS = [];
  PERM_TREE.forEach(function (g) {
    g.nodes.forEach(function (n) {
      n.acts.forEach(function (a) {
        PERMISSIONS.push([n.key + "." + a, g.group,
          (ACT_LABEL[a] ? ACT_LABEL[a].fa : a) + " " + n.labelFa]);
      });
    });
  });
  function allPermissionCodes() {
    return PERMISSIONS.map(function (p) { return p[0]; });
  }

  /* ── Storage ─────────────────────────────────────────────────────────── */
  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /* Salted hash. Deliberately not the production algorithm — the server uses
     Argon2id. Sufficient to prove that no plaintext password is ever stored. */
  function hash(password, salt) {
    var s = salt + "|" + password, h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var pass = 0; pass < 2000; pass++) {
      for (var i = 0; i < s.length; i++) {
        h1 ^= s.charCodeAt(i); h1 = (h1 * 16777619) >>> 0;
        h2 = ((h2 << 5) - h2 + h1) >>> 0;
      }
      s = h1.toString(16) + h2.toString(16) + salt;
    }
    return h1.toString(16) + h2.toString(16);
  }

  function nowIso() { return new Date().toISOString(); }

  /* The clean base: three sites, one admin, nothing else. No demo data is
     ever re-created — this matches migration 010. */
  function freshDb() {
    var adminRoleId = uuid(), adminUserId = uuid(), salt = uuid().slice(0, 8);
    return {
      version: 1,
      createdAt: nowIso(),
      site: [
        rec({ siteCode: "001", nameFa: "واحد تفکیک هوا", nameEn: "ASU", location: "North plant" }, "SEED:SYSTEM"),
        rec({ siteCode: "002", nameFa: "واحد اسمز معکوس", nameEn: "RO", location: "Water plant" }, "SEED:SYSTEM"),
        rec({ siteCode: "003", nameFa: "نیروگاه خورشیدی", nameEn: "Solar Power Plant", location: "East field" }, "SEED:SYSTEM")
      ],
      area: [], equipmentType: [], unit: [], group: [], equipment: [],
      parameter: [], equipmentParameter: [], schedule: [],
      shift: [
        rec({ shiftCode: "A", nameFa: "شیفت الف", nameEn: "Shift A", startTime: "06:00", endTime: "14:00" }, "SEED:SYSTEM"),
        rec({ shiftCode: "B", nameFa: "شیفت ب", nameEn: "Shift B", startTime: "14:00", endTime: "22:00" }, "SEED:SYSTEM"),
        rec({ shiftCode: "C", nameFa: "شیفت ج", nameEn: "Shift C", startTime: "22:00", endTime: "06:00" }, "SEED:SYSTEM"),
        rec({ shiftCode: "D", nameFa: "شیفت د", nameEn: "Shift D", startTime: "06:00", endTime: "18:00" }, "SEED:SYSTEM")
      ],
      role: [Object.assign(rec({
        roleCode: "ADMINISTRATOR", nameFa: "مدیر سیستم", nameEn: "Administrator",
        permissions: allPermissionCodes(), isSystem: true
      }, "SEED:SYSTEM"), { id: adminRoleId })],
      user: [Object.assign(rec({
        username: "admin", personnelCode: "ADMIN",
        fullNameFa: "مدیر سیستم", fullNameEn: "System Administrator",
        jobTitle: "System Administrator", roleId: adminRoleId,
        shiftId: null, siteAccess: "ALL",
        passwordSalt: salt, passwordHash: hash("admin1234", salt),
        mustChangePassword: true, isSystem: true
      }, "SEED:SYSTEM"), { id: adminUserId })],
      record: [], reading: [], photo: [], alert: [], audit: []
    };
  }

  function rec(values, by) {
    return Object.assign({
      id: uuid(), status: "ACTIVE",
      createdAt: nowIso(), createdBy: by || "system",
      updatedAt: null, updatedBy: null
    }, values);
  }

  var db = null;
  var listeners = [];
  var STAMP_KEY = "sepehran.db.stamp";
  var myStamp = null;

  /* Web and mobile run in separate frames, each with its own in-memory copy.
     A write bumps a shared stamp; every read compares it and re-reads storage
     when the other client has written. Without this the two copies diverge and
     a user created in the web panel never reaches mobile. */
  function stale() {
    try { return global.localStorage.getItem(STAMP_KEY) !== myStamp; }
    catch (e) { return false; }
  }

  function load() {
    if (db && !stale()) return db;
    try {
      var raw = global.localStorage.getItem(KEY);
      db = raw ? JSON.parse(raw) : freshDb();
      myStamp = global.localStorage.getItem(STAMP_KEY);
    } catch (e) { db = freshDb(); }
    // Forward-compatible: a new entity added later starts as an empty list.
    Object.keys(SCHEMA).forEach(function (e) { if (!db[e]) db[e] = []; });
    ["record", "reading", "photo", "alert", "audit"].forEach(function (e) { if (!db[e]) db[e] = []; });
    return db;
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(db));
      myStamp = String(Date.now()) + "." + Math.random().toString(16).slice(2, 8);
      global.localStorage.setItem(STAMP_KEY, myStamp);
    }
    catch (e) { console.error("Sepehran: storage write failed", e); }
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  function audit(action, entity, id, after) {
    db.audit.unshift({
      id: uuid(), at: nowIso(), action: action, entity: entity, entityId: id || null,
      actor: (session() && session().username) || "system",
      after: after ? JSON.stringify(after).slice(0, 500) : null
    });
    if (db.audit.length > 500) db.audit.length = 500;
  }

  /* ── Errors carry a code the UI turns into a message ─────────────────── */
  function ApiError(code, message, messageFa, details) {
    this.code = code; this.message = message;
    this.messageFa = messageFa || message; this.details = details || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  /* ── Validation — the same rules the SQL constraints enforce ─────────── */
  function validate(entity, values, existingId) {
    var def = SCHEMA[entity], errors = {};
    if (!def) throw new ApiError("UNKNOWN_ENTITY", "Unknown entity: " + entity);

    def.fields.forEach(function (f) {
      var v = values[f.k];
      var isRequired = f.required ||
        (f.requiredWhen && Object.keys(f.requiredWhen).every(function (k) { return values[k] === f.requiredWhen[k]; }));
      var hidden = f.showWhen && !Object.keys(f.showWhen).every(function (k) { return values[k] === f.showWhen[k]; });
      if (hidden) return;

      if (isRequired && (v === undefined || v === null || String(v).trim() === "")) {
        errors[f.k] = { code: "REQUIRED", en: f.label + " is required.", fa: (f.labelFa || f.label) + " الزامی است." };
        return;
      }
      if (v === undefined || v === null || String(v).trim() === "") return;

      if (f.unique) {
        var dup = load()[entity].some(function (r) {
          return r.id !== existingId && String(r[f.k] || "").toLowerCase() === String(v).toLowerCase();
        });
        if (dup) errors[f.k] = { code: "DUPLICATE", en: f.label + " \u201C" + v + "\u201D already exists.",
                                 fa: (f.labelFa || f.label) + " «" + v + "» از قبل وجود دارد." };
      }
      if (f.type === "ref") {
        var target = load()[f.ref] || [];
        var found = target.filter(function (r) { return r.id === v; })[0];
        if (!found) errors[f.k] = { code: "UNKNOWN_REF", en: f.label + " reference not found.",
                                    fa: "ارجاع " + (f.labelFa || f.label) + " یافت نشد." };
        else if (found.status !== "ACTIVE") errors[f.k] = { code: "INACTIVE_REF",
          en: "The selected " + f.label.toLowerCase() + " is inactive and cannot be used in new records.",
          fa: (f.labelFa || f.label) + " انتخاب‌شده غیرفعال است و در رکورد جدید قابل استفاده نیست." };
      }
      if (f.type === "number" && isNaN(Number(v))) {
        errors[f.k] = { code: "NOT_NUMERIC", en: f.label + " must be a number.",
                        fa: (f.labelFa || f.label) + " باید عدد باشد." };
      }
    });

    /* Cross-field rules that mirror the CHECK constraints. */
    if (entity === "equipmentParameter" && values.parameterId) {
      var p0 = load().parameter.filter(function (r) { return r.id === values.parameterId; })[0];
      if (p0 && p0.dataType === "NUMERIC") {
        var mn = values.normalMinOverride, mx = values.normalMaxOverride;
        var hasMn = mn !== "" && mn !== null && mn !== undefined;
        var hasMx = mx !== "" && mx !== null && mx !== undefined;
        if (!hasMn || !hasMx) {
          errors.normalMaxOverride = { code: "RANGE_REQUIRED",
            en: "This parameter is numeric — give both a normal minimum and maximum here.",
            fa: "این پارامتر عددی است — حداقل و حداکثر عادی باید همین‌جا وارد شود." };
        } else if (Number(mn) >= Number(mx)) {
          errors.normalMaxOverride = { code: "RANGE_ORDER", en: "Normal maximum must be greater than the minimum.",
                                       fa: "حداکثر عادی باید بزرگ‌تر از حداقل باشد." };
        }
      }
    }
    if (entity === "user" && !existingId && (!values.password || values.password.length < 6)) {
      errors.password = { code: "WEAK_PASSWORD", en: "Password must be at least 6 characters.",
                          fa: "گذرواژه باید حداقل ۶ نویسه باشد." };
    }
    if (entity === "user" && existingId && values.password && values.password.length < 6) {
      errors.password = { code: "WEAK_PASSWORD", en: "Password must be at least 6 characters.",
                          fa: "گذرواژه باید حداقل ۶ نویسه باشد." };
    }
    if (def.composite) {
      var clash = load()[entity].some(function (r) {
        return r.id !== existingId && def.composite.every(function (k) { return r[k] === values[k]; });
      });
      if (clash) errors[def.composite[1]] = { code: "DUPLICATE_PAIR",
        en: "This combination is already assigned.", fa: "این ترکیب قبلاً ثبت شده است." };
    }
    return Object.keys(errors).length ? errors : null;
  }

  /* ── Reference counting — drives delete protection ───────────────────── */
  function referenceCount(entity, id) {
    var def = SCHEMA[entity];
    if (!def) return { total: 0, detail: [] };
    var detail = [], total = 0;
    (def.refs || []).forEach(function (pair) {
      var target = pair[0], column = pair[1];
      var rows = load()[target] || [];
      var n = rows.filter(function (r) { return r[column] === id; }).length;
      if (n) { detail.push({ entity: target, column: column, count: n }); total += n; }
    });
    /* Site access and group membership are stored inline. */
    if (entity === "site") {
      var n2 = load().user.filter(function (u) {
        return Array.isArray(u.siteAccess) && u.siteAccess.indexOf(id) >= 0;
      }).length;
      if (n2) { detail.push({ entity: "user", column: "siteAccess", count: n2 }); total += n2; }
    }
    return { total: total, detail: detail };
  }

  /* ── Session ─────────────────────────────────────────────────────────── */
  function session() {
    try { return JSON.parse(global.localStorage.getItem(SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }

  function buildSession(user) {
    var role = load().role.filter(function (r) { return r.id === user.roleId; })[0];
    var perms = (role && role.permissions) || [];
    var sites = user.siteAccess === "ALL"
      ? load().site.map(function (s) { return s.id; })
      : (user.siteAccess || []);
    return {
      userId: user.id, username: user.username, personnelCode: user.personnelCode,
      fullNameEn: user.fullNameEn, fullNameFa: user.fullNameFa,
      roleCode: role ? role.roleCode : null,
      roleNameEn: role ? role.nameEn : "—", roleNameFa: role ? role.nameFa : "—",
      permissions: perms, sites: sites, allSites: user.siteAccess === "ALL",
      shiftId: user.shiftId || null,
      mustChangePassword: !!user.mustChangePassword,
      issuedAt: nowIso()
    };
  }

  /* ── Public API ──────────────────────────────────────────────────────── */
  var api = {
    schema: SCHEMA,
    permissions: PERMISSIONS,
    permTree: PERM_TREE,
    actLabel: ACT_LABEL,
    allPermissions: allPermissionCodes,
    ApiError: ApiError,

    onChange: function (fn) { listeners.push(fn); },

    /* One authentication path for web and mobile. */
    login: function (username, password) {
      var u = load().user.filter(function (x) {
        return x.username.toLowerCase() === String(username || "").trim().toLowerCase();
      })[0];
      if (!u) throw new ApiError("BAD_CREDENTIALS", "Username or password is incorrect.",
                                 "نام کاربری یا گذرواژه نادرست است.");
      if (u.status !== "ACTIVE") throw new ApiError("ACCOUNT_INACTIVE",
        "This account is deactivated. Contact the administrator.",
        "این حساب کاربری غیرفعال است. با مدیر سیستم تماس بگیرید.");
      if (hash(String(password || ""), u.passwordSalt) !== u.passwordHash) {
        u.failedAttempts = (u.failedAttempts || 0) + 1;
        save();
        throw new ApiError("BAD_CREDENTIALS", "Username or password is incorrect.",
                           "نام کاربری یا گذرواژه نادرست است.");
      }
      u.failedAttempts = 0;
      u.lastLoginAt = nowIso();
      var s = buildSession(u);
      global.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      audit("LOGIN", "user", u.id, { username: u.username });
      save();
      return s;
    },

    logout: function () {
      var s = session();
      if (s) audit("LOGOUT", "user", s.userId, null);
      global.localStorage.removeItem(SESSION_KEY);
      save();
    },

    /* Re-checked on every screen load: a user deactivated in the web admin
       is refused on mobile at the next check, not at the next login only. */
    session: function () {
      var s = session();
      if (!s) return null;
      var u = load().user.filter(function (x) { return x.id === s.userId; })[0];
      if (!u || u.status !== "ACTIVE") { global.localStorage.removeItem(SESSION_KEY); return null; }
      return buildSession(u);
    },

    can: function (permission) {
      var s = api.session();
      return !!(s && s.permissions.indexOf(permission) >= 0);
    },

    changePassword: function (userId, newPassword) {
      if (!newPassword || newPassword.length < 6)
        throw new ApiError("WEAK_PASSWORD", "Password must be at least 6 characters.",
                           "گذرواژه باید حداقل ۶ نویسه باشد.");
      var u = load().user.filter(function (x) { return x.id === userId; })[0];
      if (!u) throw new ApiError("NOT_FOUND", "User not found.", "کاربر یافت نشد.");
      u.passwordSalt = uuid().slice(0, 8);
      u.passwordHash = hash(newPassword, u.passwordSalt);
      u.mustChangePassword = false;
      u.updatedAt = nowIso();
      audit("PASSWORD_CHANGED", "user", u.id, null);
      save();
      return true;
    },

    list: function (entity, filter) {
      var rows = (load()[entity] || []).slice();
      filter = filter || {};
      if (filter.status && filter.status !== "ALL")
        rows = rows.filter(function (r) { return r.status === filter.status; });
      if (filter.siteId && filter.siteId !== "ALL")
        rows = rows.filter(function (r) {
          if (r.siteId) return r.siteId === filter.siteId;
          if (r.equipmentId) {
            var e = api.get("equipment", r.equipmentId);
            return e && e.siteId === filter.siteId;
          }
          return true;
        });
      if (filter.q) {
        var q = String(filter.q).toLowerCase();
        rows = rows.filter(function (r) {
          return Object.keys(r).some(function (k) {
            return k !== "passwordHash" && k !== "passwordSalt" &&
                   String(r[k] == null ? "" : r[k]).toLowerCase().indexOf(q) >= 0;
          }) || api.labelOf(entity, r).toLowerCase().indexOf(q) >= 0;
        });
      }
      return rows;
    },

    get: function (entity, id) {
      return (load()[entity] || []).filter(function (r) { return r.id === id; })[0] || null;
    },

    /* Human label for a row, used by ref pickers and tables. */
    labelOf: function (entity, row) {
      if (!row) return "—";
      var def = SCHEMA[entity];
      if (entity === "equipmentParameter") {
        var e = api.get("equipment", row.equipmentId), p = api.get("parameter", row.parameterId);
        return (e ? e.tagNumber : "?") + " · " + (p ? p.parameterCode : "?");
      }
      if (entity === "schedule") {
        var t, code;
        if (row.scope === "SITE")      { t = api.get("site", row.siteId);       code = t ? t.siteCode : "?"; }
        else if (row.scope === "AREA") { t = api.get("area", row.areaId);       code = t ? t.areaCode : "?"; }
        else if (row.scope === "GROUP"){ t = api.get("group", row.groupId);     code = t ? t.groupCode : "?"; }
        else                           { t = api.get("equipment", row.equipmentId); code = t ? t.tagNumber : "?"; }
        return row.scope + " " + code + " · " + row.intervalMinutes + "m";
      }
      var keyField = def ? def.key : "id";
      var code = row[keyField] || "";
      var name = row.nameEn || row.fullNameEn || row.symbol || "";
      return name ? code + " — " + name : String(code);
    },

    create: function (entity, values) {
      var def = SCHEMA[entity];
      if (!def) throw new ApiError("UNKNOWN_ENTITY", "Unknown entity: " + entity);
      var clean = normalise(entity, values);
      var errors = validate(entity, withPassword(clean, values), null);
      if (errors) throw new ApiError("VALIDATION", "Please correct the highlighted fields.",
                                     "لطفاً موارد مشخص‌شده را اصلاح کنید.", errors);
      var row = rec(clean, (session() && session().username) || "admin");
      if (entity === "user") applyPassword(row, values.password);
      load()[entity].push(row);
      audit("CREATE", entity, row.id, clean);
      save();
      return row;
    },

    update: function (entity, id, values) {
      var row = api.get(entity, id);
      if (!row) throw new ApiError("NOT_FOUND", "Record not found.", "رکورد یافت نشد.");
      var clean = normalise(entity, values);
      var errors = validate(entity, withPassword(clean, values), id);
      if (errors) throw new ApiError("VALIDATION", "Please correct the highlighted fields.",
                                     "لطفاً موارد مشخص‌شده را اصلاح کنید.", errors);
      var before = JSON.parse(JSON.stringify(row));
      Object.keys(clean).forEach(function (k) { row[k] = clean[k]; });
      if (entity === "user" && values.password) applyPassword(row, values.password);
      row.updatedAt = nowIso();
      row.updatedBy = (session() && session().username) || "admin";
      audit("UPDATE", entity, id, { before: before[SCHEMA[entity].key], after: clean });
      save();
      return row;
    },

    setStatus: function (entity, id, status) {
      var row = api.get(entity, id);
      if (!row) throw new ApiError("NOT_FOUND", "Record not found.", "رکورد یافت نشد.");
      if (row.isSystem && status !== "ACTIVE")
        throw new ApiError("SYSTEM_RECORD",
          "System records cannot be deactivated.", "رکوردهای سیستمی قابل غیرفعال‌سازی نیستند.");
      /* Only the session doing the deactivating is protected. A user signed in
         on another client is revoked at their next session check. */
      if (entity === "user" && session() && session().userId === id && status !== "ACTIVE")
        throw new ApiError("SELF_DEACTIVATE",
          "You cannot deactivate the account you are signed in with.",
          "نمی‌توانید حساب کاربری خودتان را غیرفعال کنید.");
      row.status = status;
      row.updatedAt = nowIso();
      row.updatedBy = (session() && session().username) || "admin";
      audit("STATUS_CHANGE", entity, id, { status: status });
      save();
      return row;
    },

    references: function (entity, id) { return referenceCount(entity, id); },

    /* Hard delete, permitted only when nothing references the row. This is the
       same rule the SQL Server triggers enforce — the UI never decides it. */
    remove: function (entity, id) {
      var row = api.get(entity, id);
      if (!row) throw new ApiError("NOT_FOUND", "Record not found.", "رکورد یافت نشد.");
      if (row.isSystem)
        throw new ApiError("SYSTEM_RECORD", "System records cannot be deleted.",
                           "رکوردهای سیستمی قابل حذف نیستند.");
      var refs = referenceCount(entity, id);
      if (refs.total > 0)
        throw new ApiError("REFERENCED_CANNOT_DELETE",
          "This item cannot be deleted because it is referenced by existing records. You can deactivate it instead.",
          "این مورد قابل حذف نیست چون در رکوردهای موجود استفاده شده است. می‌توانید آن را غیرفعال کنید.",
          refs);
      var list = load()[entity];
      list.splice(list.indexOf(row), 1);
      audit("DELETE", entity, id, { key: row[SCHEMA[entity].key] });
      save();
      return true;
    },

    /* Most-specific schedule wins: EQUIPMENT → GROUP → AREA → SITE. */
    scheduleFor: function (equipmentId) {
      var e = api.get("equipment", equipmentId);
      if (!e) return null;
      var all = api.list("schedule", { status: "ACTIVE" });
      var rank = { EQUIPMENT: 1, GROUP: 2, AREA: 3, SITE: 4 };
      var hits = all.filter(function (s) {
        if (s.scope === "EQUIPMENT") return s.equipmentId === equipmentId;
        if (s.scope === "GROUP")     return s.groupId && s.groupId === e.groupId;
        if (s.scope === "AREA")      return s.areaId && s.areaId === e.areaId;
        return s.siteId && s.siteId === e.siteId;
      });
      hits.sort(function (a, b) { return rank[a.scope] - rank[b.scope]; });
      return hits[0] || null;
    },

    /* ── Collection, used by the mobile app ───────────────────────────── */
    parametersFor: function (equipmentId) {
      return api.list("equipmentParameter", { status: "ACTIVE" })
        .filter(function (ep) { return ep.equipmentId === equipmentId; })
        .map(function (ep) {
          var p = api.get("parameter", ep.parameterId);
          if (!p || p.status !== "ACTIVE") return null;
          var u = p.unitId ? api.get("unit", p.unitId) : null;
          return {
            equipmentParameterId: ep.id, parameterId: p.id, code: p.parameterCode,
            nameEn: p.nameEn, nameFa: p.nameFa, dataType: p.dataType,
            unit: u ? u.symbol : "", unitKind: u ? u.kind : "NUMERIC",
            trueLabel: u ? u.trueLabel : "", falseLabel: u ? u.falseLabel : "",
            decimals: p.decimals == null ? 2 : Number(p.decimals),
            min: numOrNull(ep.normalMinOverride), max: numOrNull(ep.normalMaxOverride),
            expectedBool: p.dataType === "BOOLEAN" ? (ep.expectedBoolOverride !== "NO") : null,
            required: ep.isRequired !== false,
            photo: ep.photoPolicyOverride || p.photoPolicy || "OPTIONAL",
            order: Number(ep.displayOrder || 0)
          };
        })
        .filter(Boolean)
        .sort(function (a, b) { return a.order - b.order || a.code.localeCompare(b.code); });
    },

    /* One classifier for web and mobile, matching RangeValidator in :domain. */
    validateValue: function (raw, row) {
      var text = raw == null ? "" : String(raw).trim();
      if (!text) return "NOT_ENTERED";
      if (row.dataType === "BOOLEAN") {
        if (text !== "true" && text !== "false") return "INVALID";
        if (row.expectedBool === null || row.expectedBool === undefined) return "NORMAL";
        return (text === "true") === !!row.expectedBool ? "NORMAL" : "ABNORMAL";
      }
      if (row.dataType === "TEXT") return "NORMAL";
      var v = Number(text);
      if (!isFinite(v)) return "INVALID";
      if (row.min == null || row.max == null || row.min >= row.max) return "NORMAL";
      return (v < row.min || v > row.max) ? "ABNORMAL" : "NORMAL";
    },

    saveRecord: function (payload) {
      var s = api.session();
      if (!s) throw new ApiError("UNAUTHENTICATED", "Sign in first.", "ابتدا وارد شوید.");
      var row = Object.assign({
        id: uuid(), clientRecordUuid: uuid(),
        userId: s.userId, personnelCode: s.personnelCode, personnelName: s.fullNameEn,
        shiftId: s.shiftId, submittedAt: nowIso(), syncState: "PENDING",
        status: "ACTIVE", createdAt: nowIso()
      }, payload);
      load().record.push(row);
      (payload.readings || []).forEach(function (r) {
        load().reading.push(Object.assign({ id: uuid(), recordId: row.id }, r));
        if (r.validationStatus === "ABNORMAL" || r.validationStatus === "CRITICAL") {
          load().alert.push({ id: uuid(), recordId: row.id, equipmentId: payload.equipmentId,
                              severity: r.validationStatus, at: nowIso(),
                              message: r.parameterCode + " = " + r.rawValue });
        }
      });
      audit("READING_SUBMITTED", "record", row.id, { equipment: payload.equipmentTag });
      save();
      return row;
    },

    pendingRecords: function () {
      return load().record.filter(function (r) { return r.syncState !== "SYNCED"; });
    },

    markSynced: function (ids) {
      load().record.forEach(function (r) { if (ids.indexOf(r.id) >= 0) r.syncState = "SYNCED"; });
      audit("SYNC_COMPLETED", "record", null, { count: ids.length });
      save();
    },

    markFailed: function (ids, reason) {
      load().record.forEach(function (r) {
        if (ids.indexOf(r.id) >= 0) { r.syncState = "FAILED"; r.syncReason = reason; }
      });
      save();
    },

    auditLog: function (limit) { return load().audit.slice(0, limit || 100); },

    counts: function () {
      var c = {};
      Object.keys(SCHEMA).forEach(function (e) { c[e] = (load()[e] || []).length; });
      c.record = load().record.length;
      c.reading = load().reading.length;
      return c;
    },

    /* Theme and language persist across reloads for both applications. */
    theme: function (v) {
      if (v === undefined) return global.localStorage.getItem(THEME_KEY) || "light";
      global.localStorage.setItem(THEME_KEY, v);
      listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
      return v;
    },
    lang: function (v) {
      if (v === undefined) return global.localStorage.getItem(LANG_KEY) || "en";
      global.localStorage.setItem(LANG_KEY, v);
      listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
      return v;
    },

    /* Development helper — the same effect as migration 010. */
    resetToCleanBase: function () {
      db = freshDb();
      /* Both clients' sessions end — the store they referenced no longer exists. */
      global.localStorage.removeItem("sepehran.session.web.v1");
      global.localStorage.removeItem("sepehran.session.mobile.v1");
      global.localStorage.removeItem("sepehran.session.v1");
      save();
      return true;
    },

    exportJson: function () { return JSON.stringify(load(), null, 2); },

    /* ── Workbook import ──────────────────────────────────────────────────
       Clears master data and operational records, KEEPS users, roles, shifts
       and sites, then rebuilds every sheet in dependency order so each row's
       foreign keys resolve: area→site, group→site, equipment→site+type+group+
       area, unit, parameter→unit.                                           */
    clearMasterData: function () {
      var d = load();
      ["area","equipmentType","unit","group","equipment","parameter",
       "equipmentParameter","schedule","record","reading","photo","alert"]
        .forEach(function (e) { d[e] = []; });
      audit("MASTERDATA_CLEARED", "database", null,
            { kept: ["site","user","role","shift","permission"] });
      save();
      return api.counts();
    },

    /* Not every unit in this plant is numeric: some are switches (ON/OFF,
       YES/NO, OK/N.OK) and some are two-way selections (A/B, LOW/HIGH). The
       classification here is what decides the control the operator gets. */
    importWorkbook: function (wb) {
      var made = { sites: 0, areas: 0, types: 0, units: 0, groups: 0,
                   equipment: 0, parameters: 0, warnings: [] };
      api.clearMasterData();

      var UNIT_META = {
        "101": { kind:"BOOLEAN", symbol:"ON/OFF",   nameEn:"On / Off",                    nameFa:"روشن / خاموش",          t:"ON",  f:"OFF" },
        "102": { kind:"BOOLEAN", symbol:"YES/NO",   nameEn:"Yes / No",                    nameFa:"بله / خیر",             t:"YES", f:"NO" },
        "103": { kind:"NUMERIC", symbol:"bar",      nameEn:"Bar",                         nameFa:"بار" },
        "104": { kind:"NUMERIC", symbol:"°C",       nameEn:"Degree Celsius",              nameFa:"درجه سلسیوس" },
        "105": { kind:"NUMERIC", symbol:"mbar",     nameEn:"Millibar",                    nameFa:"میلی‌بار" },
        "106": { kind:"ENUM",    symbol:"A/B",      nameEn:"Equipment A / B",             nameFa:"تجهیز A یا B",          opts:"A,B" },
        "107": { kind:"ENUM",    symbol:"LOW/HIGH", nameEn:"Low / High",                  nameFa:"کم / زیاد",             opts:"LOW,HIGH" },
        "108": { kind:"NUMERIC", symbol:"lit/min",  nameEn:"Litres per minute",           nameFa:"لیتر بر دقیقه" },
        "109": { kind:"BOOLEAN", symbol:"OK/N.OK",  nameEn:"OK / Not OK",                 nameFa:"سالم / ناسالم",         t:"OK",  f:"N.OK" },
        "110": { kind:"NUMERIC", symbol:"%",        nameEn:"Percent",                     nameFa:"درصد" },
        "111": { kind:"NUMERIC", symbol:"RPM×10",   nameEn:"RPM x10",                     nameFa:"دور بر دقیقه × ۱۰" },
        "112": { kind:"NUMERIC", symbol:"barg",     nameEn:"Bar gauge",                   nameFa:"بار (گیج)" },
        "113": { kind:"NUMERIC", symbol:"Amp.",     nameEn:"Ampere",                      nameFa:"آمپر" },
        "114": { kind:"NUMERIC", symbol:"m3/hr",    nameEn:"Cubic metre per hour",        nameFa:"متر مکعب بر ساعت" },
        "115": { kind:"NUMERIC", symbol:"cmH2O",    nameEn:"Centimetre of water",         nameFa:"سانتی‌متر ستون آب" },
        "116": { kind:"NUMERIC", symbol:"Nm3/hr",   nameEn:"Normal cubic metre per hour", nameFa:"متر مکعب نرمال بر ساعت" }
      };
      /* The parameter sheet names its unit in words — map those to codes. */
      var UNIT_BY_LABEL = {
        "on / off":"101", "yes / no":"102", "bar":"103", "degree celsius":"104",
        "millibar":"105", "equipment a / b":"106", "low / high":"107",
        "litres per minute":"108", "ok / not ok":"109", "percent":"110",
        "rpm x10":"111", "bar gauge":"112", "ampere":"113",
        "cubic metre per hour":"114", "centimetre of water":"115",
        "normal cube meter per hour":"116", "normal cubic metre per hour":"116"
      };
      var FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
      function norm(s) {
        return String(s || "")
          .replace(/[۰-۹]/g, function (d) { return String(FA_DIGITS.indexOf(d)); })
          .toLowerCase().replace(/\s+/g, " ").trim();
      }

      /* 1 — sites: kept from the clean base, add only what the sheet needs. */
      var siteByCode = {};
      load().site.forEach(function (s) { siteByCode[s.siteCode] = s; });
      var want = {};
      (wb.areas || []).forEach(function (r) { if (r.site) want[r.site] = 1; });
      (wb.groups || []).forEach(function (r) { if (r.site) want[r.site] = 1; });
      (wb.equipment || []).forEach(function (r) { if (r.site) want[r.site] = 1; });
      Object.keys(want).forEach(function (code) {
        if (siteByCode[code]) return;
        siteByCode[code] = api.create("site",
          { siteCode: code, nameFa: "سایت " + code, nameEn: "Site " + code });
        made.sites++;
      });

      /* 2 — units, classified by kind. */
      var unitByCode = {}, codes = {};
      (wb.units || []).forEach(function (u) { codes[u.code] = 1; });
      Object.keys(UNIT_META).forEach(function (k) { codes[k] = 1; });
      Object.keys(codes).sort().forEach(function (code) {
        var m = UNIT_META[code] || {};
        var sheet = (wb.units || []).filter(function (u) { return u.code === code; })[0] || {};
        unitByCode[code] = api.create("unit", {
          unitCode: code,
          symbol: m.symbol || sheet.symbol || sheet.nameEn || code,
          nameEn: m.nameEn || sheet.nameEn || code,
          nameFa: m.nameFa || sheet.nameFa || sheet.nameEn || code,
          kind: m.kind || "NUMERIC",
          trueLabel: m.t || "", falseLabel: m.f || "", enumOptions: m.opts || ""
        });
        made.units++;
      });

      /* 3 — areas → site */
      var areaByCode = {};
      (wb.areas || []).forEach(function (a) {
        var site = siteByCode[a.site];
        if (!site) { made.warnings.push("area " + a.code + ": unknown site " + a.site); return; }
        areaByCode[a.code] = api.create("area", { areaCode: a.code, siteId: site.id,
          nameFa: a.nameFa || a.nameEn, nameEn: a.nameEn || a.nameFa });
        made.areas++;
      });

      /* 4 — equipment types, indexed by code and by English name, because the
             equipment sheet refers to them by name. */
      var typeByCode = {}, typeByName = {};
      (wb.types || []).forEach(function (t) {
        var row = api.create("equipmentType", { typeCode: t.code,
          nameFa: t.nameFa || t.nameEn, nameEn: t.nameEn || t.nameFa });
        typeByCode[t.code] = row; typeByName[norm(row.nameEn)] = row;
        made.types++;
      });

      /* 5 — groups → site */
      var groupByCode = {};
      (wb.groups || []).forEach(function (g) {
        var site = siteByCode[g.site];
        if (!site) { made.warnings.push("group " + g.code + ": unknown site " + g.site); return; }
        groupByCode[g.code] = api.create("group", { groupCode: g.code, siteId: site.id,
          nameFa: g.nameFa || g.nameEn, nameEn: g.nameEn || g.nameFa });
        made.groups++;
      });

      /* 6 — equipment → site + type + group + area. A tag repeated in the
             sheet is suffixed rather than dropped, so no row is lost. */
      var seen = {};
      (wb.equipment || []).forEach(function (e) {
        var site = siteByCode[e.site];
        if (!site) { made.warnings.push("equipment " + e.tag + ": unknown site " + e.site); return; }
        var type = typeByCode[e.typeName] || typeByName[norm(e.typeName)];
        if (!type) { made.warnings.push("equipment " + e.tag + ": unknown type " + e.typeName); return; }
        var tag = String(e.tag).toUpperCase();
        if (seen[tag]) { seen[tag]++; var nu = tag + " (" + seen[tag] + ")";
          made.warnings.push("duplicate tag " + tag + " stored as " + nu); tag = nu; }
        else seen[tag] = 1;
        try {
          api.create("equipment", {
            tagNumber: tag, equipmentCode: tag, siteId: site.id, equipmentTypeId: type.id,
            groupId: e.group && groupByCode[e.group] ? groupByCode[e.group].id : "",
            areaId: e.area && areaByCode[e.area] ? areaByCode[e.area].id : "",
            nameFa: e.nameFa || e.nameEn, nameEn: e.nameEn || e.nameFa, criticality: "MEDIUM" });
          made.equipment++;
        } catch (err) { made.warnings.push("equipment " + tag + ": " + err.message); }
      });

      /* 7 — parameters → unit, by the word label the sheet uses. */
      (wb.params || []).forEach(function (p) {
        var code = UNIT_BY_LABEL[norm(p.unit)];
        var unit = code ? unitByCode[code] : null;
        if (!unit && p.unit) made.warnings.push("parameter " + p.code + ": unmapped unit '" + p.unit + "'");
        var dataType = !unit ? "TEXT" : unit.kind === "BOOLEAN" ? "BOOLEAN"
                     : unit.kind === "ENUM" ? "TEXT" : "NUMERIC";
        try {
          api.create("parameter", {
            parameterCode: p.code, nameFa: p.nameFa || p.nameEn, nameEn: p.nameEn || p.nameFa,
            dataType: dataType, unitId: unit ? unit.id : "",
            decimals: (p.decimals === "" || p.decimals == null) ? 0 : Number(p.decimals),
            photoPolicy: /require/i.test(p.photo || "") ? "REQUIRED"
                       : /disable/i.test(p.photo || "") ? "DISABLED" : "OPTIONAL",
            isCritical: /^(بله|yes|true|1)$/i.test(String(p.critical || "").trim()) });
          made.parameters++;
        } catch (err) { made.warnings.push("parameter " + p.code + ": " + err.message); }
      });

      audit("WORKBOOK_IMPORT", "database", null, made);
      save();
      return made;
    }
  };

  /* normalise() drops the password so it can never be persisted; the validator
     still needs to see it to check length on create. */
  function withPassword(clean, raw) {
    if (raw && raw.password !== undefined) {
      var copy = {};
      Object.keys(clean).forEach(function (k) { copy[k] = clean[k]; });
      copy.password = raw.password;
      return copy;
    }
    return clean;
  }

  function numOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function applyPassword(row, password) {
    row.passwordSalt = uuid().slice(0, 8);
    row.passwordHash = hash(password, row.passwordSalt);
    row.mustChangePassword = false;
    delete row.password;
  }

  function normalise(entity, values) {
    var def = SCHEMA[entity], out = {};
    def.fields.forEach(function (f) {
      if (f.type === "password") return;             // handled separately, never stored raw
      var v = values[f.k];
      if (v === undefined) v = (f.def !== undefined ? f.def : "");
      if (typeof v === "string") {
        v = v.trim();
        if (f.upper) v = v.toUpperCase();
        if (f.lower) v = v.toLowerCase();
      }
      if (f.type === "number" && v !== "" && v !== null) v = Number(v);
      if (f.type === "bool") v = !!v;
      if (f.type === "ref" && v === "") v = null;
      out[f.k] = v;
    });
    return out;
  }

  load();
  global.SepehranCore = api;
})(window);
