/** Темы приложения игрока (DnD Tracker): цвета из Theme.kt и имена текстур. Собрано скриптом, руками не править. */
export type PlayerTheme = { light: boolean; bg: string; panel: string; panel2: string; border: string; text: string; muted: string; accent: string; tex: string | null; tile: string | null; decor: string | null };

export const PLAYER_THEMES: Record<string, PlayerTheme> = {
  "Классика": {
    "light": false,
    "bg": "14161A",
    "panel": "1D2026",
    "panel2": "262A32",
    "border": "3A404B",
    "text": "E8E6E1",
    "muted": "A3A9B4",
    "accent": "E6B866",
    "tex": null,
    "tile": null,
    "decor": null
  },
  "Таверна": {
    "light": false,
    "bg": "1A1410",
    "panel": "241B15",
    "panel2": "2E231B",
    "border": "8C6A32",
    "text": "EDE3D1",
    "muted": "B3A58C",
    "accent": "D9A441",
    "tex": "tex_wood.png",
    "tile": null,
    "decor": null
  },
  "Подземелье": {
    "light": false,
    "bg": "0F1416",
    "panel": "182024",
    "panel2": "1F292E",
    "border": "7A6640",
    "text": "E4E2DC",
    "muted": "9AA6A8",
    "accent": "C9A86A",
    "tex": "tex_stone.png",
    "tile": null,
    "decor": null
  },
  "Папирус": {
    "light": true,
    "bg": "EFE4CC",
    "panel": "F7EFDC",
    "panel2": "DCCBA6",
    "border": "9A8E74",
    "text": "2B2116",
    "muted": "6E5D45",
    "accent": "9E2E2A",
    "tex": null,
    "tile": null,
    "decor": null
  },
  "Стол": {
    "light": false,
    "bg": "1A1410",
    "panel": "241B15",
    "panel2": "3A2E23",
    "border": "514031",
    "text": "EDE3D1",
    "muted": "B3A58C",
    "accent": "7D6130",
    "tex": "tex_table.jpg",
    "tile": null,
    "decor": null
  },
  "Стол ярче": {
    "light": false,
    "bg": "1A1410",
    "panel": "261C15",
    "panel2": "4A3A2B",
    "border": "68513C",
    "text": "F3E9D6",
    "muted": "C2B396",
    "accent": "C9952E",
    "tex": "tex_table.jpg",
    "tile": null,
    "decor": null
  },
  "Стол ярко": {
    "light": false,
    "bg": "1A1410",
    "panel": "2A1F17",
    "panel2": "57442F",
    "border": "7A5F42",
    "text": "FFF6E6",
    "muted": "D0C1A4",
    "accent": "E8B03A",
    "tex": "tex_table.jpg",
    "tile": null,
    "decor": null
  },
  "Аркана": {
    "light": false,
    "bg": "15111F",
    "panel": "1E1830",
    "panel2": "2E2640",
    "border": "40355A",
    "text": "ECE6F7",
    "muted": "A79DBE",
    "accent": "8136E2",
    "tex": "tex_arcana.jpg",
    "tile": "tex_arcana_tile.jpg",
    "decor": "ARCANA"
  },
  "Морская ведьма": {
    "light": false,
    "bg": "0E1A1C",
    "panel": "14262A",
    "panel2": "1F3436",
    "border": "2B494C",
    "text": "E4F0EE",
    "muted": "98B2AF",
    "accent": "E07A55",
    "tex": "tex_sea.jpg",
    "tile": null,
    "decor": "SEA"
  },
  "Лесной друид": {
    "light": false,
    "bg": "121710",
    "panel": "1A2216",
    "panel2": "2C3524",
    "border": "3E4A32",
    "text": "E8EDDC",
    "muted": "A8B396",
    "accent": "D08A2A",
    "tex": "tex_druid.jpg",
    "tile": null,
    "decor": "OVERGROWTH"
  },
  "Тлеющие угли": {
    "light": false,
    "bg": "141313",
    "panel": "1D1B1A",
    "panel2": "2E2B29",
    "border": "403C39",
    "text": "EEE9E4",
    "muted": "A8A19A",
    "accent": "E2652A",
    "tex": "tex_ash.jpg",
    "tile": null,
    "decor": "EMBERS"
  },
  "Пергамент": {
    "light": false,
    "bg": "EFDDB8",
    "panel": "F3E4C4",
    "panel2": "E6CF9E",
    "border": "8E7650",
    "text": "120C06",
    "muted": "3B2F21",
    "accent": "96201C",
    "tex": "parch_bg.jpg",
    "tile": null,
    "decor": "PARCHMENT"
  }
};

/** Папка с текстурами в веб-сборке игрока (/player, см. data/player). */
export const TEXTURE_DIR = "/player/composeResources/dnd_tracker.shared.generated.resources/drawable/";
