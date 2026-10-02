#!/usr/bin/env python3
"""
Script de sincronización automática entre Planning Center Online (PCO) Services API
y Google Cloud Firestore para Gestión de Cámaras Media.

Sincroniza:
1. Todos los miembros de los equipos de Media (Servicio Jueves, Ayuno, Servicio Finde, LINK, KZN)
   a la colección 'miembros' en Firestore.
2. Los planes futuros y sus programaciones (directores, switchers, camarógrafos)
   a la colección 'pco_planes' en Firestore.
"""

import os
import sys
import base64
import json
import re
import urllib.request
import urllib.error

# Cargar variables desde archivo .env si existe
if os.path.exists(".env"):
    try:
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    if k and v and k not in os.environ:
                        os.environ[k] = v
    except Exception as e:
        print(f"Nota: No se pudo leer .env: {e}")

APP_ID = os.environ.get("PCO_APP_ID")
SECRET = os.environ.get("PCO_SECRET")

# Si se pasan por argumentos de línea de comandos: python3 sync_pco.py [APP_ID] [SECRET]
if (not APP_ID or not SECRET) and len(sys.argv) >= 3:
    APP_ID = sys.argv[1].strip()
    SECRET = sys.argv[2].strip()

PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "gestion-decamaras")

if not APP_ID or not SECRET:
    print("\n❌ Error: Variables de entorno PCO_APP_ID y PCO_SECRET requeridas.")
    print("Puedes proporcionarlas de tres formas:")
    print("  1. Como argumentos: python3 scripts/sync_pco.py <APP_ID> <SECRET>")
    print("  2. En un archivo .env: PCO_APP_ID=tu_id \\n PCO_SECRET=tu_secret")
    print("  3. Como variables de entorno: export PCO_APP_ID=... export PCO_SECRET=...\n")
    sys.exit(1)

FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"
auth_header = "Basic " + base64.b64encode(f"{APP_ID}:{SECRET}".encode()).decode()

def pco_get(url):
    req = urllib.request.Request(url, headers={
        "Authorization": auth_header,
        "User-Agent": "GestionCamarasMedia/1.0"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Error HTTP {e.code} al consultar {url}: {e.read().decode()}")
        return None
    except Exception as e:
        print(f"Error al consultar {url}: {e}")
        return None

def firestore_patch(collection, doc_id, fields):
    url = f"{FIRESTORE_URL}/{collection}/{doc_id}"
    data = json.dumps({"fields": fields}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="PATCH")
    try:
        with urllib.request.urlopen(req) as resp:
            return True
    except Exception as e:
        print(f"Error escribiendo en Firestore ({collection}/{doc_id}): {e}")
        return False

def sync_miembros():
    print("\n--- Sincronizando Miembros de Equipos de Media ---")
    teams_data = pco_get("https://api.planningcenteronline.com/services/v2/teams?per_page=100")
    if not teams_data or "data" not in teams_data:
        print("No se pudieron obtener equipos.")
        return 0

    media_keywords = ["media", "camara", "cámara", "link", "jueves", "finde", "kzn", "ayuno"]
    known_media_team_ids = {"2982202", "3047884", "3075184", "4496712"}
    teams_a_sincronizar = []
    for t in teams_data["data"]:
        nom = (t.get("attributes", {}).get("name") or "").lower()
        t_id = str(t.get("id"))
        if t_id in known_media_team_ids or any(kw in nom for kw in media_keywords):
            teams_a_sincronizar.append(t)

    if not teams_a_sincronizar:
        teams_a_sincronizar = teams_data["data"]

    miembros_sincronizados = 0
    personas_vistas = set()

    for team in teams_a_sincronizar:
        t_id = team["id"]
        t_nom = team.get("attributes", {}).get("name") or t_id
        people_data = pco_get(f"https://api.planningcenteronline.com/services/v2/teams/{t_id}/people?per_page=100")
        if not people_data or "data" not in people_data:
            continue

        for p in people_data["data"]:
            attrs = p.get("attributes", {})
            first_name = (attrs.get("first_name") or "").strip()
            last_name = (attrs.get("last_name") or "").strip()
            full_name = f"{first_name} {last_name}".strip()
            if not full_name:
                continue

            unique_key = full_name.lower()
            if unique_key in personas_vistas:
                continue
            personas_vistas.add(unique_key)

            doc_id = re.sub(r'[^a-zA-Z0-9_-]', '_', unique_key)
            fields = {
                "id": {"stringValue": full_name},
                "nombre": {"stringValue": first_name},
                "apellidos": {"stringValue": last_name},
                "esDirector": {"booleanValue": False},
                "esCapacitador": {"booleanValue": False},
                "esCamarografo": {"booleanValue": True},
                "enCapacitacion": {"booleanValue": False},
                "planningCenterId": {"stringValue": str(p["id"])},
                "equipoPco": {"stringValue": str(t_nom)}
            }
            if firestore_patch("miembros", doc_id, fields):
                miembros_sincronizados += 1

    print(f"✓ {miembros_sincronizados} miembros sincronizados en Firestore.")
    return miembros_sincronizados

def sync_pco():
    print("=== Iniciando sincronización Planning Center Services -> Firestore ===")

    # 1. Sincronizar Miembros
    sync_miembros()

    # 2. Sincronizar Planes y Programaciones
    print("\n--- Sincronizando Planes y Asignaciones ---")
    service_types_data = pco_get("https://api.planningcenteronline.com/services/v2/service_types?per_page=100")
    if not service_types_data or "data" not in service_types_data:
        print("No se pudieron obtener Service Types.")
        return

    st_map = {}
    for st in service_types_data["data"]:
        name = st["attributes"]["name"]
        st_map[st["id"]] = name

    total_planes = 0
    for st_id, st_name in st_map.items():
        plans_data = pco_get(f"https://api.planningcenteronline.com/services/v2/service_types/{st_id}/plans?filter=future&per_page=10")
        if not plans_data or "data" not in plans_data:
            continue

        for plan in plans_data["data"]:
            plan_id = plan["id"]
            plan_attrs = plan["attributes"]
            dates = plan_attrs.get("dates", "")
            title = plan_attrs.get("title") or ""

            sched_data = pco_get(f"https://api.planningcenteronline.com/services/v2/service_types/{st_id}/plans/{plan_id}/team_members?per_page=100")

            camarografos = []
            directores = []

            if sched_data and "data" in sched_data:
                for tm in sched_data["data"]:
                    t_attrs = tm.get("attributes", {})
                    pos = (t_attrs.get("team_position_name") or "").lower()
                    name = t_attrs.get("name") or ""
                    status = t_attrs.get("status") or "U"

                    if not name:
                        continue

                    # Directores / Realizadores / Switchers
                    if any(kw in pos for kw in ["realizador", "switcher", "dirección de cámaras", "direccion de camaras", "director de cámaras", "director de camaras"]):
                        directores.append({"name": name, "position": t_attrs.get("team_position_name"), "status": status})

                    # Camarógrafos
                    elif pos in ["cámaras", "camaras"] or pos.startswith("cámara") or pos.startswith("camara") or "camarografo" in pos or "camarógrafo" in pos:
                        camarografos.append({"name": name, "position": t_attrs.get("team_position_name"), "status": status})

            plan_fields = {
                "planId": {"stringValue": str(plan_id)},
                "serviceTypeId": {"stringValue": str(st_id)},
                "serviceName": {"stringValue": str(st_name)},
                "dates": {"stringValue": str(dates)},
                "title": {"stringValue": str(title)},
                "totalCamaras": {"integerValue": str(len(camarografos))},
                "camarografosJson": {"stringValue": json.dumps(camarografos, ensure_ascii=False)},
                "directoresJson": {"stringValue": json.dumps(directores, ensure_ascii=False)}
            }

            if firestore_patch("pco_planes", plan_id, plan_fields):
                total_planes += 1
                print(f"✓ Plan {st_name} ({dates}): {len(camarografos)} cámaras, {len(directores)} directores")

    print(f"\n✓ Proceso finalizado: {total_planes} planes sincronizados exitosamente en Firestore.")

if __name__ == "__main__":
    sync_pco()
