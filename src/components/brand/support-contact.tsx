/** Contact address from SUPPORT_EMAIL (set it in the deployment environment). */
export function SupportContact() {
  const email = process.env.SUPPORT_EMAIL?.trim();
  return email ? (
    <a href={`mailto:${email}`} className="font-medium text-primary hover:underline">
      {email}
    </a>
  ) : (
    <span className="font-medium">адрес поддержки, указанный в профиле разработчика приложения в Meta</span>
  );
}
