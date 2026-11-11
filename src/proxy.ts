import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isAuthorized } from "@/lib/auth";
import { CORS_HEADERS, SYNC_KEY_HEADER } from "@/lib/sync-cors";

export function proxy(request: NextRequest) {
  // Обмен с приложением игрока (DnD Tracker): CORS и ключ в заголовке x-dnd-key, cookie тоже годится.
  if (request.nextUrl.pathname.startsWith("/api/sync/")) {
    if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    const key = request.headers.get(SYNC_KEY_HEADER) ?? request.cookies.get(AUTH_COOKIE)?.value;
    if (!isAuthorized(key)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS_HEADERS });
    return NextResponse.next();
  }

  if (isAuthorized(request.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Не трогаем статику и страницу логина.
  // /api/books/upload и /api/maps/upload исключены: proxy буферизует тело запроса (лимит 10MB),
  // а PDF-книги бывают по сотне мегабайт — авторизация проверяется в самом хендлере.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/books/upload|api/maps/upload).*)"],
};
