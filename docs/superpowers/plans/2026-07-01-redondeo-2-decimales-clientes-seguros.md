# Redondeo a 2 decimales (Clientes Seguros) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los montos `reclamado/autorizado/diferencia` (items y header) de facturas Clientes Seguros queden a 2 decimales, para que coincidan con el Excel del proveedor y no haya drift al agregar al Proveedor.

**Architecture:** Tres frentes independientes: (A) Property Setter que fija `precision=2` en los campos Float de Sales Invoice Item; (B) redondeo `flt(x,2)` en el cálculo JS del formulario; (C) backfill de las facturas existentes con >2 decimales vía `db.set_value` sin tocar contabilidad.

**Tech Stack:** Frappe/ERPNext, JS de formulario (`frappe.ui.form.on`), `frappe.make_property_setter`, `frappe.db.set_value`, `frappe.utils.flt`.

## Global Constraints

- **PRODUCCIÓN (csrd.tzcode.tech):** NO `bench migrate`. Aplicar cambios con `bench execute` + `bench build` + `bench --site csrd.tzcode.tech clear-cache`.
- Commits directos en `master` de rades; un commit por tarea.
- Método de redondeo: `frappe.utils.flt(valor, 2)` (verificado = Excel: 601.875→601.88, 341.865→341.87, 258.512→258.51).
- Backfill toca SOLO campos auxiliares (`claimed_amount/authorized_amount/difference_amount` en items; `monto_reclamado/monto_autorizado/diferencia` en header). NUNCA `rate`, `amount`, `grand_total`, impuestos ni GL. Sin re-someter.
- Alcance: bloque de 164 autorizaciones / este proveedor. Facturas sucias conocidas: FACT-93014, FACT-93038, FACT-93108, FACT-93129, FACT-93184, FACT-93364.
- `copago` de item queda fuera de alcance.
- Limpieza: borrar el archivo temporal `rades/_probe_seguros.py` al finalizar (Task 3).

---

### Task 1: Property Setter `precision=2` en campos de Sales Invoice Item

**Files:**
- Create: `apps/rades/rades/patches/v1/set_precision_2_seguros_item_fields.py`
- Modify: `apps/rades/rades/patches.txt` (agregar una línea al final)

**Interfaces:**
- Produces: función `execute()` idempotente que crea/actualiza Property Setters `precision=2` para `claimed_amount`, `authorized_amount`, `difference_amount` en Sales Invoice Item.

- [ ] **Step 1: Crear el patch**

Crear `apps/rades/rades/patches/v1/set_precision_2_seguros_item_fields.py`:

```python
import frappe

FIELDS = ["claimed_amount", "authorized_amount", "difference_amount"]


def execute():
	"""Fija precision=2 en los montos aux de Sales Invoice Item.

	Estos campos son Float sin precision, y el site tiene float_precision=4, por
	lo que authorized_amount = base*cobertura guardaba 3-4 decimales y generaba
	drift al agregar al Proveedor (que trabaja a 2 decimales). Idempotente:
	make_property_setter reemplaza el Property Setter si ya existe.
	"""
	for fieldname in FIELDS:
		frappe.make_property_setter(
			{
				"doctype": "Sales Invoice Item",
				"fieldname": fieldname,
				"property": "precision",
				"value": "2",
				"property_type": "Select",
			},
			is_system_generated=False,
		)
	frappe.clear_cache(doctype="Sales Invoice Item")
```

- [ ] **Step 2: Registrar el patch en patches.txt**

Añadir al final de `apps/rades/rades/patches.txt` (en su propia línea):

```
rades.patches.v1.set_precision_2_seguros_item_fields
```

- [ ] **Step 3: Aplicar en csrd SIN migrate (ejecución directa del patch)**

Run: `cd /home/tzcode/frappe-bench && bench --site csrd.tzcode.tech execute rades.patches.v1.set_precision_2_seguros_item_fields.execute`
Expected: sin traceback (retorna None).

- [ ] **Step 4: Verificar que la precision quedó en 2**

Run:
```bash
cd /home/tzcode/frappe-bench && bench --site csrd.tzcode.tech execute frappe.client.get_value --args "['Property Setter', {'doc_type':'Sales Invoice Item','field_name':'authorized_amount','property':'precision'}, 'value']"
```
Expected: imprime `{'value': '2'}` (o similar con `value = 2`). Si falla el formato del comando, verificar vía:
`echo "SELECT field_name, value FROM \`tabProperty Setter\` WHERE doc_type='Sales Invoice Item' AND property='precision';" | bench --site csrd.tzcode.tech mariadb`
Expected: 3 filas (claimed_amount, authorized_amount, difference_amount) con value=2.

- [ ] **Step 5: Commit**

```bash
cd /home/tzcode/frappe-bench/apps/rades
git add rades/patches/v1/set_precision_2_seguros_item_fields.py rades/patches.txt
git commit -m "feat(seguros): precision=2 en montos aux de Sales Invoice Item (property setter)"
```

---

### Task 2: Redondeo `flt(x,2)` en el cálculo JS

**Files:**
- Modify: `apps/rades/rades/public/js/sales_invoice.js` (`item_table_update` líneas 415-425; `refresh_outside_amounts` líneas 448-451)

**Interfaces:**
- Consumes: `flt(value, precision)` (util JS de Frappe, ya usado en el archivo).
- Produces: montos de item y totales de header calculados a 2 decimales.

- [ ] **Step 1: Redondear los montos de item en `item_table_update`**

En `apps/rades/rades/public/js/sales_invoice.js`, reemplazar el bloque actual:

```js
		row.authorized_amount = apply_pct ? base * cobertura : 0;
		row.claimed_amount    = apply_pct ? base : 0;

		const gross_difference = base - row.authorized_amount;
		if (thursday_clearance) {
			// Jueves: toda la brecha va al copago; la diferencia netea a cero.
			row.copago = gross_difference;
			row.difference_amount = 0;
		} else {
			// copago + difference_amount = gross_difference (brecha total del paciente).
			row.difference_amount = gross_difference - flt(row.copago);
		}
```

por (redondeo a 2 decimales, el proveedor trabaja a 2 dígitos):

```js
		row.authorized_amount = flt(apply_pct ? base * cobertura : 0, 2);
		row.claimed_amount    = flt(apply_pct ? base : 0, 2);

		const gross_difference = base - row.authorized_amount;
		if (thursday_clearance) {
			// Jueves: toda la brecha va al copago; la diferencia netea a cero.
			row.copago = flt(gross_difference, 2);
			row.difference_amount = 0;
		} else {
			// copago + difference_amount = gross_difference (brecha total del paciente).
			row.difference_amount = flt(gross_difference - flt(row.copago), 2);
		}
```

- [ ] **Step 2: Redondear los totales del header en `refresh_outside_amounts`**

Reemplazar:

```js
		frm.set_value("monto_reclamado", total_claimed_amount);
		frm.set_value("monto_autorizado", total_authorized_amount);
		frm.set_value("diferencia", total_difference_amount);
		frm.set_value("copago", total_copago_amount);
```

por:

```js
		frm.set_value("monto_reclamado", flt(total_claimed_amount, 2));
		frm.set_value("monto_autorizado", flt(total_authorized_amount, 2));
		frm.set_value("diferencia", flt(total_difference_amount, 2));
		frm.set_value("copago", flt(total_copago_amount, 2));
```

- [ ] **Step 3: Commit**

```bash
cd /home/tzcode/frappe-bench/apps/rades
git add rades/public/js/sales_invoice.js
git commit -m "fix(seguros): redondear montos aux a 2 decimales en el calculo JS"
```

- [ ] **Step 4: Build (confirmar con el usuario antes de correr)**

Run: `cd /home/tzcode/frappe-bench && bench build --app rades`
Expected: `DONE  Total Build Time` sin errores.

- [ ] **Step 5: Verificación funcional (navegador, hard-refresh)**

Crear/editar una factura Clientes Seguros con `cobertura` ≠ 100% (p.ej. 90%) y un ítem con precio base a 2 decimales que dé 3 decimales al multiplicar (p.ej. base 379.85 → autorizado 341.865). Confirmar que en la tabla de items y en los totales del header se muestra **341.87** (2 decimales), no 341.865.

---

### Task 3: Backfill de facturas existentes con >2 decimales

**Files:**
- Create: `apps/rades/rades/maintenance/__init__.py` (vacío)
- Create: `apps/rades/rades/maintenance/round_seguros_amounts.py`
- Delete: `apps/rades/rades/_probe_seguros.py` (temporal de análisis)

**Interfaces:**
- Consumes: `frappe.utils.flt`, `frappe.db.set_value`, `frappe.db.get_value`.
- Produces:
  - `find_dirty(invoice_names=None) -> list[str]` — nombres de SI con item/header a >2 decimales.
  - `run(invoice_names, dry_run=True) -> dict` — redondea a 2 dec los campos aux; con `dry_run=True` solo reporta.

- [ ] **Step 1: Crear el paquete maintenance**

Crear `apps/rades/rades/maintenance/__init__.py` vacío.

- [ ] **Step 2: Crear el módulo de backfill**

Crear `apps/rades/rades/maintenance/round_seguros_amounts.py`:

```python
import frappe
from frappe.utils import flt

# Bloque inicial a corregir (facturas con >2 decimales detectadas en el analisis).
BLOCK_INVOICES = [
	"FACT-93014", "FACT-93038", "FACT-93108",
	"FACT-93129", "FACT-93184", "FACT-93364",
]

ITEM_FIELDS = ["claimed_amount", "authorized_amount", "difference_amount"]
HEADER_FIELDS = ["monto_reclamado", "monto_autorizado", "diferencia"]


def _dirty(v):
	return round(flt(v), 2) != flt(v)


def find_dirty(invoice_names=None):
	"""Devuelve los SI (de la lista dada o BLOCK_INVOICES) con item/header a >2 dec."""
	names = invoice_names or BLOCK_INVOICES
	dirty = []
	for name in names:
		hdr = frappe.db.get_value("Sales Invoice", name, HEADER_FIELDS, as_dict=True)
		if hdr and any(_dirty(hdr.get(f)) for f in HEADER_FIELDS):
			dirty.append(name)
			continue
		items = frappe.get_all("Sales Invoice Item", filters={"parent": name}, fields=["name"] + ITEM_FIELDS)
		if any(_dirty(it.get(f)) for it in items for f in ITEM_FIELDS):
			dirty.append(name)
	return dirty


def run(invoice_names=None, dry_run=True):
	"""Redondea a 2 decimales los montos aux de items y header.

	Solo campos auxiliares via db.set_value(update_modified=False): NO toca
	rate/amount/grand_total/GL y NO re-somete. Idempotente.
	"""
	names = invoice_names or BLOCK_INVOICES
	changed = []
	for name in names:
		items = frappe.get_all(
			"Sales Invoice Item", filters={"parent": name},
			fields=["name"] + ITEM_FIELDS)
		for it in items:
			updates = {f: flt(it.get(f), 2) for f in ITEM_FIELDS if _dirty(it.get(f))}
			if updates:
				changed.append(("item", it.name, updates))
				if not dry_run:
					frappe.db.set_value("Sales Invoice Item", it.name, updates, update_modified=False)

		hdr = frappe.db.get_value("Sales Invoice", name, HEADER_FIELDS, as_dict=True) or {}
		hupd = {f: flt(hdr.get(f), 2) for f in HEADER_FIELDS if _dirty(hdr.get(f))}
		if hupd:
			changed.append(("header", name, hupd))
			if not dry_run:
				frappe.db.set_value("Sales Invoice", name, hupd, update_modified=False)

	if not dry_run:
		frappe.db.commit()

	print("DRY_RUN" if dry_run else "APPLIED", "-> cambios:", len(changed))
	for kind, ref, upd in changed:
		print("  ", kind, ref, upd)
	return {"dry_run": dry_run, "changes": len(changed)}
```

- [ ] **Step 3: Dry-run (reporte, no escribe)**

Run: `cd /home/tzcode/frappe-bench && bench --site csrd.tzcode.tech execute rades.maintenance.round_seguros_amounts.run`
Expected: `DRY_RUN -> cambios:` con las 6 facturas y sus updates (p.ej. `header FACT-93129 {'monto_autorizado': 341.87, 'diferencia': 37.99...}`). Revisar que los valores objetivo sean los del Excel.

- [ ] **Step 4: Aplicar el backfill**

Run: `cd /home/tzcode/frappe-bench && bench --site csrd.tzcode.tech execute rades.maintenance.round_seguros_amounts.run --kwargs "{'dry_run': False}"`
Expected: `APPLIED -> cambios: N` (N>0).

- [ ] **Step 5: Verificar drift = 0 y coincidencia con Excel**

Run: `cd /home/tzcode/frappe-bench && bench --site csrd.tzcode.tech execute rades._probe_seguros.dirty`
Expected: `HEADER con >2 decimales ==== 0`, `ITEMS con >2 decimales ==== 0`, `DRIFT (raw - 2dp) = 0.0`.

- [ ] **Step 6: Borrar el temporal y commit**

```bash
cd /home/tzcode/frappe-bench/apps/rades
rm -f rades/_probe_seguros.py
git add rades/maintenance/__init__.py rades/maintenance/round_seguros_amounts.py
git commit -m "feat(seguros): backfill redondeo 2 decimales en facturas existentes (solo campos aux)"
```

Nota: el temporal `_probe_seguros.py` no está versionado (git no lo trackea); `rm` lo elimina del árbol de trabajo. Ejecutar el Step 5 ANTES del `rm`.

---

## Self-Review

- **Cobertura del spec:** A (precision items) → Task 1. B (redondeo JS) → Task 2. C (backfill) → Task 3. Verificación (drift=0) → Task 3 Step 5. Restricciones producción (sin migrate, bench execute/build) → reflejadas en steps. ✅
- **Placeholders:** ninguno; todo el código está completo. ✅
- **Consistencia:** `flt(v,2)` usado igual en JS y Python; nombres de campos (`claimed_amount/authorized_amount/difference_amount`, `monto_reclamado/monto_autorizado/diferencia`) consistentes entre tareas. `find_dirty`/`run` definidos en Task 3 y usados coherentemente. ✅
- **Orden:** Task 1 (precision) y Task 2 (JS) previenen a futuro; Task 3 corrige lo existente. Step 5 (verificación con `_probe_seguros.dirty`) va ANTES del `rm` del temporal (Step 6). ✅
