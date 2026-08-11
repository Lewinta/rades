# Redondeo a 2 decimales en montos de Clientes Seguros

- **Fecha:** 2026-07-01
- **App:** rades
- **Site:** csrd.tzcode.tech (PRODUCCIÓN)
- **DocTypes:** Sales Invoice, Sales Invoice Item

## Problema

Las facturas de venta tipo **Clientes Seguros** se facturan al Proveedor (ARS) a
fin de mes agregando el `authorized_amount` de cada factura ([api.py](../../../api.py)
`update_sales_invoice`, que suma el header `monto_autorizado`). El proveedor
trabaja a **2 decimales**, pero el sistema guarda montos con más decimales, lo que
genera una pequeña diferencia al agregar.

## Diagnóstico (datos reales, csrd, bloque de 164 autorizaciones)

- Las 164 autorizaciones del Excel del proveedor existen en el sistema.
- El `monto_autorizado` del sistema, redondeado a 2 dec, coincide con el Excel en
  las 164. La columna "Monto Reclamado" del Excel = nuestro `authorized_amount`.
- Solo **6 facturas** tienen montos con >2 decimales (todas migradas, `FACT-*`,
  `docstatus=1`): FACT-93014 (601.875), FACT-93038 (258.512), FACT-93108
  (258.512), FACT-93129 (341.865), FACT-93184 (341.865), FACT-93364 (341.865).
- **Drift** al agregar al Proveedor: `sum(monto_autorizado raw)=147,179.634` vs
  `sum(round 2dp)=147,179.65` → **−0.016**.
- Causa raíz: `claimed_amount`, `authorized_amount`, `difference_amount` de Sales
  Invoice Item son **Float sin `precision`**; el site tiene `float_precision=4` y
  `currency_precision=4`. Como `authorized_amount = base × cobertura` (p.ej.
  668.75 × 90% = 601.875), quedan terceros decimales. Los headers `monto_*` sí
  tienen `precision:2` (los nuevos salen limpios; los 6 sucios se importaron a BD
  sin pasar por el redondeo de Frappe).

## Método de redondeo

`frappe.utils.flt(valor, 2)` (redondeo comercial del site). Verificado contra el
Excel: 601.875→601.88, 341.865→341.87, 258.512→258.51 (coincide en las 6). En JS
se usa el `flt(valor, 2)` equivalente.

## Solución (3 partes)

### A) Precisión de campos de item → 2 (corrección estructural)

Fijar `precision = 2` en los campos de **Sales Invoice Item**:
`claimed_amount`, `authorized_amount`, `difference_amount`.

- Mecanismo: Property Setter (`property = "precision"`, `value = "2"`), creado por
  un **patch idempotente** en `rades/patches/` usando
  `frappe.make_property_setter(...)`, para que quede versionado y replicable.
- Aplicación inmediata en csrd sin `bench migrate`: ejecutar el mismo
  `make_property_setter` vía `bench execute` (una sola vez) + `clear-cache`.
- Efecto: Frappe redondea estos campos a 2 dec en cada guardado y los muestra a 2
  dec. (`copago` de item queda FUERA de alcance por ahora, según lo acordado.)

### B) Redondeo en el cálculo JS

En [sales_invoice.js](../../../public/js/sales_invoice.js):

- `item_table_update`: envolver en `flt(x, 2)` los cálculos de
  `row.authorized_amount`, `row.claimed_amount`, `row.difference_amount`, y el
  `row.copago` de la rama "jueves".
- `refresh_outside_amounts`: redondear a 2 dec los totales
  `monto_reclamado/monto_autorizado/diferencia/copago` del header antes de
  `set_value`.
- Requiere `bench build` (autorizado por el usuario, se confirma antes de correr).

### C) Backfill de facturas existentes con >2 decimales

Script versionado y **parametrizable** (para replicar en otros proveedores luego)
que:

1. Selecciona Clientes Seguros del bloque (por lista de facturas / ARS + rango de
   fechas) cuyos item o header aux tengan >2 decimales.
2. Reescribe a `flt(v, 2)` **solo** los campos auxiliares
   (`claimed_amount/authorized_amount/difference_amount` en items;
   `monto_reclamado/monto_autorizado/diferencia` en header) usando `db_set` /
   `frappe.db.set_value` con `update_modified=False`.
3. **No** toca `rate`, `amount`, `grand_total`, impuestos ni asientos contables;
   **no** re-somete la factura.
4. En este bloque afecta a 6 facturas (las listadas arriba).

Se ejecuta vía `bench execute` (no `bench migrate`).

## Verificación

Tras aplicar A + B + C, re-correr el análisis del bloque:

- 0 facturas con item/header a >2 decimales.
- `drift = sum(monto_autorizado raw) − sum(round 2dp) = 0.00`.
- Los 6 headers corregidos = valor del Excel (601.88 / 258.51 / 341.87).
- Prueba funcional en el navegador: crear/editar una Clientes Seguros con
  cobertura ≠ 100% y confirmar que items y totales muestran 2 dec.

## Restricciones (PRODUCCIÓN)

- NO `bench migrate`. Cambios se aplican con `bench execute` + `bench build` +
  `clear-cache`.
- Commits directos en `master` de rades.
- Alcance: solo este bloque/proveedor; otros proveedores en una fase posterior.

## Fuera de alcance

- Cambiar `currency_precision` / `float_precision` globales del site.
- `copago` de item (posible fase futura).
- Otros proveedores / bloques.
- Alterar montos contables (rate/grand_total/GL) o re-emitir facturas.
