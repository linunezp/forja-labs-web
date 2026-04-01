import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';

// Rate limit store (in-memory, resets on server restart)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Helper: Get client IP
function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

// Helper: Check rate limit (5 emails per hour per IP)
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitStore.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + 3600000 }); // 1 hour
    return true;
  }

  if (limit.count >= 5) {
    return false;
  }

  limit.count++;
  return true;
}

// Helper: Validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper: Log contact attempt
function logContactAttempt(data: {
  timestamp: string;
  ip: string;
  nombre: string;
  email: string;
  telefono?: string;
  asunto: string;
  mensaje: string;
  status: 'success' | 'error';
  error?: string;
}) {
  const logsDir = '/forja-ai/logs';
  const logFile = path.join(logsDir, 'brevo_contact.log');

  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logEntry = JSON.stringify(data) + '\n';
    fs.appendFileSync(logFile, logEntry, 'utf-8');
  } catch (err) {
    console.error('Error logging contact attempt:', err);
  }
}

// Helper: Send email via Brevo API
async function sendViaBrevo(
  recipientEmail: string,
  senderName: string,
  senderEmail: string,
  subject: string,
  telefono: string | undefined,
  mensaje: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = import.meta.env.BREVO_API_KEY;

  if (!apiKey) {
    return { success: false, error: 'BREVO_API_KEY not configured' };
  }

  // Format email content
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
      return {
        success: false,
        error: `Brevo API error: ${response.status} - ${error}`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export const POST: APIRoute = async (context) => {
  try {
    const clientIP = getClientIP(context.request);

    // Check rate limit
    if (!checkRateLimit(clientIP)) {
      logContactAttempt({
        timestamp: new Date().toISOString(),
        ip: clientIP,
        nombre: 'RATE_LIMITED',
        email: 'RATE_LIMITED',
        asunto: 'RATE_LIMITED',
        mensaje: 'RATE_LIMITED',
        status: 'error',
        error: 'Rate limit exceeded: 5 emails per hour',
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Demasiados intentos. Por favor, intenta de nuevo en una hora.',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse body
    const body = await context.request.json();
    const { nombre, email, telefono, asunto, mensaje } = body;

    // Validation
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

      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send email via Brevo
    const recipientEmail = import.meta.env.CONTACT_RECIPIENT_EMAIL;
    const brevoResult = await sendViaBrevo(
      recipientEmail,
      nombre,
      email,
      asunto,
      telefono,
      mensaje
    );

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

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Error al enviar el email. Intenta de nuevo.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Log success
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

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Correo enviado exitosamente. Luis te contactará pronto.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('Contact API error:', error);

    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
