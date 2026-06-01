export const metadata = {
  title: "Insta-Agent",
  description: "Telegram-driven Instagram post automation for @bandtoons",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
