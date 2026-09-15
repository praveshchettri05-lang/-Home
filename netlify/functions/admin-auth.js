'use strict';

const crypto = require('crypto');

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { error: 'Invalid request.' });
  }

  const configuredPassword = process.env.ADMIN_PASSWORD;
  const signingSecret = process.env.ADMIN_AUTH_SECRET;
  if (!configuredPassword || !signingSecret) {
    console.error('ADMIN_PASSWORD and ADMIN_AUTH_SECRET must be configured.');
    return response(500, { error: 'Admin authentication is not configured.' });
  }

  const supplied = typeof body.password === 'string' ? body.password : '';
  const suppliedBuffer = Buffer.from(supplied);
  const configuredBuffer = Buffer.from(configuredPassword);
  const valid = suppliedBuffer.length === configuredBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, configuredBuffer);
  if (!valid) return response(401, { error: 'Invalid password.' });

  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', signingSecret).update(payload).digest('base64url');
  return response(200, { token: `${payload}.${signature}`, expiresAt });
};
