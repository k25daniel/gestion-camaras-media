#!/usr/bin/env python3
"""
Script de depuración y limpieza de miembros duplicados en Firestore.
Elimina los 233 documentos con ID tipo slug creados por la sincronización no filtrada de PCO,
preservando intactos los 78 miembros originales de Pas Media con todos sus roles e historial.
"""

import urllib.request
import urllib.error
import json

PROJECT_ID = "gestion-decamaras"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

def get_all(collection):
    docs = []
    page_token = ''
    while True:
        url = f"{FIRESTORE_URL}/{collection}?pageSize=300"
        if page_token:
            url += f"&pageToken={page_token}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            docs.extend(data.get("documents", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return docs

def delete_doc(doc_path):
    url = f"https://firestore.googleapis.com/v1/{doc_path}"
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req) as resp:
            return True
    except Exception as e:
        print(f"Error eliminando {doc_path}: {e}")
        return False

def run_cleanup():
    print("=== Iniciando escaneo de colección 'miembros' ===")
    miembros = get_all("miembros")
    print(f"Total miembros encontrados: {len(miembros)}")

    slug_docs = [m for m in miembros if '_' in m["name"].split("/")[-1]]
    random_docs = [m for m in miembros if '_' not in m["name"].split("/")[-1]]

    print(f"Miembros originales (IDs legítimos): {len(random_docs)}")
    print(f"Registros slug a depurar: {len(slug_docs)}")

    if not slug_docs:
        print("No se encontraron registros slug para depurar.")
        return

    eliminados = 0
    for m in slug_docs:
        doc_path = m["name"].replace("projects/", "projects/", 1)
        # Extraer el path relativo después de v1/
        # m['name'] es tipo 'projects/gestion-decamaras/databases/(default)/documents/miembros/slug_id'
        if delete_doc(m["name"]):
            eliminados += 1
            if eliminados % 25 == 0:
                print(f"  Progreso: {eliminados}/{len(slug_docs)} eliminados...")

    print(f"\n✓ Depuración completada con éxito. Se eliminaron {eliminados} registros slug.")
    
    # Verificar total restante
    restantes = get_all("miembros")
    print(f"✓ Miembros restantes en el directorio: {len(restantes)} (deben ser {len(random_docs)})")

if __name__ == "__main__":
    run_cleanup()
