import { redirect } from "next/navigation";

// При открытии сайта — выбор мира (там же «Продолжить» для последнего).
export default function Home() {
  redirect("/worlds");
}
