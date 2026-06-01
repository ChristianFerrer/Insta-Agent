export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1rem", lineHeight: 1.6 }}>
      <h1>🎨 Insta-Agent</h1>
      <p>
        Backend del agente de Telegram que automatiza la creación de posts para Instagram en estilo
        cartoon vintage de músicos famosos.
      </p>
      <p>
        Esta URL hostea el webhook de Telegram. La interacción es a través del bot, no a través de
        la web.
      </p>
      <p>
        <a href="/api/health">/api/health</a> · estado del servicio
      </p>
    </main>
  );
}
