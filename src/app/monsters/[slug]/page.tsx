import { redirect } from "next/navigation";

// Старые ссылки вида /monsters/goblin ведут в каталог с открытой карточкой.
export default async function MonsterPage({ params }: PageProps<"/monsters/[slug]">) {
  const { slug } = await params;
  redirect(`/monsters?open=${encodeURIComponent(slug)}`);
}
