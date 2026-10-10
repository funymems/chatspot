import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Вход" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
