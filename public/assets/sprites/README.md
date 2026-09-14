اسپرایت‌های سبک شیت مرجع (سند اول، بخش ج) این‌جا قرار می‌گیرند. فایل‌ها را طبق فهرست `docs/سند-اول/03-شیت-مرجع-گرافیک.md` نام‌گذاری کنید و در `manifest.json` ثبت کنید؛ بازی خودکار آن‌ها را به‌جای مدل‌های سه‌بعدی نشان می‌دهد.

نمونه‌ی manifest:
{
  "units": { "soldier": { "idle": { "file": "units/soldier_idle.png", "w": 0.9, "h": 1.1, "frames": 4, "cols": 4, "fps": 6 }, "walk": { "file": "units/soldier_walk.png", "w": 0.9, "h": 1.1, "frames": 8, "cols": 8, "fps": 10 } } },
  "buildings": { "camp": { "file": "buildings/camp.png", "w": 3.2, "h": 3.0 }, "tower": { "file": "buildings/tower.png", "w": 0.7, "h": 1.1 } },
  "scenery": { "tree": { "file": "scenery/tree.png", "w": 1.2, "h": 1.6 } }
}
