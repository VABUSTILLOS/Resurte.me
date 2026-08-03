import { AuthForm } from "@/components/auth/auth-form"

export const dynamic = "force-dynamic"

export default function RegisterPage() {
  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4">
      <AuthForm mode="register" />
    </main>
  )
}
