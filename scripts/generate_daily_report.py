#!/usr/bin/env python3
"""
Sistema de reportes diarios con análisis de agentes IA.
Spawneará Henry, Misa y Dyson en paralelo para análisis.
Aurora consolida y genera HTML.
Envía vía Brevo API.
"""

import sqlite3
import json
from datetime import datetime, timedelta
import subprocess
import time

# Config
import os
CHAT_ID = "7252844702"
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")  # Viene de GitHub Secrets
DB_DIR = os.environ.get("DB_DIR", "/Users/luisnunez/.openclaw/workspace/forja-ai")

print("=" * 70)
print("🤖 SISTEMA DE REPORTES DIARIOS — FORJA LABS")
print("=" * 70)
print()

# 1. EXTRAER DATOS DE BDs
print("1️⃣ Extrayendo datos de bases de datos...")

# Tickets
conn = sqlite3.connect(f"{DB_DIR}/tickets.db")
cursor = conn.cursor()
cursor.execute("""
  SELECT ticket_id, titulo, estado, asignado_a, 
    CAST((julianday('now') - julianday(fecha_actualizacion)) * 24 AS INTEGER) as horas_sin_mover
  FROM tickets
  WHERE estado != 'completado'
  ORDER BY fecha_actualizacion ASC
""")
tickets = cursor.fetchall()
conn.close()

print(f"   ✓ Tickets: {len(tickets)} activos")

# Proyectos
conn = sqlite3.connect(f"{DB_DIR}/proyectos.db")
cursor = conn.cursor()
cursor.execute("SELECT codigo, nombre, estado, dev_asignado FROM proyectos WHERE estado='activo'")
proyectos = cursor.fetchall()
conn.close()

print(f"   ✓ Proyectos: {len(proyectos)} activos")

# Leads
conn = sqlite3.connect(f"{DB_DIR}/leads.db")
cursor = conn.cursor()
cursor.execute("SELECT codigo, nombre_empresa, estado, presupuesto_usd, fit_score FROM prospectos")
leads = cursor.fetchall()
conn.close()

print(f"   ✓ Leads: {len(leads)} en BD")
print()

# 2. SPAWNEARA AGENTES EN PARALELO
print("2️⃣ Spawneando agentes para análisis...")

# Datos para agentes
tickets_data = json.dumps([{
    "id": t[0], "titulo": t[1], "estado": t[2], 
    "asignado": t[3], "horas_sin_mover": t[4]
} for t in tickets], indent=2)

proyectos_data = json.dumps([{
    "codigo": p[0], "nombre": p[1], "estado": p[2], "dev": p[3]
} for p in proyectos], indent=2)

leads_data = json.dumps([{
    "codigo": l[0], "empresa": l[1], "estado": l[2],
    "presupuesto": l[3], "fit": l[4]
} for l in leads], indent=2)

# HENRY (Business)
print("   📊 Henry Global (Business Analysis)...")
henry_prompt = f"""
Eres Henry Global, Business Development de Forja Labs.

DATOS DE LEADS:
{leads_data}

ANALIZA:
1. Nuevo leads vs. en seguimiento
2. Presupuesto total en juego (pipeline)
3. Proyección de ingresos próximos 30 días
4. Riesgos de pérdida de clientes
5. Oportunidades de cierre

GENERA REPORTE EJECUTIVO (máx 200 palabras):
- Estado del pipeline
- Recomendaciones urgentes
- Oportunidades a explorar

Formato JSON con keys: pipeline_total, proyeccion_30d, riesgos, oportunidades
"""

# MISA (Development)
print("   🚀 Misa Hayase (Development Analysis)...")
misa_prompt = f"""
Eres Misa Hayase, PM de Forja Labs.

DATOS DE PROYECTOS:
{proyectos_data}

ANALIZA:
1. Avance actual de sprints
2. Estimación de fechas de entrega
3. Riesgos técnicos
4. Recursos necesarios
5. Blockers identificados

GENERA REPORTE EJECUTIVO (máx 200 palabras):
- Estado de cada proyecto
- Alertas de retraso
- Recomendaciones

Formato JSON con keys: proyectos_estado, riesgos, recomendaciones
"""

# DYSON (Operations)
print("   🏥 Dr. Dyson Ido (Operations Analysis)...")
dyson_prompt = f"""
Eres Dr. Dyson Ido, Coordinador de Operaciones.

DATOS DE TICKETS:
{tickets_data}

ANALIZA (umbral crítico: >= 2 horas sin movimiento):
1. Tickets activos y estado actual
2. SLA: tickets > 2h sin mover = CRÍTICO
3. Cuellos de botella identificados
4. Propuestas de resolución
5. Salud general del sistema

GENERA REPORTE EJECUTIVO (máx 200 palabras):
- Estado de tickets
- Alertas críticas
- Recomendaciones urgentes

Formato JSON con keys: tickets_status, alertas_criticas, recomendaciones
"""

# Guardar prompts para agentes
with open(f"{DB_DIR}/scripts/.henry_prompt.txt", "w") as f:
    f.write(henry_prompt)
with open(f"{DB_DIR}/scripts/.misa_prompt.txt", "w") as f:
    f.write(misa_prompt)
with open(f"{DB_DIR}/scripts/.dyson_prompt.txt", "w") as f:
    f.write(dyson_prompt)

print("   ✓ Prompts listos para agentes")
print()

# 3. GENERAR HTML
print("3️⃣ Generando reporte HTML...")

fecha_hoy = datetime.now().strftime("%d de %B de %Y")
es_lunes = datetime.now().weekday() == 0

html = f"""
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte Forja Labs</title>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }}
        .container {{ max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        h1 {{ color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }}
        h2 {{ color: #34495e; margin-top: 30px; }}
        .alert {{ background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 10px 0; border-radius: 4px; }}
        .alert.critical {{ background: #f8d7da; border-left-color: #dc3545; }}
        .alert.success {{ background: #d4edda; border-left-color: #28a745; }}
        .metric {{ display: inline-block; background: #ecf0f1; padding: 15px 20px; border-radius: 6px; margin: 10px 10px 10px 0; }}
        .metric strong {{ color: #2c3e50; }}
        table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
        th {{ background: #3498db; color: white; padding: 12px; text-align: left; }}
        td {{ padding: 10px; border-bottom: 1px solid #ecf0f1; }}
        tr:hover {{ background: #f8f9fa; }}
        .footer {{ text-align: center; color: #95a5a6; font-size: 12px; margin-top: 30px; border-top: 1px solid #ecf0f1; padding-top: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Reporte Forja Labs — {fecha_hoy}</h1>
        
        <p><strong>Tipo:</strong> {'SEMANAL COMPLETO (Lunes)' if es_lunes else 'DIARIO (Dev + Negocios)'}</p>
        <p><strong>Generado:</strong> {datetime.now().strftime('%H:%M:%S GMT-3')}</p>
        
        <h2>📌 Resumen Ejecutivo</h2>
        <p>Reportes de análisis de agentes especializados pendientes...</p>
        
        <h2>🎟️ Estado de Tickets</h2>
        <table>
            <tr>
                <th>ID</th>
                <th>Título</th>
                <th>Estado</th>
                <th>Asignado</th>
                <th>Horas sin mover</th>
            </tr>
"""

for ticket in tickets:
    horas = ticket[4]
    estado_class = "critical" if horas >= 2 else "success"
    alerta = "🔴" if horas >= 2 else "✅"
    html += f"""
            <tr>
                <td>{ticket[0]}</td>
                <td>{ticket[1]}</td>
                <td>{ticket[2]}</td>
                <td>{ticket[3]}</td>
                <td class="{estado_class}">{alerta} {horas}h</td>
            </tr>
"""

html += """
        </table>
        
        <h2>💰 Pipeline de Negocios</h2>
        <table>
            <tr>
                <th>Lead</th>
                <th>Empresa</th>
                <th>Estado</th>
                <th>Presupuesto</th>
                <th>Fit</th>
            </tr>
"""

for lead in leads:
    html += f"""
            <tr>
                <td>{lead[0]}</td>
                <td>{lead[1]}</td>
                <td>{lead[2]}</td>
                <td>${lead[3]}</td>
                <td>{lead[4]}%</td>
            </tr>
"""

html += """
        </table>
        
        <h2>🚀 Proyectos Activos</h2>
        <table>
            <tr>
                <th>Código</th>
                <th>Proyecto</th>
                <th>Estado</th>
                <th>Dev Asignado</th>
            </tr>
"""

for proyecto in proyectos:
    html += f"""
            <tr>
                <td>{proyecto[0]}</td>
                <td>{proyecto[1]}</td>
                <td>{proyecto[2]}</td>
                <td>{proyecto[3]}</td>
            </tr>
"""

html += f"""
        </table>
        
        <div class="footer">
            <p>📧 Reporte automático generado por Forja Labs</p>
            <p>Análisis de: Henry Global (Negocios) | Misa Hayase (Desarrollo) | Dr. Dyson Ido (Operaciones)</p>
        </div>
    </div>
</body>
</html>
"""

# Guardar HTML
html_path = f"{DB_DIR}/scripts/.daily_report.html"
with open(html_path, "w") as f:
    f.write(html)

print(f"   ✓ HTML generado: {html_path}")
print()

# 4. PRÓXIMOS PASOS
print("4️⃣ Próximos pasos:")
print("   1. Spawneará agentes (Henry, Misa, Dyson) en paralelo")
print("   2. Consolidará análisis en HTML final")
print("   3. Enviará vía Brevo API a lnunez@forjalabs.cl")
print()

print("=" * 70)
print("✅ SCRIPT LISTO PARA INTEGRACIÓN CON GITHUB ACTIONS")
print("=" * 70)
