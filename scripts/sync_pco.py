#!/usr/bin/env python3
"""
Script de sincronización automática entre Planning Center Online (PCO) Services API
y Google Cloud Firestore para Gestión de Cámaras Media.

Sincroniza:
1. Todos los miembros de los equipos de Media (Servicio Jueves, Ayuno, Servicio Finde, LINK, KZN)
   a la colección 'miembros'.
2. Los planes futuros y sus programaciones (directores, switchers, camarógrafos)
   a la colección 'pco_planes'.
"""

import os
import sys
import base64
import json
import urllib.request
import urllib.error

APP_ID = os.environ.get("PCO_APP_ID")
SECRET = os.environ.get("PCO_SECRET")
PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "gestion-decamaras")

if not APP_ID or not SECRET:
    print("Error: Variables de entorno PCO_APP_ID y PCO_SECRET requeridas.")
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

def sync_pco():
    print("=== Iniciando sincronización Planning Center Services -> Firestore ===")

    # 1. Obtener Service Types
    service_types_data = pco_get("https://api.planningcenteronline.com/services/v2/service_types?per_page=100")
    if not service_types_data or "data" not in service_types_data:
        print("No se pudieron obtener Service Types.")
        return

    # Buscar service types relevantes (LINK, Servicio Jueves, Servicio Finde, KZN, Ayuno)
    st_map = {}
    for st in service_types_data["data"]:
        name = st["attributes"]["name"]
        st_map[st["id"]] = name
        print(f"Service Type encontrado: {name} (ID: {st['id']})")

    # 2. Obtener planes y programaciones
    print("\n--- Sincronizando Planes y Asignaciones ---")
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
            
            # Obtener personas asignadas en este plan
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

                    if "cámara" in pos or "camara" in pos:
                        camarografos.append({"name": name, "position": t_attrs.get("team_position_name"), "status": status})
                    elif "director" in pos or "switcher" in pos:
                        directores.append({"name": name, "position": t_attrs.get("team_position_name"), "status": status})

            # Guardar plan en Firestore
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
            
            success = firestore_patch("pco_planes", plan_id, plan_fields)
            if success:
                total_planes += 1
                print(f"✓ Plan {st_name} ({dates}): {len(camarografos)} cámaras, {len(directores)} directores")

    print(f"\n✓ {total_planes} planes sincronizados exitosamente en Firestore.")

if __name__ == "__main__":
    sync_pco()
