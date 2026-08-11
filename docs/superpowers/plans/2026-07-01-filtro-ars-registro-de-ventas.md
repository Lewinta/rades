# Filtro por ARS en "Registro de Ventas" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un filtro por ARS al reporte `Registro de Ventas`, visible solo cuando `tipo_de_factura = "Clientes Seguros"`, que limpia su valor al ocultarse.

**Architecture:** Dos capas. (1) Backend Python: se extrae un seam `get_query(filters)` que construye la query pypika y aplica el `where` de `ars` si viene el filtro; `get_data` solo la ejecuta — esto hace testeable la lógica del filtro sin tocar la BD. (2) Frontend JS: nuevo filtro `ars` (Link → Customer) oculto por defecto, con visibilidad condicional vía `on_change` de `tipo_de_factura`.

**Tech Stack:** Frappe Framework (v16/v17), pypika (`frappe.qb`), Script Report, `frappe.query_report` JS API.

## Global Constraints

- **PRODUCCIÓN:** NO ejecutar `bench migrate` ni ningún comando que escriba en la BD de `csrd.tzcode.tech`. Este cambio no lo requiere (solo `.py`/`.js` de reporte).
- **NO ejecutar `bench run-tests`** (decisión del usuario). El test se escribe y se commitea, pero queda **sin ejecutar** en esta sesión; correrlo cuando haya un site de pruebas. No afirmar que los tests pasan.
- Trabajo **directo en la rama `master`** (decisión del usuario); un commit por tarea.
- El campo ARS se almacena en la columna `ars` de Sales Invoice (Link → Customer).
- El JS del reporte requiere `bench build` (o developer mode) para que el navegador tome los cambios; confirmar con el usuario antes de correr `bench build`.
- App: `rades`. Reporte: `apps/rades/rades/rades/report/registro_de_ventas/`.

---

### Task 1: Backend — seam `get_query` + filtro `ars`

**Files:**
- Modify: `apps/rades/rades/rades/report/registro_de_ventas/registro_de_ventas.py`
- Test: `apps/rades/rades/test_registro_de_ventas.py` (Create) — módulo `rades.test_registro_de_ventas`, junto al existente `test_sales_invoice.py`.

**Interfaces:**
- Produces: `get_query(filters: frappe._dict) -> pypika query` — construye la query completa (fechas, docstatus, ordenamiento, y filtros opcionales `tipo_de_factura` y `ars`). `get_data(filters)` la ejecuta con `.run(as_dict=True)`.

- [ ] **Step 1: Escribir el test (sin ejecutar — ver Global Constraints)**

Crear `apps/rades/rades/test_registro_de_ventas.py`. Aserciones robustas (comparan la query CON vs SIN el filtro, sin depender del formato exacto del SQL compilado):

```python
import unittest

import frappe

from rades.rades.report.registro_de_ventas.registro_de_ventas import get_query


def _filters(**kw):
    base = dict(from_date="2026-01-01", to_date="2026-12-31")
    base.update(kw)
    return frappe._dict(base)


class TestRegistroDeVentasQuery(unittest.TestCase):
    def test_sin_ars_no_menciona_el_valor(self):
        sql = str(get_query(_filters()))
        self.assertNotIn("ARS HUMANO", sql)

    def test_con_ars_agrega_condicion_por_ese_valor(self):
        base = str(get_query(_filters()))
        con = str(get_query(_filters(ars="ARS HUMANO")))
        self.assertNotEqual(con, base)
        self.assertIn("ARS HUMANO", con)

    def test_ars_y_tipo_de_factura_coexisten(self):
        sql = str(
            get_query(_filters(tipo_de_factura="Clientes Seguros", ars="ARS PALIC"))
        )
        self.assertIn("Clientes Seguros", sql)
        self.assertIn("ARS PALIC", sql)
```

- [ ] **Step 2: (Omitido) ejecución de tests**

Por decisión del usuario NO se corre `bench run-tests` en esta sesión. Correrlo más tarde en un site de pruebas con:
`bench --site <site-de-pruebas> run-tests --module rades.test_registro_de_ventas`

- [ ] **Step 3: Refactor + implementación mínima**

Editar `registro_de_ventas.py`. Reemplazar la función `get_data` actual por un seam `get_query` + `get_data`, y agregar el filtro `ars`:

```python
def get_data(filters: frappe._dict) -> list[dict]:
	return get_query(filters).run(as_dict=True)


def get_query(filters: frappe._dict):
	si = frappe.qb.DocType("Sales Invoice")

	query = (
		frappe.qb.from_(si)
		.select(
			si.posting_date.as_("fecha"),
			si.ars.as_("ars"),
			si.customer_name.as_("paciente"),
			si.name.as_("documento"),
			si.grand_total.as_("total"),
			si.monto_autorizado.as_("autorizado"),
			si.diferencia.as_("diferencia"),
			si.copago.as_("copago"),
		)
		.where(si.docstatus < 2)
		.where(si.posting_date.between(filters.from_date, filters.to_date))
		.orderby(si.posting_date, order=frappe.qb.desc)
		.orderby(si.name, order=frappe.qb.desc)
	)

	if filters.get("tipo_de_factura"):
		query = query.where(si.tipo_de_factura == filters.tipo_de_factura)

	if filters.get("ars"):
		query = query.where(si.ars == filters.ars)

	return query
```

(Mantener `execute`, `get_columns` sin cambios.)

- [ ] **Step 4: Verificación estática (sin bench)**

Confirmar que `get_query` existe, que `get_data` la usa, y que el `import` del test resuelve la ruta `rades.rades.report.registro_de_ventas.registro_de_ventas`. Revisar el diff a ojo.

- [ ] **Step 5: Commit**

```bash
cd /home/tzcode/frappe-bench/apps/rades
git add rades/rades/report/registro_de_ventas/registro_de_ventas.py rades/test_registro_de_ventas.py
git commit -m "feat(registro-de-ventas): filtrar por ARS en backend + seam get_query testeable"
```

---

### Task 2: Frontend — filtro ARS con visibilidad condicional

**Files:**
- Modify: `apps/rades/rades/rades/report/registro_de_ventas/registro_de_ventas.js`

**Interfaces:**
- Consumes: filtro backend `ars` de Task 1 (la query aplica `where ars == filters.ars`).
- Produces: filtro JS `ars` (Link → Customer) que solo es visible con `tipo_de_factura == "Clientes Seguros"`.

- [ ] **Step 1: Agregar `on_change` al filtro `tipo_de_factura`**

En `registro_de_ventas.js`, dentro del objeto del filtro `tipo_de_factura` (después de `default: ""`), agregar:

```js
			on_change() {
				const tipo = frappe.query_report.get_filter_value("tipo_de_factura");
				const ars = frappe.query_report.get_filter("ars");
				if (tipo === "Clientes Seguros") {
					ars.toggle(true);
				} else {
					ars.set_value("");
					ars.toggle(false);
				}
				frappe.query_report.refresh();
			},
```

- [ ] **Step 2: Agregar el filtro `ars` al array `filters`**

Después del objeto `tipo_de_factura` (último elemento del array `filters`), agregar:

```js
		{
			fieldname: "ars",
			label: __("ARS"),
			fieldtype: "Link",
			options: "Customer",
			hidden: 1,
		},
```

El array `filters` queda: `from_date`, `to_date`, `tipo_de_factura` (con `on_change`), `ars`.

- [ ] **Step 3: Verificación funcional (manual, en el navegador)**

> Requiere `bench build` (confirmar con el usuario antes de ejecutarlo) o developer mode para que el navegador tome el JS nuevo.

Abrir el reporte `Registro de Ventas` en `csrd.tzcode.tech` y verificar:
1. Con `tipo_de_factura` vacío → el filtro **ARS no aparece**.
2. Seleccionar `tipo_de_factura = "Clientes Seguros"` → el filtro **ARS aparece**.
3. Elegir un ARS → la tabla se filtra por ese ARS.
4. Cambiar `tipo_de_factura` a otro valor → el filtro **ARS se oculta y su valor se limpia**; los resultados dejan de filtrarse por ARS.

- [ ] **Step 4: Commit**

```bash
cd /home/tzcode/frappe-bench/apps/rades
git add rades/rades/report/registro_de_ventas/registro_de_ventas.js
git commit -m "feat(registro-de-ventas): filtro ARS visible solo con tipo_de_factura=Clientes Seguros"
```

---

## Self-Review

- **Cobertura del spec:** Cambio 1 (filtro JS) → Task 2 Step 2. Cambio 2 (visibilidad + limpiar) → Task 2 Step 1. Cambio 3 (backend where) → Task 1 Step 3. Verificación → Task 2 Step 3. ✅
- **Placeholders:** ninguno; todo el código está completo. ✅
- **Consistencia de tipos:** `get_query(filters)` definido en Task 1 y consumido por `get_data`; nombres de filtro `ars`/`tipo_de_factura` consistentes entre JS y Python. ✅
