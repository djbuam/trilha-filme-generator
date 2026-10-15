const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client();

/**
 * Verifica o ID token enviado pelo Google Identity Services no
 * front-end. Requer GOOGLE_CLIENT_ID configurado no .env (você
 * precisa criar um OAuth Client ID em https://console.cloud.google.com/apis/credentials
 * do tipo "Web application" e liberar a origem do seu site).
 */
async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID não configurado no servidor (.env).");
  }
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

module.exports = { verifyGoogleIdToken };
