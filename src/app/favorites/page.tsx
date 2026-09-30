import { redirect } from "next/navigation";

// Избранное теперь — закладки мира.
export default function FavoritesPage() {
  redirect("/world");
}
