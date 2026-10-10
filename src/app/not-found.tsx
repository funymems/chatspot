import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-1 text-xl font-semibold">Страница не найдена</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Такой страницы нет, или у вас нет к ней доступа.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Перейти в рабочее пространство</Link>
      </Button>
    </div>
  );
}
