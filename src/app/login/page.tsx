import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className="flex flex-1 items-center justify-center">
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </div>
  );
}
