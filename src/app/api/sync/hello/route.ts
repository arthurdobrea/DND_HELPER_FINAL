import { json } from "@/lib/sync";

/** Открытая визитка сервера: по ней приложение игрока находит мастера в сети (ключ не нужен, данных нет). */
export const GET = () => json({ app: "dnd-helper" });
