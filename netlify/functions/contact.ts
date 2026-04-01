import type { Handler } from '@netlify/functions';
import fs from 'fs';
import path from 'path';

// Rate limit store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function getClientIP(event: any): string {
  return event.headers['client-ip'] || event.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitStore.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + 3600000 });
    return true;
  }

  if (limit.count >= 5) {
    return false;
  }

  limit.count++;
  return true;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function logContactAttempt(data: any) {
  // Logs to /forja-ai/logs/brevo_contact.log
  const logsDir = '/forja-ai/logs';
  const logFile = path.join(logsDir, 'brevo_contact.log');

  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(logFile, JSON.stringify(data) + '\n', 'utf-8');
  } catch (err) {
    console.error('Error logging:', err);
  }
}

async function sendViaBrevo(
  recipientEmail: string,
  senderName: string,
  senderEmail: string,
  subject: string,
  telefono: string | undefined,
  mensaje: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  console.log('Debug: BREVO_API_KEY exists:', !!apiKey);
  console.log('Debug: CONTACT_RECIPIENT_EMAIL:', process.env.CONTACT_RECIPIENT_EMAIL);

  if (!apiKey) {
    console.error('BREVO_API_KEY no configurada');
    return { success: false, error: 'BREVO_API_KEY not configured' };
  }

  const htmlContent = `
    <p><strong>De:</strong> ${senderName} (${senderEmail})</p>
    <p><strong>Teléfono:</strong> ${telefono || 'No proporcionado'}</p>
    <p><strong>Asunto:</strong> ${subject}</p>
    <hr />
    <p><strong>Mensaje:</strong></p>
    <p>${mensaje.replace(/\n/g, '<br>')}</p>
    <hr />
    <p><em>Enviado desde forjalabs.cl</em></p>
  `;

  const payload = {
    to: [{ email: recipientEmail }],
    from: { name: 'Forja Labs', email: 'noreply@forjalabs.cl' },
    subject: `[Forja Labs] Nuevo mensaje de contacto: ${senderName}`,
    htmlContent,
  };

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Brevo error: ${response.status}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const clientIP = getClientIP(event);

    if (!checkRateLimit(clientIP)) {
      logContactAttempt({
        timestamp: new Date().toISOString(),
        ip: clientIP,
        nombre: 'RATE_LIMITED',
        email: 'RATE_LIMITED',
        asunto: 'RATE_LIMITED',
        mensaje: 'RATE_LIMITED',
        status: 'error',
        error: 'Rate limit exceeded',
      });

      return {
        statusCode: 429,
        body: JSON.stringify({
          success: false,
          error: 'Demasiados intentos. Intenta de nuevo en una hora.',
        }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { nombre, email, telefono, asunto, mensaje } = body;

    const errors: string[] = [];
    if (!nombre || nombre.trim().length === 0) errors.push('Nombre requerido');
    if (!email || !isValidEmail(email)) errors.push('Email inválido');
    if (!asunto || asunto.trim().length === 0) errors.push('Asunto requerido');
    if (!mensaje || mensaje.trim().length < 10) errors.push('Mensaje debe tener al menos 10 caracteres');

    if (errors.length > 0) {
      logContactAttempt({
        timestamp: new Date().toISOString(),
        ip: clientIP,
        nombre: nombre || 'MISSING',
        email: email || 'MISSING',
        telefono,
        asunto: asunto || 'MISSING',
        mensaje: mensaje || 'MISSING',
        status: 'error',
        error: errors.join('; '),
      });

      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, errors }),
      };
    }

    const recipientEmail = process.env.CONTACT_RECIPIENT_EMAIL || 'lnunez@forjalabs.cl';
    const brevoResult = await sendViaBrevo(recipientEmail, nombre, email, asunto, telefono, mensaje);

    if (!brevoResult.success) {
      logContactAttempt({
        timestamp: new Date().toISOString(),
        ip: clientIP,
        nombre,
        email,
        telefono,
        asunto,
        mensaje,
        status: 'error',
        error: brevoResult.error,
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: 'Error al enviar. Intenta de nuevo.',
        }),
      };
    }

    logContactAttempt({
      timestamp: new Date().toISOString(),
      ip: clientIP,
      nombre,
      email,
      telefono,
      asunto,
      mensaje,
      status: 'success',
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Correo enviado exitosamente. Luis te contactará pronto.',
      }),
    };
  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
};
